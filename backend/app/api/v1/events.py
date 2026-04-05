from __future__ import annotations

import math
from collections import defaultdict
from decimal import Decimal
from typing import Optional, cast

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUserIdDep
from app.db.session import get_db
from app.integrations.amap import amap_client
from app.models.chapter import EventChapter
from app.models.event import Event
from app.models.photo import Photo
from app.models.photo_group import PhotoGroup
from app.schemas.chapter import EventChapterResponse
from app.schemas.common import ApiResponse
from app.schemas.event import (
    EnhancementStorageSummary,
    EnhanceStoryResponse,
    EventCreateRequest,
    EventDetailResponse,
    EventEnhancementSummary,
    EventListResponse,
    LocationCityCandidate,
    LocationPlaceCandidate,
    EventPhotoItem,
    EventVisionSummary,
    EventStatus,
    EventResponse,
    EventUpdateRequest,
    RegenerateStoryResponse,
)
from app.schemas.photo_group import PhotoGroupResponse
from app.services.event_enhancement_service import (
    ENHANCEMENT_MAX_IMAGES,
    ENHANCEMENT_MIN_IMAGES,
    EventEnhancementUploadItem,
    build_event_enhancement_summary,
    cleanup_expired_event_enhancements,
    clear_user_event_enhancement_assets,
    get_active_event_enhancement_assets,
    get_event_enhancement_storage_summary,
    replace_event_enhancement_assets,
)
from app.services.event_enrichment import (
    ensure_event_title,
    get_event_location_text,
    is_coordinate_location_text,
)
from app.services.event_service import event_service
from app.services.storage_service import storage_service
from app.tasks.clustering_tasks import trigger_event_enhancement_task, trigger_event_story_task

router = APIRouter()

STRUCTURE_EDIT_FIELDS = {
    "location_name",
    "gps_lat",
    "gps_lon",
    "detailed_location",
    "location_tags",
}


def _build_event_vision_summary_lookup(
    db: Session,
    *,
    user_id: str,
    event_ids: list[str],
) -> dict[str, EventVisionSummary]:
    if not event_ids:
        return {}

    grouped_counts: dict[str, defaultdict[str, int]] = defaultdict(lambda: defaultdict(int))
    total_by_event: defaultdict[str, int] = defaultdict(int)

    for event_id, vision_status, count in db.execute(
        select(Photo.event_id, Photo.vision_status, func.count())
        .where(and_(Photo.user_id == user_id, Photo.event_id.in_(event_ids)))
        .group_by(Photo.event_id, Photo.vision_status)
    ).all():
        if not event_id:
            continue
        grouped_counts[str(event_id)][str(vision_status or "pending")] = int(count)
        total_by_event[str(event_id)] += int(count)

    return {
        event_id: EventVisionSummary(
            **event_service.build_event_vision_summary_from_counts(
                total=total_by_event.get(event_id, 0),
                counts=grouped_counts.get(event_id, defaultdict(int)),
            )
        )
        for event_id in event_ids
    }


def _event_to_response(
    event: Event,
    cover_photo: Photo | None = None,
    *,
    vision_summary: EventVisionSummary | None = None,
) -> EventResponse:
    location_text = get_event_location_text(event)
    title_text = ensure_event_title(event)
    full_story = event.full_story or event.story_text
    resolved_vision_summary = vision_summary or EventVisionSummary()
    resolved_status = cast(
        EventStatus,
        event_service.resolve_event_runtime_status(
            event=event,
            vision_summary={
                "status": resolved_vision_summary.status,
                "total": resolved_vision_summary.total,
                "pending": resolved_vision_summary.pending,
                "processing": resolved_vision_summary.processing,
                "completed": resolved_vision_summary.completed,
                "failed": resolved_vision_summary.failed,
                "unsupported": resolved_vision_summary.unsupported,
                "story_ready": resolved_vision_summary.total > 0
                and resolved_vision_summary.pending == 0
                and resolved_vision_summary.processing == 0
                and resolved_vision_summary.completed > 0,
            },
        ),
    )

    return EventResponse(
        id=event.id,
        title=title_text,
        locationName=location_text,
        gpsLat=float(event.gps_lat) if event.gps_lat is not None else None,
        gpsLon=float(event.gps_lon) if event.gps_lon is not None else None,
        startTime=event.start_time,
        endTime=event.end_time,
        photoCount=event.photo_count,
        coverPhotoId=event.cover_photo_id,
        coverAssetId=cover_photo.asset_id if cover_photo is not None else None,
        coverShootTime=cover_photo.shoot_time if cover_photo is not None else None,
        coverGpsLat=float(cover_photo.gps_lat) if cover_photo and cover_photo.gps_lat is not None else None,
        coverGpsLon=float(cover_photo.gps_lon) if cover_photo and cover_photo.gps_lon is not None else None,
        coverPhotoUrl=storage_service.resolve_client_url(event.cover_photo_url),
        storyText=event.story_text,
        fullStory=full_story,
        detailedLocation=event.detailed_location,
        locationTags=event.location_tags,
        emotionTag=event.emotion_tag,
        musicUrl=event.music_url,
        status=resolved_status,
        eventVersion=event.event_version,
        storyGeneratedFromVersion=event.story_generated_from_version,
        storyFreshness=event.story_freshness,
        slideshowGeneratedFromVersion=event.slideshow_generated_from_version,
        slideshowFreshness=event.slideshow_freshness,
        hasPendingStructureChanges=event.has_pending_structure_changes,
        titleManuallySet=event.title_manually_set,
        storyReady=bool(
            resolved_vision_summary.total > 0
            and resolved_vision_summary.pending == 0
            and resolved_vision_summary.processing == 0
            and resolved_vision_summary.completed > 0
        ),
        visionSummary=resolved_vision_summary,
        aiError=event.ai_error,
        updatedAt=event.updated_at,
    )


