from fastapi import APIRouter

from app.api.telemetry import router as telemetry_router


api_router = APIRouter()
api_router.include_router(telemetry_router)

__all__ = ["api_router"]

