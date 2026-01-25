from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.db.session import get_db
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.user import DeviceRegisterRequest, DeviceRegisterResponse

router = APIRouter()


@router.post("/register", response_model=ApiResponse[DeviceRegisterResponse])
def register_device(
    payload: DeviceRegisterRequest,
    db: Session = Depends(get_db),
) -> ApiResponse[DeviceRegisterResponse]:
    if not payload.device_id.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="device_id is required")

    stmt = select(User).where(User.device_id == payload.device_id)
    user = db.scalar(stmt)
    if user is None:
        user = User(device_id=payload.device_id)
        db.add(user)
        db.commit()
        db.refresh(user)

    token = create_access_token(subject=user.id)
    return ApiResponse.ok(DeviceRegisterResponse(token=token, user_id=user.id))
