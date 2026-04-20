"use client";

// ──────────────────────────────────────────────
// LogSense AI — Log Detay Modalı
// ──────────────────────────────────────────────

import { LogEntry } from "@/types";

interface LogDetailModalProps {
  log: LogEntry;
  onClose: () => void;
}

export default function LogDetailModal({ log, onClose }: LogDetailModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">📋 Log Detayı</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="modal-field">
            <span className="modal-label">ID</span>
            <span className="modal-value">{log.id || "Pending"}</span>
          </div>
          <div className="modal-field">
            <span className="modal-label">Zaman</span>
            <span className="modal-value">{log.timestamp}</span>
          </div>
          <div className="modal-field">
            <span className="modal-label">Seviye</span>
            <span className={`log-level-badge ${log.level}`}>{log.level}</span>
          </div>
          <div className="modal-field">
            <span className="modal-label">Kaynak</span>
            <span className="modal-value">{log.source}</span>
          </div>
          <div className="modal-field">
            <span className="modal-label">Mesaj</span>
            <span className="modal-value message-full">{log.message}</span>
          </div>

          {log.enrichment && (
            <>
              <div className="modal-divider"></div>
              {log.enrichment.tags && (
                <div className="modal-field">
                  <span className="modal-label">Etiketler</span>
                  <span className="modal-value" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {log.enrichment.tags.map((t) => (
                      <span
                        key={t}
                        style={{
                          fontSize: "0.65rem",
                          background: "var(--bg-terminal)",
                          padding: "2px 8px",
                          borderRadius: 12,
                          border: "1px solid var(--border-primary)",
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </span>
                </div>
              )}
              {log.enrichment.ip_info && (
                <div className="modal-field">
                  <span className="modal-label">IP Geo</span>
                  <span className="modal-value" style={{ color: "var(--accent-blue)" }}>
                    {log.enrichment.ip_info.ip} — {log.enrichment.ip_info.city},{" "}
                    {log.enrichment.ip_info.country} ({log.enrichment.ip_info.risk_level} risk)
                  </span>
                </div>
              )}
              {log.enrichment.http_info && (
                <div className="modal-field">
                  <span className="modal-label">HTTP</span>
                  <span className="modal-value">
                    <span
                      style={{
                        fontWeight: 700,
                        color:
                          log.enrichment.http_info.severity === "info"
                            ? "var(--accent-green)"
                            : log.enrichment.http_info.severity === "warning"
                            ? "var(--accent-yellow)"
                            : "var(--accent-red)",
                      }}
                    >
                      {log.enrichment.http_info.code}
                    </span>{" "}
                    — {log.enrichment.http_info.type}: {log.enrichment.http_info.desc}
                  </span>
                </div>
              )}
            </>
          )}

          {log.ai_analysis && (
            <>
              <div className="modal-divider"></div>
              <div className="modal-field">
                <span className="modal-label">Tahmin</span>
                <span className={`log-anomaly-badge ${log.ai_analysis.ml_prediction}`}>
                  {log.ai_analysis.ml_prediction === "anomaly" ? "⚠ ANOMALİ" : "✓ Normal"}
                </span>
              </div>
              <div className="modal-field">
                <span className="modal-label">Skor</span>
                <span className="modal-value">
                  {(log.ai_analysis.anomaly_score * 100).toFixed(1)}%
                </span>
              </div>
              {log.ai_analysis.llm_analysis && (
                <div className="modal-llm">
                  <div className="llm-comment-header">🧠 AI Analizi (GPT-4o)</div>
                  {log.ai_analysis.llm_analysis}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
