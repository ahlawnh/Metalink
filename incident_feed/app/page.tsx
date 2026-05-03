"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";

import type { IncidentLocationSnapshot } from "@/lib/incidentTelemetry";
import { requestInitialGeolocation } from "@/lib/incidentTelemetry";

const IncidentFeed = dynamic(
  () =>
    import("@/components/incident_feed/IncidentFeed").then((m) => m.IncidentFeed),
  { ssr: false }
);

type Session = {
  token: string;
  url: string;
  room: string;
  identity: string;
  sessionId: string;
  initialLocation: IncidentLocationSnapshot | null;
};

export default function IncidentFeedPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const start = useCallback(async () => {
    setConnectError(null);
    setConnecting(true);
    try {
      const initialLocation = await requestInitialGeolocation();

      const res = await fetch("/api/livekit/token");
      const data = (await res.json()) as {
        token?: string;
        url?: string;
        room?: string;
        identity?: string;
        detail?: string;
      };
      if (!res.ok) {
        throw new Error(
          typeof data.detail === "string" ? data.detail : "Could not get token"
        );
      }
      if (!data.token || !data.url) {
        throw new Error("Invalid token response");
      }

      const sessionId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `session-${Date.now()}`;

      void fetch("/api/incident/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      }).catch(() => {});

      setCallStartedAt(Date.now());
      setSession({
        token: data.token,
        url: data.url,
        room: data.room ?? "",
        identity: typeof data.identity === "string" ? data.identity : "",
        sessionId,
        initialLocation,
      });
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : "Connect failed");
    } finally {
      setConnecting(false);
    }
  }, []);

  const endSession = useCallback(() => {
    setSession(null);
    setCallStartedAt(null);
  }, []);

  if (session && callStartedAt) {
    return (
      <IncidentFeed
        token={session.token}
        serverUrl={session.url}
        callStartedAt={callStartedAt}
        sessionId={session.sessionId}
        roomName={session.room}
        livekitIdentity={session.identity}
        initialLocation={session.initialLocation}
        onSessionEnd={endSession}
      />
    );
  }

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-neutral-50 px-6 py-12">
      <div className="mx-auto flex w-full max-w-md flex-col items-center text-center">
        <h1 className="text-3xl font-light tracking-tight text-neutral-900 sm:text-[2rem]">
          Welcome to D/SPATCH.
        </h1>

        <p className="mt-10 max-w-sm text-[15px] leading-relaxed text-neutral-500">
          You&apos;ll join a secure voice call with emergency services. D/SPATCH may
          request camera and location access to help responders.
        </p>
        <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-neutral-500">
          You can continue on audio if you decline video.
        </p>

        <button
          type="button"
          onClick={() => void start()}
          disabled={connecting}
          className="mt-12 min-w-[220px] rounded-full bg-neutral-900 px-10 py-3.5 text-[15px] font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:opacity-50"
        >
          {connecting ? "Connecting…" : "Connect to D/SPATCH"}
        </button>

        {connectError ? (
          <p className="mt-6 max-w-sm text-sm text-red-600">{connectError}</p>
        ) : null}
      </div>
    </main>
  );
}
