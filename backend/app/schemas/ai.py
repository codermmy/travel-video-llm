"""AI 相关 Schema 定义"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class PhotoAnalysisRequest(BaseModel):
    """照片分析请求"""

    photo_urls: list[str] = Field(..., description="照片 URL 列表")
    location: Optional[str] = Field(None, description="地点信息")


class PhotoAnalysisResponse(BaseModel):
    """照片分析响应"""

    descriptions: list[str] = Field(default_factory=list, description="照片描述列表")
    emotion: str = Field(default="Peaceful", description="情感标签")


class StoryGenerationRequest(BaseModel):
    """故事生成请求"""

    event_id: str = Field(..., description="事件 ID")
    location: str = Field(..., description="地点")
    start_time: str = Field(..., description="开始时间")
    end_time: str = Field(..., description="结束时间")
    photo_descriptions: list[str] = Field(default_factory=list, description="照片描述列表")


class StoryGenerationResponse(BaseModel):
    """故事生成响应"""

    title: str = Field(..., description="事件标题")
    story: str = Field(..., description="故事内容")
    full_story: Optional[str] = Field(None, description="完整故事")
    hero_title: Optional[str] = Field(None, description="视频面板标题")
    hero_summary: Optional[str] = Field(None, description="视频面板短文案")
    emotion: str = Field(default="Peaceful", description="情感标签")


class ImageAnalysisResult(BaseModel):
    """图像分析结果"""

    description: str = Field(..., description="图像描述")
    tags: list[str] = Field(default_factory=list, description="标签列表")
    emotion: str = Field(default="Peaceful", description="情感标签")
