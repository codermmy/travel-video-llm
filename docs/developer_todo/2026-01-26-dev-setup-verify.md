# 开发者待办：配置与验证（AI + 高德地图）

本文档用于你在本机完成：Key 申请与配置、运行项目、端到端验证。

## 今晚已完成的工作（概览）

移动端（Expo / React Native）
- 事件详情页：`mobile/app/events/[eventId].tsx`
  - 读取路由参数 `eventId`，拉取事件详情并渲染封面、标题、时间地点、状态/心情、故事文案、照片网格
  - 处理加载态/错误态/重试/返回
  - 对异步请求做“过期响应保护”（避免快速返回导致 setState 警告）
- 地图页到详情页导航打通：`mobile/app/(tabs)/index.tsx` 推到 `/events/${eventId}`

地图（高德 AMap，react-native-amap3d）
- 地图容器：`mobile/src/components/map/MapViewContainer.tsx`
  - 从 `mobile/app.json` 的 `expo.extra.amap.*Key` 读取 Key
  - 未配置 Key 或运行在 Expo Go 时，显示明确的 fallback 提示

后端（FastAPI）
- AI 集成（通义千问/万相 DashScope 兼容模式）：
  - 客户端：`backend/app/integrations/tongyi.py`（读取 `DASHSCOPE_API_KEY`）
  - 服务封装：`backend/app/services/ai_service.py`
  - API 路由：`backend/app/api/v1/ai.py`（已在 `backend/app/api/v1/router.py` 注册为 `/api/v1/ai`）
- 高德逆地理编码（用于把经纬度转地点名）：`backend/app/integrations/amap.py`（读取 `AMAP_API_KEY`）

说明
- 当前仓库工作区里还有不少未提交改动（包含后端/移动端多处）。本文件仅描述“如何配置与验证”，不要求你先清理改动。

## 你需要做的配置（按优先级）

### 0) 基础运行环境

后端
- Python 3.11+
- PostgreSQL 15+
- Redis 7+

移动端
- Node.js 18+（建议 18/20 LTS）
- iOS：Xcode
- Android：Android Studio + SDK

### 1) AI：DashScope（通义千问/万相）Key

#### 1.1 去哪里申请

- 入口（DashScope）：https://dashscope.aliyun.com/
- 在控制台创建/获取 API Key（通常叫 API-KEY / Access Key），并确保账号有对应模型调用权限（本项目使用 `qwen-plus`、`qwen-vl-max`）。

#### 1.2 Key 配置到哪里

后端支持的环境变量（任选其一即可）
- 推荐：`DASHSCOPE_API_KEY`
- 兼容：`dashscope_api_key`
- 兼容：`TONGYI_API_KEY` / `tongyi_api_key`

配置步骤
1) 复制后端环境文件：

```bash
cd backend
cp .env.example .env
```

2) 编辑 `backend/.env`，新增/修改（推荐写法）：

```ini
DASHSCOPE_API_KEY=你的_dashscope_key
```

备注
- 之前如果你在 `backend/.env` 里写了 `dashscope_api_key=` 或 `tongyi_api_key=`，现在也会被后端接受。
- 为避免后续歧义，建议统一使用全大写：`DASHSCOPE_API_KEY`。

#### 1.3 如何验证 AI API 是否生效

启动后端（见下面“运行”章节），然后用 Swagger 或 curl 调用：

- Swagger：`http://localhost:8000/docs` -> tag `ai`

1) 照片分析（需要可公网访问的图片 URL 才有意义）：

```bash
curl -sS -H 'Content-Type: application/json' \
  -X POST http://localhost:8000/api/v1/ai/analyze-photos \
  -d '{
    "photo_urls": [
      "https://example.com/a.jpg",
      "https://example.com/b.jpg"
    ],
    "location": "上海"
  }'
```

2) 故事生成：

```bash
curl -sS -H 'Content-Type: application/json' \
  -X POST http://localhost:8000/api/v1/ai/generate-story \
  -d '{
    "event_id": "evt-demo",
    "location": "上海",
    "start_time": "2026-01-01T08:00:00",
    "end_time": "2026-01-02T18:00:00",
    "photo_descriptions": ["外滩夜景", "街头小吃", "江边散步"]
  }'
```

预期
- 正常情况下返回 JSON，包含 `title/story/emotion`。
- 如果没配置 `DASHSCOPE_API_KEY` 或权限不足，`/generate-story` 大概率会返回 500。

### 2) 高德地图：AMap Key（移动端地图 SDK）

#### 2.1 去哪里申请

- 高德开放平台（控制台）：https://console.amap.com/
- Key 管理通常在：控制台 -> 应用管理 -> 我的应用 -> 添加 Key
- 文档入口（可选）：https://lbs.amap.com/

你需要分别准备：
- iOS Key：绑定 iOS 包名（Bundle Identifier）
- Android Key：绑定 Android 包名（Package Name）+（通常还需要 SHA1 指纹）

#### 2.2 先确定包名/应用标识（很关键）

当前 `mobile/app.json` 里没有显式设置：
- `expo.ios.bundleIdentifier`
- `expo.android.package`

建议你先选定自己的标识并补上（否则你在高德后台不容易正确绑定）。例如：

```json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "com.yourcompany.travelalbum"
    },
    "android": {
      "package": "com.yourcompany.travelalbum"
    }
  }
}
```

然后再用这些值去高德控制台创建对应平台的 Key。

