# 全局规范

## 1. 命名与组织

### 1.1 前端

- 页面路由放在 `mobile/app/`
- 复合页面逻辑优先放 `mobile/src/screens/`
- API、本地缓存、导入、视觉、导出统一放 `mobile/src/services/`
- Zustand store 放 `mobile/src/stores/`
- 组件文件名用 `PascalCase.tsx`
- service / utils 文件名用 `camelCase.ts`

### 1.2 后端

- 路由统一放 `backend/app/api/v1/`
- 业务逻辑优先进入 `backend/app/services/`
- 第三方集成优先进入 `backend/app/integrations/`
- ORM 模型在 `backend/app/models/`
- Pydantic schema 在 `backend/app/schemas/`
- Python 文件统一 `snake_case.py`

## 2. 当前业务约束

### 2.1 设备与账号

- 当前移动端主入口是设备自动注册，不再依赖登录页。
- `users` 表里邮箱、验证码、重置密码字段仍在，但当前主链路未使用。
- 401 时前端会清理 token 并重新 bootstrap 设备会话。

### 2.2 图片与隐私

- 默认导入不上图，只写入照片 metadata。
- 默认图片文件只留在本机，通过 `localMediaRegistry` 回填展示。
- 例外上传场景只有：
  - 用户头像
  - 事件增强素材

### 2.3 事件与故事

- 事件编辑、照片移动、照片删除都会导致 `eventVersion` 递增。
- 只要结构发生变化，就应把 `storyFreshness/slideshowFreshness` 置为 `stale`。
- 事件是否“可播可导出”，不能只看 `status`，还要看 freshness 和 `hasPendingStructureChanges`。

### 2.4 地图

- 地图页依赖 `react-native-amap3d`，只能在 Development Build 里工作。
- `mobile/app.json` 里的 AMap key 缺失时，页面应明确给出 fallback。

## 3. 文档回写规则

- 页面行为变更：更新对应前端模块文档
- API 或任务阶段变更：更新 `backend/api/INDEX.md`
- 表字段、索引、表关系变更：更新 `backend/database/schema-dictionary.md`
- 产品边界变化：优先更新 `project/01-overview.md`
