from __future__ import annotations

import base64
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import BinaryIO, Optional

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.event_enhancement_asset import EventEnhancementAsset
from app.models.photo import Photo
from app.schemas.event import EnhancementStorageSummary, EventEnhancementSummary
from app.services.ai_service import ai_service
from app.services.event_ai_service import (
    _apply_story_payload_to_event,
    _ensure_location_context,
    _save_event_chapters,
    _save_photo_captions,
    ensure_event_title,
)
from app.services.event_service import event_service
from app.services.storage_service import storage_service
from app.services.story_signal_service import aggregate_story_signals
from app.services.vision_analysis_service import vision_analysis_service
from app.integrations.providers.base import parse_story_json_payload

logger = logging.getLogger(__name__)

ENHANCEMENT_MIN_IMAGES = 3
ENHANCEMENT_MAX_IMAGES = 5
ENHANCEMENT_RETENTION_DAYS = 7


@dataclass
class EventEnhancementUploadItem:
    photo_id: Optional[str]
    file_obj: BinaryIO


def _now_utc() -> datetime:
    return datetime.now(tz=timezone.utc)


def _retained_until(now: Optional[datetime] = None) -> datetime:
    return (now or _now_utc()) + timedelta(days=ENHANCEMENT_RETENTION_DAYS)


def _coerce_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def build_event_enhancement_summary(
    assets: list[EventEnhancementAsset], *, now: Optional[datetime] = None
) -> EventEnhancementSummary:
    if not assets:
        return EventEnhancementSummary()

    current = now or _now_utc()
    retained_candidates: list[datetime] = []
    uploaded_candidates: list[datetime] = []
    for asset in assets:
        retained_candidate = _coerce_utc(asset.expires_at)
        if retained_candidate is not None:
            retained_candidates.append(retained_candidate)

        uploaded_candidate = _coerce_utc(asset.created_at)
        if uploaded_candidate is not None:
            uploaded_candidates.append(uploaded_candidate)

    retained_until = max(retained_candidates, default=None)
    last_uploaded_at = max(uploaded_candidates, default=None)
    total_bytes = sum(int(asset.file_size or 0) for asset in assets)
    can_retry = retained_until is not None and retained_until > current

    return EventEnhancementSummary(
        status="retained" if can_retry else "expired",
        assetCount=len(assets),
        totalBytes=total_bytes,
        canRetry=can_retry,
        lastUploadedAt=last_uploaded_at,
        retainedUntil=retained_until,
    )


def cleanup_expired_event_enhancements(db: Session) -> int:
    current = _now_utc()
    expired_assets = list(db.scalars(select(EventEnhancementAsset)).all())
    expired_assets = [
        asset
        for asset in expired_assets
        if (_coerce_utc(asset.expires_at) or current) <= current
    ]
    if not expired_assets:
        return 0

    for asset in expired_assets:
        storage_service.delete_uploaded_file(
            local_path=asset.local_path,
            object_key=asset.object_key,
        )
        db.delete(asset)

    db.commit()
    return len(expired_assets)


def get_active_event_enhancement_assets(
    db: Session, *, user_id: str, event_id: str
) -> list[EventEnhancementAsset]:
    cleanup_expired_event_enhancements(db)
    assets = list(
        db.scalars(
            select(EventEnhancementAsset)
            .where(
                and_(
                    EventEnhancementAsset.user_id == user_id,
                    EventEnhancementAsset.event_id == event_id,
                )
            )
            .order_by(EventEnhancementAsset.created_at.asc())
        ).all()
    )
    current = _now_utc()
    return [
        asset
        for asset in assets
        if (_coerce_utc(asset.expires_at) or current) > current
    ]


def replace_event_enhancement_assets(
    db: Session,
    *,
    user_id: str,
    event_id: str,
    uploads: list[EventEnhancementUploadItem],
) -> EventEnhancementSummary:
    if len(uploads) < ENHANCEMENT_MIN_IMAGES or len(uploads) > ENHANCEMENT_MAX_IMAGES:
        raise ValueError("event_enhancement_asset_count_invalid")

    existing_assets = list(
        db.scalars(
            select(EventEnhancementAsset).where(
                and_(
                    EventEnhancementAsset.user_id == user_id,
                    EventEnhancementAsset.event_id == event_id,
                )
            )
        ).all()
    )
    for asset in existing_assets:
        storage_service.delete_uploaded_file(
            local_path=asset.local_path,
            object_key=asset.object_key,
        )
        db.delete(asset)
    db.flush()

    expires_at = _retained_until()
    for upload in uploads:
        asset = EventEnhancementAsset(
            user_id=user_id,
            event_id=event_id,
            photo_id=upload.photo_id,
            local_path="",
            public_url=None,
            storage_provider=None,
            object_key=None,
            file_size=0,
            analysis_result=None,
            expires_at=expires_at,
        )
        db.add(asset)
        db.flush()

        saved = storage_service.upload_event_enhancement_file(
            user_id=user_id,
            event_id=event_id,
            asset_id=asset.id,
            file_obj=upload.file_obj,
        )
        file_size = (
            Path(saved.local_path).stat().st_size
            if Path(saved.local_path).exists()
            else 0
        )
        asset.local_path = saved.local_path
        asset.public_url = saved.public_url
        asset.storage_provider = saved.storage_provider
        asset.object_key = saved.object_key
        asset.file_size = int(file_size)

    db.commit()
    assets = get_active_event_enhancement_assets(db, user_id=user_id, event_id=event_id)
    return build_event_enhancement_summary(assets)


