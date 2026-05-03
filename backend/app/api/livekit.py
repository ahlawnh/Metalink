from __future__ import annotations

import re
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.config import get_settings

router = APIRouter()

_IDENTITY_RE = re.compile(r"^[a-zA-Z0-9._@-]{1,128}$")


class LiveKitTokenResponse(BaseModel):
    """Credentials for the operator dashboard joining the configured room."""

    url: str = Field(description="WebSocket URL for the LiveKit server, e.g. wss://*.livekit.cloud")
    token: str = Field(
        description="JWT with subscribe + publish (microphone only; camera disabled in the client app)"
    )
    room: str
    identity: str = Field(description="Participant identity embedded in the token")


def _sanitize_identity(raw: Optional[str], default: str) -> str:
    candidate = (raw or "").strip() or default
    if not _IDENTITY_RE.fullmatch(candidate):
        raise HTTPException(
            status_code=400,
            detail="identity must be 1–128 chars: letters, digits, . _ @ -",
        )
    return candidate


@router.get("/token", response_model=LiveKitTokenResponse)
def issue_operator_livekit_token(
    identity: Optional[str] = Query(
        default=None,
        description="Unique participant id for this browser session (recommended per tab).",
    ),
) -> LiveKitTokenResponse:
    """
    Mint a short-lived LiveKit JWT for the Metalink operator dashboard.

    Grants subscribe + **publish microphone** (no camera); the client keeps the camera track disabled.

    Requires ``LIVEKIT_URL``, ``LIVEKIT_API_KEY``, and ``LIVEKIT_API_SECRET`` on the server.
    """
    settings = get_settings()
    if not settings.livekit_url.strip() or not settings.livekit_api_key.strip() or not settings.livekit_api_secret.strip():
        raise HTTPException(
            status_code=503,
            detail="LiveKit is not configured (set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET).",
        )

    try:
        from livekit.api import AccessToken, VideoGrants  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=503, detail="LiveKit SDK is not available.") from exc

    default_id = "metalink-operator"
    op_identity = _sanitize_identity(identity, default_id)

    token = (
        AccessToken(settings.livekit_api_key, settings.livekit_api_secret)
        .with_identity(op_identity)
        .with_name("Metalink operator")
        .with_grants(
            VideoGrants(
                room_join=True,
                room=settings.livekit_room,
                can_subscribe=True,
                can_publish=True,
                can_publish_sources=["microphone"],
            )
        )
        .to_jwt()
    )

    return LiveKitTokenResponse(
        url=settings.livekit_url.strip(),
        token=token,
        room=settings.livekit_room,
        identity=op_identity,
    )
