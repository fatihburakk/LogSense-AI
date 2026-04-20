"use client";

// ──────────────────────────────────────────────
// LogSense AI — Korelasyonlar Sekmesi
// ──────────────────────────────────────────────

import { CorrelationGroup } from "@/types";
import Pagination from "@/components/shared/Pagination";

interface CorrelationsTabProps {
  filteredCorrelations: CorrelationGroup[];
  paginatedCorrelations: CorrelationGroup[];
  correlationPage: number;
  totalCorrelationPages: number;
  setCorrelationPage: (page: number) => void;
  correlationSearchQuery: string;
  setCorrelationSearchQuery: (v: string) => void;
  onSelectCorrelation: (corr: CorrelationGroup) => void;
}

export default function CorrelationsTab({
  filteredCorrelations,
  paginatedCorrelations,
  correlationPage,
  totalCorrelationPages,
  setCorrelationPage,
  correlationSearchQuery,
  setCorrelationSearchQuery,
  onSelectCorrelation,
}: CorrelationsTabProps) {
  if (filteredCorrelations.length === 0) {
    return (
      <div className="tab-pane fade-in">
        <div className="ai-empty-full">
          <span className="ai-empty-icon">🔗</span>
          <h3>Korelasyon Tespit Edilmedi</h3>
          <p>
            Şu anda olaylar arasında herhangi bir nedensellik veya tetikleme zinciri
            bulunmuyor.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-pane fade-in">
      <div className="corr-trace-container fade-in">
        <div className="corr-trace-header">
          <div className="corr-trace-title">Nedensellik & Zincirleme Hata Analizi</div>
          <div className="corr-trace-subtitle">
            Sistem, farklı kaynaklardan gelen logları zaman ve içerik bazlı otomatik bağlar.
          </div>
          <div className="filter-search" style={{ marginTop: 12, maxWidth: 300 }}>
            <span className="filter-icon">🔎</span>
            <input
              type="text"
              className="filter-input"
              placeholder="Zincirlerde ara..."
              value={correlationSearchQuery}
              onChange={(e) => setCorrelationSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="corr-trace-list">
          {paginatedCorrelations.map((corr) => (
            <div
              key={corr.group_id}
              className="corr-trace-item"
              onClick={() => onSelectCorrelation(corr)}
            >
              <div className="corr-trace-left">
                <div className="corr-trace-line"></div>
                <div className="corr-trace-node"></div>
              </div>
              <div className="corr-trace-content">
                <div className="corr-trace-meta">
                  <span className="corr-trace-id">
                    Zincir #{corr.group_id.split("-")[0]}
                  </span>
                  <span className="corr-trace-count">{corr.event_count} Bağlı Olay</span>
                </div>
                <div className="corr-trace-label">{corr.chain_label}</div>
                {corr.impact_summary && (
                  <div className="corr-trace-impact">{corr.impact_summary}</div>
                )}
              </div>
              <div className="corr-trace-action">
                <button className="corr-view-btn">Detay İncele ➔</button>
              </div>
            </div>
          ))}
        </div>

        <Pagination
          currentPage={correlationPage}
          totalPages={totalCorrelationPages}
          onPageChange={setCorrelationPage}
          style={{ marginTop: 16 }}
        />
      </div>
    </div>
  );
}
