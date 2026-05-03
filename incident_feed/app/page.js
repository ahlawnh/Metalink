"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import LocalCameraPreview from "@/components/LocalCameraPreview";

const IncidentBroadcaster = dynamic(
  () => import("@/components/IncidentBroadcaster"),
  { ssr: false }
);

/** Supports FastAPI `{ detail: string | [...] | object }` and `{ error }`. */
function apiFailureDetail(data) {
  if (!data || typeof data !== "object") return null;
  if (typeof data.error === "string") return data.error;
  const d = data.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    return d
      .map((item) =>
        item && typeof item === "object" && "msg" in item
          ? String(item.msg)
          : String(item)
      )
      .filter(Boolean)
      .join(" ");
  }
  if (d && typeof d === "object") {
    if ("message" in d && typeof d.message === "string") return d.message;
  }
  return null;
}

function relayFailureMessage(status, rawBody, parsed) {
  const fromApi = apiFailureDetail(parsed);
  if (fromApi) return fromApi;
  if (status === 502) {
    return "Could not reach the FastAPI backend. Start it on port 8000 and set BACKEND_INTERNAL_URL in incident_feed/.env.local.";
  }
  if (status === 503) {
    return "Backend refused LiveKit token (often LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET missing in backend/.env).";
  }
  const trimmed = typeof rawBody === "string" ? rawBody.trim() : "";
  if (trimmed.startsWith("<") || trimmed.startsWith("<!")) {
    return `Token endpoint returned HTML (${status}), not JSON — check BACKEND_INTERNAL_URL and backend URL.`;
  }
  if (trimmed.length > 0 && trimmed.length < 220) return trimmed;
  if (!parsed || typeof parsed !== "object") {
    return `Token response was not valid JSON (${status}).`;
  }
  return `Token request failed (${status}).`;
}

