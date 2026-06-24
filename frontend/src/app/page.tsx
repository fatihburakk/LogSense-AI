"use client";

// ──────────────────────────────────────────────
// LogSense AI — Ana Orkestratör Sayfası
// Tüm bileşenler src/components/ altında organize edilmiştir.
// Bu dosya yalnızca global state ve koordinasyonu yönetir.
// ──────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo } from "react";

// Types
import {
  LogEntry,
  AlertEntry,
  CorrelationGroup,
  SystemSettings,
  BackupEntry,
  AlertView,
  ActiveTab,
  Theme,
  SystemTab,
} from "@/types";

// Hooks
import { useWebSocket } from "@/hooks/useWebSocket";

// Lib
import { minsAgo } from "@/lib/utils";
import {
  buildChart,
  buildSeverityData,
  buildHttpData,
  buildRiskData,
  buildTopErrorsData,
} from "@/lib/chartBuilders";

// Layout
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

// Tabs
import OverviewTab from "@/components/tabs/OverviewTab";
import LiveStreamTab from "@/components/tabs/LiveStreamTab";
import AIAnalysisTab from "@/components/tabs/AIAnalysisTab";
import CorrelationsTab from "@/components/tabs/CorrelationsTab";

// Modals
import LogDetailModal from "@/components/modals/LogDetailModal";
import AlertDetailModal from "@/components/modals/AlertDetailModal";
import CorrelationModal from "@/components/modals/CorrelationModal";
import ExportModal from "@/components/modals/ExportModal";
import SystemSettingsModal from "@/components/modals/SystemSettingsModal";

// ──────────────────────────────────────────────
// Ortam Değişkenleri
// ──────────────────────────────────────────────
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8000";
const API_KEY = process.env.NEXT_PUBLIC_LOGSENSE_API_KEY || "";

const LOGS_PER_PAGE = 50;
const ALERTS_PER_PAGE = 8;

