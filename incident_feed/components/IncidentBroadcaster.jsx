"use client";

import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";

/**
 * When LiveKit credentials are valid: publishes camera + mic for backend ingest.
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
        className="flex flex-col gap-2 p-3 sm:p-4"
        onError={(err) => console.error("[LiveKit]", err)}
      >
        <div className="relative min-h-[min(52vh,420px)] overflow-hidden rounded-xl bg-neutral-950 [&_.lk-video-conference]:min-h-[min(48vh,380px)] [&_.lk-video-conference]:h-full [&_.lk-video-conference-inner]:min-h-[inherit]">
          <VideoConference />
        </div>
      </LiveKitRoom>
    </div>
  );
}