export default function HomePage() {
  const [phase, setPhase] = useState(
    /** @type {'idle' | 'preview' | 'relay'} */ ("idle")
  );
  const [localStream, setLocalStream] = useState(null);
  const [relaySession, setRelaySession] = useState(null);
  const [relayNotice, setRelayNotice] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const streamRef = useRef(null);

  const stopLocalTracks = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setLocalStream(null);
  }, []);

  const disconnectAll = useCallback(() => {
    stopLocalTracks();
    setRelaySession(null);
    setRelayNotice(null);
    setPhase("idle");
    setError(null);
  }, [stopLocalTracks]);

  useEffect(() => {
    return () => stopLocalTracks();
  }, [stopLocalTracks]);

  const tryRelayToken = useCallback(async () => {
    const res = await fetch("/api/livekit/token");
    const rawBody = await res.text();
    let data = {};
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = {};
    }

    const okPayload =
      res.ok &&
      typeof data.token === "string" &&
      data.token.length > 0 &&
      typeof data.url === "string" &&
      data.url.trim().length > 0;

    if (!okPayload) {
      const core = relayFailureMessage(res.status, rawBody, data);
      setRelayNotice(
        `${core} Your camera preview on this device still works — Try again after fixing env or restarting servers.`
      );
      return null;
    }

    setRelayNotice(null);
    return {
      token: data.token,
      serverUrl: data.url.trim(),
      room: data.room,
      identity: data.identity,
    };
  }, []);

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    setRelayNotice(null);

    const hostname =
      typeof window !== "undefined" ? window.location.hostname : "";
    const protocol =
      typeof window !== "undefined" ? window.location.protocol : "";
    const isLocalHost =
      hostname === "localhost" || hostname === "127.0.0.1";
    const insecureHttpLan = protocol === "http:" && !isLocalHost;

    const hasGetUserMedia =
      typeof navigator !== "undefined" &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function";

    if (!hasGetUserMedia) {
      setError(
        insecureHttpLan
          ? "On iPhone, Safari only exposes the camera over HTTPS or on localhost—not over plain http:// with your Mac's Wi‑Fi address. Use an HTTPS tunnel to your Mac (Cloudflare Tunnel, ngrok, etc.) or deploy this app to HTTPS hosting, then open that URL on your phone."
          : "Camera isn't available in this browser or context. Use Safari or Chrome (not an in-app browser), update your device, or open the site over HTTPS."
      );
      setBusy(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;
      setLocalStream(stream);
      setPhase("preview");

      const session = await tryRelayToken();
      if (session) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setLocalStream(null);
        setRelaySession(session);
        setPhase("relay");
      }
    } catch (e) {
      const name = e && typeof e === "object" && "name" in e ? e.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError(
          "Camera or microphone permission was blocked. Allow access in Settings, then try again."
        );
      } else if (name === "NotFoundError") {
        setError("No camera found on this device.");
      } else {
        setError(
          e instanceof Error ? e.message : "Could not open camera. Try again."
        );
      }
      stopLocalTracks();
      setPhase("idle");
    } finally {
      setBusy(false);
    }
  }, [stopLocalTracks, tryRelayToken]);

  const retryRelay = useCallback(async () => {
    if (phase !== "preview" || !localStream) return;
    setBusy(true);
    setRelayNotice(null);
    try {
      const session = await tryRelayToken();
      if (session) {
        localStream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setLocalStream(null);
        setRelaySession(session);
        setPhase("relay");
      }
    } finally {
      setBusy(false);
    }
  }, [phase, localStream, tryRelayToken]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 pb-12 pt-14 sm:px-8">
      {phase === "idle" ? (
        <>
          <div className="mb-12 space-y-4 text-center">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-neutral-500">
              When it&apos;s safe
            </p>
            <h1 className="text-[1.65rem] font-semibold leading-snug tracking-tight text-neutral-900 sm:text-3xl">
              Share what dispatch needs to see
            </h1>
            <p className="mx-auto max-w-sm text-[15px] leading-relaxed text-neutral-600">
              One tap turns on your camera and microphone so responders can guide you.
              Stay aware of your surroundings.
            </p>
          </div>

          <div className="mt-auto flex flex-col items-center gap-6 sm:mt-8">
            <button
              type="button"
              onClick={connect}
              disabled={busy}
              className="group relative w-full max-w-sm overflow-hidden rounded-2xl bg-neutral-900 px-8 py-4 text-[17px] font-semibold text-white shadow-[0_2px_24px_-4px_rgba(0,0,0,0.28)] transition hover:bg-neutral-800 active:scale-[0.99] disabled:opacity-50"
            >
              <span className="relative z-10">
                {busy ? "Starting…" : "Connect with dispatch"}
              </span>
            </button>
            <p className="max-w-xs text-center text-[13px] leading-relaxed text-neutral-500">
              You&apos;ll be asked to allow camera and microphone.
            </p>
          </div>
        </>
      ) : null}

      {phase === "preview" && localStream ? (
        <section className="flex flex-1 flex-col gap-5">
          <div className="overflow-hidden rounded-2xl border border-neutral-200/90 bg-neutral-950 shadow-md ring-1 ring-black/[0.06]">
            <div className="relative aspect-[3/4] max-h-[62vh] w-full bg-neutral-900 sm:aspect-video sm:max-h-[52vh]">
              <LocalCameraPreview stream={localStream} />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent pb-5 pt-16 px-5">
                <div className="flex items-center gap-2">
                  <span
                    className="relative flex h-2.5 w-2.5"
                    aria-hidden
                  >
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/70 opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
                  </span>
                  <p className="text-[15px] font-medium leading-snug text-white drop-shadow-sm">
                    Waiting for dispatch
                  </p>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-white/85 drop-shadow-sm">
                  Stay on this screen and keep the scene in view. Help is coordinating on
                  their side.
                </p>
              </div>
            </div>
          </div>

          {relayNotice ? (
            <p className="rounded-xl border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-[13px] leading-relaxed text-amber-950">
              {relayNotice}{" "}
              <button
                type="button"
                onClick={retryRelay}
                disabled={busy}
                className="font-semibold text-amber-900 underline decoration-amber-700/40 underline-offset-2 hover:decoration-amber-900 disabled:opacity-50"
              >
                Try again
              </button>
            </p>
          ) : (
            <p className="text-center text-[13px] text-neutral-500">
              Connecting you to dispatch…
            </p>
          )}

          <button
            type="button"
            onClick={disconnectAll}
            className="mx-auto rounded-xl border border-neutral-300 bg-white px-6 py-3 text-[14px] font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50"
          >
            End session
          </button>
        </section>
      ) : null}

      {phase === "relay" && relaySession ? (
        <section className="flex flex-1 flex-col gap-5">
          <div className="rounded-xl border border-emerald-200/90 bg-emerald-50/80 px-4 py-3 text-[13px] leading-relaxed text-emerald-950">
            <p className="font-medium text-emerald-900">Connected to dispatch relay</p>
            <p className="mt-0.5 text-emerald-900/85">
              Dispatch can receive your audio and video. Keep your camera steady when safe.
            </p>
          </div>
          <IncidentBroadcaster
            token={relaySession.token}
            serverUrl={relaySession.serverUrl}
          />
          <button
            type="button"
            onClick={disconnectAll}
            className="rounded-xl border border-neutral-300 bg-white px-6 py-3 text-[14px] font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50"
          >
            End session
          </button>
        </section>
      ) : null}

      {error ? (
        <p
          className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-relaxed text-red-900"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </main>
  );
}
