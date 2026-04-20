"use client";

// ──────────────────────────────────────────────
// LogSense AI — Canlı Akış Sekmesi
// ──────────────────────────────────────────────

import { LogEntry } from "@/types";
import { fmtTime } from "@/lib/utils";
import FilterBar from "@/components/shared/FilterBar";
import Pagination from "@/components/shared/Pagination";

interface LiveStreamTabProps {
  paginatedLogs: LogEntry[];
  filteredLogs: LogEntry[];
  logPage: number;
  totalLogPages: number;
  setLogPage: (page: number) => void;
  onSelectLog: (log: LogEntry) => void;
  onClearHistory: () => void;
  onExport: () => void;
  // FilterBar props
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  levelFilter: string | null;
  setLevelFilter: (v: string | null) => void;
  sourceFilter: string;
  setSourceFilter: (v: string) => void;
  timeRange: number;
  setTimeRange: (v: number) => void;
  uniqueSources: string[];
}

export default function LiveStreamTab({
  paginatedLogs,
  filteredLogs,
  logPage,
  totalLogPages,
  setLogPage,
  onSelectLog,
  onClearHistory,
  onExport,
  searchQuery,
  setSearchQuery,
  levelFilter,
  setLevelFilter,
  sourceFilter,
  setSourceFilter,
  timeRange,
  setTimeRange,
  uniqueSources,
}: LiveStreamTabProps) {
  return (
    <div className="tab-pane fade-in">
      <FilterBar
        showLevel={true}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        levelFilter={levelFilter}
        setLevelFilter={setLevelFilter}
        sourceFilter={sourceFilter}
        setSourceFilter={setSourceFilter}
        timeRange={timeRange}
        setTimeRange={setTimeRange}
        uniqueSources={uniqueSources}
      />
      <div className="terminal-container-v2">
        <div className="terminal-header-v2">
          <div className="terminal-dots">
            <span className="dot r"></span>
            <span className="dot y"></span>
            <span className="dot g"></span>
          </div>
          <span className="terminal-uri">
            logsense://canli-akis — {filteredLogs.length} kayıt
          </span>
          <div className="terminal-controls">
            <button
              className="term-btn export-btn"
              onClick={onExport}
              title="CSV olarak dışa aktar"
            >
              📥 Export CSV
            </button>
            <span className="badge-live">● CANLI</span>
            <button
              className="term-btn"
              onClick={onClearHistory}
              title="Tüm geçmişi sil"
            >
              🗑️ Temizle
            </button>
          </div>
        </div>
        <div className="terminal-body-v2">
          {paginatedLogs.length === 0 ? (
            <div className="terminal-empty">
              <span className="empty-icon">📡</span>
              <p>Log akışı bekleniyor...</p>
              <code>python producer.py</code>
            </div>
          ) : (
            paginatedLogs.map((log, i) => (
              <div
                key={log.id || i}
                className={`log-line-v2 ${log.level}`}
                onClick={() => onSelectLog(log)}
              >
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
            ))
          )}
        </div>
        <Pagination
          currentPage={logPage}
          totalPages={totalLogPages}
          onPageChange={setLogPage}
          totalItems={filteredLogs.length}
        />
      </div>
    </div>
  );
}
