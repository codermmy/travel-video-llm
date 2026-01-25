# 任务 ID: 02 - 后端 JWT 认证中间件

## 📋 基本信息

| 项目 | 内容 |
|------|------|
| **任务名称** | 后端 JWT 认证中间件 |
| **所属阶段** | Stage-02 认证与权限 |
| **预估工期** | 0.5 天 |
| **前置条件** | Task-01 项目架构搭建 |

---

## 1. 任务目标

实现完整的 JWT 认证中间件，确保所有需要认证的 API 接口都经过 Token 验证，实现用户数据隔离。

**核心功能**：
- JWT Token 生成与验证
- 认证中间件（依赖注入）
- 当前用户获取（从 Token 解析 user_id）
- Token 过期处理

---

## 2. 前置条件

- [x] Task-01 已完成：项目骨架已搭建
- [x] 数据库已创建并运行
- [x] 基础配置文件 `app/config.py` 已存在

---

## 3. 实现细节

### 3.1 涉及文件

```
backend/
├── app/
│   ├── core/
│   │   └── security.py          # ✏️ 修改：完善 JWT 功能
│   ├── api/
│   │   ├── deps.py              # ✏️ 修改：依赖注入
│   │   └── v1/
│   │       └── auth.py          # ✏️ 修改：注册接口
│   └── models/
│       └── user.py              # ✅ 已存在：用户模型
```

### 3.2 技术方案

**库选择**：
- `python-jose[cryptography]` - JWT 编解码
- `passlib[bcrypt]` - 密码哈希（预留，本项目不使用密码）

**JWT 配置**（来自 `config.py`）：
```python
JWT_SECRET_KEY: str = "jwt-secret-key"  # 生产环境需更换
JWT_ALGORITHM: str = "HS256"
JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 43200  # 30天
```

### 3.3 核心逻辑

#### 3.3.1 Token 生成

```python
def create_access_token(user_id: int, expires_delta: Optional[timedelta] = None) -> str:
    """创建 JWT Token

    Token Payload:
    {
        "user_id": 123,
        "exp": 1737888000  # 过期时间戳
    }
    """
```

#### 3.3.2 Token 验证

```python
def verify_token(token: str) -> Optional[int]:
    """验证 JWT Token

    Returns:
        user_id: 验证成功返回用户ID
        None: 验证失败（过期/伪造）
    """
```

#### 3.3.3 认证依赖

```python
async def get_current_user_id(
    authorization: Annotated[str | None, Header()] = None
) -> int:
    """从 Authorization Header 获取当前用户 ID

    Header格式: Authorization: Bearer <token>

    Raises:
        HTTPException(401): Token 无效或过期
    """
```

#### 3.3.4 可选认证依赖

```python
async def get_optional_user_id(...) -> int | None:
    """可选认证，不强制要求 Token"""
```

### 3.4 完整代码实现

#### `app/core/security.py`

```python
"""
认证和安全相关
"""
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status

from app.config import get_settings

settings = get_settings()

# 密码加密上下文（预留）
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def create_access_token(user_id: int, expires_delta: Optional[timedelta] = None) -> str:
    """创建 JWT Token

    Args:
        user_id: 用户 ID
        expires_delta: 自定义过期时间增量

    Returns:
        JWT Token 字符串

    Example:
        >>> token = create_access_token(user_id=123)
        >>> print(token)
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    """
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode = {"user_id": user_id, "exp": expire}
    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )
    return encoded_jwt


def verify_token(token: str) -> Optional[int]:
    """验证 JWT Token

    Args:
        token: JWT Token 字符串

    Returns:
        用户 ID，验证失败返回 None

    Example:
        >>> user_id = verify_token("eyJhbG...")
        >>> print(user_id)
        123
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
        user_id: int = payload.get("user_id")
        if user_id is None:
            return None
        return user_id
    except JWTError:
        return None


def create_refresh_token(user_id: int) -> str:
    """创建刷新 Token（预留）"""
    # 当前版本不使用 Refresh Token
    # 预留接口，后续可扩展
    return create_access_token(user_id)
```

#### `app/api/deps.py`

