# 后端模块：测试（Testing）

> **文档目的**：详细说明后端测试模块的测试框架、测试文件结构、执行命令、测试策略和最佳实践，帮助开发者快速理解和编写后端测试。

---

## 1. 模块概述

### 1.1 职责范围

- 定义后端测试框架和工具链
- 管理测试数据库和 Fixtures
- 执行单元测试和集成测试
- 生成测试报告和覆盖率
- 确保 API 接口和业务逻辑的正确性

### 1.2 代码入口

| 类型 | 文件路径 |
|------|----------|
| 测试目录 | `backend/tests/` |
| 测试配置 | `backend/tests/conftest.py` |
| 依赖定义 | `backend/requirements.txt` |
| 认证测试 | `backend/tests/test_auth.py` |
| 照片测试 | `backend/tests/test_photos.py` |
| 事件测试 | `backend/tests/test_events_api.py` |
| AI 测试 | `backend/tests/test_ai_service.py` |
| 聚类测试 | `backend/tests/test_clustering.py` |

---

## 2. 测试框架

### 2.1 技术栈

| 工具 | 版本 | 用途 |
|------|------|------|
| pytest | >=8.0 | 测试框架 |
| FastAPI TestClient | - | API 集成测试 |
| SQLAlchemy | >=2.0 | ORM 测试 |
| SQLite (内存) | - | 测试数据库 |

### 2.2 依赖安装

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2.3 测试数据库配置

```python
# backend/tests/test_auth.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# 使用内存 SQLite 数据库
engine = create_engine(
    "sqlite+pysqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

# 创建表结构
Base.metadata.create_all(bind=engine)

# 覆盖依赖注入
app.dependency_overrides[get_db] = override_get_db
```

---

## 3. 测试文件结构

### 3.1 文件列表

```
backend/tests/
├── conftest.py              # pytest 配置和共享 fixtures
├── test_auth.py             # 认证模块测试
├── test_photos.py           # 照片模块测试
├── test_events_api.py       # 事件 API 测试
├── test_tasks_api.py        # 任务 API 测试
├── test_users_api.py        # 用户 API 测试
├── test_admin_api.py        # 管理 API 测试
├── test_ai_service.py       # AI 服务测试
├── test_ai_api.py           # AI API 测试
├── test_ai_provider_factory.py  # AI 提供商工厂测试
├── test_openai_provider.py  # OpenAI 提供商测试
├── test_tongyi_client.py    # 通义千问客户端测试
├── test_clustering.py       # 聚类算法测试
├── test_geo.py              # 地理编码测试
├── test_storage_service.py  # 存储服务测试
└── test_security.py         # 安全相关测试
```

### 3.2 测试覆盖模块

| 测试文件 | 覆盖模块 | 测试类型 |
|----------|----------|----------|
| `test_auth.py` | 认证、注册、登录 | 集成测试 |
| `test_photos.py` | 照片上传、去重 | 集成测试 |
| `test_events_api.py` | 事件 CRUD | 集成测试 |
| `test_ai_service.py` | AI 故事生成 | 单元测试 |
| `test_clustering.py` | 时空聚类 | 单元测试 |
| `test_geo.py` | 逆地理编码 | 单元测试 |

---

## 4. 测试执行

### 4.1 常用命令

```bash
# 进入后端目录并激活虚拟环境
cd backend
source .venv/bin/activate

# 运行所有测试
pytest -q

# 运行所有测试（详细输出）
pytest -v

# 运行特定测试文件
pytest -q tests/test_auth.py

# 运行特定测试函数
pytest -q tests/test_auth.py::test_register_new_user

# 运行匹配名称的测试
pytest -k "auth" -v

# 显示测试覆盖率
pytest --cov=app --cov-report=term-missing

# 生成 HTML 覆盖率报告
pytest --cov=app --cov-report=html
```

### 4.2 输出重定向

```bash
# 保存测试输出到文件
pytest -q > my-spec/artifacts/<change>/reports/backend-pytest.txt 2>&1

# 保存详细日志
pytest -v --tb=long > my-spec/artifacts/<change>/logs/backend-test.log 2>&1
```