def _photo_to_event_item(photo: Photo) -> EventPhotoItem:
    photo_url = storage_service.resolve_client_url(photo.thumbnail_url)
    return EventPhotoItem(
        id=photo.id,
        assetId=photo.asset_id,
        fileHash=photo.file_hash,
        width=photo.width,
        height=photo.height,
        photoUrl=photo_url,
        thumbnailUrl=photo_url,
        shootTime=photo.shoot_time,
        gpsLat=float(photo.gps_lat) if photo.gps_lat is not None else None,
        gpsLon=float(photo.gps_lon) if photo.gps_lon is not None else None,
        caption=photo.caption,
        photoIndex=photo.photo_index,
        visualDesc=photo.visual_desc,
        microStory=photo.micro_story,
        emotionTag=photo.emotion_tag,
        visionStatus=photo.vision_status,
        visionError=photo.vision_error,
        visionUpdatedAt=photo.vision_updated_at,
        vision=photo.vision_result,
    )


def _chapter_to_response(chapter: EventChapter) -> EventChapterResponse:
    return EventChapterResponse(
        id=chapter.id,
        chapterIndex=chapter.chapter_index,
        chapterTitle=chapter.chapter_title,
        chapterStory=chapter.chapter_story,
        chapterIntro=chapter.chapter_intro,
        chapterSummary=chapter.chapter_summary,
        slideshowCaption=chapter.slideshow_caption,
        photoStartIndex=chapter.photo_start_index,
        photoEndIndex=chapter.photo_end_index,
        createdAt=chapter.created_at,
    )


def _photo_group_to_response(group: PhotoGroup) -> PhotoGroupResponse:
    return PhotoGroupResponse(
        id=group.id,
        chapterId=group.chapter_id,
        groupIndex=group.group_index,
        groupTheme=group.group_theme,
        groupEmotion=group.group_emotion,
        groupSceneDesc=group.group_scene_desc,
        photoStartIndex=group.photo_start_index,
        photoEndIndex=group.photo_end_index,
        createdAt=group.created_at,
    )


def _get_event_enhancement_summary(
    db: Session, *, user_id: str, event_id: str
) -> EventEnhancementSummary:
    assets = get_active_event_enhancement_assets(db, user_id=user_id, event_id=event_id)
    return build_event_enhancement_summary(assets)


def _maybe_trigger_story_refresh(
    *,
    db: Session,
    user_id: str,
    event_id: str,
) -> None:
    event = event_service.refresh_event_summary(event_id=event_id, user_id=user_id, db=db)
    if not event:
        return
    if event.photo_count == 0:
        event_service.delete_empty_event(event_id=event_id, user_id=user_id, db=db)
        return

    queued = event_service.mark_event_pending_story_refresh(
        event_id=event_id,
        user_id=user_id,
        db=db,
    )
    if not queued or queued.story_requested_for_version != queued.event_version:
        return

    trigger_event_story_task(
        user_id=user_id,
        event_id=event_id,
        event_version=queued.event_version,
        db=db,
    )


