from __future__ import annotations

import os

import pytest

# Ensure test runs do not spawn LiveKit ingestion or call paid APIs by default.
os.environ.setdefault("MOCK_AI", "true")
os.environ.setdefault("ENABLE_INGESTION_LOOP", "false")


@pytest.fixture(autouse=True)
def _clear_settings_cache() -> None:
    from app.core.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
