import { NextRequest, NextResponse } from "next/server";

/**
 * Proxies the FastAPI bystander token (publish) so the browser never sees API keys.
 * Operator dashboard uses `GET /api/livekit/token`; incident feed uses broadcaster token.
 */
export async function GET(request: NextRequest) {
  const base =
    process.env.BACKEND_INTERNAL_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:8000";
  const q = request.nextUrl.searchParams.toString();
  const url = `${base}/api/livekit/broadcaster/token${q ? `?${q}` : ""}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = (await res.json()) as unknown;
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Token fetch failed";
    return NextResponse.json({ detail: msg }, { status: 502 });
  }
}
