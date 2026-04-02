from __future__ import annotations

import logging
import math
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUserIdDep
from app.db.session import get_db
from app.models.event import Event
from app.models.photo import Photo
from app.schemas.common import ApiResponse
from app.schemas.photo import (
    PhotoBatchDeleteRequest,
    PhotoBatchDeleteResponse,
    CheckDuplicatesByMetadataData,
    CheckDuplicatesByMetadataRequest,
    PhotoBatchEventUpdateRequest,
    PhotoBatchEventUpdateResponse,
    PhotoDeleteResponse,
    PhotoListData,
    PhotoMetadataItem,
    PhotoOut,
    PhotoStatsData,
    PhotoUploadItem,
    PhotoVisionResult,
    PhotoVisionStatus,
    PhotoUploadResultItem,
    PhotoUpdateRequest,
    PhotoUploadData,
    PhotoUploadRequest,
)
from app.services.event_service import event_service
from app.services.storage_service import storage_service
from app.tasks.clustering_tasks import trigger_clustering_task, trigger_event_story_task

router = APIRouter()
logger = logging.getLogger(__name__)


def _refresh_impacted_events(
    *,
    db: Session,
    user_id: str,
    event_ids: set[str | None],
    structure_changed: bool = False,
) -> tuple[list[str], list[str]]:
    normalized_event_ids = {event_id for event_id in event_ids if event_id}
    if structure_changed:
        event_service.mark_events_structure_changed(
            event_ids=normalized_event_ids,
            user_id=user_id,
            db=db,
        )

    impacted_event_ids: list[str] = []
    deleted_event_ids: list[str] = []
    for event_id in normalized_event_ids:
        event = event_service.refresh_event_summary(event_id=event_id, user_id=user_id, db=db)
        if not event:
            continue
        if event.photo_count == 0:
            if event_service.delete_empty_event(event_id=event_id, user_id=user_id, db=db):
                deleted_event_ids.append(event_id)
            continue

        impacted_event_ids.append(event_id)

        queued = event_service.mark_event_pending_story_refresh(
            event_id=event_id,
            user_id=user_id,
            db=db,
        )
        if not queued or queued.story_requested_for_version != queued.event_version:
            continue

        trigger_event_story_task(
            user_id=user_id,
            event_id=event_id,
            event_version=queued.event_version,
            db=db,
        )

    return sorted(impacted_event_ids), sorted(deleted_event_ids)


def _build_visual_desc(vision: PhotoVisionResult | None) -> str | None:
    if vision is None:
        return None

    parts: list[str] = []
    if vision.scene_category:
        parts.append(vision.scene_category)
    if vision.activity_hint:
        parts.append(vision.activity_hint)
    if vision.object_tags:
        parts.append(" / ".join(vision.object_tags[:3]))
    if vision.ocr_text:
        parts.append(vision.ocr_text[:80])

    if not parts:
        return None
    return " | ".join(parts)


def _photo_to_out(photo: Photo) -> PhotoOut:
    return PhotoOut(
        id=photo.id,
        assetId=photo.asset_id,
        fileHash=photo.file_hash,
        thumbnailUrl=storage_service.resolve_client_url(photo.thumbnail_url),
        storageProvider=photo.storage_provider,
        objectKey=photo.object_key,
        gpsLat=float(photo.gps_lat) if photo.gps_lat is not None else None,
        gpsLon=float(photo.gps_lon) if photo.gps_lon is not None else None,
        shootTime=photo.shoot_time,
        eventId=photo.event_id,
        status=photo.status,
        caption=photo.caption,
        visualDesc=photo.visual_desc,
        emotionTag=photo.emotion_tag,
        visionStatus=photo.vision_status,
        visionError=photo.vision_error,
        visionUpdatedAt=photo.vision_updated_at,
        vision=photo.vision_result,
    )


def _find_existing_photo_for_upload(
    *,
    db: Session,
    current_user_id: str,
    item: PhotoUploadItem,
) -> Photo | None:
    asset_id = (item.assetId or "").strip()
    if asset_id:
        return db.scalar(
            select(Photo).where(
                and_(Photo.user_id == current_user_id, Photo.asset_id == asset_id)
            )
        )

    if item.shootTime is None:
        return None

    query = select(Photo).where(
        and_(
            Photo.user_id == current_user_id,
            Photo.shoot_time >= item.shootTime - timedelta(seconds=2),
            Photo.shoot_time <= item.shootTime + timedelta(seconds=2),
        )
    )

    if item.gpsLat is not None and item.gpsLon is not None:
        query = query.where(
            and_(
                Photo.gps_lat == item.gpsLat,
                Photo.gps_lon == item.gpsLon,
            )
        )
    elif item.gpsLat is None and item.gpsLon is None:
        query = query.where(
            and_(
                Photo.gps_lat.is_(None),
                Photo.gps_lon.is_(None),
            )
        )
    else:
        return None

    return db.scalar(query.limit(1))