// ──────────────────────────────────────────────
// Dashboard — Ana Koordinatör Bileşen
// ──────────────────────────────────────────────
export default function Dashboard() {
  const { logs, connected, clearLogs } = useWebSocket(`${WS_URL}/ws/logs`);

  // Navigasyon & Tema
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [theme, setTheme] = useState<Theme>("dark");

  // Tema yönetimi
  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    if (saved) setTheme(saved);
  }, []);
  useEffect(() => {
    if (theme === "light") document.documentElement.classList.add("light-theme");
    else document.documentElement.classList.remove("light-theme");
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Filtreler
  const [levelFilter, setLevelFilter] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [timeRange, setTimeRange] = useState(0);

  // Sayfalama
  const [logPage, setLogPage] = useState(1);
  const [alertPage, setAlertPage] = useState(1);
  const [correlationPage, setCorrelationPage] = useState(1);
  const [correlationSearchQuery, setCorrelationSearchQuery] = useState("");

  // Modal görünürlüğü
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSystemModal, setShowSystemModal] = useState(false);

  // Seçili modalların içeriği
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<AlertEntry | null>(null);
  const [selectedCorrelation, setSelectedCorrelation] = useState<CorrelationGroup | null>(null);

  // Veri state'leri
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [alertView, setAlertView] = useState<AlertView>("active");
  const [correlations, setCorrelations] = useState<CorrelationGroup[]>([]);

  // Sistem yönetimi state'leri
  const [systemTab, setSystemTab] = useState<SystemTab>("settings");
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({ retention_days: 15, auto_backup: true });
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [isMaintenanceRunning, setIsMaintenanceRunning] = useState(false);
  const [systemToast, setSystemToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [sending, setSending] = useState(false);

  // Modal açıkken body scroll kilitle
  useEffect(() => {
    document.body.style.overflow =
      selectedLog || selectedAlert || selectedCorrelation ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [selectedLog, selectedAlert, selectedCorrelation]);

  // ── API Çağrıları ──
  const fetchAlerts = useCallback(async (view: AlertView = "active") => {
    try {
      let url = `${API_URL}/api/alerts`;
      if (view === "active") url += "?only_open=true";
      const resp = await fetch(url);
      const data = await resp.json();
      if (Array.isArray(data)) {
        if (view === "resolved") setAlerts(data.filter((a: AlertEntry) => a.is_resolved));
        else if (view === "false_positive") setAlerts(data.filter((a: AlertEntry) => a.is_false_positive));
        else setAlerts(data);
      }
    } catch (e) { console.error("fetchAlerts:", e); }
  }, []);

  const fetchCorrelations = useCallback(async () => {
    try {
      const resp = await fetch(`${API_URL}/api/history/correlations`);
      const data = await resp.json();
      if (Array.isArray(data)) setCorrelations(data);
    } catch (e) { console.error("fetchCorrelations:", e); }
  }, []);

  const fetchSystemSettings = useCallback(async () => {
    try {
      const resp = await fetch(`${API_URL}/api/system/settings`);
      const data = await resp.json();
      if (data) setSystemSettings(data);
    } catch (e) { console.error("fetchSystemSettings:", e); }
  }, []);

  const fetchBackups = useCallback(async () => {
    try {
      const resp = await fetch(`${API_URL}/api/system/backups`);
      const data = await resp.json();
      if (Array.isArray(data)) setBackups(data);
    } catch (e) { console.error("fetchBackups:", e); }
  }, []);

  useEffect(() => {
    fetchAlerts();
    fetchCorrelations();
    fetchSystemSettings();
    fetchBackups();
  }, [fetchAlerts, fetchCorrelations, fetchSystemSettings, fetchBackups]);

  useEffect(() => { fetchAlerts(alertView); }, [alertView, fetchAlerts]);

  // Canlı WebSocket olayları
  useEffect(() => {
    const handleCorrelation = (e: Event) => {
      const corr = (e as CustomEvent).detail;
      setCorrelations((prev) => {
        const idx = prev.findIndex((g) => g.group_id === corr.group_id);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = corr;
          return next.sort((a, b) => a.age_seconds - b.age_seconds);
        }
        return [corr, ...prev].sort((a, b) => a.age_seconds - b.age_seconds);
      });
    };
    const handleNewAlert = () => fetchAlerts("active");
    window.addEventListener("new-correlation", handleCorrelation);
    window.addEventListener("new-alert", handleNewAlert);
    return () => {
      window.removeEventListener("new-correlation", handleCorrelation);
      window.removeEventListener("new-alert", handleNewAlert);
    };
  }, [fetchAlerts]);

  // ── Sistem İşlemleri ──
  const updateSystemSettings = async (settings: SystemSettings) => {
    try {
      const resp = await fetch(`${API_URL}/api/system/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await resp.json();
      if (data) setSystemSettings(data);
    } catch (e) { console.error("updateSystemSettings:", e); }
  };

  const triggerMaintenance = async () => {
    setIsMaintenanceRunning(true);
    try {
      await fetch(`${API_URL}/api/system/maintenance`, { method: "POST" });
      alert("Bakım görevi başlatıldı! İşlem arka planda yürütülüyor.");
      setTimeout(fetchBackups, 3000);
    } catch (e) { console.error("triggerMaintenance:", e); }
    finally { setIsMaintenanceRunning(false); }
  };

  const downloadBackup = (filename: string) => {
    window.open(`${API_URL}/api/system/backups/${filename}/download`, "_blank");
  };

  const deleteBackup = async (filename: string) => {
    if (!confirm(`${filename} dosyasını kalıcı olarak silmek istediğinize emin misiniz?`)) return;
    try {
      await fetch(`${API_URL}/api/system/backups/${filename}`, { method: "DELETE" });
      fetchBackups();
    } catch (e) { console.error("deleteBackup:", e); }
  };

  const clearAllHistory = useCallback(async () => {
    try {
      if (!confirm("Tüm log, anomali ve AI analiz geçmişini silmek istediğinize emin misiniz?")) return;
      const resp = await fetch(`${API_URL}/api/history/clear-all`, { method: "DELETE" });
      if (resp.ok) { clearLogs(); setAlerts([]); setCorrelations([]); }
    } catch (e) { console.error("clearAllHistory:", e); }
  }, [clearLogs]);

  // ── Alert İşlemleri ──
  const resolveAlert = async (id: number) => {
    try {
      await fetch(`${API_URL}/api/alerts/${id}/resolve`, { method: "POST", headers: { "X-API-KEY": API_KEY } });
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      setSelectedAlert(null);
    } catch (e) { console.error("resolveAlert:", e); }
  };

  const markFalse = async (id: number) => {
    try {
      await fetch(`${API_URL}/api/alerts/${id}/false-positive`, { method: "POST", headers: { "X-API-KEY": API_KEY } });
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      setSelectedAlert(null);
    } catch (e) { console.error("markFalse:", e); }
  };

  // ── Paylaşım ──
  const copyToClipboard = async (text: string) => {
    try { await navigator.clipboard.writeText(text); alert("✅ Rapor panoya başarıyla kopyalandı!"); }
    catch (e) { console.error("clipboard:", e); }
  };

  const shareAlert = (alert: AlertEntry) => {
    const text = `🚨 *LogSense Anomali Raporu* 🚨\n*Seviye:* ${alert.level}\n*Kaynak:* ${alert.source}\n\n*Mesaj:*\n\`\`\`\n${alert.message}\n\`\`\`\n\n🧠 *AI Kök Neden Analizi:*\n${alert.ai_analysis?.llm_analysis || "Analiz yok."}`;
    copyToClipboard(text);
  };

  const shareCorrelation = (corr: CorrelationGroup) => {
    const text = `🔗 *LogSense Korelasyon Raporu* 🔗\n*Zincir ID:* ${corr.group_id}\n*Etiket:* ${corr.chain_label}\n\n*Etki Özeti:*\n${corr.impact_summary || "Bilinmiyor."}\n\n*Bağlı Olaylar (${corr.event_count}):*\n${corr.events.map((e, i) => `${i + 1}. [${e.source}] ${e.message}`).join("\n")}`;
    copyToClipboard(text);
  };

  // ── Test Hatası Üret ──
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
          headers: { "Content-Type": "application/json", "X-API-KEY": API_KEY },
          body: JSON.stringify({ ...err, timestamp: new Date().toISOString() }),
        });
      } catch { }
      await new Promise((r) => setTimeout(r, 500));
    }
    setSending(false);
  };

  // ── Hesaplanan (Memoized) Değerler ──
  const uniqueSources = useMemo(
    () => Array.from(new Set(logs.map((l) => l.source))).sort(),
    [logs]
  );

  const filteredLogs = useMemo(
    () =>
      logs.filter((log) => {
        if (levelFilter && log.level !== levelFilter) return false;
        if (sourceFilter !== "all" && log.source !== sourceFilter) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          if (!log.message.toLowerCase().includes(q) && !log.source.toLowerCase().includes(q)) return false;
        }
        if (timeRange > 0 && minsAgo(log.timestamp) > timeRange) return false;
        return true;
      }),
    [logs, levelFilter, sourceFilter, searchQuery, timeRange]
  );

  const totalLogPages = Math.max(1, Math.ceil(filteredLogs.length / LOGS_PER_PAGE));
  useEffect(() => { if (logPage > totalLogPages) setLogPage(1); }, [totalLogPages, logPage]);
  const paginatedLogs = filteredLogs.slice((logPage - 1) * LOGS_PER_PAGE, logPage * LOGS_PER_PAGE);

  const filteredAlerts = useMemo(
    () =>
      alerts.filter((alert) => {
        if (sourceFilter !== "all" && alert.source !== sourceFilter) return false;
        if (searchQuery && !alert.message.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
      }),
    [alerts, sourceFilter, searchQuery]
  );

  const totalAlertPages = Math.max(1, Math.ceil(filteredAlerts.length / ALERTS_PER_PAGE));
  useEffect(() => { if (alertPage > totalAlertPages) setAlertPage(1); }, [totalAlertPages, alertPage]);
  const paginatedAlerts = filteredAlerts.slice((alertPage - 1) * ALERTS_PER_PAGE, alertPage * ALERTS_PER_PAGE);

  const filteredCorrelations = useMemo(
    () =>
      correlations.filter((corr) =>
        correlationSearchQuery
          ? corr.chain_label.toLowerCase().includes(correlationSearchQuery.toLowerCase())
          : true
      ),
    [correlations, correlationSearchQuery]
  );

  const totalCorrelationPages = Math.max(1, Math.ceil(filteredCorrelations.length / ALERTS_PER_PAGE));
  useEffect(() => { if (correlationPage > totalCorrelationPages) setCorrelationPage(1); }, [totalCorrelationPages, correlationPage]);
  const paginatedCorrelations = filteredCorrelations.slice((correlationPage - 1) * ALERTS_PER_PAGE, correlationPage * ALERTS_PER_PAGE);

  const stats = useMemo(() => ({
    total: logs.length,
    info: logs.filter((l) => l.level === "INFO").length,
    warn: logs.filter((l) => l.level === "WARN").length,
    error: logs.filter((l) => l.level === "ERROR" || l.level === "CRITICAL").length,
    anomalies: alerts.length,
  }), [logs, alerts]);

  const chartData = useMemo(() => buildChart(logs), [logs]);
  const severityData = useMemo(() => buildSeverityData(logs), [logs]);
  const httpData = useMemo(() => buildHttpData(logs), [logs]);
  const riskData = useMemo(() => buildRiskData(logs), [logs]);
  const topErrorsData = useMemo(() => buildTopErrorsData(logs), [logs]);

  // ── Paylaşılan Filtre Props'ları ──
  const filterProps = {
    searchQuery,
    setSearchQuery,
    levelFilter,
    setLevelFilter,
    sourceFilter,
    setSourceFilter,
    timeRange,
    setTimeRange,
    uniqueSources,
  };

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────
  return (
    <div className="app-container">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        theme={theme}
        setTheme={setTheme}
        connected={connected}
        sending={sending}
        onTriggerError={triggerError}
        onOpenSystemModal={() => setShowSystemModal(true)}
        anomalyCount={stats.anomalies}
        correlationCount={correlations.length}
      />

      <div className="main-layout">
        <Header activeTab={activeTab} stats={stats} />

        <main className="content-area">
          {activeTab === "overview" && (
            <OverviewTab
              stats={stats}
              chartData={chartData}
              severityData={severityData}
              httpData={httpData}
              riskData={riskData}
              topErrorsData={topErrorsData}
            />
          )}

          {activeTab === "logs" && (
            <LiveStreamTab
              paginatedLogs={paginatedLogs}
              filteredLogs={filteredLogs}
              logPage={logPage}
              totalLogPages={totalLogPages}
              setLogPage={setLogPage}
              onSelectLog={setSelectedLog}
              onClearHistory={clearAllHistory}
              onExport={() => setShowExportModal(true)}
              {...filterProps}
            />
          )}

          {activeTab === "ai" && (
            <AIAnalysisTab
              alertView={alertView}
              setAlertView={setAlertView}
              paginatedAlerts={paginatedAlerts}
              filteredAlerts={filteredAlerts}
              alertPage={alertPage}
              totalAlertPages={totalAlertPages}
              setAlertPage={setAlertPage}
              onSelectAlert={setSelectedAlert}
              onResolve={resolveAlert}
              onMarkFalse={markFalse}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              sourceFilter={sourceFilter}
              setSourceFilter={setSourceFilter}
              uniqueSources={uniqueSources}
            />
          )}

          {activeTab === "correlations" && (
            <CorrelationsTab
              filteredCorrelations={filteredCorrelations}
              paginatedCorrelations={paginatedCorrelations}
              correlationPage={correlationPage}
              totalCorrelationPages={totalCorrelationPages}
              setCorrelationPage={setCorrelationPage}
              correlationSearchQuery={correlationSearchQuery}
              setCorrelationSearchQuery={setCorrelationSearchQuery}
              onSelectCorrelation={setSelectedCorrelation}
            />
          )}
        </main>
      </div>

      {/* Modallar */}
      {showExportModal && (
        <ExportModal logs={logs} onClose={() => setShowExportModal(false)} />
      )}

      {selectedLog && (
        <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}

      {selectedAlert && (
        <AlertDetailModal
          alert={selectedAlert}
          alertView={alertView}
          onClose={() => setSelectedAlert(null)}
          onResolve={resolveAlert}
          onMarkFalse={markFalse}
          onShare={shareAlert}
        />
      )}

      {selectedCorrelation && (
        <CorrelationModal
          correlation={selectedCorrelation}
          onClose={() => setSelectedCorrelation(null)}
          onShare={shareCorrelation}
        />
      )}

      {showSystemModal && (
        <SystemSettingsModal
          systemTab={systemTab}
          setSystemTab={setSystemTab}
          systemSettings={systemSettings}
          setSystemSettings={setSystemSettings}
          backups={backups}
          isMaintenanceRunning={isMaintenanceRunning}
          systemToast={systemToast}
          onClose={() => setShowSystemModal(false)}
          onSaveSettings={updateSystemSettings}
          onFetchBackups={fetchBackups}
          onDownloadBackup={downloadBackup}
          onDeleteBackup={deleteBackup}
          onTriggerMaintenance={triggerMaintenance}
        />
      )}
    </div>
  );
}
