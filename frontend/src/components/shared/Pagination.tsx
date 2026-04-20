"use client";

// ──────────────────────────────────────────────
// LogSense AI — Sayfa Kontrolleri Bileşeni
// ──────────────────────────────────────────────

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  style?: React.CSSProperties;
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  style,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="pagination-bar" style={style}>
      <button
        className="page-btn"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(1)}
      >
        ⏮
      </button>
      <button
        className="page-btn"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
      >
        ◀
      </button>
      <span className="page-info">
        {currentPage} / {totalPages}
      </span>
      <button
        className="page-btn"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
      >
        ▶
      </button>
      <button
        className="page-btn"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(totalPages)}
      >
        ⏭
      </button>
      {totalItems !== undefined && (
        <span className="page-hint">{totalItems} kayıt</span>
      )}
    </div>
  );
}
