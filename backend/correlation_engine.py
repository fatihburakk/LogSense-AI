"""
LogSense AI — Event Correlation Engine
Zaman penceresi (time window) bazlı hata korelasyonu.
Birbirine yakın zamanda oluşan hataları gruplar ve nedensellik zinciri kurar.

Örnek çıktı:
    disk full → database crash → api error → frontend error
"""

import time
from datetime import datetime
from typing import List, Optional
from collections import defaultdict


# ──────────────────────────────────────────────
# Nedensellik Zinciri Tanımları
# ──────────────────────────────────────────────
CAUSAL_CHAINS = {
    "resource": {
        "triggers": ["disk", "memory", "cpu", "space", "OOM", "storage"],
        "causes":   ["database", "db", "sql", "mongo", "postgres", "mysql", "cache"],
        "effects":  ["api", "gateway", "service", "endpoint", "timeout", "connection"],
        "label":    "Resource → Database → Service Cascade"
    },
    "auth": {
        "triggers": ["authentication", "credential", "password", "token", "certificate", "SSL", "TLS"],
        "causes":   ["unauthorized", "forbidden", "denied", "401", "403"],
        "effects":  ["connection", "refused", "rejected", "blocked"],
        "label":    "Authentication → Access → Connection Chain"
    },
    "database": {
        "triggers": ["replication", "replica", "primary", "failover", "deadlock", "lock", "transaction"],
        "causes":   ["timeout", "slow", "latency", "query"],
        "effects":  ["api", "service", "500", "502", "503", "gateway"],
        "label":    "Database → Latency → Service Failure"
    },
    "network": {
        "triggers": ["DNS", "resolve", "network", "routing", "connection pool"],
        "causes":   ["timeout", "refused", "unreachable"],
        "effects":  ["service", "api", "gateway", "502", "504"],
        "label":    "Network → Timeout → Gateway Failure"
    }
}


class CorrelatedGroup:
    """Bir korelasyon grubunu temsil eder."""

    def __init__(self, group_id: str, chain_type: str, chain_label: str):
        self.group_id = group_id
        self.chain_type = chain_type
        self.chain_label = chain_label
        self.events: List[dict] = []
        self.created_at = time.time()
        self.root_cause: Optional[str] = None
        self.impact_summary: Optional[str] = None

    def add_event(self, log_entry: dict, role: str):
        """Gruba bir olay ekler. role: 'trigger', 'cause', 'effect'"""
        self.events.append({
            "log": log_entry,
            "role": role,
            "added_at": time.time()
        })

    def to_dict(self) -> dict:
        return {
            "group_id": self.group_id,
            "chain_type": self.chain_type,
            "chain_label": self.chain_label,
            "event_count": len(self.events),
            "events": [
                {
                    "timestamp": e["log"].get("timestamp", ""),
                    "level": e["log"].get("level", ""),
                    "source": e["log"].get("source", ""),
                    "message": e["log"].get("message", "")[:120],
                    "role": e["role"],
                }
                for e in self.events
            ],
            "root_cause": self.root_cause,
            "impact_summary": self.impact_summary,
            "age_seconds": round(time.time() - self.created_at, 1),
        }


