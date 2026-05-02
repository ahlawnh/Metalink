/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TELEMETRY_API_ORIGIN?: string
  readonly VITE_TELEMETRY_WS_URL?: string
  readonly VITE_TELEMETRY_SCENARIO?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
