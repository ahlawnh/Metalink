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
  RoomEvent,
  Track,
} from "livekit-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useIncidentTelemetryReporter } from "@/hooks/useIncidentTelemetryReporter";
import { useIncidentCprHapticListener } from "@/hooks/useIncidentCprHapticListener";
import { useRppgVitals } from "@/hooks/useRppgVitals";
import { CprDispatcherGuidance } from "@/components/incident_feed/CprDispatcherGuidance";
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
    return { tone: "yellow" as const, label: "Awaiting D/spatch" };
  }

  if (cs === ConnectionState.Connected && qualityPoor) {
    return { tone: "red" as const, label: "Poor Connection" };
  }

  if (cs === ConnectionState.Connected && remotes.length === 0) {
    return { tone: "yellow" as const, label: "Awaiting D/spatch" };
  }

  return { tone: "green" as const, label: "Connected" };
}

type VideoSharingChoice = "idle" | "undecided" | "accepted" | "declined";

function FaceTimeOfferModal({
  open,
  busy,
  onAccept,
  onDecline,
}: {
  open: boolean;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-12 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="facetime-offer-title"
    >
      <div className="w-full max-w-md rounded-3xl bg-neutral-900 p-6 text-center shadow-2xl ring-2 ring-white/10">
        <p
          id="facetime-offer-title"
          className="text-lg font-semibold text-white"
        >
          D/spatch requests video
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-white/70">
          D/spatch requested video to better assess the scene.
          You can stay on audio only.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onAccept}
            className="w-full rounded-full bg-emerald-500 px-6 py-3.5 text-[15px] font-semibold text-white shadow-lg hover:bg-emerald-400 disabled:opacity-50"
          >
            {busy ? "Starting camera…" : "Use FaceTime-style video"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDecline}
            className="w-full rounded-full bg-white/10 px-6 py-3.5 text-[15px] font-medium text-white ring-2 ring-white/20 hover:bg-white/15 disabled:opacity-50"
          >
            Stay audio-only
          </button>
        </div>
      </div>
    </div>
  );
}

