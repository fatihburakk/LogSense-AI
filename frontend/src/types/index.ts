// ──────────────────────────────────────────────
// LogSense AI — Merkezi Tip Tanımlamaları
// ──────────────────────────────────────────────

export interface EnrichmentData {
  ip_info?: { ip: string; city: string; country: string; region: string; risk_level: string };
  http_info?: { code: number; type: string; severity: string; desc: string };
  error_category?: { category: string; domain: string };
  tags?: string[];
}

export interface AIAnalysis {
  model_used: string;
  ml_prediction: "anomaly" | "normal";
  anomaly_score: number;
  llm_analysis: string | null;
}

export interface LogEntry {
  id?: number;
  timestamp: string;
  level: string;
  message: string;
  source: string;
  ai_analysis?: AIAnalysis;
  enrichment?: EnrichmentData;
}

export interface AlertEntry {
  id: number;
  log_id: number;
  level: string;
  source: string;
  message: string;
  timestamp: string;
  is_resolved: boolean;
  is_false_positive: boolean;
  ai_analysis?: AIAnalysis;
}

export interface CorrelationGroup {
  group_id: string;
  chain_type: string;
  chain_label: string;
  event_count: number;
  events: Array<{ timestamp: string; level: string; source: string; message: string; role: string }>;
  root_cause: string | null;
  impact_summary: string | null;
  age_seconds: number;
}

export interface ChartPoint {
  time: string;
  info: number;
  warn: number;
  error: number;
  maxScore: number;
}

export interface SystemSettings {
  retention_days: number;
  auto_backup: boolean;
}

export interface BackupEntry {
  filename: string;
  size_mb: number;
  created_at: string;
}

export type AlertView = 'active' | 'resolved' | 'false_positive';
export type ActiveTab = 'overview' | 'logs' | 'ai' | 'correlations';
export type Theme = 'dark' | 'light';
export type SystemTab = 'settings' | 'backups' | 'maintenance';
