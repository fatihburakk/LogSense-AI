"use client";

// ──────────────────────────────────────────────
// LogSense AI — WebSocket Custom Hook
// ──────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import { LogEntry, AIAnalysis } from "@/types";

export function useWebSocket(url: string) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnect = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (e) => {
        const p = JSON.parse(e.data);
        if (p.type === "history") {
          setLogs(p.data.reverse());
        } else if (p.type === "log") {
          setLogs((prev) => [p.data, ...prev.slice(0, 999)]);
          if (p.data.ai_analysis?.ml_prediction === "anomaly") {
            window.dispatchEvent(new CustomEvent("new-alert", { detail: p.data }));
          }
        } else if (p.type === "llm_update") {
          setLogs((prev) =>
            prev.map((log) =>
              log.id === p.log_id
                ? {
                    ...log,
                    ai_analysis: {
                      ...log.ai_analysis,
                      llm_analysis: p.llm_analysis,
                    } as AIAnalysis,
                  }
                : log
            )
          );
          window.dispatchEvent(new CustomEvent("update-alert", { detail: p }));
        } else if (p.type === "correlation") {
          window.dispatchEvent(new CustomEvent("new-correlation", { detail: p.data }));
        }
      };
      ws.onclose = () => {
        setConnected(false);
        reconnect.current = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
    } catch {
      reconnect.current = setTimeout(connect, 3000);
    }
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (reconnect.current) clearTimeout(reconnect.current);
    };
  }, [connect]);

  return {
    logs,
    connected,
    clearLogs: useCallback(() => setLogs([]), []),
  };
}
