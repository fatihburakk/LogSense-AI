"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Area, AreaChart, LineChart, Line, ReferenceLine
} from "recharts";

// ──────────────────────────────────────────────
// Configuration from Environment
// ──────────────────────────────────────────────
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8000";
const API_KEY = process.env.NEXT_PUBLIC_LOGSENSE_API_KEY || "";

// ──────────────────────────────────────────────
// Types & Constants
// ──────────────────────────────────────────────
interface EnrichmentData {
  ip_info?: { ip: string; city: string; country: string; region: string; risk_level: string };
  http_info?: { code: number; type: string; severity: string; desc: string };
  error_category?: { category: string; domain: string };
  tags?: string[];
}
interface AIAnalysis {
  model_used: string;
  ml_prediction: "anomaly" | "normal";
  anomaly_score: number;
  llm_analysis: string | null;
}
interface LogEntry {
  id?: number;
  timestamp: string;
  level: string;
  message: string;
  source: string;
  ai_analysis?: AIAnalysis;
  enrichment?: EnrichmentData;
}
interface AlertEntry {
  id: number;
  log_id: number;
  level: string;
  source: string;
  message: string;
  timestamp: string;
  is_resolved: boolean;
  is_false_positive: boolean;
  ai_analysis?: AIAnalysis; // UI hint
}
interface CorrelationGroup {
  group_id: string;
  chain_type: string;
  chain_label: string;
  event_count: number;
  events: Array<{ timestamp: string; level: string; source: string; message: string; role: string }>;
  root_cause: string | null;
  impact_summary: string | null;
  age_seconds: number;
}
interface ChartPoint { time: string; info: number; warn: number; error: number; maxScore: number; }

const LOGS_PER_PAGE = 50;
const ALERTS_PER_PAGE = 8;

// ──────────────────────────────────────────────
// WebSocket Hook
// ──────────────────────────────────────────────
function useWebSocket(url: string) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnect = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (e) => {
        const p = JSON.parse(e.data);
        if (p.type === "history") setLogs(p.data.reverse());
        else if (p.type === "log") {
          setLogs((prev) => [p.data, ...prev.slice(0, 999)]);
          // If it's an anomaly, notify Dashboard to refresh alerts
          if (p.data.ai_analysis?.ml_prediction === "anomaly") {
             window.dispatchEvent(new CustomEvent('new-alert', { detail: p.data }));
          }
        }
        else if (p.type === "correlation") {
          window.dispatchEvent(new CustomEvent('new-correlation', { detail: p.data }));
        }
      };
      ws.onclose = () => { setConnected(false); reconnect.current = setTimeout(connect, 3000); };
      ws.onerror = () => ws.close();
    } catch { reconnect.current = setTimeout(connect, 3000); }
  }, [url]);

  useEffect(() => {
    connect();
    return () => { wsRef.current?.close(); if (reconnect.current) clearTimeout(reconnect.current); };
  }, [connect]);

  return { logs, connected, clearLogs: useCallback(() => setLogs([]), []) };
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
  catch { return "--:--:--"; }
}
function minsAgo(iso: string) { return (Date.now() - new Date(iso).getTime()) / 60000; }
function scoreLevel(s: number) { return s >= 0.8 ? "critical" : s >= 0.5 ? "high" : s >= 0.3 ? "medium" : "low"; }

function buildChart(logs: LogEntry[]): ChartPoint[] {
  const b: Record<string, ChartPoint> = {};
  logs.forEach((l) => {
    const k = fmtTime(l.timestamp).substring(0, 5);
    if (!b[k]) b[k] = { time: k, info: 0, warn: 0, error: 0, maxScore: 0 };
    if (l.level === "INFO") b[k].info++;
    else if (l.level === "WARN") b[k].warn++;
    else if (l.level === "ERROR" || l.level === "CRITICAL") b[k].error++;
    if (l.ai_analysis) b[k].maxScore = Math.max(b[k].maxScore, l.ai_analysis.anomaly_score);
  });
  return Object.values(b).slice(-20);
}

