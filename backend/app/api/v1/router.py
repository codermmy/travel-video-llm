from fastapi import APIRouter

from app.api.v1 import ai, auth, events, health, photos, tasks

api_v1_router = APIRouter()

api_v1_router.include_router(health.router, tags=["health"])
api_v1_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_v1_router.include_router(photos.router, prefix="/photos", tags=["photos"])
api_v1_router.include_router(events.router, prefix="/events", tags=["events"])
api_v1_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
api_v1_router.include_router(ai.router, prefix="/ai", tags=["ai"])
