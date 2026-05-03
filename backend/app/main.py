from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import api_router
from app.core.config import get_settings
from app.core.constants import APP_NAME
from app.core.ingestion import run_safe_ingestion_loop


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    ingestion_task: Optional[asyncio.Task[None]] = None
    if settings.enable_ingestion_loop:
        ingestion_task = asyncio.create_task(run_safe_ingestion_loop(settings))

    try:
        yield
    finally:
        if ingestion_task is not None:
            ingestion_task.cancel()
            try:
                await ingestion_task
            except asyncio.CancelledError:
                pass


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(title=APP_NAME, lifespan=lifespan)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(api_router, prefix="/api")
    return application


app = create_app()
