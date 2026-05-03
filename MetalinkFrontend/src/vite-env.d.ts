/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TELEMETRY_API_ORIGIN?: string
  readonly VITE_TELEMETRY_WS_URL?: string
  readonly VITE_TELEMETRY_SCENARIO?: string
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
  readonly VITE_VIDEO_STREAM_URL?: string
  readonly VITE_LIVEKIT_URL?: string
  readonly VITE_LIVEKIT_TOKEN?: string
  /** Display only when using static env session */
  readonly VITE_LIVEKIT_ROOM?: string
  readonly VITE_LIVEKIT_CALLER_PARTICIPANT_IDENTITY?: string
  readonly VITE_LIVEKIT_OPERATOR_PARTICIPANT_IDENTITY?: string
  /** Exclude ingest / bot participant when resolving the caller (defaults match backend `LIVEKIT_IDENTITY`). */
  readonly VITE_LIVEKIT_BACKEND_PARTICIPANT_IDENTITY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
