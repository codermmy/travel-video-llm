"""AI 相关 API 路由"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.common import ApiResponse
from app.schemas.ai import (
    PhotoAnalysisRequest,
    PhotoAnalysisResponse,
    StoryGenerationRequest,
    StoryGenerationResponse,
)
from app.services.ai_service import ai_service

router = APIRouter()


@router.post("/analyze-photos", response_model=ApiResponse[PhotoAnalysisResponse])
async def analyze_photos(
    request: PhotoAnalysisRequest,
) -> ApiResponse[PhotoAnalysisResponse]:
    try:
        result = ai_service.analyze_event_photos(
            event_id="no-cache",
            photo_urls=request.photo_urls,
            location=request.location or "",
        )
        return ApiResponse.ok(PhotoAnalysisResponse(**result))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"照片分析失败: {e}")


@router.post("/generate-story", response_model=ApiResponse[StoryGenerationResponse])
async def generate_story(
    request: StoryGenerationRequest,
) -> ApiResponse[StoryGenerationResponse]:
    result = ai_service.generate_event_story(
        event_id=request.event_id,
        location=request.location,
        start_time=request.start_time,
        end_time=request.end_time,
        photo_descriptions=request.photo_descriptions,
    )

    if not result:
        raise HTTPException(status_code=500, detail="故事生成失败")

    payload = dict(result)
    if "full_story" not in payload and "story" in payload:
        payload["full_story"] = payload["story"]
    if "story" not in payload and "full_story" in payload:
        payload["story"] = payload["full_story"]

    return ApiResponse.ok(StoryGenerationResponse(**payload))
