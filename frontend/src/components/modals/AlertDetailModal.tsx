"use client";

// ──────────────────────────────────────────────
// LogSense AI — Alert Detay Modalı
// ──────────────────────────────────────────────

import { AlertEntry, AlertView } from "@/types";
import { fmtTime } from "@/lib/utils";

interface AlertDetailModalProps {
  alert: AlertEntry;
  alertView: AlertView;
  onClose: () => void;
  onResolve: (id: number) => void;
  onMarkFalse: (id: number) => void;
  onShare: (alert: AlertEntry) => void;
}

export default function AlertDetailModal({
  alert,
  alertView,
  onClose,
  onResolve,
  onMarkFalse,
  onShare,
}: AlertDetailModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content alert-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header alert-modal-header">
          <span className="modal-title">
            {alert.level === "CRITICAL" ? "💀" : "🔴"} Anomali Derin Analizi
          </span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="alert-popup-top">
            <div className="alert-popup-level-badge" data-level={alert.level}>
              {alert.level}
            </div>
            <div className="alert-popup-source">{alert.source}</div>
            <div className="alert-popup-time">{fmtTime(alert.timestamp)}</div>
          </div>
          <div className="alert-popup-message">{alert.message}</div>

          {alert.ai_analysis && (
            <>
              <div className="modal-divider"></div>
              <div className="modal-field">
                <span className="modal-label">Anomali Skoru</span>
                <span className="modal-value" style={{ color: "var(--accent-red)", fontWeight: "bold" }}>
                  {(alert.ai_analysis.anomaly_score * 100).toFixed(1)}%
                </span>
              </div>
              {alert.ai_analysis.llm_analysis && (
                <div className="modal-llm" style={{ marginTop: 12 }}>
                  <div className="llm-comment-header">🧠 AI Kök Neden & Çözüm Analizi</div>
                  <div
                    style={{
                      whiteSpace: "pre-wrap",
                      fontSize: "0.85rem",
                      lineHeight: "1.6",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {alert.ai_analysis.llm_analysis}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="modal-divider"></div>
          <div className="alert-popup-actions">
            {alertView === "active" && (
              <>
                <button
                  className="alert-popup-action-btn resolve"
                  onClick={() => onResolve(alert.id)}
                >
                  ✅ Çözüldü İşaretle
                </button>
                <button
                  className="alert-popup-action-btn false-positive"
                  onClick={() => onMarkFalse(alert.id)}
                >
                  🚫 Hatalı Alarm İşaretle
                </button>
              </>
            )}
            <button
              className="alert-popup-action-btn export"
              onClick={() => onShare(alert)}
            >
              📤 Kopyala (Share)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
