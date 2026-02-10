from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, cast

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUserIdDep
from app.db.session import get_db
from app.models.event import Event
from app.models.photo import Photo
from app.models.user import UserDeviceSyncState
from app.schemas.common import ApiResponse
from app.schemas.event import EventResponse, EventStatus
from app.schemas.task import (
    SyncAckRequest,
    SyncAckResponse,
    SyncCloudSnapshot,
    SyncDeviceSnapshot,
    SyncPullRequest,
    SyncPullResponse,
    SyncPullStats,
    SyncStatusResponse,
)
from app.services.event_enrichment import ensure_event_title, get_event_location_text
from app.services.storage_service import storage_service

router = APIRouter()


def _now_utc() -> datetime:
    return datetime.now(tz=timezone.utc)


def _to_event_response(event: Event) -> EventResponse:
    full_story = event.full_story or event.story_text
    return EventResponse(
        id=event.id,
        title=ensure_event_title(event),
        locationName=get_event_location_text(event),
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


def _get_cloud_cursor(db: Session, user_id: str) -> Optional[datetime]:
    event_cursor = db.scalar(
        select(func.max(Event.updated_at)).where(Event.user_id == user_id)
    )
    photo_cursor = db.scalar(
        select(func.max(Photo.updated_at)).where(Photo.user_id == user_id)
    )
    candidates = [
        value for value in [event_cursor, photo_cursor] if isinstance(value, datetime)
    ]
    if not candidates:
        return None
    return max(candidates)


def _get_sync_state(
    db: Session, user_id: str, device_id: str
) -> Optional[UserDeviceSyncState]:
    return db.scalar(
        select(UserDeviceSyncState).where(
            and_(
                UserDeviceSyncState.user_id == user_id,
                UserDeviceSyncState.device_id == device_id,
            )
        )
    )


def _required_device_id(x_device_id: Optional[str]) -> str:
    device_id = (x_device_id or "").strip()
    if not device_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="X-Device-Id 不能为空"
        )
    return device_id


@router.get("/status", response_model=ApiResponse[SyncStatusResponse])
def get_sync_status(
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
    x_device_id: Optional[str] = Header(default=None, alias="X-Device-Id"),
) -> ApiResponse[SyncStatusResponse]:
    device_id = _required_device_id(x_device_id)
    state = _get_sync_state(db, current_user_id, device_id)

    cloud_event_count = (
        db.scalar(
            select(func.count()).select_from(
                select(Event).where(Event.user_id == current_user_id).subquery()
            )
        )
        or 0
    )
    cloud_photo_count = (
        db.scalar(
            select(func.count()).select_from(
                select(Photo).where(Photo.user_id == current_user_id).subquery()
            )
        )
        or 0
    )
    cloud_cursor = _get_cloud_cursor(db, current_user_id)

    is_first_sync = state is None
    last_cursor = state.last_pull_cursor if state else None
    needs_sync = False
    if cloud_cursor and last_cursor:
        needs_sync = cloud_cursor > last_cursor
    elif cloud_event_count > 0 and last_cursor is None:
        needs_sync = True

    return ApiResponse.ok(
        SyncStatusResponse(
            deviceId=device_id,
            isFirstSyncOnDevice=is_first_sync,
            needsSync=needs_sync,
            cloud=SyncCloudSnapshot(
                eventCount=int(cloud_event_count),
                photoCount=int(cloud_photo_count),
                cursor=cloud_cursor,
            ),
            device=SyncDeviceSnapshot(
                lastPullCursor=last_cursor,
                lastPullAt=state.last_pull_at if state else None,
            ),
            serverTime=_now_utc(),
        )
    )


@router.post("/pull", response_model=ApiResponse[SyncPullResponse])
def pull_sync_metadata(
    payload: SyncPullRequest,
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
    x_device_id: Optional[str] = Header(default=None, alias="X-Device-Id"),
) -> ApiResponse[SyncPullResponse]:
    _ = _required_device_id(x_device_id)

    query = select(Event).where(Event.user_id == current_user_id)
    if payload.sinceCursor:
        query = query.where(Event.updated_at > payload.sinceCursor)

    events = db.scalars(query.order_by(Event.updated_at.asc())).all()
    cloud_event_count = (
        db.scalar(
            select(func.count()).select_from(
                select(Event).where(Event.user_id == current_user_id).subquery()
            )
        )
        or 0
    )
    new_cursor = _get_cloud_cursor(db, current_user_id) or payload.sinceCursor

    return ApiResponse.ok(
        SyncPullResponse(
            mode="metadata_only",
            events=[_to_event_response(event) for event in events],
            deletedEventIds=[],
            newCursor=new_cursor,
            stats=SyncPullStats(
                pulledEvents=len(events),
                cloudEventCount=int(cloud_event_count),
            ),
        )
    )


@router.post("/ack", response_model=ApiResponse[SyncAckResponse])
def ack_sync(
    payload: SyncAckRequest,
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
    x_device_id: Optional[str] = Header(default=None, alias="X-Device-Id"),
) -> ApiResponse[SyncAckResponse]:
    device_id = _required_device_id(x_device_id)
    state = _get_sync_state(db, current_user_id, device_id)
    if not state:
        state = UserDeviceSyncState(user_id=current_user_id, device_id=device_id)
        db.add(state)

    state.last_pull_cursor = payload.cursor
    state.last_pull_at = _now_utc()
    state.last_prompt_at = _now_utc()

    db.commit()
    return ApiResponse.ok(SyncAckResponse(ok=True))