function EmergencyCallSurface({
  callStartedAt,
  sessionId,
  roomName,
  livekitIdentity,
  initialLocation,
}: {
  callStartedAt: number;
  sessionId: string;
  roomName: string;
  livekitIdentity: string;
  initialLocation: IncidentLocationSnapshot | null;
}) {
  const room = useRoomContext();
  const timer = useCallTimer(callStartedAt);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [videoChoice, setVideoChoice] = useState<VideoSharingChoice>("idle");
  const [videoEnableBusy, setVideoEnableBusy] = useState(false);
  const [remoteParticipantCount, setRemoteParticipantCount] = useState(0);
  const [liveLocation, setLiveLocation] =
    useState<IncidentLocationSnapshot | null>(initialLocation);
  const videoChoiceRef = useRef(videoChoice);
  videoChoiceRef.current = videoChoice;
  const lastServerDeploySeqRef = useRef<number | null>(null);

  useEffect(() => {
    setLiveLocation(initialLocation);
  }, [initialLocation]);

  useEffect(() => {
    const sync = () => setRemoteParticipantCount(room.remoteParticipants.size);
    sync();
    room.on(RoomEvent.ParticipantConnected, sync);
    room.on(RoomEvent.ParticipantDisconnected, sync);
    return () => {
      room.off(RoomEvent.ParticipantConnected, sync);
      room.off(RoomEvent.ParticipantDisconnected, sync);
    };
  }, [room]);

  const ingestDeploySeq = useCallback((seq: number) => {
    if (videoChoiceRef.current === "accepted") {
      lastServerDeploySeqRef.current = seq;
      return;
    }
    const prev = lastServerDeploySeqRef.current;
    if (prev === null) {
      lastServerDeploySeqRef.current = seq;
      if (seq > 0) setVideoChoice("undecided");
      return;
    }
    if (seq === prev) return;
    lastServerDeploySeqRef.current = seq;
    setVideoChoice("undecided");
  }, []);

  useEffect(() => {
    if (!sessionId || videoChoice === "accepted") return;

    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/incident/video-deploy/status?sessionId=${encodeURIComponent(sessionId)}`
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { video_deploy_seq?: unknown };
        const seq =
          typeof data.video_deploy_seq === "number" ? data.video_deploy_seq : 0;
        if (!cancelled) ingestDeploySeq(seq);
      } catch {
        /* offline */
      }
    };

    void poll();
    const id = window.setInterval(poll, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [sessionId, videoChoice, ingestDeploySeq]);

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
    active: videoChoice === "accepted" && !videoEnableBusy,
    paused: tutorialOpen,
  });

  const cprHapticCue = useIncidentCprHapticListener(Boolean(sessionId));

  useIncidentTelemetryReporter({
    enabled: Boolean(sessionId),
    sessionId,
    roomName,
    livekitIdentity,
    callStartedAt,
    location: liveLocation,
    onVideoDeploySeq: ingestDeploySeq,
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
  const showVideoStage = videoChoice === "accepted";
  const hasRemoteVideo = showVideoStage && !!remoteCam;
  const hasLocalVideo = showVideoStage && !!localCam;

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

  const handleAcceptFaceTime = useCallback(async () => {
    setVideoEnableBusy(true);
    try {
      await room.localParticipant.setCameraEnabled(true, {
        facingMode: "environment",
      });
      setVideoChoice("accepted");
    } finally {
      setVideoEnableBusy(false);
    }
  }, [room]);

  const handleDeclineFaceTime = useCallback(() => {
    setVideoChoice("declined");
  }, []);

  const faceTimeOfferOpen =
    videoChoice === "undecided" && room.state === ConnectionState.Connected;

  const voiceSubtitle =
    room.state === ConnectionState.Connecting
      ? "Connecting…"
      : remoteParticipantCount === 0
        ? "Waiting for dispatch…"
        : videoChoice === "idle"
          ? "Connected — standby until dispatch cues video"
          : videoChoice === "declined"
            ? "Connected — audio only"
            : videoChoice === "undecided"
              ? "Follow the prompt on screen"
              : null;

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-black transition-all duration-700 ease-in-out">
      <RoomAudioRenderer />

      <FaceTimeOfferModal
        open={faceTimeOfferOpen}
        busy={videoEnableBusy}
        onAccept={() => void handleAcceptFaceTime()}
        onDecline={handleDeclineFaceTime}
      />

      {/* Main stage */}
      <div className="absolute inset-0 transition-all duration-700 ease-in-out">
        {!showVideoStage ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-gradient-to-b from-neutral-950 to-black px-8">
            <div className="flex h-28 w-28 items-center justify-center rounded-full bg-white/10 ring-4 ring-white/15">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-14 w-14 text-white/90"
                aria-hidden
              >
                <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-lg font-medium text-white">
                Emergency voice call
              </p>
              {voiceSubtitle ? (
                <p className="mt-2 text-sm text-white/55">{voiceSubtitle}</p>
              ) : videoEnableBusy ? (
                <p className="mt-2 text-sm text-white/55">Starting camera…</p>
              ) : null}
            </div>
          </div>
        ) : hasRemoteVideo && remoteCam ? (
          <VideoTrack
            trackRef={remoteCam}
            className="h-full w-full object-cover"
          />
        ) : hasLocalVideo && localCam ? (
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
      {showVideoStage && hasRemoteVideo && localCam ? (
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
              {videoChoice !== "accepted" ? (
                <span className="text-base font-medium text-white/45">
                  Video off
                </span>
              ) : vitals.bpmAnalyzing ? (
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
            disabled={videoChoice !== "accepted"}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 text-lg font-semibold text-white ring-2 ring-white/25 hover:bg-white/25 disabled:pointer-events-none disabled:opacity-35"
            aria-label="Vitals help"
          >
            ?
          </button>

          <div className="min-w-0 flex-1 text-center">
            <p className="text-[10px] font-medium uppercase tracking-wide text-white/55">
              Breathing (est.)
            </p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums text-white">
              {videoChoice !== "accepted" ? (
                <span className="text-base font-medium text-white/45">
                  Video off
                </span>
              ) : vitals.rr > 0 ? (
                vitals.rr
              ) : (
                "—"
              )}
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

      <CprDispatcherGuidance cue={cprHapticCue} />
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
  const notifySessionEnd = useCallback(async () => {
    try {
      await fetch("/api/incident/session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
    } catch {
      /* dispatch clear is best-effort */
    }
    onSessionEnd();
  }, [onSessionEnd, sessionId]);

  return (
    <div className="h-[100dvh] w-screen overflow-hidden bg-black transition-all duration-700 ease-in-out">
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect
        audio
        video={false}
        screen={false}
        onDisconnected={() => void notifySessionEnd()}
      >
        <EmergencyCallSurface
          callStartedAt={callStartedAt}
          sessionId={sessionId}
          roomName={roomName}
          livekitIdentity={livekitIdentity}
          initialLocation={initialLocation}
        />
      </LiveKitRoom>
    </div>
  );
}
