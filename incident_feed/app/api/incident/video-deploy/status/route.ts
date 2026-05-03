import { NextRequest, NextResponse } from "next/server";

/**
 * Proxies video-deploy sequence for caller polling (dispatcher bumped seq from FastAPI).
 * Backend: `GET /api/incident/video-deploy/status?session_id=...`
 */
export async function GET(request: NextRequest) {
  const base =
    process.env.BACKEND_INTERNAL_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:8000";

  const sessionId = request.nextUrl.searchParams.get("sessionId") ?? "";
  if (sessionId.length < 8) {
    return NextResponse.json({ detail: "sessionId required" }, { status: 400 });
  }

  const url = new URL(`${base}/api/incident/video-deploy/status`);
  url.searchParams.set("session_id", sessionId);

  try {
    const res = await fetch(url.toString(), { method: "GET" });
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
