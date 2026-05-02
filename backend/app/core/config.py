from __future__ import annotations

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
    """
    backend_root = _repo_root()
    load_dotenv(backend_root / ".env.local", override=False)
    load_dotenv(backend_root / ".env", override=False)


class Settings(BaseModel):
    env: str = "development"
    log_level: str = "info"


@lru_cache
def get_settings() -> Settings:
    load_env()
    # Keep this minimal for now; add fields as the backend grows.
    return Settings()
