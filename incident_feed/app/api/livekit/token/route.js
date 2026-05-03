import { AccessToken } from "livekit-server-sdk";

export const dynamic = "force-dynamic";

/**
 * Mints a short-lived publisher token. Secrets stay server-side only.
 * Query: room (optional), identity (optional)
 */
export async function GET(request) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const defaultRoom =
    process.env.LIVEKIT_ROOM || process.env.NEXT_PUBLIC_LIVEKIT_ROOM || "";
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL || "";

  if (!apiKey || !apiSecret) {
    return Response.json(
      { error: "Missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET on the server." },
      { status: 500 }
    );
  }

  if (!url) {
    return Response.json(
      { error: "Missing NEXT_PUBLIC_LIVEKIT_URL (LiveKit websocket URL)." },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const room = searchParams.get("room") || defaultRoom;
  if (!room) {
    return Response.json(
      {
        error:
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