def get_event_enhancement_storage_summary(
    db: Session, *, user_id: str
) -> EnhancementStorageSummary:
    cleanup_expired_event_enhancements(db)
    summary_row = db.execute(
        select(
            func.count(EventEnhancementAsset.id),
            func.count(func.distinct(EventEnhancementAsset.event_id)),
            func.coalesce(func.sum(EventEnhancementAsset.file_size), 0),
            func.min(EventEnhancementAsset.expires_at),
        ).where(EventEnhancementAsset.user_id == user_id)
    ).one()

    asset_count = int(summary_row[0] or 0)
    event_count = int(summary_row[1] or 0)
    total_bytes = int(summary_row[2] or 0)
    next_expires_at = summary_row[3]

    return EnhancementStorageSummary(
        eventCount=event_count,
        assetCount=asset_count,
        totalBytes=total_bytes,
        nextExpiresAt=next_expires_at,
    )


def clear_user_event_enhancement_assets(
    db: Session, *, user_id: str
) -> EnhancementStorageSummary:
    assets = list(
        db.scalars(
            select(EventEnhancementAsset).where(
                EventEnhancementAsset.user_id == user_id
            )
        ).all()
    )
    for asset in assets:
        storage_service.delete_uploaded_file(
            local_path=asset.local_path,
            object_key=asset.object_key,
        )
        db.delete(asset)
    db.commit()
    return EnhancementStorageSummary()


def _load_image_input(asset: EventEnhancementAsset) -> Optional[str]:
    local_path = Path(asset.local_path)
    if not local_path.exists():
        return storage_service.resolve_public_url(asset.public_url)

    provider_name = ai_service.provider_name().lower()
    if provider_name == "openai":
        encoded = base64.b64encode(local_path.read_bytes()).decode("ascii")
        return f"data:image/jpeg;base64,{encoded}"

    return storage_service.resolve_public_url(asset.public_url) or str(local_path)


def _build_enhancement_narrative(
    analyses: list[dict[str, object]],
) -> tuple[str, Optional[str]]:
    descriptions: list[str] = []
    emotions: list[str] = []

    for analysis in analyses:
        description = str(analysis.get("description") or "").strip()
        if description:
            descriptions.append(description[:160])
        emotion = str(analysis.get("emotion") or "").strip()
        if emotion:
            emotions.append(emotion)

    if not descriptions:
        return ("", emotions[0] if emotions else None)

    narrative = "\n".join(
        [f"- {item}" for item in descriptions[:ENHANCEMENT_MAX_IMAGES]]
    )
    dominant_emotion = emotions[0] if emotions else None
    return (narrative, dominant_emotion)


def _generate_enhanced_story_text(
    *,
    location: str,
    detailed_location: str,
    date_range: str,
    location_tags: str,
    structured_summary: str,
    timeline_clues: list[str],
    enhancement_narrative: str,
) -> dict[str, object] | None:
    prompt = f"""你是一位旅行写作者。用户这次主动上传了少量代表图，希望生成一版更有画面感、但仍然真实克制的事件总览。

【事件信息】
地点：{detailed_location or location}
时间：{date_range}
地点特色：{location_tags or "根据旅行线索判断"}
结构化摘要：
{structured_summary or "暂无结构化摘要"}
时间线索：
{chr(10).join(timeline_clues[:10]) or "暂无"}

【增强代表图可见内容】
{enhancement_narrative or "- 暂无"}

【要求】
1. title：16字以内，用于事件标题，清晰概括地点和活动
2. full_story：100-140字中文，用于故事面板展示，是事件整体概览，不要逐图展开，不要写成长篇故事
3. hero_title：18字以内，用于视频面板标题，要更文艺、更凝练，可点明月份、地点或时间感，不要直接复述 title
4. hero_summary：30-40字中文，用于视频面板短文案，要比 full_story 更短更轻，不要重复完整故事
5. 细节必须来自结构化线索或增强代表图可见内容，不能编造
6. 输入中可能存在 OCR、英文字母、数字、原始坐标、碎片化或低关联脏数据；对难以理解、无法自然连接、没有叙事价值的信息可以直接忽略
7. 优先使用重复出现或相互印证的线索；如果增强图像提供了更明确的情绪或场景，可优先吸收
8. 比默认故事更有画面感，但保持克制，不要夸张
9. 视频文案风格锚点：hero_title 可参考“秋水照见归途”，hero_summary 可参考“这一程不急着抵达，只让江岸与晚风把心绪放慢。” 要有画面感、回望感和更轻的情绪入口

请严格返回 JSON：
{{
  "title": "事件标题",
  "full_story": "完整故事",
  "hero_title": "视频面板标题",
  "hero_summary": "视频面板短文案",
  "emotion": "情感标签（Joyful/Exciting/Adventurous/Epic/Romantic/Peaceful/Nostalgic/Thoughtful/Melancholic/Solitary）"
}}
"""

    response_text = ai_service.client.generate_story(prompt, max_tokens=500)
    if not response_text:
        return None
    return parse_story_json_payload(response_text=response_text, location=location)


