from __future__ import annotations

import os

import pytest

# Skip loading developer `.env` during tests (see app.core.config.load_env).
os.environ["AEGIS_TESTING"] = "1"
# Ensure test runs do not spawn LiveKit ingestion or call paid APIs by default.
os.environ["MOCK_AI"] = "true"
os.environ["ENABLE_INGESTION_LOOP"] = "false"


@pytest.fixture(autouse=True)
def _clear_settings_cache() -> None:
    from app.core.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
