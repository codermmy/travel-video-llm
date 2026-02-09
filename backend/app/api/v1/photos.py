from __future__ import annotations

import math
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUserIdDep
from app.db.session import get_db
from app.models.photo import Photo
from app.schemas.common import ApiResponse
from app.schemas.photo import (
    CheckDuplicatesData,
    CheckDuplicatesRequest,
    PhotoListData,
    PhotoOut,
    PhotoStatsData,
    PhotoUpdateRequest,
    PhotoUploadData,
    PhotoUploadRequest,
)
from app.services.storage_service import storage_service
from app.tasks.clustering_tasks import trigger_clustering_task

router = APIRouter()


def _photo_to_out(photo: Photo) -> PhotoOut:
    return PhotoOut(
        id=photo.id,
        fileHash=photo.file_hash,
        thumbnailUrl=storage_service.resolve_client_url(photo.thumbnail_url),
        storageProvider=photo.storage_provider,
        objectKey=photo.object_key,
        gpsLat=float(photo.gps_lat) if photo.gps_lat else None,
        gpsLon=float(photo.gps_lon) if photo.gps_lon else None,
        shootTime=photo.shoot_time,
        eventId=photo.event_id,
        status=photo.status,
    )


@router.post("/check-duplicates", response_model=ApiResponse[CheckDuplicatesData])
def check_duplicates(
    request: CheckDuplicatesRequest,
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[CheckDuplicatesData]:
    existing_photos = db.scalars(
        select(Photo.file_hash).where(
            and_(Photo.user_id == current_user_id, Photo.file_hash.in_(request.hashes))
        )
    ).all()
    existing_set = {h for h in existing_photos if h is not None}
    new_hashes = [h for h in request.hashes if h not in existing_set]
    return ApiResponse.ok(
        CheckDuplicatesData(
            newHashes=new_hashes,
            existingHashes=list(existing_set),
            totalCount=len(request.hashes),
        )
    )


@router.post("/upload/metadata", response_model=ApiResponse[PhotoUploadData])
def upload_metadata(
    request: PhotoUploadRequest,
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[PhotoUploadData]:
    existing_result = db.scalars(
        select(Photo.file_hash).where(
            and_(
                Photo.user_id == current_user_id,
                Photo.file_hash.in_([p.hash for p in request.photos]),
            )
        )
    ).all()
    existing_hashes: set[str] = {h for h in existing_result if h is not None}

    uploaded = 0
    failed = 0

    try:
        for item in request.photos:
            if item.hash in existing_hashes:
                failed += 1
                continue

            thumbnail_url, storage_provider, object_key = storage_service.build_public_photo_url(
                item.hash
            )
            photo = Photo(
                user_id=current_user_id,
                file_hash=item.hash,
                thumbnail_path=item.thumbnailPath,
                thumbnail_url=thumbnail_url,
                storage_provider=storage_provider,
                object_key=object_key,
                gps_lat=item.gpsLat,
                gps_lon=item.gpsLon,
                shoot_time=item.shootTime,
                file_size=item.fileSize,
                status="uploaded",
            )
            db.add(photo)
            existing_hashes.add(item.hash)
            uploaded += 1

        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"上传失败: {e}")

    task_id = None
    if uploaded > 0 and request.triggerClustering:
        try:
            task_id = trigger_clustering_task(user_id=current_user_id, db=db)
        except Exception:
            task_id = None

    return ApiResponse.ok(PhotoUploadData(uploaded=uploaded, failed=failed, taskId=task_id))


@router.post("/upload/file", response_model=ApiResponse[dict])
def upload_file(
    current_user_id: CurrentUserIdDep,
    file_hash: str = Query(..., min_length=64, max_length=64),
    file: UploadFile = File(...),
) -> ApiResponse[dict]:
    try:
        upload = storage_service.upload_photo_file(file_hash=file_hash, file_obj=file.file)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"文件上传失败: {e}")

    return ApiResponse.ok(
        {
            "path": upload.local_path,
            "size": Path(upload.local_path).stat().st_size,
            "url": upload.public_url,
            "storageProvider": upload.storage_provider,
            "objectKey": upload.object_key,
        }
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

    if request.eventId is not None:
        photo.event_id = request.eventId
    if request.status is not None:
        photo.status = request.status

    db.commit()
    db.refresh(photo)
    return ApiResponse.ok(_photo_to_out(photo))


@router.delete("/{photo_id}", response_model=ApiResponse[dict])
def delete_photo(
    photo_id: str,
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[dict]:
    photo = db.scalar(
        select(Photo).where(and_(Photo.id == photo_id, Photo.user_id == current_user_id))
    )
    if not photo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="照片不存在")

    db.delete(photo)
    db.commit()
    return ApiResponse.ok({"message": "照片已删除"})
