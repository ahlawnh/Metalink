import { AccessToken } from "livekit-server-sdk";

export const dynamic = "force-dynamic";

/**
 * Prefer forwarding to FastAPI (`BACKEND_INTERNAL_URL`) so LiveKit secrets stay only on the backend.
 * Fallback: mint here using LIVEKIT_* if no backend URL is set (local-only dev).
 */
export async function GET(request) {
  const backendRaw =
    process.env.BACKEND_INTERNAL_URL?.trim() ||
    process.env.LIVEKIT_TOKEN_BACKEND_URL?.trim() ||
    "";

  if (backendRaw) {
    const backend = backendRaw.replace(/\/+$/, "");
    const incoming = new URL(request.url);
    const target = new URL(`${backend}/api/livekit/token`);
    incoming.searchParams.forEach((v, k) => target.searchParams.set(k, v));
    let upstream;
    try {
      upstream = await fetch(target.toString(), { cache: "no-store" });
    } catch {
      return Response.json(
        { detail: "Could not reach FastAPI backend for LiveKit token." },
        { status: 502 }
      );
    }
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("Content-Type") || "application/json",
      },
    });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const defaultRoom =
    process.env.LIVEKIT_ROOM || process.env.NEXT_PUBLIC_LIVEKIT_ROOM || "";
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL || "";

  if (!apiKey || !apiSecret) {
    return Response.json(
      {
        detail:
          "Set BACKEND_INTERNAL_URL to your FastAPI base (e.g. http://127.0.0.1:8000), or configure LIVEKIT_API_KEY / LIVEKIT_API_SECRET on Next.js.",
      },
      { status: 500 }
    );
  }

  if (!url) {
    return Response.json(
      {
        detail:
          "Missing NEXT_PUBLIC_LIVEKIT_URL for local Next token fallback.",
      },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const room = searchParams.get("room") || defaultRoom;
  if (!room) {
    return Response.json(
      {
        detail:
          "No room configured. Set LIVEKIT_ROOM or NEXT_PUBLIC_LIVEKIT_ROOM, or pass ?room=",
      },
      { status: 400 }
    );
  }

  let identity = searchParams.get("identity");
  if (!identity) {
    identity = `bystander-${crypto.randomUUID().slice(0, 8)}`;
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    name: searchParams.get("name") || "Incident broadcaster",
  });

  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });

  const token = await at.toJwt();

  return Response.json({
    token,
    url,
    room,
    identity,
  });
}