#### 2.3 Key 配置到哪里（推荐：环境变量，不把 Key 写入仓库）

我们新增了 Expo 配置入口：`mobile/app.config.ts`。
它会在构建时把环境变量注入到 `expo.extra.amap`，这样 Key 不需要写进 `mobile/app.json`。

推荐做法：在执行 `prebuild/run:*` 前先设置环境变量：

```bash
export AMAP_IOS_KEY="你的_ios_key"
export AMAP_ANDROID_KEY="你的_android_key"
```

然后重新 prebuild / 构建 Development Build（Key 会被 bake 进原生包）。

#### 2.4 Key 配置到哪里（备选：直接改 app.json）

移动端地图模块从 `mobile/app.json` 读取：
- `expo.extra.amap.androidKey`
- `expo.extra.amap.iosKey`

位置：`mobile/app.json`

```json
{
  "expo": {
    "extra": {
      "amap": {
        "androidKey": "你的_android_key",
        "iosKey": "你的_ios_key"
      }
    }
  }
}
```

重要
- 这是原生模块 Key：修改后必须重新构建 Development Build（热更新/Expo Go 都不行）。

#### 2.4 如何验证地图是否生效

你需要用 Development Build 运行（Expo Go 不支持 `react-native-amap3d`）。

1) 安装依赖

```bash
cd mobile
npm install
```

2) 生成原生工程并运行（本地方式）

iOS：
```bash
cd mobile
npx expo prebuild -p ios
npx expo run:ios
```

Android：
```bash
cd mobile
npx expo prebuild -p android
npx expo run:android
```

3) 用 Dev Client 启动 Metro

```bash
cd mobile
npx expo start --dev-client
```

4) 在自建客户端里打开应用
- 地图 Tab 应显示地图与事件 marker。
- 若 Key 未配/不匹配/运行在 Expo Go，你会看到 `MapViewContainer` 的 fallback 文案（会提示要配 `mobile/app.json` 的 key 或要用 Dev Build）。

补充
- Web（`npm run web`）不支持高德地图原生模块，会显示提示与事件预览，这是预期行为。

## 运行与端到端验证流程

### A) 启动后端

```bash
cd backend
cp .env.example .env
source .venv/bin/activate

# 如未建虚拟环境：
# /opt/homebrew/bin/python3.11 -m venv .venv
# source .venv/bin/activate

pip install -r requirements.txt
alembic upgrade head
python main.py
```

如果你看到类似报错（很常见，代表数据库 schema 还没升级到最新）：
- `psycopg.errors.UndefinedColumn: column users.email does not exist`

处理方式：
1) 确认当前连接的是你预期的数据库（`backend/.env` 的 `DATABASE_URL`）
2) 重新执行：

```bash
cd backend
source .venv/bin/activate
alembic upgrade head
```

如果你的数据库是早期版本且迁移冲突严重，最省事的做法是：删除并重建 dev 数据库后再 `alembic upgrade head`。

验证后端可用
- `GET http://localhost:8000/api/v1/health`
- Swagger：`http://localhost:8000/docs`

### B) 启动移动端（普通 JS 调试）

说明
- 事件详情页、列表等纯 JS 页面：可以在普通 `npm start` 下验证。
- 高德地图：必须用 Development Build（见上文）。

```bash
cd mobile
npm install
npm start
```

API 访问说明（真机）
- `mobile/src/constants/api.ts` 会尝试自动把 API 指向你的开发机 IP（从 Expo hostUri 推断）。
- 若你在真机上访问失败，优先检查：手机与 Mac 是否在同一局域网、后端是否监听 0.0.0.0、以及防火墙设置。

### C) 业务验证清单

1) 注册/登录（任一方式）
- 用 Swagger 调用 `/api/v1/auth/*`，或直接走 App 的登录流程。

2) 事件数据准备
- 如果你还没有事件：先走“上传照片/聚类生成事件”的流程（本仓库已有相关实现）。

3) 地图页验证（需要 AMap 配置 + Dev Build）
- 地图能加载
- 事件 marker 出现
- 点击 marker/bubble 能触发 onEventPress

4) 事件详情页验证
- 从地图点击进入 `/events/[eventId]`
- 加载态/错误态/重试可用
- 无封面/无缩略图时占位正常
- `startTime` 非法/为空时不崩
- 快速返回不报 setState 警告（有请求过期保护）

## 常见问题排查

地图一直显示“Expo Go 无法显示地图”
- 预期行为：Expo Go 不支持原生高德模块。
- 解决：按上文构建并使用 `npx expo start --dev-client`。

地图显示“未配置高德地图 Key”
- 检查 `mobile/app.json` 的 `expo.extra.amap.androidKey/iosKey` 是否还是 `__AMAP_*_KEY__` 占位。
- 修改 Key 后需要重新构建 dev build。

AI 接口返回 500
- 检查 `backend/.env` 是否配置了 `DASHSCOPE_API_KEY`
- 检查 DashScope 账号是否已开通对应模型/额度

## 相关配置入口速查

- 移动端 AMap Key：`mobile/app.json`
- 移动端 API Base URL：`mobile/src/constants/api.ts`
- 后端 AMap Web API Key：`backend/.env` -> `AMAP_API_KEY`（供 `backend/app/integrations/amap.py`）
- 后端 DashScope Key：`backend/.env` -> `DASHSCOPE_API_KEY`（供 `backend/app/integrations/tongyi.py`）
- AI API：`backend/app/api/v1/ai.py`（`/api/v1/ai/*`）