def generate_event_enhanced_story_for_event(
    db: Session,
    *,
    user_id: str,
    event_id: str,
    target_version: Optional[int] = None,
) -> tuple[bool, Optional[str]]:
    event = db.scalar(
        select(Event).where(and_(Event.id == event_id, Event.user_id == user_id))
    )
    if not event:
        return False, "event_not_found"

    generation_version = target_version or event.event_version
    if event.event_version != generation_version:
        return True, "event_version_outdated"

    assets = get_active_event_enhancement_assets(db, user_id=user_id, event_id=event_id)
    if len(assets) < ENHANCEMENT_MIN_IMAGES:
        event.status = "ai_failed"
        event.ai_error = "event_enhancement_assets_missing"
        event.title = ensure_event_title(event)
        db.commit()
        return False, event.ai_error

    photos = list(
        db.scalars(
            select(Photo)
            .where(and_(Photo.user_id == user_id, Photo.event_id == event_id))
            .order_by(Photo.shoot_time.asc().nullslast(), Photo.created_at.asc())
        ).all()
    )
    if not photos:
        event_service.mark_story_failed(
            event=event,
            target_version=generation_version,
            reason="event_has_no_photos",
        )
        event.title = ensure_event_title(event)
        db.commit()
        return False, event.ai_error

    if not ai_service.is_configured():
        reason = ai_service.configuration_error_code()
        event_service.mark_story_failed(
            event=event,
            target_version=generation_version,
            reason=reason,
        )
        event.title = ensure_event_title(event)
        db.commit()
        return False, reason

    if not event_service.mark_story_processing(
        event=event,
        target_version=generation_version,
    ):
        db.rollback()
        return True, "event_version_outdated"
    event.title = ensure_event_title(event)
    db.commit()

    analyses: list[dict[str, object]] = []
    for asset in assets:
        image_input = _load_image_input(asset)
        if not image_input:
            continue
        analysis = vision_analysis_service.analyze_photo(image_input)
        asset.analysis_result = analysis
        analyses.append(analysis)
    db.commit()

    enhancement_narrative, dominant_emotion = _build_enhancement_narrative(analyses)
    if not enhancement_narrative:
        event_service.mark_story_failed(
            event=event,
            target_version=generation_version,
            reason="event_enhancement_analysis_failed",
        )
        db.commit()
        return False, event.ai_error

    location, detailed_location, location_tags = _ensure_location_context(event)
    signals = aggregate_story_signals(photos)
    if not event.start_time or not event.end_time:
        event_service.mark_story_failed(
            event=event,
            target_version=generation_version,
            reason="event_date_range_missing",
        )
        event.title = ensure_event_title(event)
        db.commit()
        return False, event.ai_error

    date_range = f"{event.start_time.strftime('%m月%d日')} - {event.end_time.strftime('%m月%d日')}"
    story = _generate_enhanced_story_text(
        location=location,
        detailed_location=detailed_location,
        date_range=date_range,
        location_tags=location_tags,
        structured_summary=str(signals.get("structured_summary") or ""),
        timeline_clues=[
            str(item)
            for item in signals.get("timeline_clues", [])
            if isinstance(item, str) and item.strip()
        ],
        enhancement_narrative=enhancement_narrative,
    )
    if not story:
        event_service.mark_story_failed(
            event=event,
            target_version=generation_version,
            reason=ai_service.last_error_code
            or "event_enhanced_story_generation_failed",
        )
        event.title = ensure_event_title(event)
        db.commit()
        return False, event.ai_error

    db.refresh(event)
    if event.event_version != generation_version:
        return True, "event_version_outdated"

    _apply_story_payload_to_event(
        event=event,
        story=story,
        fallback_emotion=(
            str(
                dominant_emotion
                or signals.get("dominant_emotion")
                or ""
            ).strip()
            or None
        ),
    )

    _save_photo_captions(photos)
    _save_event_chapters(
        db,
        event=event,
        photos=photos,
        detailed_location=detailed_location,
        location_tags=location_tags,
        narrative_boost=enhancement_narrative,
    )

    event_service.mark_story_generated(event=event, target_version=generation_version)
    db.commit()
    return True, None