@router.post("/", response_model=ApiResponse[EventResponse])
def create_event(
    payload: EventCreateRequest,
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[EventResponse]:
    impacted_event_ids = set(
        db.scalars(
            select(Photo.event_id).where(
                and_(
                    Photo.user_id == current_user_id,
                    Photo.id.in_(payload.photoIds),
                    Photo.event_id.isnot(None),
                )
            )
        ).all()
    )
    event = event_service.create_event(
        user_id=current_user_id,
        db=db,
        title=payload.title,
        location_name=payload.locationName,
        photo_ids=payload.photoIds,
    )
    changed_event_ids = event_service.mark_events_structure_changed(
        event_ids=impacted_event_ids,
        user_id=current_user_id,
        db=db,
    )
    for impacted_event_id in changed_event_ids:
        _maybe_trigger_story_refresh(
            db=db,
            user_id=current_user_id,
            event_id=impacted_event_id,
        )
    _maybe_trigger_story_refresh(db=db, user_id=current_user_id, event_id=event.id)
    refreshed = event_service.get_event_detail(event_id=event.id, user_id=current_user_id, db=db)
    vision_summary_lookup = _build_event_vision_summary_lookup(
        db,
        user_id=current_user_id,
        event_ids=[event.id],
    )
    return ApiResponse.ok(
        _event_to_response(
            refreshed or event,
            vision_summary=vision_summary_lookup.get(event.id),
        )
    )


@router.get("/", response_model=ApiResponse[EventListResponse])
def list_events(
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
) -> ApiResponse[EventListResponse]:
    events, total = event_service.get_user_events(
        user_id=current_user_id, db=db, page=page, page_size=pageSize
    )
    cover_photo_ids = [event.cover_photo_id for event in events if event.cover_photo_id]
    cover_photo_by_id: dict[str, Photo] = {}
    if cover_photo_ids:
        cover_photo_by_id = {
            photo.id: photo
            for photo in db.scalars(
                select(Photo).where(
                    and_(Photo.user_id == current_user_id, Photo.id.in_(cover_photo_ids))
                )
            ).all()
        }
    vision_summary_by_event = _build_event_vision_summary_lookup(
        db,
        user_id=current_user_id,
        event_ids=[event.id for event in events],
    )
    total_pages = max(1, math.ceil(total / pageSize))
    return ApiResponse.ok(
        EventListResponse(
            items=[
                _event_to_response(
                    e,
                    cover_photo_by_id.get(e.cover_photo_id),
                    vision_summary=vision_summary_by_event.get(e.id),
                )
                for e in events
            ],
            total=total,
            page=page,
            pageSize=pageSize,
            totalPages=total_pages,
        )
    )


@router.get("/stats", response_model=ApiResponse[dict])
def get_event_stats(
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[dict]:
    return ApiResponse.ok(event_service.get_event_stats(user_id=current_user_id, db=db))


@router.get(
    "/location-search/cities",
    response_model=ApiResponse[list[LocationCityCandidate]],
)
def search_location_cities(query: str = Query(..., min_length=1)) -> ApiResponse[list[LocationCityCandidate]]:
    return ApiResponse.ok(
        [
            LocationCityCandidate(
                name=item["name"],
                displayName=item["display_name"],
                adcode=item["adcode"],
            )
            for item in amap_client.search_cities(query)
        ]
    )


@router.get(
    "/location-search/places",
    response_model=ApiResponse[list[LocationPlaceCandidate]],
)
def search_location_places(
    query: str = Query(..., min_length=1),
    city: str = Query(..., min_length=1),
) -> ApiResponse[list[LocationPlaceCandidate]]:
    results = [
        LocationPlaceCandidate(
            name=item["name"],
            address=item.get("address") or "",
            locationName=item["display_location"],
            detailedLocation=item["detailed_location"],
            locationTags=item.get("location_tags") or "",
            gpsLat=item["gps_lat"],
            gpsLon=item["gps_lon"],
        )
        for item in amap_client.search_places(keyword=query, city=city)
    ]
    return ApiResponse.ok(results)


@router.get(
    "/enhancement-storage/summary",
    response_model=ApiResponse[EnhancementStorageSummary],
)
def get_enhancement_storage_summary(
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[EnhancementStorageSummary]:
    cleanup_expired_event_enhancements(db)
    return ApiResponse.ok(get_event_enhancement_storage_summary(db, user_id=current_user_id))


@router.delete(
    "/enhancement-storage",
    response_model=ApiResponse[EnhancementStorageSummary],
)
def clear_enhancement_storage(
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[EnhancementStorageSummary]:
    return ApiResponse.ok(clear_user_event_enhancement_assets(db, user_id=current_user_id))


@router.get("/{event_id}", response_model=ApiResponse[EventDetailResponse])
def get_event_detail(
    event_id: str,
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[EventDetailResponse]:
    cleanup_expired_event_enhancements(db)
    event = event_service.get_event_detail(
        event_id=event_id, user_id=current_user_id, db=db
    )
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="事件不存在")

    photos = event_service.get_event_photos(
        event_id=event_id, user_id=current_user_id, db=db
    )
    chapters = event_service.get_event_chapters(
        event_id=event_id, user_id=current_user_id, db=db
    )
    photo_groups = event_service.get_event_photo_groups(
        event_id=event_id, user_id=current_user_id, db=db
    )
    cover_photo = next((photo for photo in photos if photo.id == event.cover_photo_id), None)
    base = _event_to_response(
        event,
        cover_photo,
        vision_summary=EventVisionSummary(**event_service.build_event_vision_summary(photos)),
    )
    detail = EventDetailResponse(
        **base.model_dump(),
        photos=[_photo_to_event_item(p) for p in photos],
        chapters=[_chapter_to_response(c) for c in chapters],
        photoGroups=[_photo_group_to_response(group) for group in photo_groups],
        enhancement=_get_event_enhancement_summary(
            db, user_id=current_user_id, event_id=event_id
        ),
    )
    return ApiResponse.ok(detail)


@router.post(
    "/{event_id}/regenerate-story", response_model=ApiResponse[RegenerateStoryResponse]
)
def regenerate_story(
    event_id: str,
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[RegenerateStoryResponse]:
    event = event_service.refresh_event_summary(
        event_id=event_id,
        user_id=current_user_id,
        db=db,
    )
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="事件不存在")

    queued = event_service.mark_event_pending_story_refresh(
        event_id=event_id,
        user_id=current_user_id,
        db=db,
        force=True,
    )
    if not queued or not event_service.can_generate_story(queued):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="事件当前仍有照片在端侧识别中，完成后会自动更新故事",
        )

    task_id = trigger_event_story_task(
        user_id=current_user_id,
        event_id=event_id,
        event_version=queued.event_version,
        db=db,
    )
    return ApiResponse.ok(
        RegenerateStoryResponse(
            taskId=task_id,
            status="queued" if task_id else "processed_inline",
        )
    )


@router.post(
    "/{event_id}/enhance-story", response_model=ApiResponse[EnhanceStoryResponse]
)
def enhance_story(
    event_id: str,
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
    reuseExisting: bool = Form(False),
    photoIds: list[str] = Form([]),
    files: list[UploadFile] = File([]),
) -> ApiResponse[EnhanceStoryResponse]:
    cleanup_expired_event_enhancements(db)

    event = event_service.get_event_detail(
        event_id=event_id, user_id=current_user_id, db=db
    )
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="事件不存在")

    upload_files = files
    selected_photo_ids = photoIds

    if upload_files:
        if len(upload_files) < ENHANCEMENT_MIN_IMAGES or len(upload_files) > ENHANCEMENT_MAX_IMAGES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"请上传 {ENHANCEMENT_MIN_IMAGES}-{ENHANCEMENT_MAX_IMAGES} 张代表图",
            )
        if selected_photo_ids and len(selected_photo_ids) != len(upload_files):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="photoIds 与 files 数量不匹配",
            )

        if selected_photo_ids:
            existing_photo_ids = set(
                db.scalars(
                    select(Photo.id).where(
                        and_(
                            Photo.user_id == current_user_id,
                            Photo.event_id == event_id,
                            Photo.id.in_(selected_photo_ids),
                        )
                    )
                ).all()
            )
            if len(existing_photo_ids) != len(set(selected_photo_ids)):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="包含不属于当前事件的代表图",
                )

        uploads = [
            EventEnhancementUploadItem(
                photo_id=selected_photo_ids[index] if index < len(selected_photo_ids) else None,
                file_obj=upload.file,
            )
            for index, upload in enumerate(upload_files)
        ]
        summary = replace_event_enhancement_assets(
            db,
            user_id=current_user_id,
            event_id=event_id,
            uploads=uploads,
        )
    elif reuseExisting:
        summary = _get_event_enhancement_summary(db, user_id=current_user_id, event_id=event_id)
        if not summary.canRetry:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="当前事件没有可复用的增强素材",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请上传代表图或选择复用 7 天内的增强素材",
        )

    queued = event_service.mark_event_pending_story_refresh(
        event_id=event_id,
        user_id=current_user_id,
        db=db,
        force=True,
    )
    if not queued:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="事件不存在")

    task_id = trigger_event_enhancement_task(
        user_id=current_user_id,
        event_id=event_id,
        event_version=queued.event_version,
        db=db,
    )
    return ApiResponse.ok(
        EnhanceStoryResponse(
            taskId=task_id,
            status="queued" if task_id else "processed_inline",
            enhancement=summary,
        )
    )


