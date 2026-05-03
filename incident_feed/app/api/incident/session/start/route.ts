import { NextRequest, NextResponse } from "next/server";

/**
 * New bystander session — resume server-side STT. Backend: `POST /api/incident/session/start`
 */
export async function POST(request: NextRequest) {
  const base =
    process.env.BACKEND_INTERNAL_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:8000";

  let sessionId = "";
  try {
    const body = (await request.json()) as { sessionId?: string };
    if (typeof body.sessionId === "string") sessionId = body.sessionId;
  } catch {
    /* empty body */
  }

  const url = new URL(`${base}/api/incident/session/start`);
  if (sessionId) url.searchParams.set("session_id", sessionId);

  try {
    const res = await fetch(url.toString(), { method: "POST" });
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
