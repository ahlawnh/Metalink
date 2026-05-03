"use client";

import {
  buildTelemetryWsUrl,
  isWsTelemetryBlockedByMixedContent,
} from "@/lib/telemetryWsUrl";
import { useEffect, useState } from "react";

export type IncidentCprHapticCue =
  | { kind: "off" }
  | { kind: "on"; bpm: number };

const RECONNECT_MS = 3000;
const POLL_MS = 650;

function parseCueFromPayload(payload: unknown): IncidentCprHapticCue | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (!("haptic_cue" in p)) return null;
  const hc = p.haptic_cue;
  // Ingest often sends `"haptic_cue": null` on routine vitals — must NOT clear an active CPR broadcast.
  if (hc === null || hc === undefined) return null;
  if (typeof hc !== "object") return null;

  const h = hc as Record<string, unknown>;
  const pattern = h.pattern;
  const active = h.active;

  if (active === true && pattern === "cpr_metronome") {
    const raw = h.bpm;
    const bpm =
      typeof raw === "number" && Number.isFinite(raw)
        ? Math.min(140, Math.max(60, Math.round(raw)))
        : 110;
    return { kind: "on", bpm };
  }

  if (active === false || pattern === "none") {
    return { kind: "off" };
  }

  return null;
}

function mergeCue(
  prev: IncidentCprHapticCue,
  next: IncidentCprHapticCue | null,
): IncidentCprHapticCue {
  if (next === null) return prev;
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
}

/**
 * Subscribes to CPR haptic cues: telemetry WebSocket when allowed, plus HTTP polling as fallback
 * (HTTPS pages cannot use ws:// to a plain FastAPI server — mixed content).
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
    let pollTimer: number | null = null;

    const wsUrl = buildTelemetryWsUrl();
    const wsBlocked = isWsTelemetryBlockedByMixedContent(wsUrl);

    const applyParsed = (next: IncidentCprHapticCue | null) => {
      if (cancelled || next === null) return;
      setCue((prev) => mergeCue(prev, next));
    };

    const pollSnapshot = async () => {
      try {
        const res = await fetch("/api/telemetry/haptic-snapshot", {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { haptic_cue?: unknown };
        applyParsed(parseCueFromPayload({ haptic_cue: body.haptic_cue }));
      } catch {
        /* offline */
      }
    };

    void pollSnapshot();
    pollTimer = window.setInterval(() => void pollSnapshot(), POLL_MS);

    const clearReconnect = () => {
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const connectWs = () => {
      clearReconnect();
      if (cancelled || wsBlocked) return;
      socket = new WebSocket(wsUrl);

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as {
            event_type?: string;
            payload?: unknown;
          };
          if (data.event_type !== "telemetry.update") return;
          applyParsed(parseCueFromPayload(data.payload));
        } catch {
          /* ignore */
        }
      };

      socket.onclose = () => {
        if (cancelled || wsBlocked) return;
        reconnectTimer = setTimeout(connectWs, RECONNECT_MS);
      };
    };

    if (!wsBlocked) {
      connectWs();
    }

    return () => {
      cancelled = true;
      clearReconnect();
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
      socket?.close();
      socket = null;
    };
  }, [enabled]);

  return cue;
}
