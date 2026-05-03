import { NextRequest, NextResponse } from "next/server";

/**
 * Proxies incident telemetry (location + vitals) to the FastAPI backend.
 * Backend path: `POST /api/incident/telemetry`
 */
export async function POST(request: NextRequest) {
  const base =
    process.env.BACKEND_INTERNAL_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:8000";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON" }, { status: 400 });
  }

  try {
    const res = await fetch(`${base}/api/incident/telemetry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upstream error";
    return NextResponse.json({ detail: msg, proxied: false }, { status: 502 });
  }
}
