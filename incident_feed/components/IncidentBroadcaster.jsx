"use client";

import { LiveKitRoom } from "@livekit/components-react";
import "@livekit/components-styles";
import FaceTimeCallLayout from "@/components/FaceTimeCallLayout";

/**
 * Publishes camera + mic for ingest; FaceTime-style UI (solo fullscreen / PiP when remote has video).
 */
export default function IncidentBroadcaster({ token, serverUrl }) {
  const ready = Boolean(token && serverUrl);

  return (
    <div className="lk-scope overflow-hidden rounded-2xl border border-neutral-200/90 bg-white shadow-sm ring-1 ring-black/[0.04]">
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect={ready}
        audio={true}
        video={{
          facingMode: "environment",
        }}
        options={{
          adaptiveStream: true,
          dynacast: true,
          videoCaptureDefaults: {
            facingMode: "environment",
          },
        }}
        className="flex flex-col gap-1 p-3 sm:p-4"
        onError={(err) => console.error("[LiveKit]", err)}
      >
        <p className="px-0.5 text-center text-[11px] text-neutral-500">
          {ready
            ? "You fill the screen until dispatch joins with video — then they’re full screen and you move to the corner."
            : null}
        </p>
        <FaceTimeCallLayout />
      </LiveKitRoom>
    </div>
  );
}