@router.post("/check-duplicates-by-metadata", response_model=ApiResponse[CheckDuplicatesByMetadataData])
def check_duplicates_by_metadata(
    request: CheckDuplicatesByMetadataRequest,
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[CheckDuplicatesByMetadataData]:
    """基于拍摄时间和 GPS 的 metadata 去重。"""
    new_items: list[PhotoMetadataItem] = []
    existing_items: list[PhotoMetadataItem] = []
    new_indices: list[int] = []
    existing_indices: list[int] = []

    for index, item in enumerate(request.photos):
        # 缺少拍摄时间时不过滤，避免把“同地点不同时间”误判为重复。
        if item.shootTime is None:
            new_items.append(item)
            new_indices.append(index)
            continue

        # 构建查询条件：拍摄时间（±2 秒误差）+ GPS 位置
        time_start = item.shootTime - timedelta(seconds=2)
        time_end = item.shootTime + timedelta(seconds=2)

        # 构建查询
        query = select(Photo).where(
            and_(
                Photo.user_id == current_user_id,
                Photo.shoot_time >= time_start,
                Photo.shoot_time <= time_end,
            )
        )

        # GPS 条件：精确匹配或都为空
        if item.gpsLat is not None and item.gpsLon is not None:
            query = query.where(
                and_(
                    Photo.gps_lat == item.gpsLat,
                    Photo.gps_lon == item.gpsLon,
                )
            )
        elif item.gpsLat is None and item.gpsLon is None:
            query = query.where(
                and_(
                    Photo.gps_lat.is_(None),
                    Photo.gps_lon.is_(None),
                )
            )
        else:
            # GPS 信息不完整时不过滤，避免产生宽泛匹配。
            new_items.append(item)
            new_indices.append(index)
            continue

        # 执行查询
        existing_photo = db.scalar(query.limit(1))

        if existing_photo:
            # 找到重复照片
            existing_items.append(item)
            existing_indices.append(index)
        else:
            # 新照片
            new_items.append(item)
            new_indices.append(index)

    return ApiResponse.ok(
        CheckDuplicatesByMetadataData(
            newItems=new_items,
            existingItems=existing_items,
            newIndices=new_indices,
            existingIndices=existing_indices,
            totalCount=len(request.photos),
        )
    )


@router.post("/upload/metadata", response_model=ApiResponse[PhotoUploadData])
def upload_metadata(
    request: PhotoUploadRequest,
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[PhotoUploadData]:
    uploaded = 0
    failed = 0
    uploaded_items: list[PhotoUploadResultItem] = []

    try:
        for item in request.photos:
            if _find_existing_photo_for_upload(
                db=db, current_user_id=current_user_id, item=item
            ):
                failed += 1
                continue

            photo = Photo(
                user_id=current_user_id,
                asset_id=item.assetId,
                gps_lat=item.gpsLat,
                gps_lon=item.gpsLon,
                shoot_time=item.shootTime,
                file_size=item.fileSize,
                status="uploaded",
                visual_desc=_build_visual_desc(item.vision),
                emotion_tag=(item.vision.emotion_hint if item.vision is not None else None),
                vision_status="completed" if item.vision is not None else "pending",
                vision_error=None,
                vision_result=(
                    item.vision.model_dump(mode="json") if item.vision is not None else None
                ),
                vision_updated_at=(
                    datetime.now(tz=timezone.utc) if item.vision is not None else None
                ),
            )
            db.add(photo)
            db.flush()
            uploaded += 1
            uploaded_items.append(
                PhotoUploadResultItem(
                    id=photo.id,
                    clientRef=item.clientRef,
                    assetId=photo.asset_id,
                    gpsLat=float(photo.gps_lat) if photo.gps_lat is not None else None,
                    gpsLon=float(photo.gps_lon) if photo.gps_lon is not None else None,
                    shootTime=photo.shoot_time,
                )
            )

        db.commit()
    except Exception as e:
        db.rollback()
        logger.exception("upload_metadata failed")
        raise HTTPException(status_code=500, detail=f"上传失败: {e}")

    task_id = None
    if uploaded > 0 and request.triggerClustering:
        try:
            task_id = trigger_clustering_task(user_id=current_user_id, db=db)
        except Exception:
            task_id = None

    return ApiResponse.ok(
        PhotoUploadData(
            uploaded=uploaded,
            failed=failed,
            taskId=task_id,
            items=uploaded_items,
        )
    )


@router.get("/", response_model=ApiResponse[PhotoListData])
def list_photos(
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    eventId: Optional[str] = Query(None),
    hasGps: Optional[bool] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
) -> ApiResponse[PhotoListData]:
    query = select(Photo).where(Photo.user_id == current_user_id)

    if eventId:
        query = query.where(Photo.event_id == eventId)
    if hasGps is True:
        query = query.where(and_(Photo.gps_lat.isnot(None), Photo.gps_lon.isnot(None)))
    elif hasGps is False:
        query = query.where(Photo.gps_lat.is_(None))
    if status_filter:
        query = query.where(Photo.status == status_filter)

    total = db.scalar(select(func.count()).select_from(query.subquery()))
    total = total or 0
    total_pages = max(1, math.ceil(total / pageSize))

    photos = db.scalars(
        query.order_by(Photo.shoot_time.desc()).offset((page - 1) * pageSize).limit(pageSize)
    ).all()

    return ApiResponse.ok(
        PhotoListData(
            items=[_photo_to_out(p) for p in photos],
            total=total,
            page=page,
            pageSize=pageSize,
            totalPages=total_pages,
        )
    )


@router.get("/stats/summary", response_model=ApiResponse[PhotoStatsData])
def get_stats(
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[PhotoStatsData]:
    base = select(Photo).where(Photo.user_id == current_user_id)

    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    with_gps = (
        db.scalar(
            select(func.count()).select_from(
                base.where(and_(Photo.gps_lat.isnot(None), Photo.gps_lon.isnot(None))).subquery()
            )
        )
        or 0
    )
    clustered = (
        db.scalar(
            select(func.count()).select_from(base.where(Photo.event_id.isnot(None)).subquery())
        )
        or 0
    )

    return ApiResponse.ok(
        PhotoStatsData(
            total=total,
            withGps=with_gps,
            withoutGps=total - with_gps,
            clustered=clustered,
            unclustered=total - clustered,
        )
    )


@router.get("/event/{event_id}", response_model=ApiResponse[PhotoListData])
def get_photos_by_event(
    event_id: str,
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
) -> ApiResponse[PhotoListData]:
    query = select(Photo).where(and_(Photo.user_id == current_user_id, Photo.event_id == event_id))

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    total_pages = max(1, math.ceil(total / pageSize))

    photos = db.scalars(
        query.order_by(Photo.shoot_time.asc()).offset((page - 1) * pageSize).limit(pageSize)
    ).all()

    return ApiResponse.ok(
        PhotoListData(
            items=[_photo_to_out(p) for p in photos],
            total=total,
            page=page,
            pageSize=pageSize,
            totalPages=total_pages,
        )
    )


@router.get("/{photo_id}", response_model=ApiResponse[PhotoOut])
def get_photo(
    photo_id: str,
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[PhotoOut]:
    photo = db.scalar(
        select(Photo).where(and_(Photo.id == photo_id, Photo.user_id == current_user_id))
    )
    if not photo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="照片不存在")
    return ApiResponse.ok(_photo_to_out(photo))


@router.patch("/{photo_id}", response_model=ApiResponse[PhotoOut])
def update_photo(
    photo_id: str,
    request: PhotoUpdateRequest,
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[PhotoOut]:
    photo = db.scalar(
        select(Photo).where(and_(Photo.id == photo_id, Photo.user_id == current_user_id))
    )
    if not photo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="照片不存在")

    previous_event_id = photo.event_id
    fields_set = request.model_fields_set
    vision_updated = False

    if request.eventId is not None:
        if request.eventId:
            target_event = db.scalar(
                select(Event).where(
                    and_(Event.id == request.eventId, Event.user_id == current_user_id)
                )
            )
            if not target_event:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="目标事件不存在"
                )
        photo.event_id = request.eventId
        if request.eventId:
            photo.status = "clustered"
        elif request.status is None:
            photo.status = "uploaded"
    if request.status is not None:
        photo.status = request.status
    if request.caption is not None:
        photo.caption = request.caption
    if "vision" in fields_set:
        if request.vision is None:
            photo.vision_result = None
            photo.visual_desc = None
            photo.emotion_tag = None
        else:
            photo.vision_result = request.vision.model_dump(mode="json")
            photo.visual_desc = _build_visual_desc(request.vision)
            photo.emotion_tag = request.vision.emotion_hint
            if request.visionStatus is None:
                photo.vision_status = "completed"
            if "visionError" not in fields_set:
                photo.vision_error = None
        vision_updated = True
    if request.visionStatus is not None:
        photo.vision_status = request.visionStatus
        vision_updated = True
    if "visionError" in fields_set:
        photo.vision_error = request.visionError
        vision_updated = True
    if photo.vision_status == "completed" and "visionError" not in fields_set:
        photo.vision_error = None
    if vision_updated:
        photo.vision_updated_at = datetime.now(tz=timezone.utc)

    db.commit()
    db.refresh(photo)
    if request.eventId is not None or vision_updated:
        _refresh_impacted_events(
            db=db,
            user_id=current_user_id,
            event_ids={previous_event_id, photo.event_id},
            structure_changed=request.eventId is not None,
        )
        db.refresh(photo)
    return ApiResponse.ok(_photo_to_out(photo))


@router.post("/batch/reassign-event", response_model=ApiResponse[PhotoBatchEventUpdateResponse])
def batch_reassign_photos_to_event(
    request: PhotoBatchEventUpdateRequest,
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[PhotoBatchEventUpdateResponse]:
    if request.eventId:
        target_event = db.scalar(
            select(Event).where(
                and_(Event.id == request.eventId, Event.user_id == current_user_id)
            )
        )
        if not target_event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="目标事件不存在",
            )

    photos = list(
        db.scalars(
            select(Photo).where(
                and_(Photo.user_id == current_user_id, Photo.id.in_(request.photoIds))
            )
        ).all()
    )
    if len(photos) != len(set(request.photoIds)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="存在无效照片")

    impacted_event_ids = {photo.event_id for photo in photos}
    if request.eventId:
        impacted_event_ids.add(request.eventId)

    for photo in photos:
        photo.event_id = request.eventId
        if request.eventId:
            photo.status = "clustered"
        else:
            photo.status = "uploaded"

    db.commit()

    impacted_event_ids, deleted_event_ids = _refresh_impacted_events(
        db=db,
        user_id=current_user_id,
        event_ids=impacted_event_ids,
        structure_changed=True,
    )

    return ApiResponse.ok(
        PhotoBatchEventUpdateResponse(
            updated=len(photos),
            impactedEventIds=impacted_event_ids,
            deletedEventIds=deleted_event_ids,
        )
    )


@router.post("/batch/delete", response_model=ApiResponse[PhotoBatchDeleteResponse])
def batch_delete_photos(
    request: PhotoBatchDeleteRequest,
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[PhotoBatchDeleteResponse]:
    photos = list(
        db.scalars(
            select(Photo).where(
                and_(Photo.user_id == current_user_id, Photo.id.in_(request.photoIds))
            )
        ).all()
    )
    if len(photos) != len(set(request.photoIds)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="存在无效照片")

    impacted_event_ids = {photo.event_id for photo in photos}
    for photo in photos:
        db.delete(photo)
    db.commit()

    refreshed_event_ids, deleted_event_ids = _refresh_impacted_events(
        db=db,
        user_id=current_user_id,
        event_ids=impacted_event_ids,
        structure_changed=True,
    )

    return ApiResponse.ok(
        PhotoBatchDeleteResponse(
            deleted=len(photos),
            impactedEventIds=refreshed_event_ids,
            deletedEventIds=deleted_event_ids,
        )
    )


@router.delete("/{photo_id}", response_model=ApiResponse[PhotoDeleteResponse])
def delete_photo(
    photo_id: str,
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[PhotoDeleteResponse]:
    photo = db.scalar(
        select(Photo).where(and_(Photo.id == photo_id, Photo.user_id == current_user_id))
    )
    if not photo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="照片不存在")

    impacted_event_ids = {photo.event_id}
    db.delete(photo)
    db.commit()

    refreshed_event_ids, deleted_event_ids = _refresh_impacted_events(
        db=db,
        user_id=current_user_id,
        event_ids=impacted_event_ids,
        structure_changed=True,
    )
    return ApiResponse.ok(
        PhotoDeleteResponse(
            message="照片已删除",
            impactedEventIds=refreshed_event_ids,
            deletedEventIds=deleted_event_ids,
        )
    )
