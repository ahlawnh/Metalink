from fastapi import APIRouter

from app.api.incident_telemetry import router as incident_telemetry_router
from app.api.livekit import router as livekit_router
from app.api.livekit_token import router as livekit_token_router
from app.api.telemetry import router as telemetry_router

api_router = APIRouter()
api_router.include_router(telemetry_router)
api_router.include_router(livekit_router, prefix="/livekit", tags=["livekit"])
api_router.include_router(
    livekit_token_router, prefix="/livekit", tags=["livekit-broadcaster"]
)
api_router.include_router(incident_telemetry_router)

__all__ = ["api_router"]
