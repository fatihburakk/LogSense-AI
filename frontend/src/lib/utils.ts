// ──────────────────────────────────────────────
// LogSense AI — Yardımcı Fonksiyonlar
// ──────────────────────────────────────────────

export function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "--:--:--";
  }
}

export function minsAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

export function scoreLevel(s: number): string {
  return s >= 0.8 ? "critical" : s >= 0.5 ? "high" : s >= 0.3 ? "medium" : "low";
}
