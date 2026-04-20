"use client";

// ──────────────────────────────────────────────
// LogSense AI — Kenar Çubuğu (Sidebar) Bileşeni
// ──────────────────────────────────────────────

import { ActiveTab, Theme } from "@/types";

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  connected: boolean;
  sending: boolean;
  onTriggerError: () => void;
  onOpenSystemModal: () => void;
  anomalyCount: number;
  correlationCount: number;
}

export default function Sidebar({
  activeTab,
  setActiveTab,
  theme,
  setTheme,
  connected,
  sending,
  onTriggerError,
  onOpenSystemModal,
  anomalyCount,
  correlationCount,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">🔍</div>
        <div>
          <h1 className="sidebar-title">LogSense AI</h1>
          <p className="sidebar-version">v2.2 — Managed</p>
        </div>
      </div>

      <nav className="sidebar-nav">
        <button
          className={`nav-item ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          <span className="nav-icon">📊</span> Genel Bakış
        </button>
        <button
          className={`nav-item ${activeTab === "logs" ? "active" : ""}`}
          onClick={() => setActiveTab("logs")}
        >
          <span className="nav-icon">📜</span> Canlı Akış
        </button>
        <button
          className={`nav-item ${activeTab === "ai" ? "active" : ""}`}
          onClick={() => setActiveTab("ai")}
        >
          <span className="nav-icon">🧠</span> AI Analiz
          {anomalyCount > 0 && <span className="nav-badge">{anomalyCount}</span>}
        </button>
        <button
          className={`nav-item ${activeTab === "correlations" ? "active" : ""}`}
          onClick={() => setActiveTab("correlations")}
        >
          <span className="nav-icon">🔗</span> Korelasyonlar
          {correlationCount > 0 && (
            <span
              className="nav-badge"
              style={{ background: "var(--accent-cyan)" }}
            >
              {correlationCount}
            </span>
          )}
        </button>
        <div className="sidebar-divider"></div>
        <button className="nav-item system-btn" onClick={onOpenSystemModal}>
          <span className="nav-icon">⚙️</span> Sistem Ayarları
        </button>
      </nav>

      <div className="sidebar-footer">
        <div className="status-indicator">
          <div className={`status-dot ${connected ? "" : "disconnected"}`}></div>
          <span>{connected ? "Bağlı" : "Bağlantı Yok"}</span>
        </div>
        <button
          className="error-trigger-btn"
          onClick={onTriggerError}
          disabled={sending}
        >
          {sending ? "⏳ Gönderiliyor..." : "💥 Test Hatası Üret"}
        </button>
        <button
          className="theme-toggle-btn"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? "☀️ Aydınlık Mod" : "🌙 Karanlık Mod"}
        </button>
      </div>
    </aside>
  );
}