class CorrelationEngine:
    """
    Zaman penceresi bazlı olay korelasyonu.
    
    Çalışma Prensibi:
    1. Her gelen ERROR/CRITICAL logu analiz eder
    2. Son N saniye içindeki diğer hatalarla karşılaştırır
    3. Nedensellik zinciri eşleşmesi bulursa gruplar
    4. Grupları frontend'e sunar
    """

    def __init__(self, window_seconds: int = 60, max_groups: int = 20):
        self.window_seconds = window_seconds
        self.max_groups = max_groups
        self.recent_errors: List[dict] = []    # Son hatalı loglar
        self.groups: List[CorrelatedGroup] = [] # Korelasyon grupları
        self._group_counter = 0

    def process(self, log_entry: dict) -> Optional[dict]:
        """
        Yeni gelen logu korelasyon motoruna verir.
        Eğer yeni bir korelasyon grubu oluştuysa veya mevcut gruba eklendiyse, 
        grup bilgisini döner.
        """
        level = log_entry.get("level", "INFO")

        # Sadece hata loglarını korelatör'e sok
        if level not in ("ERROR", "CRITICAL", "WARN"):
            return None

        message = log_entry.get("message", "").lower()
        source = log_entry.get("source", "").lower()
        now = time.time()

        # Eski logları temizle
        self.recent_errors = [
            e for e in self.recent_errors
            if now - e["_ts"] < self.window_seconds
        ]

        # Bu logu ekle
        entry_with_ts = {**log_entry, "_ts": now}
        self.recent_errors.append(entry_with_ts)

        # Yeterli hata birikmediyse çık
        if len(self.recent_errors) < 2:
            return None

        # Nedensellik zinciri ara
        for chain_type, chain_def in CAUSAL_CHAINS.items():
            matched = self._match_chain(chain_def, message, source)
            if not matched:
                continue

            role = matched  # 'trigger', 'cause', or 'effect'

            # Mevcut açık gruplarda bu zincir tipi var mı?
            existing = self._find_open_group(chain_type)
            if existing:
                # Aynı logu tekrar ekleme kontrolü
                if not self._is_duplicate(existing, log_entry):
                    existing.add_event(log_entry, role)
                    self._update_summary(existing)
                    return existing.to_dict()
            else:
                # Zaman penceresinde bu zincire uyan başka hatalar var mı?
                related = self._find_related_errors(chain_def)
                if len(related) >= 1:  # En az 1 ilişkili hata + bu = 2 toplam
                    group = self._create_group(chain_type, chain_def["label"])
                    for rel_entry, rel_role in related:
                        group.add_event(rel_entry, rel_role)
                    group.add_event(log_entry, role)
                    self._update_summary(group)
                    return group.to_dict()

        return None

    def get_active_groups(self) -> List[dict]:
        """Aktif korelasyon gruplarını döner."""
        now = time.time()
        # Eski grupları temizle (5 dakikadan eski)
        self.groups = [g for g in self.groups if now - g.created_at < 300]
        return [g.to_dict() for g in self.groups]

    def _match_chain(self, chain_def: dict, message: str, source: str) -> Optional[str]:
        """Log mesajının hangi zincir rolüne uyduğunu belirler."""
        text = f"{message} {source}"

        for keyword in chain_def["triggers"]:
            if keyword.lower() in text:
                return "trigger"

        for keyword in chain_def["causes"]:
            if keyword.lower() in text:
                return "cause"

        for keyword in chain_def["effects"]:
            if keyword.lower() in text:
                return "effect"

        return None

    def _find_open_group(self, chain_type: str) -> Optional[CorrelatedGroup]:
        """Son 60 saniye içinde açılmış aynı tipteki grubu bulur."""
        now = time.time()
        for group in reversed(self.groups):
            if group.chain_type == chain_type and now - group.created_at < self.window_seconds:
                return group
        return None

    def _find_related_errors(self, chain_def: dict) -> List[tuple]:
        """Zaman penceresindeki ilişkili hataları bulur."""
        related = []
        for entry in self.recent_errors:
            msg = entry.get("message", "").lower()
            src = entry.get("source", "").lower()
            role = self._match_chain(chain_def, msg, src)
            if role:
                related.append((entry, role))
        return related

    def _create_group(self, chain_type: str, label: str) -> CorrelatedGroup:
        """Yeni korelasyon grubu oluşturur."""
        self._group_counter += 1
        group_id = f"COR-{self._group_counter:04d}"
        group = CorrelatedGroup(group_id, chain_type, label)
        self.groups.append(group)

        # Eski grupları sınırla
        if len(self.groups) > self.max_groups:
            self.groups = self.groups[-self.max_groups:]

        return group

    def _is_duplicate(self, group: CorrelatedGroup, log_entry: dict) -> bool:
        """Aynı mesajın gruba zaten eklenip eklenmediğini kontrol eder."""
        msg = log_entry.get("message", "")
        for evt in group.events:
            if evt["log"].get("message", "") == msg:
                return True
        return False

    def _update_summary(self, group: CorrelatedGroup):
        """Grup özetini günceller."""
        roles = defaultdict(list)
        for evt in group.events:
            roles[evt["role"]].append(evt["log"].get("source", "?"))

        parts = []
        if roles["trigger"]:
            group.root_cause = f"Root trigger from: {', '.join(set(roles['trigger']))}"
            parts.append(f"🔴 Trigger: {', '.join(set(roles['trigger']))}")
        if roles["cause"]:
            parts.append(f"🟡 Affected: {', '.join(set(roles['cause']))}")
        if roles["effect"]:
            parts.append(f"🔵 Impact: {', '.join(set(roles['effect']))}")

        group.impact_summary = " → ".join(parts) if parts else None


# Singleton
correlation_engine = CorrelationEngine(window_seconds=60, max_groups=20)