// ──────────────────────────────────────────────
// Dashboard
// ──────────────────────────────────────────────
export default function Dashboard() {
  const { logs, connected, clearLogs } = useWebSocket(`${WS_URL}/ws/logs`);
  const [activeTab, setActiveTab] = useState<"overview" | "logs" | "ai" | "correlations">("overview");
  const [sending, setSending] = useState(false);

  // Shared Filters
  const [levelFilter, setLevelFilter] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [timeRange, setTimeRange] = useState(0);
  const [logPage, setLogPage] = useState(1);
  const [alertPage, setAlertPage] = useState(1);

  // Alerts & Correlations State
  const [correlations, setCorrelations] = useState<CorrelationGroup[]>([]);
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);

  const fetchAlerts = useCallback(async () => {
    try {
      const resp = await fetch(`${API_URL}/api/alerts?only_open=true`);
      const data = await resp.json();
      if (Array.isArray(data)) setAlerts(data);
    } catch (e) {
      console.error("Error fetching alerts:", e);
    }
  }, []);

  const fetchCorrelations = useCallback(async () => {
    try {
      const resp = await fetch(`${API_URL}/api/history/correlations`);
      const data = await resp.json();
      if (Array.isArray(data)) setCorrelations(data);
    } catch (e) {
      console.error("Error fetching correlation history:", e);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    fetchCorrelations();
  }, [fetchAlerts, fetchCorrelations]);

  // Handle incoming live alerts/correlations
  useEffect(() => {
    const handleCorrelation = (e: any) => {
      setCorrelations(prev => {
        const idx = prev.findIndex(g => g.group_id === e.detail.group_id);
        if (idx !== -1) {
          const newGroups = [...prev];
          newGroups[idx] = e.detail;
          return newGroups.sort((a, b) => a.age_seconds - b.age_seconds);
        }
        return [e.detail, ...prev].sort((a, b) => a.age_seconds - b.age_seconds);
      });
    };
    const handleNewAlert = () => fetchAlerts();

    window.addEventListener('new-correlation', handleCorrelation);
    window.addEventListener('new-alert', handleNewAlert);
    return () => {
      window.removeEventListener('new-correlation', handleCorrelation);
      window.removeEventListener('new-alert', handleNewAlert);
    };
  }, [fetchAlerts]);

  // Modals
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<AlertEntry | null>(null);
  const [selectedCorrelation, setSelectedCorrelation] = useState<CorrelationGroup | null>(null);

  useEffect(() => {
    document.body.style.overflow = (selectedLog || selectedAlert || selectedCorrelation) ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [selectedLog, selectedAlert, selectedCorrelation]);

  const uniqueSources = useMemo(() => Array.from(new Set(logs.map(l => l.source))).sort(), [logs]);

  const filteredLogs = useMemo(() => logs.filter(log => {
    if (levelFilter && log.level !== levelFilter) return false;
    if (sourceFilter !== "all" && log.source !== sourceFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!log.message.toLowerCase().includes(q) && !log.source.toLowerCase().includes(q)) return false;
    }
    if (timeRange > 0 && minsAgo(log.timestamp) > timeRange) return false;
    return true;
  }), [logs, levelFilter, sourceFilter, searchQuery, timeRange]);

  const totalLogPages = Math.max(1, Math.ceil(filteredLogs.length / LOGS_PER_PAGE));
  useEffect(() => { if (logPage > totalLogPages) setLogPage(1); }, [totalLogPages, logPage]);
  const paginatedLogs = filteredLogs.slice((logPage - 1) * LOGS_PER_PAGE, logPage * LOGS_PER_PAGE);

  const stats = useMemo(() => ({
    total: logs.length,
    info: logs.filter(l => l.level === "INFO").length,
    warn: logs.filter(l => l.level === "WARN").length,
    error: logs.filter(l => l.level === "ERROR" || l.level === "CRITICAL").length,
    anomalies: alerts.length,
  }), [logs, alerts]);

  const filteredAlerts = useMemo(() => alerts.filter((alert) => {
    if (sourceFilter !== "all" && alert.source !== sourceFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!alert.message.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [alerts, sourceFilter, searchQuery]);

  const totalAlertPages = Math.max(1, Math.ceil(filteredAlerts.length / ALERTS_PER_PAGE));
  useEffect(() => { if (alertPage > totalAlertPages) setAlertPage(1); }, [totalAlertPages, alertPage]);
  const paginatedAlerts = filteredAlerts.slice((alertPage - 1) * ALERTS_PER_PAGE, alertPage * ALERTS_PER_PAGE);

  const chartData = useMemo(() => buildChart(logs), [logs]);

  // ──── Persistent Alert Actions ────
  const resolveAlert = async (id: number) => {
    try {
      await fetch(`${API_URL}/api/alerts/${id}/resolve`, {
        method: "PATCH",
        headers: { "X-API-KEY": API_KEY }
      });
      setAlerts(prev => prev.filter(a => a.id !== id));
      setSelectedAlert(null);
    } catch (e) {
      console.error("Failed to resolve alert:", e);
    }
  };

  const markFalse = async (id: number) => {
    try {
      await fetch(`${API_URL}/api/alerts/${id}/false-positive`, {
        method: "PATCH",
        headers: { "X-API-KEY": API_KEY }
      });
      setAlerts(prev => prev.filter(a => a.id !== id));
      setSelectedAlert(null);
    } catch (e) {
      console.error("Failed to mark false positive:", e);
    }
  };

  const triggerError = async () => {
    setSending(true);
    const errors = [
      { level: "CRITICAL", message: "PANIC: could not write to log file: No space left on device", source: "postgres" },
      { level: "ERROR", message: "MongoTimeoutError: Server selection timed out after 30000ms", source: "mongodb" },
      { level: "CRITICAL", message: "AH00060: seg fault or similar nasty error detected in parent process", source: "apache" },
      { level: "ERROR", message: "Error: 1205, Severity: 13. Transaction deadlocked on lock resources", source: "mssql" },
      { level: "CRITICAL", message: "InnoDB: Fatal error: ib_logfile0 is of different size", source: "mysql" },
    ];
    for (const err of errors) {
      try {
        await fetch(`${API_URL}/api/logs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": API_KEY
          },
          body: JSON.stringify({ ...err, timestamp: new Date().toISOString() })
        });
      } catch { }
      await new Promise(r => setTimeout(r, 500));
    }
    setSending(false);
  };

  // ──── Filter Bar Component ────
  const FilterBar = ({ showLevel = true }: { showLevel?: boolean }) => (
    <div className="filter-bar">
      <div className="filter-search">
        <span className="filter-icon">🔎</span>
        <input type="text" className="filter-input" placeholder="Loglarda ara..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        {searchQuery && <button className="filter-clear" onClick={() => setSearchQuery("")}>✕</button>}
      </div>
      {showLevel && (
        <div className="filter-levels">
          {["ALL", "INFO", "WARN", "ERROR", "CRITICAL"].map(lvl => (
            <button key={lvl} className={`level-btn ${(lvl === "ALL" ? levelFilter === null : levelFilter === lvl) ? "active" : ""}`}
              onClick={() => setLevelFilter(lvl === "ALL" ? null : (levelFilter === lvl ? null : lvl))}>{lvl}</button>
          ))}
        </div>
      )}
      <select className="filter-select" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
        <option value="all">Tüm Kaynaklar</option>
        {uniqueSources.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select className="filter-select" value={timeRange} onChange={e => setTimeRange(Number(e.target.value))}>
        <option value={0}>Tüm Zamanlar</option>
        <option value={1}>Son 1 dk</option>
        <option value={5}>Son 5 dk</option>
        <option value={15}>Son 15 dk</option>
        <option value={60}>Son 1 saat</option>
      </select>
    </div>
  );

  return (
    <div className="app-container">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">🔍</div>
          <div>
            <h1 className="sidebar-title">LogSense AI</h1>
            <p className="sidebar-version">v2.2 — Managed</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
            <span className="nav-icon">📊</span> Genel Bakış
          </button>
          <button className={`nav-item ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>
            <span className="nav-icon">📜</span> Canlı Akış
          </button>
          <button className={`nav-item ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => setActiveTab('ai')}>
            <span className="nav-icon">🧠</span> AI Analiz
            {stats.anomalies > 0 && <span className="nav-badge">{stats.anomalies}</span>}
          </button>
          <button className={`nav-item ${activeTab === 'correlations' ? 'active' : ''}`} onClick={() => setActiveTab('correlations')}>
            <span className="nav-icon">🔗</span> Korelasyonlar
            {correlations.length > 0 && <span className="nav-badge" style={{ background: 'var(--accent-cyan)' }}>{correlations.length}</span>}
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="status-indicator">
            <div className={`status-dot ${connected ? "" : "disconnected"}`}></div>
            <span>{connected ? "Bağlı" : "Bağlantı Yok"}</span>
          </div>
          <button className="error-trigger-btn" onClick={triggerError} disabled={sending}>
            {sending ? "⏳ Gönderiliyor..." : "💥 Test Hatası Üret"}
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="main-layout">
        <header className="top-header">
          <div className="header-page-title">
            {activeTab === 'overview' && "Sistem Genel Bakış"}
            {activeTab === 'logs' && "Gerçek Zamanlı Log Akışı"}
            {activeTab === 'ai' && "AI Anomali Zekası"}
            {activeTab === 'correlations' && "Olay Korelasyonları"}
          </div>
          <div className="header-stats-row">
            <div className="h-stat total"><span className="h-stat-n">{stats.total}</span> log</div>
            <div className="h-stat info"><span className="h-stat-n">{stats.info}</span> veri</div>
            <div className="h-stat warn"><span className="h-stat-n">{stats.warn}</span> uyarı</div>
            <div className="h-stat error"><span className="h-stat-n">{stats.error}</span> hata</div>
            <div className="h-stat anomaly"><span className="h-stat-n">{stats.anomalies}</span> anomali</div>
          </div>
        </header>

        <main className="content-area">

          {/* ═══════ TAB: OVERVIEW ═══════ */}
          {activeTab === 'overview' && (
            <div className="tab-pane fade-in">
              <div className="stats-grid">
                <div className="stat-box blue"><div className="stat-icon-wrap">📊</div><div className="stat-data"><span className="stat-num">{stats.total}</span><span className="stat-lbl">Total Logs</span></div></div>
                <div className="stat-box cyan"><div className="stat-icon-wrap">ℹ️</div><div className="stat-data"><span className="stat-num">{stats.info}</span><span className="stat-lbl">Info</span></div></div>
                <div className="stat-box yellow"><div className="stat-icon-wrap">⚠️</div><div className="stat-data"><span className="stat-num">{stats.warn}</span><span className="stat-lbl">Warnings</span></div></div>
                <div className="stat-box red"><div className="stat-icon-wrap">🔴</div><div className="stat-data"><span className="stat-num">{stats.error}</span><span className="stat-lbl">Errors / Critical</span></div></div>
              </div>
              <div className="charts-row">
                <div className="chart-card-v2">
                  <div className="chart-title-v2">📈 Log Hacmi <span className="badge-live-sm">CANLI</span></div>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="gI" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                        <linearGradient id="gW" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient>
                        <linearGradient id="gE" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} /><stop offset="95%" stopColor="#ef4444" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" /><XAxis dataKey="time" stroke="#475569" fontSize={10} /><YAxis stroke="#475569" fontSize={10} />
                      <Tooltip contentStyle={{ background: "#1a1f2e", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12, color: "#e2e8f0" }} />
                      <Area type="monotone" dataKey="info" stroke="#3b82f6" fill="url(#gI)" strokeWidth={2} name="Info" />
                      <Area type="monotone" dataKey="warn" stroke="#f59e0b" fill="url(#gW)" strokeWidth={2} name="Warn" />
                      <Area type="monotone" dataKey="error" stroke="#ef4444" fill="url(#gE)" strokeWidth={2} name="Error" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-card-v2">
                  <div className="chart-title-v2">🧠 ML Anomali Skoru <span className="badge-trend-sm">TREND</span></div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData}>
                      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" /><XAxis dataKey="time" stroke="#475569" fontSize={10} /><YAxis stroke="#475569" fontSize={10} domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} />
                      <Tooltip contentStyle={{ background: "#1a1f2e", border: "1px solid #c084fc", borderRadius: 8, fontSize: 12, color: "#e2e8f0" }} formatter={(v: any) => [(Number(v) * 100).toFixed(0) + "%", "Skor"]} />
                      <ReferenceLine y={0.5} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "Eşik", fill: "#ef4444", fontSize: 10 }} />
                      <Line type="monotone" dataKey="maxScore" stroke="#c084fc" strokeWidth={3} dot={false} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* ═══════ TAB: LIVE STREAM ═══════ */}
          {activeTab === 'logs' && (
            <div className="tab-pane fade-in">
              <FilterBar showLevel={true} />
              <div className="terminal-container-v2">
                <div className="terminal-header-v2">
                  <div className="terminal-dots"><span className="dot r"></span><span className="dot y"></span><span className="dot g"></span></div>
                  <span className="terminal-uri">logsense://canli-akis — {filteredLogs.length} kayıt</span>
                  <div className="terminal-controls">
                    <span className="badge-live">● CANLI</span>
                    <button className="term-btn" onClick={() => { if (confirm("Tüm logları temizle?")) clearLogs(); }}>🗑️</button>
                  </div>
                </div>
                <div className="terminal-body-v2">
                  {paginatedLogs.length === 0 ? (
                    <div className="terminal-empty"><span className="empty-icon">📡</span><p>Log akışı bekleniyor...</p><code>python producer.py</code></div>
                  ) : paginatedLogs.map((log, i) => (
                    <div key={log.id || i} className={`log-line-v2 ${log.level}`} onClick={() => setSelectedLog(log)}>
                      <span className="ll-time">{fmtTime(log.timestamp)}</span>
                      <span className={`ll-level ${log.level}`}>{log.level}</span>
                      <span className="ll-source">{log.source}</span>
                      {log.ai_analysis && (
                        <>
                          <span className="ll-model">{log.ai_analysis.model_used}</span>
                          <span className={`ll-badge ${log.ai_analysis.ml_prediction}`}>
                            {log.ai_analysis.ml_prediction === "anomaly" ? "⚠ ANOMALY" : "✓"}
                          </span>
                        </>
                      )}
                      <span className="ll-msg">{log.message}</span>
                    </div>
                  ))}
                </div>
                {totalLogPages > 1 && (
                  <div className="pagination-bar">
                    <button className="page-btn" disabled={logPage <= 1} onClick={() => setLogPage(1)}>⏮</button>
                    <button className="page-btn" disabled={logPage <= 1} onClick={() => setLogPage(p => p - 1)}>◀</button>
                    <span className="page-info">{logPage} / {totalLogPages}</span>
                    <button className="page-btn" disabled={logPage >= totalLogPages} onClick={() => setLogPage(p => p + 1)}>▶</button>
                    <button className="page-btn" disabled={logPage >= totalLogPages} onClick={() => setLogPage(totalLogPages)}>⏭</button>
                    <span className="page-hint">{filteredLogs.length} kayıt</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════ TAB: AI INSIGHTS ═══════ */}
          {activeTab === 'ai' && (
            <div className="tab-pane fade-in">
              <FilterBar showLevel={false} />

              <div className="ai-grid">
                {paginatedAlerts.length === 0 ? (
                  <div className="ai-empty"><span className="ai-empty-icon">🧠</span><h3>Sistem Temiz</h3><p>Anomali tespit edilmedi. AI motoru altyapınızı sürekli tarıyor.</p></div>
                ) : paginatedAlerts.map((alert) => (
                  <div key={alert.id} className={`ai-card ${alert.level}`} onClick={() => setSelectedAlert(alert)}>
                    <div className="ai-card-top">
                      <span className={`ai-level-tag ${alert.level}`}>{alert.level === "CRITICAL" ? "💀" : "🔴"} {alert.level}</span>
                      <span className="ai-card-source">{alert.source}</span>
                      <span className="ai-card-time">{fmtTime(alert.timestamp)}</span>
                    </div>
                    <div className="ai-card-message">{alert.message}</div>
                    {/* Note: Fetch linked log's AI analysis for display in card if needed, or rely on alert message */}
                    <div className="ai-card-actions">
                      <button className="action-btn resolve" onClick={e => { e.stopPropagation(); resolveAlert(alert.id); }}>✅ Çözüldü</button>
                      <button className="action-btn false-pos" onClick={e => { e.stopPropagation(); markFalse(alert.id); }}>🚫 Hatalı Alarm</button>
                    </div>
                  </div>
                ))}
              </div>
              {totalAlertPages > 1 && (
                <div className="pagination-bar" style={{ marginTop: 16 }}>
                  <button className="page-btn" onClick={() => setAlertPage(p => Math.max(1, p - 1))}>◀</button>
                  <span className="page-info">{alertPage} / {totalAlertPages}</span>
                  <button className="page-btn" onClick={() => setAlertPage(p => Math.min(totalAlertPages, p + 1))}>▶</button>
                </div>
              )}
            </div>
          )}

          {/* ═══════ TAB: CORRELATIONS ═══════ */}
          {activeTab === 'correlations' && (
            <div className="tab-pane fade-in">
              {correlations.length === 0 ? (
                <div className="ai-empty"><span className="ai-empty-icon">🔗</span><h3>Korelasyon Bulunmuyor</h3><p>Şu anda olaylar arasında herhangi bir nedensellik zinciri tespit edilmedi.</p></div>
              ) : (
                <div className="correlations-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxHeight: 'none', overflowY: 'visible' }}>
                  {correlations.map(corr => (
                    <div key={corr.group_id} className="correlation-card"
                      onClick={() => setSelectedCorrelation(corr)}
                      style={{ background: 'rgba(57,210,192,0.05)', border: '1px solid rgba(57,210,192,0.2)', borderLeft: '3px solid var(--accent-cyan)', borderRadius: 8, padding: 16, cursor: 'pointer', transition: '0.2s' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>{corr.group_id}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', background: 'rgba(0,0,0,0.2)', padding: '2px 8px', borderRadius: 12 }}>{corr.event_count} olay bağlandı</span>
                      </div>
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: 10 }}>{corr.chain_label}</div>
                      {corr.impact_summary && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.2)', padding: 8, borderRadius: 4 }}>
                          {corr.impact_summary}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ═══════ MODAL: Log Detail ═══════ */}
      {selectedLog && (
        <div className="modal-overlay" onClick={() => setSelectedLog(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">📋 Log Detayı</span>
              <button className="modal-close" onClick={() => setSelectedLog(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="modal-field"><span className="modal-label">ID</span><span className="modal-value">{selectedLog.id || "Pending"}</span></div>
              <div className="modal-field"><span className="modal-label">Zaman</span><span className="modal-value">{selectedLog.timestamp}</span></div>
              <div className="modal-field"><span className="modal-label">Seviye</span><span className={`log-level-badge ${selectedLog.level}`}>{selectedLog.level}</span></div>
              <div className="modal-field"><span className="modal-label">Kaynak</span><span className="modal-value">{selectedLog.source}</span></div>
              <div className="modal-field"><span className="modal-label">Mesaj</span><span className="modal-value message-full">{selectedLog.message}</span></div>

              {selectedLog.enrichment && (
                <>
                  <div className="modal-divider"></div>
                  {selectedLog.enrichment.tags && (
                    <div className="modal-field"><span className="modal-label">Etiketler</span><span className="modal-value" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {selectedLog.enrichment.tags.map(t => <span key={t} style={{ fontSize: '0.65rem', background: 'var(--bg-terminal)', padding: '2px 8px', borderRadius: 12, border: '1px solid var(--border-primary)' }}>{t}</span>)}
                    </span></div>
                  )}
                  {selectedLog.enrichment.ip_info && (
                    <div className="modal-field"><span className="modal-label">IP Geo</span><span className="modal-value" style={{ color: 'var(--accent-blue)' }}>
                      {selectedLog.enrichment.ip_info.ip} — {selectedLog.enrichment.ip_info.city}, {selectedLog.enrichment.ip_info.country} ({selectedLog.enrichment.ip_info.risk_level} risk)
                    </span></div>
                  )}
                  {selectedLog.enrichment.http_info && (
                    <div className="modal-field"><span className="modal-label">HTTP</span><span className="modal-value">
                      <span style={{ fontWeight: 700, color: selectedLog.enrichment.http_info.severity === 'info' ? 'var(--accent-green)' : selectedLog.enrichment.http_info.severity === 'warning' ? 'var(--accent-yellow)' : 'var(--accent-red)' }}>{selectedLog.enrichment.http_info.code}</span> — {selectedLog.enrichment.http_info.type}: {selectedLog.enrichment.http_info.desc}
                    </span></div>
                  )}
                </>
              )}

              {selectedLog.ai_analysis && (
                <>
                  <div className="modal-divider"></div>
                  <div className="modal-field"><span className="modal-label">Tahmin</span><span className={`log-anomaly-badge ${selectedLog.ai_analysis.ml_prediction}`}>{selectedLog.ai_analysis.ml_prediction === "anomaly" ? "⚠ ANOMALİ" : "✓ Normal"}</span></div>
                  <div className="modal-field"><span className="modal-label">Skor</span><span className="modal-value">{(selectedLog.ai_analysis.anomaly_score * 100).toFixed(1)}%</span></div>
                  {selectedLog.ai_analysis.llm_analysis && (
                    <div className="modal-llm"><div className="llm-comment-header">🧠 AI Analizi (GPT-4o)</div>{selectedLog.ai_analysis.llm_analysis}</div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ MODAL: Anomaly Deep Dive ═══════ */}
      {selectedAlert && (
        <div className="modal-overlay" onClick={() => setSelectedAlert(null)}>
          <div className="modal-content alert-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header alert-modal-header">
              <span className="modal-title">{selectedAlert.level === "CRITICAL" ? "💀" : "🔴"} Anomali Derin Analizi</span>
              <button className="modal-close" onClick={() => setSelectedAlert(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="alert-popup-top">
                <div className="alert-popup-level-badge" data-level={selectedAlert.level}>{selectedAlert.level}</div>
                <div className="alert-popup-source">{selectedAlert.source}</div>
                <div className="alert-popup-time">{fmtTime(selectedAlert.timestamp)}</div>
              </div>
              <div className="alert-popup-message">{selectedAlert.message}</div>
              <div className="modal-divider"></div>
              <div className="alert-popup-actions">
                <button className="alert-popup-action-btn resolve" onClick={() => resolveAlert(selectedAlert.id)}>✅ Çözüldü İşaretle</button>
                <button className="alert-popup-action-btn false-positive" onClick={() => markFalse(selectedAlert.id)}>🚫 Hatalı Alarm İşaretle</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ MODAL: Correlation Deep Dive ═══════ */}
      {selectedCorrelation && (
        <div className="modal-overlay" onClick={() => setSelectedCorrelation(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
            <div className="modal-header" style={{ background: 'linear-gradient(135deg, rgba(57,210,192,0.1), rgba(13,17,23,0.8))' }}>
              <span className="modal-title" style={{ color: 'var(--accent-cyan)' }}>🔗 Korelasyon: {selectedCorrelation.group_id}</span>
              <button className="modal-close" onClick={() => setSelectedCorrelation(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ padding: '12px 16px', background: 'var(--bg-terminal)', borderRadius: 8, border: '1px solid var(--border-primary)', marginBottom: 8 }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>{selectedCorrelation.chain_label}</div>
              </div>
              {selectedCorrelation.impact_summary && (
                <div style={{ padding: '12px 16px', background: 'rgba(240,136,62,0.05)', borderRadius: 8, border: '1px solid rgba(240,136,62,0.15)', borderLeft: '3px solid var(--accent-orange)' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{selectedCorrelation.impact_summary}</div>
                </div>
              )}
              <div className="modal-divider" style={{ margin: '12px 0' }}></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                {selectedCorrelation.events.map((evt, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 12px', background: 'var(--bg-card-hover)', borderRadius: 6, border: '1px solid var(--border-primary)' }}>
                     <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 4, alignItems: 'center' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{fmtTime(evt.timestamp)}</span>
                        <span className={`log-level-badge ${evt.level}`} style={{ fontSize: '0.6rem' }}>{evt.level}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--accent-purple)', fontWeight: 600 }}>{evt.source}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{evt.message}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
