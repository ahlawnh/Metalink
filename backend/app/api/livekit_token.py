from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query

from app.core.config import get_settings

router = APIRouter(tags=["livekit"])


@router.get("/broadcaster/token")
async def mint_broadcaster_token(
    identity: str | None = Query(
        None,
        description="Participant identity; generated if omitted.",
        max_length=128,
    ),
    name: str | None = Query(
        None,
        description="Display name shown to dispatch.",
        max_length=128,
    ),
) -> dict[str, str]:
    """
    Mint a short-lived JWT so bystander clients can publish camera/mic into the ingest room.

    Uses the same LIVEKIT_* configuration as ``livekit_ingest.py``. Secrets never leave the server.
    """
    settings = get_settings()
    if (
        not settings.livekit_api_key
        or not settings.livekit_api_secret
        or not settings.livekit_url.strip()
    ):
        raise HTTPException(
            status_code=503,
            detail="LiveKit is not configured (set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET).",
        )

    try:
        from livekit.api import AccessToken, VideoGrants  # type: ignore[attr-defined]
    except Exception as exc:  # pragma: no cover
        raise HTTPException(
            status_code=503,
            detail="LiveKit SDK unavailable on server.",
        ) from exc

    pid = identity.strip() if identity else f"bystander-{uuid.uuid4().hex[:10]}"
    display = name.strip() if name else "Bystander"

    grants = VideoGrants(
        room_join=True,
        room=settings.livekit_room,
        can_publish=True,
        can_subscribe=True,
    )

    token = (
        AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(pid)
        .with_name(display)
        .with_grants(grants)
        .to_jwt()
    )

    return {
        "token": token,
        "url": settings.livekit_url,
        "room": settings.livekit_room,
        "identity": pid,
    }
