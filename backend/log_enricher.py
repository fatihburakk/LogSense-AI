"""
LogSense AI — Log Enrichment Engine
Gelen log mesajlarını parse ederek ek metadata çıkarır:
  - IP adresleri → Simüle edilmiş coğrafi konum
  - HTTP durum kodları → İnsan okunabilir hata tipleri
  - Bilinen hata pattern'leri → Kategorizasyon
"""

import re
from typing import Optional

# ──────────────────────────────────────────────
# IP → Geo Location (Simülasyon)
# Gerçek üretimde GeoIP2/MaxMind kullanılır
# ──────────────────────────────────────────────
IP_GEO_MAP = {
    "10.":      {"city": "Internal DC",     "country": "Private Network", "region": "LAN",     "risk": "low"},
    "172.16.":  {"city": "Internal DC",     "country": "Private Network", "region": "LAN",     "risk": "low"},
    "192.168.": {"city": "Internal DC",     "country": "Private Network", "region": "LAN",     "risk": "low"},
    "127.":     {"city": "Localhost",       "country": "Loopback",        "region": "Local",    "risk": "none"},
    "203.":     {"city": "Sydney",          "country": "Australia",       "region": "APAC",     "risk": "medium"},
    "185.":     {"city": "Amsterdam",       "country": "Netherlands",     "region": "EU",       "risk": "medium"},
    "45.":      {"city": "New York",        "country": "USA",             "region": "NA",       "risk": "low"},
    "91.":      {"city": "Moscow",          "country": "Russia",          "region": "EU-East",  "risk": "high"},
    "23.":      {"city": "San Jose",        "country": "USA",             "region": "NA",       "risk": "low"},
    "104.":     {"city": "San Francisco",   "country": "USA",             "region": "NA",       "risk": "low"},
    "52.":      {"city": "Virginia",        "country": "USA (AWS)",       "region": "Cloud",    "risk": "low"},
    "34.":      {"city": "Oregon",          "country": "USA (GCP)",       "region": "Cloud",    "risk": "low"},
    "13.":      {"city": "N. Virginia",     "country": "USA (AWS)",       "region": "Cloud",    "risk": "low"},
    "0.":       {"city": "Unknown",         "country": "Invalid",         "region": "N/A",      "risk": "critical"},
}

# ──────────────────────────────────────────────
# HTTP Status Code → Error Type Mapping
# ──────────────────────────────────────────────
HTTP_STATUS_MAP = {
    # 2xx
    200: {"type": "Success",          "severity": "info",     "desc": "OK"},
    201: {"type": "Created",          "severity": "info",     "desc": "Resource created"},
    204: {"type": "No Content",       "severity": "info",     "desc": "Success, no body"},
    # 3xx
    301: {"type": "Redirect",         "severity": "info",     "desc": "Permanent redirect"},
    302: {"type": "Redirect",         "severity": "info",     "desc": "Temporary redirect"},
    304: {"type": "Not Modified",     "severity": "info",     "desc": "Cache hit"},
    # 4xx
    400: {"type": "Client Error",     "severity": "warning",  "desc": "Bad request — malformed syntax"},
    401: {"type": "Auth Failure",     "severity": "warning",  "desc": "Unauthorized — missing/invalid credentials"},
    403: {"type": "Access Denied",    "severity": "warning",  "desc": "Forbidden — insufficient permissions"},
    404: {"type": "Not Found",        "severity": "info",     "desc": "Resource not found"},
    405: {"type": "Method Error",     "severity": "warning",  "desc": "HTTP method not allowed"},
    408: {"type": "Timeout",          "severity": "warning",  "desc": "Request timeout"},
    409: {"type": "Conflict",         "severity": "warning",  "desc": "Resource conflict (duplicate)"},
    413: {"type": "Payload Error",    "severity": "warning",  "desc": "Request payload too large"},
    429: {"type": "Rate Limited",     "severity": "warning",  "desc": "Too many requests — throttled"},
    # 5xx
    500: {"type": "Server Error",     "severity": "critical", "desc": "Internal server error"},
    502: {"type": "Gateway Error",    "severity": "critical", "desc": "Bad gateway — upstream failure"},
    503: {"type": "Service Down",     "severity": "critical", "desc": "Service unavailable"},
    504: {"type": "Gateway Timeout",  "severity": "critical", "desc": "Upstream timeout"},
}

# ──────────────────────────────────────────────
# Known Error Pattern → Category
# ──────────────────────────────────────────────
ERROR_PATTERNS = [
    (r"out of memory|OOM|memory.*exceed",               "Memory Exhaustion",     "resource"),
    (r"no space left|disk full|storage.*full",           "Disk Full",             "resource"),
    (r"connection refused|ECONNREFUSED",                 "Connection Refused",    "network"),
    (r"timeout|timed out|ETIMEDOUT",                     "Timeout",               "network"),
    (r"deadlock|lock.*wait",                             "Deadlock",              "database"),
    (r"seg\s*fault|segmentation|SIGSEGV",                "Segmentation Fault",    "crash"),
    (r"permission denied|access denied|EACCES",          "Permission Denied",     "security"),
    (r"authentication.*fail|login.*fail|unauthorized",   "Auth Failure",          "security"),
    (r"SSL|TLS|certificate.*expire",                     "TLS/SSL Error",         "security"),
    (r"replication.*lag|replica.*behind",                 "Replication Lag",       "database"),
    (r"connection pool.*exhaust|too many connections",    "Pool Exhaustion",       "resource"),
    (r"DNS.*resolution|NXDOMAIN|name.*resolve",          "DNS Failure",           "network"),
    (r"CPU.*spike|load average.*high",                   "CPU Overload",          "resource"),
    (r"file.*descriptor|too many open files",            "FD Exhaustion",         "resource"),
]

