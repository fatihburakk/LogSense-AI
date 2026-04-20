"use client";

// ──────────────────────────────────────────────
// LogSense AI — AI Analiz Sekmesi
// ──────────────────────────────────────────────

import { AlertEntry, AlertView } from "@/types";
import { fmtTime } from "@/lib/utils";
import FilterBar from "@/components/shared/FilterBar";
import Pagination from "@/components/shared/Pagination";

interface AIAnalysisTabProps {
  alertView: AlertView;
  setAlertView: (v: AlertView) => void;
  paginatedAlerts: AlertEntry[];
  filteredAlerts: AlertEntry[];
  alertPage: number;
  totalAlertPages: number;
  setAlertPage: (page: number) => void;
  onSelectAlert: (alert: AlertEntry) => void;
  onResolve: (id: number) => void;
  onMarkFalse: (id: number) => void;
  // FilterBar props
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  sourceFilter: string;
  setSourceFilter: (v: string) => void;
  uniqueSources: string[];
}

export default function AIAnalysisTab({
  alertView,
  setAlertView,
  paginatedAlerts,
  filteredAlerts,
  alertPage,
  totalAlertPages,
  setAlertPage,
  onSelectAlert,
  onResolve,
  onMarkFalse,
  searchQuery,
  setSearchQuery,
  sourceFilter,
  setSourceFilter,
  uniqueSources,
}: AIAnalysisTabProps) {
  return (
    <div className="tab-pane fade-in">
      {/* Arşiv Başlığı */}
      <div className="ai-archive-header">
        <div className="ai-view-toggle">
          <button
            className={`ai-view-btn ${alertView === "active" ? "active" : ""}`}
            onClick={() => setAlertView("active")}
          >
            🔴 Aktif Anomaliler
            {alertView === "active" && filteredAlerts.length > 0 && (
              <span className="ai-view-count">{filteredAlerts.length}</span>
            )}
          </button>
          <button
            className={`ai-view-btn ${alertView === "resolved" ? "active resolved" : ""}`}
            onClick={() => setAlertView("resolved")}
          >
            ✅ Çözülenler Arşivi
          </button>
          <button
            className={`ai-view-btn ${alertView === "false_positive" ? "active false-pos" : ""}`}
            onClick={() => setAlertView("false_positive")}
          >
            🚫 Hatalı Alarmlar
          </button>
        </div>
        <FilterBar
          showLevel={false}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          levelFilter={null}
          setLevelFilter={() => {}}
          sourceFilter={sourceFilter}
          setSourceFilter={setSourceFilter}
          timeRange={0}
          setTimeRange={() => {}}
          uniqueSources={uniqueSources}
        />
      </div>

      {/* Yoğun Izgara Düzeni */}
      <div className="ai-grid-dense">
        {paginatedAlerts.length === 0 ? (
          <div className="ai-empty-full">
            <span className="ai-empty-icon">
              {alertView === "active" ? "🧠" : alertView === "resolved" ? "✅" : "🚫"}
            </span>
            <h3>
              {alertView === "active"
                ? "Sistem Temiz"
                : alertView === "resolved"
                ? "Çözülen Alarm Yok"
                : "Hatalı Alarm Kaydı Yok"}
            </h3>
            <p>
              {alertView === "active"
                ? "Anomali tespit edilmedi. AI motoru altyapınızı sürekli tarıyor."
                : alertView === "resolved"
                ? "Henüz çözülen bir anomali kaydı bulunmuyor."
                : "Hatalı alarm olarak işaretlenmiş kayıt yok."}
            </p>
          </div>
        ) : (
          paginatedAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`ai-card-compact ${alert.level} ${alert.is_resolved ? "resolved" : ""} ${alert.is_false_positive ? "false-pos" : ""}`}
              onClick={() => onSelectAlert(alert)}
            >
              {/* Durum şeridi */}
              {alert.is_resolved && <div className="ai-card-ribbon resolved">✅ Çözüldü</div>}
              {alert.is_false_positive && <div className="ai-card-ribbon false-pos">🚫 Hatalı</div>}

              <div className="ai-card-compact-top">
                <span className={`ai-level-tag ${alert.level}`}>
                  {alert.level === "CRITICAL" ? "💀" : alert.level === "ERROR" ? "🔴" : "⚠️"}{" "}
                  {alert.level}
                </span>
                <span className="ai-card-source-badge">{alert.source}</span>
                {alert.ai_analysis && alert.ai_analysis.anomaly_score !== undefined && (
                  <div
                    className="ai-risk-badge"
                    style={{
                      background:
                        alert.ai_analysis.anomaly_score > 0.7
                          ? "rgba(239, 68, 68, 0.2)"
                          : "rgba(245, 158, 11, 0.2)",
                      color:
                        alert.ai_analysis.anomaly_score > 0.7 ? "#fca5a5" : "#fcd34d",
                    }}
                  >
                    %{(alert.ai_analysis.anomaly_score * 100).toFixed(0)} RİSK
                  </div>
                )}
                <span className="ai-card-time-sm">{fmtTime(alert.timestamp)}</span>
              </div>

              <div className="ai-card-compact-msg">{alert.message}</div>

              {alert.ai_analysis?.llm_analysis && (
                <div className="ai-card-llm-preview">
                  🧠 {alert.ai_analysis.llm_analysis.substring(0, 120)}
                  {alert.ai_analysis.llm_analysis.length > 120 ? "..." : ""}
                </div>
              )}

              {alert.ai_analysis?.anomaly_score !== undefined && (
                <div className="ai-card-score-bar">
                  <div
                    className="score-bar-fill"
                    style={{
                      width: `${alert.ai_analysis.anomaly_score * 100}%`,
                      background:
                        alert.ai_analysis.anomaly_score > 0.7
                          ? "#ef4444"
                          : alert.ai_analysis.anomaly_score > 0.4
                          ? "#f59e0b"
                          : "#22c55e",
                    }}
                  />
                  <span className="score-bar-label">
                    {(alert.ai_analysis.anomaly_score * 100).toFixed(0)}% Risk
                  </span>
                </div>
              )}

              {alertView === "active" && (
                <div className="ai-card-compact-actions">
                  <button
                    className="action-btn-sm resolve"
                    onClick={(e) => {
                      e.stopPropagation();
                      onResolve(alert.id);
                    }}
                  >
                    ✅ Çözüldü
                  </button>
                  <button
                    className="action-btn-sm false-pos"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarkFalse(alert.id);
                    }}
                  >
                    🚫 Hatalı
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <Pagination
        currentPage={alertPage}
        totalPages={totalAlertPages}
        onPageChange={setAlertPage}
        style={{ marginTop: 16 }}
      />
    </div>
  );
}
