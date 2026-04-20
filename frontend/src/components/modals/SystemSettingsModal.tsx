"use client";

// ──────────────────────────────────────────────
// LogSense AI — Sistem Ayarları Modalı
// ──────────────────────────────────────────────

import { SystemSettings, BackupEntry, SystemTab } from "@/types";

interface SystemSettingsModalProps {
  systemTab: SystemTab;
  setSystemTab: (tab: SystemTab) => void;
  systemSettings: SystemSettings;
  setSystemSettings: (fn: (s: SystemSettings) => SystemSettings) => void;
  backups: BackupEntry[];
  isMaintenanceRunning: boolean;
  systemToast: { type: "success" | "error"; msg: string } | null;
  onClose: () => void;
  onSaveSettings: (settings: SystemSettings) => void;
  onFetchBackups: () => void;
  onDownloadBackup: (filename: string) => void;
  onDeleteBackup: (filename: string) => void;
  onTriggerMaintenance: () => void;
}

export default function SystemSettingsModal({
  systemTab,
  setSystemTab,
  systemSettings,
  setSystemSettings,
  backups,
  isMaintenanceRunning,
  systemToast,
  onClose,
  onSaveSettings,
  onFetchBackups,
  onDownloadBackup,
  onDeleteBackup,
  onTriggerMaintenance,
}: SystemSettingsModalProps) {
  return (
    <div className="sys-modal-overlay" onClick={onClose}>
      <div className="sys-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sys-panel-header">
          <div className="sys-panel-title-group">
            <div className="sys-panel-icon">⚙️</div>
            <div>
              <div className="sys-panel-title">Sistem Yönetimi & Bakım</div>
              <div className="sys-panel-subtitle">LogSense AI çekirdek yapılandırması</div>
            </div>
          </div>
          <button className="sys-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="sys-tab-bar">
          <button
            className={`sys-tab ${systemTab === "settings" ? "active" : ""}`}
            onClick={() => setSystemTab("settings")}
          >
            Genel Ayarlar
          </button>
          <button
            className={`sys-tab ${systemTab === "backups" ? "active" : ""}`}
            onClick={() => setSystemTab("backups")}
          >
            Yedeklemeler
          </button>
          <button
            className={`sys-tab ${systemTab === "maintenance" ? "active" : ""}`}
            onClick={() => setSystemTab("maintenance")}
          >
            Sistem Bakımı
          </button>
        </div>

        <div className="sys-body">
          {/* Genel Ayarlar */}
          {systemTab === "settings" && (
            <div className="fade-in">
              <div className="sys-config-card">
                <div className="sys-config-header">
                  <div>
                    <div className="sys-config-title">Log Saklama Süresi</div>
                    <div className="sys-config-desc">
                      Veritabanında tutulacak maksimum log yaşı.
                    </div>
                  </div>
                  <div className="sys-retention-badge">{systemSettings.retention_days} Gün</div>
                </div>
                <div className="sys-slider-container">
                  <input
                    type="range"
                    min="1"
                    max="90"
                    className="sys-slider"
                    value={systemSettings.retention_days}
                    onChange={(e) =>
                      setSystemSettings((s) => ({
                        ...s,
                        retention_days: Number(e.target.value),
                      }))
                    }
                    style={{ "--v": systemSettings.retention_days } as React.CSSProperties}
                  />
                  <div className="sys-slider-labels">
                    <span>1G</span>
                    <span>30G</span>
                    <span>60G</span>
                    <span>90G</span>
                  </div>
                </div>
              </div>

              <div className="sys-config-card" style={{ marginTop: 16 }}>
                <div className="sys-config-header">
                  <div>
                    <div className="sys-config-title">Otomatik Yedekleme</div>
                    <div className="sys-config-desc">
                      Her gece saat 00:00&#39;da sistem yedeği alınır.
                    </div>
                  </div>
                  <label className="sys-toggle">
                    <input
                      type="checkbox"
                      checked={systemSettings.auto_backup}
                      onChange={(e) =>
                        setSystemSettings((s) => ({
                          ...s,
                          auto_backup: e.target.checked,
                        }))
                      }
                    />
                    <span className="sys-toggle-track">
                      <span className="sys-toggle-thumb"></span>
                    </span>
                  </label>
                </div>
              </div>
              <button
                className="sys-save-btn"
                style={{ marginTop: 24 }}
                onClick={() => onSaveSettings(systemSettings)}
              >
                Değişiklikleri Kaydet
              </button>
            </div>
          )}

          {/* Yedeklemeler */}
          {systemTab === "backups" && (
            <div className="fade-in">
              <div className="sys-backups-header">
                <div className="sys-backups-title">Mevcut Yedekler (CSV.GZ)</div>
                <button className="sys-refresh-btn" onClick={onFetchBackups}>
                  🔄 Yenile
                </button>
              </div>
              <div className="sys-backup-grid">
                {backups.length === 0 ? (
                  <div className="sys-backup-empty">
                    <div className="sys-backup-empty-icon">📁</div>
                    <div className="sys-backup-empty-text">Arşiv Boş</div>
                    <div className="sys-backup-empty-hint">
                      Henüz sistem yedeği oluşturulmamış.
                    </div>
                  </div>
                ) : (
                  backups.map((b, i) => (
                    <div key={b.filename} className="sys-backup-card">
                      <div className="sys-backup-card-top">
                        <span className="sys-backup-number">#{backups.length - i}</span>
                        <span className="sys-backup-size-badge">{b.size_mb} MB</span>
                      </div>
                      <div className="sys-backup-card-icon">📦</div>
                      <div className="sys-backup-card-name" title={b.filename}>
                        {b.filename}
                      </div>
                      <div className="sys-backup-card-date">
                        {new Date(b.created_at).toLocaleDateString()}
                      </div>
                      <div className="sys-backup-card-actions">
                        <button
                          className="sys-backup-btn download"
                          onClick={() => onDownloadBackup(b.filename)}
                        >
                          İndir
                        </button>
                        <button
                          className="sys-backup-btn delete"
                          onClick={() => onDeleteBackup(b.filename)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Bakım */}
          {systemTab === "maintenance" && (
            <div className="fade-in">
              <div className="sys-maintenance-card">
                <div>
                  <div className="sys-maintenance-title">Manuel Arşivleme & Temizlik</div>
                  <div className="sys-maintenance-desc">
                    Tüm eski logları hemen yedekle ve veritabanını optimize et.
                  </div>
                </div>
                <button
                  className={`sys-run-btn ${isMaintenanceRunning ? "loading" : ""}`}
                  onClick={onTriggerMaintenance}
                  disabled={isMaintenanceRunning}
                >
                  {isMaintenanceRunning ? "🔄 Çalışıyor..." : "⚡ Başlat"}
                </button>
              </div>
            </div>
          )}
        </div>

        {systemToast && (
          <div className={`sys-toast ${systemToast.type}`}>
            {systemToast.type === "success" ? "✅" : "❌"} {systemToast.msg}
          </div>
        )}
      </div>
    </div>
  );
}
