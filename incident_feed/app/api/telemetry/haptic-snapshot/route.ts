import { NextResponse } from "next/server";

/**
 * Proxies polling CPR haptic snapshot for HTTPS PWAs where ws:// telemetry is mixed-content blocked.
 * Backend: GET /api/telemetry/haptic-snapshot
 */
export async function GET() {
  const base =
    process.env.BACKEND_INTERNAL_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:8000";

  try {
    const res = await fetch(`${base}/api/telemetry/haptic-snapshot`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const text = await res.text();
    let data: unknown = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upstream error";
    return NextResponse.json({ detail: msg, haptic_cue: null }, { status: 502 });
  }
}
