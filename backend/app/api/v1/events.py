from fastapi import APIRouter

from app.schemas.common import ApiResponse

router = APIRouter()


@router.get("/", response_model=ApiResponse[list])
def list_events() -> ApiResponse[list]:
    return ApiResponse.ok([])
