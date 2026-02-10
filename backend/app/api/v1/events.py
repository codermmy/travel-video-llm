from __future__ import annotations

import math
from typing import cast

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentUserIdDep
from app.db.session import get_db
from app.models.chapter import EventChapter
from app.models.event import Event
from app.models.photo import Photo
from app.models.photo_group import PhotoGroup
from app.schemas.chapter import EventChapterResponse
from app.schemas.common import ApiResponse
from app.schemas.event import (
    EventDetailResponse,
    EventListResponse,
    EventPhotoItem,
    EventStatus,
    EventResponse,
    EventUpdateRequest,
    RegenerateStoryResponse,
)
from app.schemas.photo_group import PhotoGroupResponse
from app.services.event_enrichment import ensure_event_title, get_event_location_text
from app.services.event_service import event_service
from app.services.storage_service import storage_service
from app.tasks.clustering_tasks import trigger_event_story_task

router = APIRouter()


def _event_to_response(event: Event) -> EventResponse:
    location_text = get_event_location_text(event)
    title_text = ensure_event_title(event)
    full_story = event.full_story or event.story_text

    return EventResponse(
        id=event.id,
        title=title_text,
        locationName=location_text,
        gpsLat=float(event.gps_lat) if event.gps_lat is not None else None,
        gpsLon=float(event.gps_lon) if event.gps_lon is not None else None,
        startTime=event.start_time,
        endTime=event.end_time,
        photoCount=event.photo_count,
        coverPhotoUrl=storage_service.resolve_client_url(event.cover_photo_url),
        storyText=event.story_text,
        fullStory=full_story,
        detailedLocation=event.detailed_location,
        locationTags=event.location_tags,
        emotionTag=event.emotion_tag,
        musicUrl=event.music_url,
        status=cast(EventStatus, event.status),
        aiError=event.ai_error,
        updatedAt=event.updated_at,
    )


def _photo_to_event_item(photo: Photo) -> EventPhotoItem:
    photo_url = storage_service.resolve_client_url(photo.thumbnail_url)
    return EventPhotoItem(
        id=photo.id,
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
    total_pages = max(1, math.ceil(total / pageSize))
    return ApiResponse.ok(
        EventListResponse(
            items=[_event_to_response(e) for e in events],
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


@router.get("/{event_id}", response_model=ApiResponse[EventDetailResponse])
def get_event_detail(
    event_id: str,
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[EventDetailResponse]:
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
    base = _event_to_response(event)
    detail = EventDetailResponse(
        **base.model_dump(),
        photos=[_photo_to_event_item(p) for p in photos],
        chapters=[_chapter_to_response(c) for c in chapters],
        photoGroups=[_photo_group_to_response(group) for group in photo_groups],
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
    event = event_service.get_event_detail(
        event_id=event_id, user_id=current_user_id, db=db
    )
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="事件不存在")

    event.status = "ai_pending"
    event.ai_error = None
    db.commit()

    task_id = trigger_event_story_task(
        user_id=current_user_id, event_id=event_id, db=db
    )
    return ApiResponse.ok(
        RegenerateStoryResponse(
            taskId=task_id,
            status="queued" if task_id else "processed_inline",
        )
    )


@router.patch("/{event_id}", response_model=ApiResponse[EventResponse])
def update_event(
    event_id: str,
    payload: EventUpdateRequest,
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[EventResponse]:
    event = event_service.update_event(
        event_id=event_id,
        user_id=current_user_id,
        db=db,
        title=payload.title,
        location_name=payload.locationName,
        cover_photo_url=payload.coverPhotoUrl,
        story_text=payload.storyText,
        full_story=payload.fullStory,
        detailed_location=payload.detailedLocation,
        location_tags=payload.locationTags,
        emotion_tag=payload.emotionTag,
        music_url=payload.musicUrl,
        status=payload.status,
    )
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="事件不存在")
    return ApiResponse.ok(_event_to_response(event))


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
