"use client";

import "@livekit/components-styles/components";

import {
  isTrackReference,
  RoomAudioRenderer,
  VideoTrack,
  LiveKitRoom,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import {
  ConnectionQuality,
  ConnectionState,
  Room,
  Track,
} from "livekit-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useIncidentTelemetryReporter } from "@/hooks/useIncidentTelemetryReporter";
import { useRppgVitals } from "@/hooks/useRppgVitals";
import { VitalsTutorialModal } from "@/components/incident_feed/VitalsTutorialModal";
import type { IncidentLocationSnapshot } from "@/lib/incidentTelemetry";
import { positionToSnapshot } from "@/lib/incidentTelemetry";

export type IncidentFeedProps = {
  token: string;
  serverUrl: string;
  callStartedAt: number;
  sessionId: string;
  roomName: string;
  livekitIdentity: string;
  initialLocation: IncidentLocationSnapshot | null;
  onSessionEnd: () => void;
};

function formatMmSs(elapsedSec: number) {
  const sec = Math.max(0, Math.floor(elapsedSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function useCallTimer(callStartedAt: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return formatMmSs((now - callStartedAt) / 1000);
}

function connectionBadgeState(room: Room) {
  const cs = room.state;
  const locals = room.localParticipant;
  const remotes = [...room.remoteParticipants.values()];

  const badQuality = (q: ConnectionQuality) =>
    q === ConnectionQuality.Poor || q === ConnectionQuality.Lost;

  const qualityPoor =
    (locals && badQuality(locals.connectionQuality)) ||
    remotes.some((p) => badQuality(p.connectionQuality));

  if (
    cs === ConnectionState.Disconnected ||
    cs === ConnectionState.Reconnecting
  ) {
    return { tone: "red" as const, label: "Poor Connection" };
  }

  if (cs === ConnectionState.Connecting) {
    return { tone: "yellow" as const, label: "Awaiting Dispatch" };
  }

  if (cs === ConnectionState.Connected && qualityPoor) {
    return { tone: "red" as const, label: "Poor Connection" };
  }

  if (cs === ConnectionState.Connected && remotes.length === 0) {
    return { tone: "yellow" as const, label: "Awaiting Dispatch" };
  }

  return { tone: "green" as const, label: "Connected" };
}

function EmergencyCallSurface({
  callStartedAt,
  sessionId,
  roomName,
  livekitIdentity,
  initialLocation,
  onSessionEnd,
}: {
  callStartedAt: number;
  sessionId: string;
  roomName: string;
  livekitIdentity: string;
  initialLocation: IncidentLocationSnapshot | null;
  onSessionEnd: () => void;
}) {
  const room = useRoomContext();
  const timer = useCallTimer(callStartedAt);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [liveLocation, setLiveLocation] =
    useState<IncidentLocationSnapshot | null>(initialLocation);

  useEffect(() => {
    setLiveLocation(initialLocation);
  }, [initialLocation]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setLiveLocation(positionToSnapshot(pos)),
      () => {},
      {
        enableHighAccuracy: true,
        maximumAge: 4000,
        timeout: 25000,
      }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const vitals = useRppgVitals(localVideoRef, {
    active: true,
    paused: tutorialOpen,
  });

  useIncidentTelemetryReporter({
    enabled: Boolean(sessionId),
    sessionId,
    roomName,
    livekitIdentity,
    callStartedAt,
    location: liveLocation,
    vitals: {
      heartRateBpm:
        vitals.bpmAnalyzing || vitals.bpmDisplay <= 0
          ? null
          : vitals.bpmDisplay,
      respiratoryRate: vitals.rr > 0 ? vitals.rr : null,
      bpmAnalyzing: vitals.bpmAnalyzing,
    },
  });

  const cameraTracks = useTracks(
    [Track.Source.Camera],
    { onlySubscribed: false }
  );
  const cameras = useMemo(
    () => cameraTracks.filter(isTrackReference),
    [cameraTracks]
  );

  const localCam = cameras.find((t) => t.participant.isLocal);
  const remoteCam = cameras.find((t) => !t.participant.isLocal);
  const hasRemote = !!remoteCam;

  const badge = connectionBadgeState(room);

  const pillClass =
    badge.tone === "yellow"
      ? "bg-amber-400 text-neutral-900"
      : badge.tone === "green"
        ? "bg-emerald-500 text-white"
        : "bg-red-600 text-white";

  const handleEnd = useCallback(async () => {
    await room.disconnect();
  }, [room]);

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-black transition-all duration-700 ease-in-out">
      <RoomAudioRenderer />

      {/* Main stage */}
      <div className="absolute inset-0 transition-all duration-700 ease-in-out">
        {hasRemote && remoteCam ? (
          <VideoTrack
            trackRef={remoteCam}
            className="h-full w-full object-cover"
          />
        ) : localCam ? (
          <VideoTrack
            ref={localVideoRef}
            trackRef={localCam}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-neutral-950 text-sm text-neutral-500">
            Starting camera…
          </div>
        )}
      </div>

      {/* PiP local */}
      {hasRemote && localCam ? (
        <div className="absolute bottom-24 right-5 z-30 h-44 w-32 overflow-hidden rounded-2xl bg-black/40 shadow-2xl ring-2 ring-white/25 transition-all duration-700 ease-in-out">
          <VideoTrack
            ref={localVideoRef}
            trackRef={localCam}
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}

      {/* Top status */}
      <header className="absolute left-0 right-0 top-0 z-50 flex justify-center pt-[max(0.75rem,env(safe-area-inset-top))] transition-all duration-700 ease-in-out">
        <div className="flex items-center gap-3 rounded-full bg-black/45 px-4 py-2 text-xs font-medium text-white backdrop-blur-md">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${pillClass}`}
          >
            {badge.label}
          </span>
          <span className="tabular-nums text-white/90">{timer}</span>
        </div>
      </header>

      {/* End call */}
      <div className="absolute bottom-[calc(7.5rem+env(safe-area-inset-bottom))] left-0 right-0 z-40 flex justify-center transition-all duration-700 ease-in-out">
        <button
          type="button"
          onClick={() => void handleEnd()}
          className="rounded-full bg-red-600 px-10 py-3 text-sm font-semibold text-white shadow-lg shadow-red-900/40 ring-2 ring-red-400/30 hover:bg-red-500"
        >
          End Call
        </button>
      </div>

      {/* Vitals HUD */}
      <footer className="absolute bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-black/40 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md transition-all duration-700 ease-in-out">
        <div className="relative mx-auto flex max-w-lg items-center justify-between gap-4">
          <div className="min-w-0 flex-1 text-center">
            <p className="text-[10px] font-medium uppercase tracking-wide text-white/55">
              Heart rate (est.)
            </p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums text-white">
              {vitals.bpmAnalyzing ? (
                <span className="text-base font-medium text-white/60">
                  Analyzing…
                </span>
              ) : vitals.bpmDisplay > 0 ? (
                vitals.bpmDisplay
              ) : (
                "—"
              )}
            </p>
            <p className="text-[10px] text-white/40">BPM</p>
          </div>

          <button
            type="button"
            onClick={() => setTutorialOpen(true)}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 text-lg font-semibold text-white ring-2 ring-white/25 hover:bg-white/25"
            aria-label="Vitals help"
          >
            ?
          </button>

          <div className="min-w-0 flex-1 text-center">
            <p className="text-[10px] font-medium uppercase tracking-wide text-white/55">
              Breathing (est.)
            </p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums text-white">
              {vitals.rr > 0 ? vitals.rr : "—"}
            </p>
            <p className="text-[10px] text-white/40">breaths / min</p>
          </div>
        </div>
        {vitals.error ? (
          <p className="mt-2 text-center text-[11px] text-amber-200/90">
            {vitals.error}
          </p>
        ) : null}
      </footer>

      <VitalsTutorialModal
        open={tutorialOpen}
        onClose={() => setTutorialOpen(false)}
      />
    </div>
  );
}

export function IncidentFeed({
  token,
  serverUrl,
  callStartedAt,
  sessionId,
  roomName,
  livekitIdentity,
  initialLocation,
  onSessionEnd,
}: IncidentFeedProps) {
  return (
    <div className="h-[100dvh] w-screen overflow-hidden bg-black transition-all duration-700 ease-in-out">
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect
        audio
        video={{ facingMode: "environment" }}
        screen={false}
        onDisconnected={() => onSessionEnd()}
      >
        <EmergencyCallSurface
          callStartedAt={callStartedAt}
          sessionId={sessionId}
          roomName={roomName}
          livekitIdentity={livekitIdentity}
          initialLocation={initialLocation}
          onSessionEnd={onSessionEnd}
        />
      </LiveKitRoom>
    </div>
  );
}
