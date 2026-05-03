/** Browser WebSocket URL for FastAPI `/api/ws/telemetry` (same contract as MetalinkFrontend). */
export function buildTelemetryWsUrl(): string {
  const fallback = "ws://127.0.0.1:8000/api/ws/telemetry";
  try {
    const override = process.env.NEXT_PUBLIC_TELEMETRY_WS_URL?.trim();
    if (override) return override;
    const origin =
      process.env.NEXT_PUBLIC_TELEMETRY_API_ORIGIN?.trim() ||
      "http://127.0.0.1:8000";
    const u = new URL(origin);
    const wsProto = u.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProto}//${u.host}/api/ws/telemetry`;
  } catch {
    return fallback;
  }
}
