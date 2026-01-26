"""AI 相关 API 路由"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.ai import (
    PhotoAnalysisRequest,
    PhotoAnalysisResponse,
    StoryGenerationRequest,
    StoryGenerationResponse,
)
from app.services.ai_service import ai_service

router = APIRouter()


@router.post("/analyze-photos", response_model=PhotoAnalysisResponse)
async def analyze_photos(request: PhotoAnalysisRequest) -> PhotoAnalysisResponse:
    """批量分析照片内容

    Args:
        request: 分析请求，包含照片 URL 列表和地点信息

    Returns:
        分析结果，包含描述和情感标签
    """
    try:
        result = ai_service.analyze_event_photos(
            event_id="no-cache",  # 不使用缓存
            photo_urls=request.photo_urls,
            location=request.location or "",
        )
        return PhotoAnalysisResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"照片分析失败: {e}")


@router.post("/generate-story", response_model=StoryGenerationResponse)
async def generate_story(request: StoryGenerationRequest) -> StoryGenerationResponse:
    """生成事件故事

    Args:
        request: 故事生成请求

    Returns:
        生成的故事，包含标题、内容和情感标签
    """
    result = ai_service.generate_event_story(
        event_id=request.event_id,
        location=request.location,
        start_time=request.start_time,
        end_time=request.end_time,
        photo_descriptions=request.photo_descriptions,
    )

    if not result:
        raise HTTPException(status_code=500, detail="故事生成失败")

    return StoryGenerationResponse(**result)
