"use client";

// ──────────────────────────────────────────────
// LogSense AI — CSV Dışa Aktarım Modalı
// ──────────────────────────────────────────────

import { useState } from "react";
import { LogEntry } from "@/types";

interface ExportModalProps {
  logs: LogEntry[];
  onClose: () => void;
}

export default function ExportModal({ logs, onClose }: ExportModalProps) {
  const [exportStartStr, setExportStartStr] = useState("");
  const [exportEndStr, setExportEndStr] = useState("");

  const setQuickDate = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    const fmt = (d: Date) =>
      new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    setExportEndStr(fmt(end));
    setExportStartStr(fmt(start));
  };

  const executeExportCSV = () => {
    let dataToExport = logs;
    if (exportStartStr) {
      const startObj = new Date(exportStartStr);
      dataToExport = dataToExport.filter((l) => new Date(l.timestamp) >= startObj);
    }
    if (exportEndStr) {
      const endObj = new Date(exportEndStr);
      dataToExport = dataToExport.filter((l) => new Date(l.timestamp) <= endObj);
    }

    const csvContent =
      "data:text/csv;charset=utf-8," +
      "Zaman;Seviye;Kaynak;Mesaj\n" +
      dataToExport
        .map(
          (l) =>
            `${l.timestamp};${l.level};${l.source};"${l.message.replace(/"/g, '""')}"`
        )
        .join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `logsense_export_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content alert-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 400 }}
      >
        <div className="modal-header">
          <span className="modal-title">📥 Gelişmiş CSV Dışa Aktarım</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p
            style={{
              fontSize: "0.85rem",
              color: "var(--text-secondary)",
              marginBottom: 12,
            }}
          >
            Dışa aktarmak istediğiniz kayıtların tarih aralığını belirleyin. (Boş
            bırakırsanız mevcut tüm kayıtlar aktarılır.)
          </p>
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            <button
              className="level-btn"
              style={{ flex: 1, padding: "4px", fontSize: "0.75rem" }}
              onClick={(e) => { e.preventDefault(); setQuickDate(1); }}
            >
              Günlük
            </button>
            <button
              className="level-btn"
              style={{ flex: 1, padding: "4px", fontSize: "0.75rem" }}
              onClick={(e) => { e.preventDefault(); setQuickDate(7); }}
            >
              Haftalık
            </button>
            <button
              className="level-btn"
              style={{ flex: 1, padding: "4px", fontSize: "0.75rem" }}
              onClick={(e) => { e.preventDefault(); setQuickDate(30); }}
            >
              Aylık
            </button>
          </div>
          <div
            className="modal-field"
            style={{ flexDirection: "column", alignItems: "flex-start" }}
          >
            <span className="modal-label" style={{ marginBottom: 4 }}>
              Başlangıç Tarihi
            </span>
            <input
              type="datetime-local"
              className="filter-input"
              style={{ width: "100%", fontSize: "0.9rem" }}
              value={exportStartStr}
              onChange={(e) => setExportStartStr(e.target.value)}
            />
          </div>
          <div
            className="modal-field"
            style={{ flexDirection: "column", alignItems: "flex-start", marginTop: 12 }}
          >
            <span className="modal-label" style={{ marginBottom: 4 }}>
              Bitiş Tarihi
            </span>
            <input
              type="datetime-local"
              className="filter-input"
              style={{ width: "100%", fontSize: "0.9rem" }}
              value={exportEndStr}
              onChange={(e) => setExportEndStr(e.target.value)}
            />
          </div>
          <div className="modal-divider" style={{ marginTop: 24 }}></div>
          <button
            className="alert-popup-action-btn export"
            style={{ width: "100%" }}
            onClick={executeExportCSV}
          >
            ✅ CSV İndir
          </button>
        </div>
      </div>
    </div>
  );
}
