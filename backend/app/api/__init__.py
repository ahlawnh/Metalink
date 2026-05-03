from fastapi import APIRouter

from app.api.livekit import router as livekit_router
from app.api.telemetry import router as telemetry_router


api_router = APIRouter()
api_router.include_router(telemetry_router)
api_router.include_router(livekit_router, prefix="/livekit", tags=["livekit"])

__all__ = ["api_router"]

