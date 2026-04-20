"use client";

// ──────────────────────────────────────────────
// LogSense AI — Üst Başlık (Header) Bileşeni
// ──────────────────────────────────────────────

import { ActiveTab } from "@/types";

interface HeaderStats {
  total: number;
  info: number;
  warn: number;
  error: number;
  anomalies: number;
}

interface HeaderProps {
  activeTab: ActiveTab;
  stats: HeaderStats;
}

const TAB_TITLES: Record<ActiveTab, string> = {
  overview: "Sistem Genel Bakış",
  logs: "Gerçek Zamanlı Log Akışı",
  ai: "AI Anomali Zekası",
  correlations: "Olay Korelasyonları",
};

export default function Header({ activeTab, stats }: HeaderProps) {
  return (
    <header className="top-header">
      <div className="header-page-title">{TAB_TITLES[activeTab]}</div>
      <div className="header-stats-row">
        <div className="h-stat total">
          <span className="h-stat-n">{stats.total}</span> log
        </div>
        <div className="h-stat info">
          <span className="h-stat-n">{stats.info}</span> veri
        </div>
        <div className="h-stat warn">
          <span className="h-stat-n">{stats.warn}</span> uyarı
        </div>
        <div className="h-stat error">
          <span className="h-stat-n">{stats.error}</span> hata
        </div>
        <div className="h-stat anomaly">
          <span className="h-stat-n">{stats.anomalies}</span> anomali
        </div>
        <div className="header-sync-badge">
          <span className="sync-dot"></span>
          {new Date().toLocaleTimeString("tr-TR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </div>
      </div>
    </header>
  );
}