```python
"""
依赖注入
"""
from typing import Annotated
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.models.base import get_db
from app.core.security import verify_token


# ================================
# 数据库依赖
# ================================

DatabaseDep = Annotated[Session, Depends(get_db)]


# ================================
# 认证依赖
# ================================

async def get_current_user_id(
    authorization: Annotated[str | None, Header()] = None
) -> int:
    """从 Authorization Header 获取当前用户 ID

    Args:
        authorization: Authorization header 值，格式 "Bearer <token>"

    Returns:
        当前用户的 ID

    Raises:
        HTTPException(401): 未提供 Token 或 Token 无效

    Example:
        >>> @router.get("/photos")
        >>> async def get_photos(user_id: CurrentUserIdDep):
        ...     # user_id 就是解析出的用户 ID
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未提供认证信息",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 移除 "Bearer " 前缀
    if authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "")
    else:
        token = authorization

    user_id = verify_token(token)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token 无效或已过期",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user_id


async def get_optional_user_id(
    authorization: Annotated[str | None, Header()] = None
) -> int | None:
    """可选认证依赖

    不强制要求 Token，有 Token 则解析，没有则返回 None

    Returns:
        用户 ID 或 None
    """
    if not authorization:
        return None

    if authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "")
    else:
        token = authorization

    return verify_token(token)


# ================================
# 类型别名，方便使用
# ================================

CurrentUserIdDep = Annotated[int, Depends(get_current_user_id)]
OptionalUserIdDep = Annotated[int | None, Depends(get_optional_user_id)]
```

---

## 4. 预期行为

### 4.1 正常流程

```
用户请求 → 携带 Token → 中间件验证 → 提取 user_id → 传递给路由函数
```

### 4.2 错误场景

| 场景 | 响应状态码 | 响应消息 |
|------|-----------|----------|
| 未提供 Token | 401 | "未提供认证信息" |
| Token 格式错误 | 401 | "Token 无效或已过期" |
| Token 已过期 | 401 | "Token 无效或已过期" |
| Token 被篡改 | 401 | "Token 无效或已过期" |

---

## 5. 验收标准

### 5.1 单元测试

创建 `backend/tests/test_security.py`：

```python
import pytest
from datetime import timedelta
from app.core.security import create_access_token, verify_token


def test_create_and_verify_token():
    """测试 Token 创建和验证"""
    user_id = 123
    token = create_access_token(user_id)
    assert token is not None
    assert isinstance(token, str)

    # 验证 Token
    verified_id = verify_token(token)
    assert verified_id == user_id


def test_invalid_token():
    """测试无效 Token"""
    assert verify_token("invalid_token") is None
    assert verify_token("") is None


def test_token_expiration():
    """测试 Token 过期"""
    user_id = 123
    # 创建一个已过期的 Token
    token = create_access_token(user_id, expires_delta=timedelta(seconds=-1))
    assert verify_token(token) is None
```

### 5.2 API 测试

```bash
# 1. 注册获取 Token
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"device_id": "test-device-123", "nickname": "测试用户"}'

# 响应: {"userId": 1, "token": "eyJhbG..."}

# 2. 使用 Token 访问受保护接口
curl http://localhost:8000/api/v1/photos \
  -H "Authorization: Bearer eyJhbG..."

# 应该返回照片列表

# 3. 不带 Token 访问
curl http://localhost:8000/api/v1/photos

# 应该返回 401
```

### 5.3 手动验证步骤

1. [ ] 启动后端服务
2. [ ] 调用注册接口，获取 Token
3. [ ] 使用 Token 调用受保护接口，成功访问
4. [ ] 不使用 Token 调用受保护接口，返回 401
5. [ ] 使用伪造 Token 调用接口，返回 401

---

## 6. 风险与注意事项

### 6.1 安全风险

| 风险 | 应对措施 |
|------|----------|
| JWT_SECRET_KEY 泄露 | 生产环境必须更换为强随机字符串 |
| Token 被截获 | 使用 HTTPS 传输（生产环境必须） |
| 永久 Token（30天） | 这是简化设计，生产环境建议缩短 |

### 6.2 开发注意事项

1. **环境变量**：`.env` 文件中的 `JWT_SECRET_KEY` 在生产环境必须更换
2. **Token 存储**：前端使用 AsyncStorage 存储，后续任务实现
3. **过期处理**：前端需要处理 401 响应，引导用户重新登录

### 6.3 与其他模块的交互

- **Task-03**：设备注册接口使用 `create_access_token()`
- **Task-04**：前端调用接口时携带 Token
- **所有后续接口**：使用 `CurrentUserIdDep` 获取当前用户 ID

---

## 7. 完成检查清单

- [ ] `app/core/security.py` 中的函数已实现
- [ ] `app/api/deps.py` 中的依赖已实现
- [ ] 所有需要认证的接口已添加 `CurrentUserIdDep` 依赖
- [ ] 单元测试已编写并通过
- [ ] API 手动测试通过
- [ ] 代码符合开发规范（类型注解、注释）

---

**任务完成后，进入 [Task-03: 后端设备注册接口完善](./03-后端设备注册接口完善.md)**
