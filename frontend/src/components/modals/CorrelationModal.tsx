"use client";

// ──────────────────────────────────────────────
// LogSense AI — Korelasyon Detay Modalı
// ──────────────────────────────────────────────

import { CorrelationGroup } from "@/types";
import { fmtTime } from "@/lib/utils";

interface CorrelationModalProps {
  correlation: CorrelationGroup;
  onClose: () => void;
  onShare: (corr: CorrelationGroup) => void;
}

export default function CorrelationModal({
  correlation,
  onClose,
  onShare,
}: CorrelationModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 720 }}
      >
        <div
          className="modal-header"
          style={{
            background: "linear-gradient(135deg, rgba(57,210,192,0.1), rgba(13,17,23,0.8))",
          }}
        >
          <span className="modal-title" style={{ color: "var(--accent-cyan)" }}>
            🔗 Korelasyon: {correlation.group_id}
          </span>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="corr-view-btn" onClick={() => onShare(correlation)}>
              📤 Kopyala
            </button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="modal-body">
          <div
            style={{
              padding: "12px 16px",
              background: "var(--bg-terminal)",
              borderRadius: 8,
              border: "1px solid var(--border-primary)",
              marginBottom: 8,
            }}
          >
            <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>
              {correlation.chain_label}
            </div>
          </div>

          {correlation.impact_summary && (
            <div
              style={{
                padding: "12px 16px",
                background: "rgba(240,136,62,0.05)",
                borderRadius: 8,
                border: "1px solid rgba(240,136,62,0.15)",
                borderLeft: "3px solid var(--accent-orange)",
              }}
            >
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                {correlation.impact_summary}
              </div>
            </div>
          )}

          <div className="modal-divider" style={{ margin: "12px 0" }}></div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxHeight: 300,
              overflowY: "auto",
            }}
          >
            {correlation.events.map((evt, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "10px 12px",
                  background: "var(--bg-card-hover)",
                  borderRadius: 6,
                  border: "1px solid var(--border-primary)",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginBottom: 4,
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>
                      {fmtTime(evt.timestamp)}
                    </span>
                    <span
                      className={`log-level-badge ${evt.level}`}
                      style={{ fontSize: "0.6rem" }}
                    >
                      {evt.level}
                    </span>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--accent-purple)",
                        fontWeight: 600,
                      }}
                    >
                      {evt.source}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    {evt.message}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
