/** True for localhost / RFC1918 — backend usually on same machine :8000 as plain ws. */
function isLikelySameMachineTelemetryHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  return /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

/** HTTPS documents cannot open `ws://` sockets (mixed content). Poll `/api/telemetry/haptic-snapshot` instead. */
export function isWsTelemetryBlockedByMixedContent(wsUrl: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.isSecureContext &&
      window.location.protocol === "https:" &&
      wsUrl.startsWith("ws://")
    );
  } catch {
    return false;
  }
}

/** Browser WebSocket URL for FastAPI `/api/ws/telemetry` (same contract as MetalinkFrontend). */
export function buildTelemetryWsUrl(): string {
  const fallback = "ws://127.0.0.1:8000/api/ws/telemetry";
  try {
    const override = process.env.NEXT_PUBLIC_TELEMETRY_WS_URL?.trim();
    if (override) return override;

    let origin = process.env.NEXT_PUBLIC_TELEMETRY_API_ORIGIN?.trim();

    if (
      !origin &&
      typeof window !== "undefined" &&
      isLikelySameMachineTelemetryHost(window.location.hostname)
    ) {
      origin = `http://${window.location.hostname}:8000`;
    }

    if (!origin) origin = "http://127.0.0.1:8000";

    const u = new URL(origin);
    const wsProto = u.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProto}//${u.host}/api/ws/telemetry`;
  } catch {
    return fallback;
  }
}