# ──────────────────────────────────────────────
# Regex patterns
# ──────────────────────────────────────────────
IP_REGEX = re.compile(r'\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b')
HTTP_CODE_REGEX = re.compile(r'\b(?:HTTP/?[\d.]*\s+|status[:\s=]+|Error:\s*)(\d{3})\b', re.IGNORECASE)
HTTP_CODE_SIMPLE = re.compile(r'\b([2-5]\d{2})\b')


class LogEnricher:
    """Log mesajlarını parse ederek zenginleştirilmiş metadata üretir."""

    def enrich(self, log_entry: dict) -> dict:
        """
        Log entry'yi zenginleştirir.
        Returns: enrichment dict (ip_info, http_info, error_category, tags)
        """
        message = log_entry.get("message", "")
        source = log_entry.get("source", "")
        level = log_entry.get("level", "INFO")

        enrichment = {
            "ip_info": self._extract_ip_info(message),
            "http_info": self._extract_http_info(message),
            "error_category": self._categorize_error(message),
            "tags": self._generate_tags(message, source, level),
        }

        # Null olan (bulunamayan) alanları kaldır
        enrichment = {k: v for k, v in enrichment.items() if v is not None}

        return enrichment if enrichment else None

    def _extract_ip_info(self, message: str) -> Optional[dict]:
        """Mesajdaki ilk IP adresini bulur ve geo bilgisi döner."""
        match = IP_REGEX.search(message)
        if not match:
            return None

        ip = match.group(1)
        geo = None

        # Prefix eşleştirme
        for prefix, info in IP_GEO_MAP.items():
            if ip.startswith(prefix):
                geo = info
                break

        if not geo:
            # Bilinmeyen IP için varsayılan
            first_octet = int(ip.split(".")[0])
            if first_octet < 128:
                geo = {"city": "Unknown", "country": "Class A Network", "region": "Global", "risk": "medium"}
            else:
                geo = {"city": "Unknown", "country": "External", "region": "Global", "risk": "medium"}

        return {
            "ip": ip,
            "city": geo["city"],
            "country": geo["country"],
            "region": geo["region"],
            "risk_level": geo["risk"],
        }

    def _extract_http_info(self, message: str) -> Optional[dict]:
        """Mesajdaki HTTP durum kodunu bulur ve anlamını döner."""
        # Önce spesifik pattern'leri dene
        match = HTTP_CODE_REGEX.search(message)
        if match:
            code = int(match.group(1))
            return self._resolve_http_code(code)

        # Basit sayı araması (yalnızca web kaynaklarında)
        match = HTTP_CODE_SIMPLE.search(message)
        if match:
            code = int(match.group(1))
            if 200 <= code <= 599:
                return self._resolve_http_code(code)

        return None

    def _resolve_http_code(self, code: int) -> dict:
        """HTTP kodunu insan okunabilir bilgiye çevirir."""
        info = HTTP_STATUS_MAP.get(code)
        if info:
            return {"code": code, **info}

        # Bilinmeyen kodlar için genel sınıflandırma
        if 200 <= code < 300:
            return {"code": code, "type": "Success", "severity": "info", "desc": f"HTTP {code} Success"}
        elif 300 <= code < 400:
            return {"code": code, "type": "Redirect", "severity": "info", "desc": f"HTTP {code} Redirect"}
        elif 400 <= code < 500:
            return {"code": code, "type": "Client Error", "severity": "warning", "desc": f"HTTP {code} Client Error"}
        elif 500 <= code < 600:
            return {"code": code, "type": "Server Error", "severity": "critical", "desc": f"HTTP {code} Server Error"}
        return None

    def _categorize_error(self, message: str) -> Optional[dict]:
        """Bilinen hata pattern'lerine göre hatayı kategorize eder."""
        for pattern, category, domain in ERROR_PATTERNS:
            if re.search(pattern, message, re.IGNORECASE):
                return {"category": category, "domain": domain}
        return None

    def _generate_tags(self, message: str, source: str, level: str) -> list:
        """Otomatik etiketler üretir."""
        tags = []

        # Kaynak bazlı etiket
        if source:
            tags.append(f"source:{source}")

        # Seviye bazlı etiket
        if level in ("ERROR", "CRITICAL"):
            tags.append("priority:high")
        elif level == "WARN":
            tags.append("priority:medium")

        # İçerik bazlı etiketler
        if re.search(r'database|db|sql|mongo|postgres|mysql', message, re.IGNORECASE):
            tags.append("component:database")
        if re.search(r'auth|login|token|credential|password', message, re.IGNORECASE):
            tags.append("component:auth")
        if re.search(r'api|endpoint|route|request|response', message, re.IGNORECASE):
            tags.append("component:api")
        if re.search(r'disk|memory|cpu|storage|resource', message, re.IGNORECASE):
            tags.append("component:infrastructure")
        if re.search(r'replic|cluster|shard|node|primary|secondary', message, re.IGNORECASE):
            tags.append("component:cluster")

        return tags if tags else None


# Singleton
log_enricher = LogEnricher()
