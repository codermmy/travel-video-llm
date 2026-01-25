from fastapi import APIRouter

from app.schemas.common import ApiResponse

router = APIRouter()


@router.get("/health", response_model=ApiResponse[dict])
def health_check() -> ApiResponse[dict]:
    return ApiResponse.ok({"status": "ok"})
