"use client";

import { buildTelemetryWsUrl } from "@/lib/telemetryWsUrl";
import { useEffect, useState } from "react";

export type IncidentCprHapticCue =
  | { kind: "off" }
  | { kind: "on"; bpm: number };

const RECONNECT_MS = 3000;

function parseCueFromPayload(payload: unknown): IncidentCprHapticCue | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (!("haptic_cue" in p)) return null;
  const hc = p.haptic_cue;
  if (!hc || typeof hc !== "object") {
    return { kind: "off" };
  }
  const h = hc as Record<string, unknown>;
  if (h.active === true && h.pattern === "cpr_metronome") {
    const raw = h.bpm;
    const bpm =
      typeof raw === "number" && Number.isFinite(raw)
        ? Math.min(140, Math.max(60, Math.round(raw)))
        : 110;
    return { kind: "on", bpm };
  }
  return { kind: "off" };
}

/**
 * Subscribes to telemetry WebSocket only to read `haptic_cue` updates.
 * Ignores frames that omit `haptic_cue` so routine vitals traffic does not clear an active cue.
 */
export function useIncidentCprHapticListener(enabled: boolean): IncidentCprHapticCue {
  const [cue, setCue] = useState<IncidentCprHapticCue>({ kind: "off" });

  useEffect(() => {
    if (!enabled) {
      setCue({ kind: "off" });
      return;
    }

    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const url = buildTelemetryWsUrl();

    const clearReconnect = () => {
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const connect = () => {
      clearReconnect();
      if (cancelled) return;
      socket = new WebSocket(url);

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as {
            event_type?: string;
            payload?: unknown;
          };
          if (data.event_type !== "telemetry.update") return;
          const next = parseCueFromPayload(data.payload);
          if (next === null) return;
          setCue((prev) => {
            if (next.kind === "off") {
              return prev.kind === "off" ? prev : next;
            }
            if (
              prev.kind === "on" &&
              next.kind === "on" &&
              prev.bpm === next.bpm
            ) {
              return prev;
            }
            return next;
          });
        } catch {
          /* ignore */
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        reconnectTimer = setTimeout(connect, RECONNECT_MS);
      };
    };

    connect();

    return () => {
      cancelled = true;
      clearReconnect();
      socket?.close();
      socket = null;
    };
  }, [enabled]);

  return cue;
}
