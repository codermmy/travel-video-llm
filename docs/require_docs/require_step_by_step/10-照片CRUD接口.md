# 任务 ID: 10 - 照片 CRUD 接口

## 📋 基本信息

| 项目 | 内容 |
|------|------|
| **任务名称** | 照片 CRUD 接口 |
| **所属阶段** | Stage-03 照片管理 |
| **预估工期** | 0.5 天 |
| **前置条件** | Task-09 照片上传接口 |

---

## 1. 任务目标

完善照片的增删改查接口，确保前端能够完整管理照片数据。

**核心功能**：
- 获取照片列表（分页）
- 获取单张照片详情
- 更新照片信息
- 删除照片
- 按事件筛选照片

---

## 2. 前置条件

- [x] Task-09 已完成
- [x] 照片模型已存在

---

## 3. 实现细节

### 3.1 涉及文件

```
backend/
├── app/
│   ├── api/
│   │   └── v1/
│   │       └── photos.py          # ✏️ 修改：完善 CRUD 接口
│   └── schemas/
│       └── photo.py               # ✏️ 修改：添加 CRUD Schema
```

### 3.2 API 接口列表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/photos | 获取照片列表（分页） |
| GET | /api/v1/photos/{id} | 获取照片详情 |
| PATCH | /api/v1/photos/{id} | 更新照片信息 |
| DELETE | /api/v1/photos/{id} | 删除照片 |
| GET | /api/v1/photos/event/{eventId} | 获取事件下的照片 |

### 3.3 Schema 定义

#### `app/schemas/photo.py` 添加

```python
"""
照片相关 Schema
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from decimal import Decimal


class PhotoResponse(BaseModel):
    """照片响应"""
    id: int
    fileHash: str
    thumbnailUrl: str
    gpsLat: Optional[float]
    gpsLon: Optional[float]
    shootTime: Optional[datetime]
    eventId: Optional[int]
    status: str

    class Config:
        from_attributes = True


class PhotoListResponse(BaseModel):
    """照片列表响应"""
    items: List[PhotoResponse]
    total: int
    page: int
    pageSize: int
    totalPages: int


class PhotoUpdateRequest(BaseModel):
    """照片更新请求"""
    eventId: Optional[int] = None
    status: Optional[str] = None


class PhotoQueryParams(BaseModel):
    """照片查询参数"""
    eventId: Optional[int] = None
    status: Optional[str] = None
    hasGps: Optional[bool] = None
    page: int = Field(1, ge=1)
    pageSize: int = Field(20, ge=1, le=100)
```

### 3.4 核心代码实现

#### `app/api/v1/photos.py` 完善

