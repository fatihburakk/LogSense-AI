// ──────────────────────────────────────────────
// LogSense AI — Grafik Verisi Üreticileri
// ──────────────────────────────────────────────

import { LogEntry, AlertEntry, ChartPoint } from "@/types";
import { fmtTime } from "./utils";

export function buildChart(logs: LogEntry[]): ChartPoint[] {
  const b: Record<string, ChartPoint> = {};
  logs.forEach((l) => {
    const k = fmtTime(l.timestamp).substring(0, 5);
    if (!b[k]) b[k] = { time: k, info: 0, warn: 0, error: 0, maxScore: 0 };
    if (l.level === "INFO") b[k].info++;
    else if (l.level === "WARN") b[k].warn++;
    else if (l.level === "ERROR" || l.level === "CRITICAL") b[k].error++;
    if (l.ai_analysis) b[k].maxScore = Math.max(b[k].maxScore, l.ai_analysis.anomaly_score);
  });
  return Object.values(b).slice(-20);
}

export function buildSourceData(logs: LogEntry[]) {
  const counts: Record<string, number> = {};
  logs.forEach((l) => {
    counts[l.source] = (counts[l.source] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function buildSeverityData(logs: LogEntry[]) {
  const s = { INFO: 0, WARN: 0, ERROR: 0, CRITICAL: 0 };
  logs.forEach((l) => {
    if (l.level in s) s[l.level as keyof typeof s]++;
  });
  return [
    { name: "Info", value: s.INFO, color: "#3b82f6" },
    { name: "Warn", value: s.WARN, color: "#f59e0b" },
    { name: "Error", value: s.ERROR, color: "#ef4444" },
    { name: "Critical", value: s.CRITICAL, color: "#7f1d1d" },
  ].filter((x) => x.value > 0);
}

export function buildHttpData(logs: LogEntry[]) {
  const counts: Record<string, number> = { "2xx": 0, "4xx": 0, "5xx": 0 };
  logs.forEach((l) => {
    const code = l.enrichment?.http_info?.code;
    if (code) {
      if (code >= 200 && code < 300) counts["2xx"]++;
      else if (code >= 400 && code < 500) counts["4xx"]++;
      else if (code >= 500) counts["5xx"]++;
    }
  });
  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .filter((x) => x.value > 0);
}

export function buildRiskData(logs: LogEntry[]) {
  const counts: Record<string, number> = { Low: 0, Medium: 0, High: 0 };
  logs.forEach((l) => {
    const risk = l.enrichment?.ip_info?.risk_level;
    if (risk) {
      const key = risk.charAt(0).toUpperCase() + risk.slice(1);
      if (key in counts) counts[key]++;
    }
  });
  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .filter((x) => x.value > 0);
}

export function buildTopErrorsData(logs: LogEntry[]) {
  const counts: Record<string, number> = {};
  logs.forEach((l) => {
    if (l.level === "ERROR" || l.level === "CRITICAL") {
      const cleanMsg = l.message.replace(/\d+/g, "X").substring(0, 60) + "...";
      counts[cleanMsg] = (counts[cleanMsg] || 0) + 1;
    }
  });
  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

export function buildAnomalyStatusData(alerts: AlertEntry[]) {
  return [
    { name: "Aktif", value: alerts.filter((a) => !a.is_resolved).length, color: "#ef4444" },
    { name: "Çözüldü", value: alerts.filter((a) => a.is_resolved).length, color: "#22c55e" },
  ].filter((x) => x.value > 0);
}
