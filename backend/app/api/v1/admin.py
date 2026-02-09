from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.schemas.admin import (
    AdminReclusterRequest,
    AdminReclusterResponse,
    AdminUserReclusterResult,
)
from app.schemas.common import ApiResponse
from app.services.admin_recluster_service import list_recluster_target_user_ids, recluster_users

router = APIRouter()


def _require_admin_key(
    x_admin_key: str | None = Header(default=None, alias="X-Admin-Key"),
) -> None:
    configured = settings.admin_api_key.strip()
    if not configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="admin_api_key_not_configured",
        )

    if not x_admin_key or x_admin_key.strip() != configured:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="admin_key_invalid",
        )


@router.post("/recluster", response_model=ApiResponse[AdminReclusterResponse])
def admin_recluster(
    payload: AdminReclusterRequest,
    _: None = Depends(_require_admin_key),
    db: Session = Depends(get_db),
) -> ApiResponse[AdminReclusterResponse]:
    target_user_ids = list_recluster_target_user_ids(
        db,
        user_id=payload.userId,
        all_users=payload.allUsers,
        limit_users=payload.limitUsers,
    )

    run_result = recluster_users(
        db,
        target_user_ids=target_user_ids,
        run_geocoding=payload.runGeocoding,
    )

    duration_ms = int((run_result.finished_at - run_result.started_at).total_seconds() * 1000)

    return ApiResponse.ok(
        AdminReclusterResponse(
            startedAt=run_result.started_at,
            finishedAt=run_result.finished_at,
            durationMs=max(duration_ms, 0),
            userCount=run_result.user_count,
            totalCreatedEvents=run_result.total_created_events,
            totalPreviousEvents=run_result.total_previous_events,
            totalResetPhotos=run_result.total_reset_photos,
            totalNoisePhotos=run_result.total_noise_photos,
            results=[
                AdminUserReclusterResult(
                    userId=item.user_id,
                    totalPhotos=item.total_photos,
                    previousEvents=item.previous_events,
                    resetPhotos=item.reset_photos,
                    createdEvents=item.created_events,
                    noisePhotos=item.noise_photos,
                    uploadedPhotos=item.uploaded_photos,
                    geocodedEvents=item.geocoded_events,
                )
                for item in run_result.results
            ],
        )
    )