```python
"""
照片接口 - CRUD 部分
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app.models.base import get_db
from app.models.photo import Photo
from app.schemas.photo import (
    PhotoResponse, PhotoListResponse,
    PhotoUpdateRequest, PhotoQueryParams
)
from app.schemas.common import ApiResponse, PaginatedResponse
from app.api.deps import CurrentUserIdDep
from datetime import datetime
from decimal import Decimal

router = APIRouter()


@router.get("", response_model=ApiResponse[PhotoListResponse])
async def get_photos(
    user_id: CurrentUserIdDep,
    eventId: Optional[int] = None,
    status: Optional[str] = None,
    hasGps: Optional[bool] = None,
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    获取用户照片列表（支持分页和筛选）

    筛选条件：
    - eventId: 按事件筛选
    - status: 按状态筛选
    - hasGps: 是否有 GPS 信息
    """
    # 构建查询
    query = db.query(Photo).filter(Photo.user_id == user_id)

    # 应用筛选条件
    if eventId is not None:
        query = query.filter(Photo.event_id == eventId)

    if status is not None:
        query = query.filter(Photo.status == status)

    if hasGps is True:
        query = query.filter(
            Photo.gps_lat.isnot(None),
            Photo.gps_lon.isnot(None)
        )
    elif hasGps is False:
        query = query.filter(
            or_(
                Photo.gps_lat.is_(None),
                Photo.gps_lon.is_(None)
            )
        )

    # 计算总数
    total = query.count()

    # 分页
    offset = (page - 1) * pageSize
    photos = query.order_by(Photo.shoot_time.desc()).offset(offset).limit(pageSize).all()

    # 计算总页数
    totalPages = (total + pageSize - 1) // pageSize

    return ApiResponse(
        success=True,
        data=PhotoListResponse(
            items=[
                PhotoResponse(
                    id=p.id,
                    fileHash=p.file_hash,
                    thumbnailUrl=p.thumbnail_url or "",
                    gpsLat=float(p.gps_lat) if p.gps_lat else None,
                    gpsLon=float(p.gps_lon) if p.gps_lon else None,
                    shootTime=p.shoot_time,
                    eventId=p.event_id,
                    status=p.status
                )
                for p in photos
            ],
            total=total,
            page=page,
            pageSize=pageSize,
            totalPages=totalPages
        ),
        timestamp=datetime.utcnow()
    )


@router.get("/event/{eventId}", response_model=ApiResponse[PhotoListResponse])
async def get_photos_by_event(
    eventId: int,
    user_id: CurrentUserIdDep,
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """获取指定事件的照片列表"""
    query = db.query(Photo).filter(
        Photo.user_id == user_id,
        Photo.event_id == eventId
    )

    total = query.count()
    offset = (page - 1) * pageSize
    photos = query.order_by(Photo.shoot_time.asc()).offset(offset).limit(pageSize).all()
    totalPages = (total + pageSize - 1) // pageSize

    return ApiResponse(
        success=True,
        data=PhotoListResponse(
            items=[
                PhotoResponse(
                    id=p.id,
                    fileHash=p.file_hash,
                    thumbnailUrl=p.thumbnail_url or "",
                    gpsLat=float(p.gps_lat) if p.gps_lat else None,
                    gpsLon=float(p.gps_lon) if p.gps_lon else None,
                    shootTime=p.shoot_time,
                    eventId=p.event_id,
                    status=p.status
                )
                for p in photos
            ],
            total=total,
            page=page,
            pageSize=pageSize,
            totalPages=totalPages
        ),
        timestamp=datetime.utcnow()
    )


@router.get("/{photo_id}", response_model=ApiResponse[PhotoResponse])
async def get_photo(
    photo_id: int,
    user_id: CurrentUserIdDep,
    db: Session = Depends(get_db)
):
    """获取单张照片详情"""
    photo = db.query(Photo).filter(
        Photo.id == photo_id,
        Photo.user_id == user_id
    ).first()

    if not photo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="照片不存在"
        )

    return ApiResponse(
        success=True,
        data=PhotoResponse(
            id=photo.id,
            fileHash=photo.file_hash,
            thumbnailUrl=photo.thumbnail_url or "",
            gpsLat=float(photo.gps_lat) if photo.gps_lat else None,
            gpsLon=float(photo.gps_lon) if photo.gps_lon else None,
            shootTime=photo.shoot_time,
            eventId=photo.event_id,
            status=photo.status
        ),
        timestamp=datetime.utcnow()
    )


@router.patch("/{photo_id}", response_model=ApiResponse[PhotoResponse])
async def update_photo(
    photo_id: int,
    update_data: PhotoUpdateRequest,
    user_id: CurrentUserIdDep,
    db: Session = Depends(get_db)
):
    """更新照片信息"""
    photo = db.query(Photo).filter(
        Photo.id == photo_id,
        Photo.user_id == user_id
    ).first()

    if not photo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="照片不存在"
        )

    # 更新字段
    if update_data.eventId is not None:
        photo.event_id = update_data.eventId

    if update_data.status is not None:
        photo.status = update_data.status

    db.commit()
    db.refresh(photo)

    return ApiResponse(
        success=True,
        data=PhotoResponse(
            id=photo.id,
            fileHash=photo.file_hash,
            thumbnailUrl=photo.thumbnail_url or "",
            gpsLat=float(photo.gps_lat) if photo.gps_lat else None,
            gpsLon=float(photo.gps_lon) if photo.gps_lon else None,
            shootTime=photo.shoot_time,
            eventId=photo.event_id,
            status=photo.status
        ),
        timestamp=datetime.utcnow()
    )


@router.delete("/{photo_id}", response_model=ApiResponse[dict])
async def delete_photo(
    photo_id: int,
    user_id: CurrentUserIdDep,
    db: Session = Depends(get_db)
):
    """删除照片"""
    photo = db.query(Photo).filter(
        Photo.id == photo_id,
        Photo.user_id == user_id
    ).first()

    if not photo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="照片不存在"
        )

    # TODO: 删除文件存储

    db.delete(photo)
    db.commit()

    return ApiResponse(
        success=True,
        data={"message": "照片已删除"},
        timestamp=datetime.utcnow()
    )


@router.get("/stats/summary", response_model=ApiResponse[dict])
async def get_photo_stats(
    user_id: CurrentUserIdDep,
    db: Session = Depends(get_db)
):
    """获取照片统计信息"""
    total = db.query(Photo).filter(Photo.user_id == user_id).count()

    with_gps = db.query(Photo).filter(
        Photo.user_id == user_id,
        Photo.gps_lat.isnot(None),
        Photo.gps_lon.isnot(None)
    ).count()

    clustered = db.query(Photo).filter(
        Photo.user_id == user_id,
        Photo.event_id.isnot(None)
    ).count()

    return ApiResponse(
        success=True,
        data={
            "total": total,
            "withGps": with_gps,
            "withoutGps": total - with_gps,
            "clustered": clustered,
            "unclustered": total - clustered
        },
        timestamp=datetime.utcnow()
    )
```

---

## 4. 预期行为

### 4.1 分页查询

```
GET /api/v1/photos?page=1&pageSize=20

返回前 20 张照片，以及分页信息
```

### 4.2 按事件筛选

```
GET /api/v1/photos/event/123

返回事件 123 下的所有照片
```

### 4.3 数据隔离

所有接口都自动带 `user_id` 过滤，确保用户只能访问自己的数据。

---

## 5. 验收标准

### 5.1 API 测试

```bash
# 1. 获取照片列表
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/photos?page=1&pageSize=10"

# 2. 获取事件照片
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/photos/event/1"

# 3. 获取统计信息
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/photos/stats/summary"

# 4. 更新照片
curl -X PATCH -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "http://localhost:8000/api/v1/photos/1" \
  -d '{"eventId": 5}'

# 5. 删除照片
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/photos/1"
```

### 5.2 单元测试

- [ ] 分页功能正确
- [ ] 筛选功能正确
- [ ] 数据隔离正确
- [ ] 权限检查正确

---

## 6. 风险与注意事项

### 6.1 性能优化

- 添加适当的数据库索引
- 大量照片时考虑缓存

### 6.2 与其他模块的交互

- **Task-11**：聚类后更新照片的 event_id

---

## 7. 完成检查清单

- [ ] 所有 CRUD 接口已实现
- [ ] Schema 定义完整
- [ ] API 测试通过
- [ ] 单元测试通过
- [ ] 代码符合开发规范

---

**Stage-03 完成！进入 [Task-11: 时空聚类算法核心](./11-时空聚类算法核心.md)**