### 4.3 并行执行

```bash
# 安装 pytest-xdist
pip install pytest-xdist

# 并行运行测试
pytest -n auto
```

---

## 5. 测试用例详解

### 5.1 认证测试 (test_auth.py)

| 测试函数 | 测试场景 | 预期结果 |
|----------|----------|----------|
| `test_register_new_user` | 新设备注册 | 返回 token，is_new_user=true |
| `test_register_existing_user` | 已存在设备注册 | 返回 token，is_new_user=false |
| `test_register_email_requires_code_and_succeeds` | 邮箱注册完整流程 | 验证码验证后注册成功 |
| `test_register_email_duplicate` | 重复邮箱注册 | 返回 409，EMAIL_ALREADY_EXISTS |
| `test_login_email_success` | 邮箱登录成功 | 返回 token |
| `test_login_email_wrong_password` | 密码错误 | 返回 401，INVALID_PASSWORD |
| `test_reset_password_flow` | 重置密码流程 | 新密码可登录 |
| `test_email_case_insensitive` | 邮箱大小写不敏感 | 大写邮箱可登录 |

### 5.2 照片测试 (test_photos.py)

| 测试函数 | 测试场景 | 预期结果 |
|----------|----------|----------|
| `test_upload_photos` | 照片上传 | 返回上传成功 |
| `test_check_duplicates` | 去重检查 | 返回新哈希列表 |
| `test_upload_duplicate` | 重复上传 | 跳过已存在照片 |

### 5.3 事件测试 (test_events_api.py)

| 测试函数 | 测试场景 | 预期结果 |
|----------|----------|----------|
| `test_list_events` | 获取事件列表 | 返回分页事件 |
| `test_get_event_detail` | 获取事件详情 | 返回完整事件信息 |
| `test_regenerate_story` | 重新生成故事 | 返回任务 ID |

### 5.4 聚类测试 (test_clustering.py)

| 测试函数 | 测试场景 | 预期结果 |
|----------|----------|----------|
| `test_cluster_photos` | 照片聚类 | 返回聚类结果 |
| `test_empty_photos` | 空照片列表 | 返回空聚类 |
| `test_single_photo` | 单张照片 | 返回单个聚类 |

---

## 6. 测试数据管理

### 6.1 Fixtures 模式

```python
# conftest.py
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

@pytest.fixture(scope="function")
def db_session():
    """每个测试函数独立的数据库会话"""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()

@pytest.fixture
def test_user(db_session):
    """创建测试用户"""
    user = User(device_id="test-device", nickname="Tester")
    db_session.add(user)
    db_session.commit()
    return user

@pytest.fixture
def auth_headers(test_user):
    """生成认证头"""
    token = create_access_token(user_id=str(test_user.id))
    return {"Authorization": f"Bearer {token}"}
```

### 6.2 测试数据隔离

```python
# 每个测试文件独立的数据库实例
engine = create_engine(
    "sqlite+pysqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

# 测试前创建表
Base.metadata.create_all(bind=engine)

# 测试后清理（可选）
Base.metadata.drop_all(bind=engine)
```

### 6.3 辅助函数

```python
def _fetch_verification_code(email: str) -> str:
    """从数据库获取验证码（测试用）"""
    db: Session = TestingSessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == email.lower()))
        assert user is not None
        assert user.verification_code is not None
        return user.verification_code
    finally:
        db.close()
```

---

## 7. Mock 策略

### 7.1 外部服务 Mock

```python
from unittest.mock import patch, MagicMock

@patch("app.integrations.amap.AMapClient.reverse_geocode")
def test_geocode_with_mock(mock_geocode):
    """Mock 高德地图 API"""
    mock_geocode.return_value = {
        "province": "北京市",
        "city": "北京市",
        "district": "朝阳区",
    }
    # 测试逻辑...

@patch("app.integrations.tongyi.TongyiClient.generate")
def test_ai_with_mock(mock_generate):
    """Mock 通义千问 API"""
    mock_generate.return_value = "生成的故事内容"
    # 测试逻辑...
```

