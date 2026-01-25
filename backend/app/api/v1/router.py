from fastapi import APIRouter

from app.api.v1 import auth, events, health, photos

api_v1_router = APIRouter()

api_v1_router.include_router(health.router, tags=["health"])
api_v1_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_v1_router.include_router(photos.router, prefix="/photos", tags=["photos"])
api_v1_router.include_router(events.router, prefix="/events", tags=["events"])
