from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUserIdDep
from app.db.session import get_db
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.user import UserProfileResponse, UserSearchResponse, UserUpdateRequest
from app.services.storage_service import storage_service

router = APIRouter()


def _user_to_response(user: User) -> UserProfileResponse:
    return UserProfileResponse(
        id=user.id,
        device_id=user.device_id,
        email=user.email,
        nickname=user.nickname,
        avatar_url=storage_service.resolve_client_url(user.avatar_url),
        username=user.username,
        auth_type=user.auth_type,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.get("/me", response_model=ApiResponse[UserProfileResponse])
def get_current_user(
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[UserProfileResponse]:
    user = db.scalar(select(User).where(User.id == current_user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    return ApiResponse.ok(_user_to_response(user))


@router.patch("/me", response_model=ApiResponse[UserProfileResponse])
def update_current_user(
    payload: UserUpdateRequest,
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[UserProfileResponse]:
    user = db.scalar(select(User).where(User.id == current_user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    if payload.username is not None:
        existing = db.scalar(select(User).where(User.username == payload.username))
        if existing and existing.id != user.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="用户名已存在"
            )
        user.username = payload.username

    if payload.nickname is not None:
        user.nickname = payload.nickname

    if payload.avatar_url is not None:
        user.avatar_url = payload.avatar_url

    db.commit()
    db.refresh(user)
    return ApiResponse.ok(_user_to_response(user))


@router.post("/me/avatar", response_model=ApiResponse[UserProfileResponse])
def upload_current_user_avatar(
    current_user_id: CurrentUserIdDep,
    file_hash: str = Query(..., min_length=64, max_length=64),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> ApiResponse[UserProfileResponse]:
    user = db.scalar(select(User).where(User.id == current_user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    try:
        upload = storage_service.upload_avatar_file(
            user_id=current_user_id,
            file_hash=file_hash,
            file_obj=file.file,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"头像上传失败: {exc}") from exc

    user.avatar_url = upload.public_url
    db.commit()
    db.refresh(user)
    return ApiResponse.ok(_user_to_response(user))


@router.get("/by-username/{username}", response_model=ApiResponse[UserProfileResponse])
def get_user_by_username(
    username: str,
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[UserProfileResponse]:
    _ = current_user_id
    user = db.scalar(select(User).where(User.username == username.lower().strip()))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    return ApiResponse.ok(_user_to_response(user))


@router.get("/by-nickname/{nickname}", response_model=ApiResponse[UserSearchResponse])
def search_users_by_nickname(
    nickname: str,
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> ApiResponse[UserSearchResponse]:
    _ = current_user_id
    keyword = nickname.strip()
    query = select(User).where(User.nickname.ilike(f"%{keyword}%"))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    users = db.scalars(
        query.order_by(User.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return ApiResponse.ok(
        UserSearchResponse(
            users=[_user_to_response(user) for user in users], total=int(total)
        )
    )


@router.get("/{user_id}", response_model=ApiResponse[UserProfileResponse])
def get_user_by_id(
    user_id: str,
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[UserProfileResponse]:
    _ = current_user_id
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    return ApiResponse.ok(_user_to_response(user))