### 7.2 环境变量 Mock

```python
import os
from unittest.mock import patch

@patch.dict(os.environ, {"TONGYI_API_KEY": "test-key"})
def test_with_env():
    """Mock 环境变量"""
    # 测试逻辑...
```

---

## 8. 测试门禁

### 8.1 必须通过的测试

| 模块 | 测试文件 | 门禁级别 |
|------|----------|----------|
| 认证 | `test_auth.py` | 必须通过 |
| 照片 | `test_photos.py` | 必须通过 |
| 事件 | `test_events_api.py` | 必须通过 |
| 安全 | `test_security.py` | 必须通过 |

### 8.2 回归测试链路

```
认证 → 照片上传 → 聚类 → 事件生成 → 故事生成 → 同步
```

### 8.3 失败处理

1. 测试失败时，先记录原始输出到 artifacts
2. 分析失败原因，修复代码或测试
3. 重新运行测试直到通过
4. 多次失败且外部依赖阻塞时，标记 `BLOCKED`

---

## 9. 代码质量工具

### 9.1 格式化工具

```bash
# 代码格式化
black app/ tests/

# 导入排序
isort app/ tests/

# 类型检查
mypy app/
```

### 9.2 Lint 配置

```toml
# pyproject.toml
[tool.black]
line-length = 88
target-version = ['py311']

[tool.isort]
profile = "black"
line_length = 88

[tool.mypy]
python_version = "3.11"
strict = true
```

---

## 10. 证据产物

### 10.1 必须产出

| 文件 | 路径 | 说明 |
|------|------|------|
| 测试报告 | `my-spec/artifacts/<change>/reports/backend-pytest.txt` | pytest 输出 |
| 测试日志 | `my-spec/artifacts/<change>/logs/backend-test.log` | 详细日志 |
| 覆盖率报告 | `my-spec/artifacts/<change>/reports/coverage.html` | 可选 |

### 10.2 报告格式

```text
# backend-pytest.txt 示例
============================= test session starts ==============================
platform darwin -- Python 3.11.0, pytest-8.0.0
collected 16 items

tests/test_auth.py ........                                              [ 50%]
tests/test_photos.py ....                                                [ 75%]
tests/test_events_api.py ....                                            [100%]

============================== 16 passed in 2.34s ==============================
```

---

## 11. 最佳实践

### 11.1 测试命名规范

```python
# 格式：test_<功能>_<场景>_<预期结果>
def test_register_new_user():
    """新用户注册成功"""
    pass

def test_login_wrong_password_returns_401():
    """密码错误返回 401"""
    pass

def test_upload_duplicate_photo_skipped():
    """重复照片被跳过"""
    pass
```

### 11.2 断言规范

```python
# 使用明确的断言
assert response.status_code == 200
assert data["success"] is True
assert data["data"]["is_new_user"] is True

# 检查错误响应
assert response.status_code == 401
detail = response.json()["detail"]
assert detail["code"] == "INVALID_PASSWORD"
```

### 11.3 测试独立性

- 每个测试函数应独立运行
- 不依赖其他测试的执行顺序
- 使用 fixtures 管理共享状态
- 测试后清理创建的数据

---

## 12. 关联模块

| 模块 | 文档 | 关联说明 |
|------|------|----------|
| 前端测试 | `frontend/modules/testing.md` | 前后端测试协调 |
| 测试策略 | `execution/03-test-strategy.md` | 全局测试策略 |
| 测试手册 | `execution/02-testing-playbook.md` | 执行手册 |
| 测试配置 | `execution/01-test-profile.yaml` | profile 定义 |

---

## 13. 变更影响

若本模块变更，需同步检查：

- [ ] `my-spec/system/execution/01-test-profile.yaml`
- [ ] `my-spec/system/execution/02-testing-playbook.md`
- [ ] `my-spec/system/frontend/modules/testing.md`
- [ ] `my-spec/system/execution/03-test-strategy.md`

---

> **最后更新**：2026-02-10