@router.patch("/{event_id}", response_model=ApiResponse[EventResponse])
def update_event(
    event_id: str,
    payload: EventUpdateRequest,
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[EventResponse]:
    payload_fields: dict[str, object] = {}
    if "title" in payload.model_fields_set:
        payload_fields["title"] = payload.title
        payload_fields["title_manually_set"] = True
    if "locationName" in payload.model_fields_set:
        payload_fields["location_name"] = payload.locationName
    if "gpsLat" in payload.model_fields_set:
        payload_fields["gps_lat"] = (
            Decimal(str(payload.gpsLat)) if payload.gpsLat is not None else None
        )
    if "gpsLon" in payload.model_fields_set:
        payload_fields["gps_lon"] = (
            Decimal(str(payload.gpsLon)) if payload.gpsLon is not None else None
        )
    if "coverPhowtoUrl" in payload.model_fields_set:
        payload_fields["cover_photo_url"] = payload.coverPhotoUrl
    if "storyText" in payload.model_fields_set:
        payload_fields["story_text"] = payload.storyText
    if "fullStory" in payload.model_fields_set:
        payload_fields["full_story"] = payload.fullStory
    if "detailedLocation" in payload.model_fields_set:
        payload_fields["detailed_location"] = payload.detailedLocation
    if "locationTags" in payload.model_fields_set:
        payload_fields["location_tags"] = payload.locationTags
    if "emotionTag" in payload.model_fields_set:
        payload_fields["emotion_tag"] = payload.emotionTag
    if "musicUrl" in payload.model_fields_set:
        payload_fields["music_url"] = payload.musicUrl
    if "status" in payload.model_fields_set:
        payload_fields["status"] = payload.status

    if (
        payload_fields.get("gps_lat") is not None
        and payload_fields.get("gps_lon") is not None
        and (
            "location_name" not in payload_fields
            or not payload_fields.get("location_name")
            or is_coordinate_location_text(cast(Optional[str], payload_fields.get("location_name")))
        )
    ):
        context = amap_client.get_location_context(
            float(cast(Decimal, payload_fields["gps_lat"])),
            float(cast(Decimal, payload_fields["gps_lon"])),
        )
        if "location_name" not in payload_fields or not payload_fields.get("location_name"):
            payload_fields["location_name"] = context.get("display_location") or None
        if "detailed_location" not in payload_fields or not payload_fields.get("detailed_location"):
            payload_fields["detailed_location"] = context.get("detailed_location") or None
        if "location_tags" not in payload_fields or not payload_fields.get("location_tags"):
            payload_fields["location_tags"] = context.get("location_tags") or None

    event = event_service.update_event(
        event_id=event_id,
        user_id=current_user_id,
        db=db,
        **payload_fields,
    )
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="事件不存在")

    should_refresh_story = bool(STRUCTURE_EDIT_FIELDS.intersection(payload_fields.keys()))
    if should_refresh_story:
        event_service.mark_events_structure_changed(
            event_ids=[event_id],
            user_id=current_user_id,
            db=db,
        )
        _maybe_trigger_story_refresh(db=db, user_id=current_user_id, event_id=event_id)
        event = (
            event_service.get_event_detail(event_id=event_id, user_id=current_user_id, db=db)
            or event
        )

    vision_summary_lookup = _build_event_vision_summary_lookup(
        db,
        user_id=current_user_id,
        event_ids=[event.id],
    )
    return ApiResponse.ok(
        _event_to_response(
            event,
            vision_summary=vision_summary_lookup.get(event.id),
        )
    )


@router.delete("/{event_id}", response_model=ApiResponse[dict])
def delete_event(
    event_id: str,
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[dict]:
    ok = event_service.delete_event(event_id=event_id, user_id=current_user_id, db=db)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="事件不存在")
    return ApiResponse.ok({"message": "事件已删除"})
