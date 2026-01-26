from __future__ import annotations

import math

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentUserIdDep
from app.db.session import get_db
from app.models.event import Event
from app.models.photo import Photo
from app.schemas.common import ApiResponse
from app.schemas.event import (
    EventDetailResponse,
    EventListResponse,
    EventPhotoItem,
    EventResponse,
    EventUpdateRequest,
)
from app.services.event_service import event_service

router = APIRouter()


def _event_to_response(event: Event) -> EventResponse:
    return EventResponse(
        id=event.id,
        title=event.title,
        locationName=event.location_name,
        gpsLat=float(event.gps_lat) if event.gps_lat is not None else None,
        gpsLon=float(event.gps_lon) if event.gps_lon is not None else None,
        startTime=event.start_time,
        endTime=event.end_time,
        photoCount=event.photo_count,
        coverPhotoUrl=event.cover_photo_url,
        storyText=event.story_text,
        emotionTag=event.emotion_tag,
        musicUrl=event.music_url,
        status=event.status,
    )


def _photo_to_event_item(photo: Photo) -> EventPhotoItem:
    return EventPhotoItem(
        id=photo.id,
        thumbnailUrl=photo.thumbnail_url,
        shootTime=photo.shoot_time,
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
    event = event_service.get_event_detail(event_id=event_id, user_id=current_user_id, db=db)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="事件不存在")

    photos = event_service.get_event_photos(event_id=event_id, user_id=current_user_id, db=db)
    base = _event_to_response(event)
    detail = EventDetailResponse(
        **base.model_dump(), photos=[_photo_to_event_item(p) for p in photos]
    )
    return ApiResponse.ok(detail)


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
