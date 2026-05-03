"use client";

import { useEffect, useRef } from "react";

import type {
  IncidentLocationSnapshot,
  IncidentTelemetryBatch,
  IncidentVitalsSnapshot,
} from "@/lib/incidentTelemetry";
import { INCIDENT_TELEMETRY_SCHEMA_VERSION } from "@/lib/incidentTelemetry";

const FLUSH_MS = 1_500;
const STORAGE_KEY = "metalink_last_telemetry";

type Args = {
  enabled: boolean;
  sessionId: string;
  roomName: string;
  livekitIdentity: string;
  callStartedAt: number;
  location: IncidentLocationSnapshot | null;
  vitals: IncidentVitalsSnapshot;
  /** Backend returns monotonic `video_deploy_seq` when dispatch cues camera/vitals. */
  onVideoDeploySeq?: (seq: number) => void;
};

async function postBatch(
  body: IncidentTelemetryBatch,
  onVideoDeploySeq?: (seq: number) => void
) {
  const json = JSON.stringify(body);
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(STORAGE_KEY, json);
    }
  } catch {
    /* ignore quota */
  }

  try {
    const res = await fetch("/api/incident/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: json,
    });
    const data = (await res.json()) as { video_deploy_seq?: unknown };
    const seq =
      typeof data.video_deploy_seq === "number" ? data.video_deploy_seq : 0;
    onVideoDeploySeq?.(seq);
  } catch {
    /* unreachable proxy */
  }
}

/**
 * Sends location + vitals to `/api/incident/telemetry` on an interval while in-call.
 * Mirrors last payload in `sessionStorage` under `metalink_last_telemetry` for debugging.
 */
export function useIncidentTelemetryReporter(args: Args) {
  const argsRef = useRef(args);
  argsRef.current = args;

  useEffect(() => {
    if (!args.enabled || !args.sessionId) return;

    const tick = () => {
      const a = argsRef.current;
      if (!a.enabled || !a.sessionId) return;

      const batch: IncidentTelemetryBatch = {
        schemaVersion: INCIDENT_TELEMETRY_SCHEMA_VERSION,
        sessionId: a.sessionId,
        roomName: a.roomName,
        livekitIdentity: a.livekitIdentity,
        callStartedAt: new Date(a.callStartedAt).toISOString(),
        sentAt: new Date().toISOString(),
        location: a.location,
        vitals: a.vitals,
      };
      void postBatch(batch, a.onVideoDeploySeq);
    };

    tick();
    const id = window.setInterval(tick, FLUSH_MS);
    return () => window.clearInterval(id);
  }, [args.enabled, args.sessionId, args.roomName, args.livekitIdentity, args.callStartedAt]);
}
