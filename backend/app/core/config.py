from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel


def _repo_root() -> Path:
    # backend/app/core/config.py -> backend/
    return Path(__file__).resolve().parents[2]


def load_env() -> None:
    """
    Load environment variables from common backend-local locations.
    Call this once at process startup.

    Order: `.env` first, then `.env.local` (local wins).

    `.env` uses ``override=True`` so file entries beat stale shell exports during
    local dev (e.g. ``export MOCK_AI=false`` left over from a Deepgram test while
    `.env` says ``MOCK_AI=true``).

    When ``AEGIS_TESTING=1`` (set by ``tests/conftest.py``), skip dotenv so a developer's
    `.env` does not break pytest expectations.
    """
    if os.getenv("AEGIS_TESTING") == "1":
        return
    backend_root = _repo_root()
    load_dotenv(backend_root / ".env", override=True)
    load_dotenv(backend_root / ".env.local", override=True)


class Settings(BaseModel):
    env: str = "development"
    log_level: str = "info"
    mock_ai: bool = True
    enable_ingestion_loop: bool = True
    mock_telemetry_scenario: str = "overdose_case"
    mock_broadcast_interval_seconds: float = 1.0
    heartbeat_interval_seconds: float = 5.0
    livekit_url: str = ""
    livekit_api_key: str = ""
    livekit_api_secret: str = ""
    livekit_room: str = "d-spatch-demo"
    livekit_identity: str = "d-spatch-backend"
    frame_sample_interval_seconds: float = 2.5
    deepgram_model: str = "nova-3"
    deepgram_language: str = "multi"
    deepgram_endpointing: str = "100"
    telemetry_coalesce_ms: float = 100.0
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]


@lru_cache
def get_settings() -> Settings:
    load_env()
    cors_origins = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000,"
            "http://localhost:3001,http://127.0.0.1:3001,"
            "http://localhost:5173,http://127.0.0.1:5173",
        ).split(",")
        if origin.strip()
    ]
    return Settings(
        env=os.getenv("APP_ENV", "development"),
        log_level=os.getenv("LOG_LEVEL", "info"),
        mock_ai=os.getenv("MOCK_AI", "true").lower() in {"1", "true", "yes", "on"},
        enable_ingestion_loop=os.getenv("ENABLE_INGESTION_LOOP", "true").lower() in {"1", "true", "yes", "on"},
        mock_telemetry_scenario=os.getenv("MOCK_TELEMETRY_SCENARIO", "overdose_case"),
        mock_broadcast_interval_seconds=float(os.getenv("MOCK_BROADCAST_INTERVAL_SECONDS", "1.0")),
        heartbeat_interval_seconds=float(os.getenv("HEARTBEAT_INTERVAL_SECONDS", "5.0")),
        livekit_url=os.getenv("LIVEKIT_URL", ""),
        livekit_api_key=os.getenv("LIVEKIT_API_KEY", ""),
        livekit_api_secret=os.getenv("LIVEKIT_API_SECRET", ""),
        livekit_room=os.getenv("LIVEKIT_ROOM", "d-spatch-demo"),
        livekit_identity=os.getenv("LIVEKIT_IDENTITY", "d-spatch-backend"),
        frame_sample_interval_seconds=float(os.getenv("FRAME_SAMPLE_INTERVAL_SECONDS", "2.5")),
        deepgram_model=os.getenv("DEEPGRAM_MODEL", "nova-3"),
        deepgram_language=os.getenv("DEEPGRAM_LANGUAGE", "multi"),
        deepgram_endpointing=os.getenv("DEEPGRAM_ENDPOINTING", "100"),
        telemetry_coalesce_ms=float(os.getenv("TELEMETRY_COALESCE_MS", "100")),
        cors_origins=cors_origins,
    )
