from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING, Optional

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.models.photo import Photo
from app.services.story_signal_service import build_visual_desc_from_signal

if TYPE_CHECKING:
    from app.schemas.photo import PhotoUploadItem, PhotoVisionResult


def _build_visual_desc(vision: "PhotoVisionResult | None") -> str | None:
    if vision is None:
        return None
    return build_visual_desc_from_signal(
        vision.model_dump(mode="json"),
        emotion_tag=vision.emotion_hint,
    )


class PhotoService:
    @staticmethod
    def _find_existing_photo(
        user_id: str, item: "PhotoUploadItem", db: Session
    ) -> Photo | None:
        asset_id = (item.assetId or "").strip()
        if asset_id:
            return db.scalar(
                select(Photo).where(
                    and_(Photo.user_id == user_id, Photo.asset_id == asset_id)
                )
            )

        if item.shootTime is None:
            return None

        query = select(Photo).where(
            and_(
                Photo.user_id == user_id,
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

    def upload_photos(
        self, user_id: str, items: list["PhotoUploadItem"], db: Session
    ) -> tuple[int, int]:
        uploaded = 0
        failed = 0

        for item in items:
            if self._find_existing_photo(user_id, item, db):
                failed += 1
                continue

            photo = Photo(
                user_id=user_id,
                asset_id=item.assetId,
                gps_lat=item.gpsLat,
                gps_lon=item.gpsLon,
                shoot_time=item.shootTime,
                file_size=item.fileSize,
                status="uploaded",
                visual_desc=_build_visual_desc(item.vision),
                emotion_tag=item.vision.emotion_hint
                if item.vision is not None
                else None,
                vision_result=(
                    item.vision.model_dump(mode="json")
                    if item.vision is not None
                    else None
                ),
            )
            db.add(photo)
            uploaded += 1

        db.commit()
        return uploaded, failed

    def get_photos(
        self,
        user_id: str,
        db: Session,
        page: int = 1,
        page_size: int = 20,
        event_id: Optional[str] = None,
        has_gps: Optional[bool] = None,
        status: Optional[str] = None,
    ) -> tuple[list[Photo], int]:
        query = select(Photo).where(Photo.user_id == user_id)

        if event_id:
            query = query.where(Photo.event_id == event_id)
        if has_gps is True:
            query = query.where(
                and_(Photo.gps_lat.isnot(None), Photo.gps_lon.isnot(None))
            )
        elif has_gps is False:
            query = query.where(Photo.gps_lat.is_(None))
        if status:
            query = query.where(Photo.status == status)

        total = db.scalar(select(func.count()).select_from(query.subquery())) or 0

        photos = db.scalars(
            query.order_by(Photo.shoot_time.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()

        return list(photos), total

    def get_photo_by_id(self, user_id: str, photo_id: str, db: Session) -> Photo | None:
        return db.scalar(
            select(Photo).where(and_(Photo.id == photo_id, Photo.user_id == user_id))
        )

    def update_photo(
        self,
        user_id: str,
        photo_id: str,
        db: Session,
        event_id: Optional[str] = None,
        status: Optional[str] = None,
    ) -> Photo | None:
        photo = self.get_photo_by_id(user_id, photo_id, db)
        if not photo:
            return None

        if event_id is not None:
            photo.event_id = event_id
        if status is not None:
            photo.status = status

        db.commit()
        db.refresh(photo)
        return photo

    def delete_photo(self, user_id: str, photo_id: str, db: Session) -> bool:
        photo = self.get_photo_by_id(user_id, photo_id, db)
        if not photo:
            return False
        db.delete(photo)
        db.commit()
        return True

    def get_photos_by_event(
        self,
        user_id: str,
        event_id: str,
        db: Session,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Photo], int]:
        query = select(Photo).where(
            and_(Photo.user_id == user_id, Photo.event_id == event_id)
        )
        total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
        photos = db.scalars(
            query.order_by(Photo.shoot_time.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return list(photos), total

    def get_photo_stats(self, user_id: str, db: Session) -> dict:
        base = select(Photo).where(Photo.user_id == user_id)
        total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
        with_gps = (
            db.scalar(
                select(func.count()).select_from(
                    base.where(
                        and_(Photo.gps_lat.isnot(None), Photo.gps_lon.isnot(None))
                    ).subquery()
                )
            )
            or 0
        )
        clustered = (
            db.scalar(
                select(func.count()).select_from(
                    base.where(Photo.event_id.isnot(None)).subquery()
                )
            )
            or 0
        )

        return {
            "total": total,
            "with_gps": with_gps,
            "without_gps": total - with_gps,
            "clustered": clustered,
            "unclustered": total - clustered,
        }


photo_service = PhotoService()
