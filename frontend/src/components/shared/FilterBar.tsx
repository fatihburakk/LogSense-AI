"use client";

// ──────────────────────────────────────────────
// LogSense AI — Filtre Çubuğu Bileşeni
// ──────────────────────────────────────────────

interface FilterBarProps {
  showLevel?: boolean;
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

export default function FilterBar({
  showLevel = true,
  searchQuery,
  setSearchQuery,
  levelFilter,
  setLevelFilter,
  sourceFilter,
  setSourceFilter,
  timeRange,
  setTimeRange,
  uniqueSources,
}: FilterBarProps) {
  return (
    <div className="filter-bar">
      <div className="filter-search">
        <span className="filter-icon">🔎</span>
        <input
          type="text"
          className="filter-input"
          placeholder="Loglarda ara..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button className="filter-clear" onClick={() => setSearchQuery("")}>
            ✕
          </button>
        )}
      </div>

      {showLevel && (
        <div className="filter-levels">
          {["ALL", "INFO", "WARN", "ERROR", "CRITICAL"].map((lvl) => {
            const isActive = lvl === "ALL" ? levelFilter === null : levelFilter === lvl;
            return (
              <button
                key={lvl}
                className={`level-btn ${lvl} ${isActive ? "active" : ""}`}
                onClick={() =>
                  setLevelFilter(lvl === "ALL" ? null : levelFilter === lvl ? null : lvl)
                }
              >
                {lvl}
              </button>
            );
          })}
        </div>
      )}

      <select
        className="filter-select"
        value={sourceFilter}
        onChange={(e) => setSourceFilter(e.target.value)}
      >
        <option value="all">Tüm Kaynaklar</option>
        {uniqueSources.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <select
        className="filter-select"
        value={timeRange}
        onChange={(e) => setTimeRange(Number(e.target.value))}
      >
        <option value={0}>Tüm Zamanlar</option>
        <option value={1}>Son 1 dk</option>
        <option value={5}>Son 5 dk</option>
        <option value={15}>Son 15 dk</option>
        <option value={60}>Son 1 saat</option>
      </select>
    </div>
  );
}
