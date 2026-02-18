# AI 开发工作流指南

> **本文档作用**: 定义 AI 辅助开发的行为规范和工作流指引。

---

## 📖 首次阅读顺序（重要）

AI 进入本项目后，按以下顺序建立上下文：

| 步骤 | 文档 | 目的 | 预计时间 |
|------|------|------|----------|
| 1 | **`my-spec/README.md`** | 了解 my-spec 工作流全貌 | 2 分钟 |
| 2 | **`my-spec/system/README.md`** | 了解 system 知识库的作用和结构 | 3 分钟 |
| 3 | **`my-spec/system/INDEX.md`** | 索引表，按场景查找具体文档 | 按需 |

> **原则**：渐进式披露，按需加载。不要一次性读完所有文档。

---

## ⚠️ 文档加载原则

**知识库优先于源码，先文档后代码。**

| 场景 | 推荐做法 |
|------|----------|
| 日常对话、简单问答 | ❌ 不需要读取文档 |
| **理解项目架构/模块** | ✅ **先读知识库**，再看代码 |
| **Debug / 排查问题** | ✅ **先搜知识库**，可能已有解决方案 |
| **修改某个功能** | ✅ **先读模块文档**，了解设计意图 |
| 小改动、单文件修复 | ⚡ 可直接改，但建议快速查阅相关文档 |
| 使用 `/spec:*` 命令 | ✅ 按命令要求读取 |

### 知识库快速入口

| 我想了解... | 应该看... |
|-------------|-----------|
| 项目整体架构 | `my-spec/system/project/01-overview.md` |
| 某个模块怎么工作 | `my-spec/system/frontend/` 或 `backend/` 下的模块文档 |
| 遇到报错/问题 | `my-spec/system/knowledge/INDEX.md` 搜索关键词 |
| API 接口定义 | `my-spec/system/backend/api/INDEX.md` |
| 数据库表结构 | `my-spec/system/backend/database/schema-dictionary.md` |
| 编码规范 | `my-spec/system/project/04-conventions.md` |

---

## 🧭 my-spec 工作流

> **触发条件**：用户使用 `/spec:*` 命令，或明确要求走 my-spec 流程时才启用。

### 五命令流程

| 命令 | 作用 | 状态转换 |
|------|------|----------|
| `/spec:prd` | 创建变更、澄清需求 | `DRAFT → CLARIFIED` |
| `/spec:testplan <change>` | 定义测试计划 | `CLARIFIED → TEST_DEFINED` |
| `/spec:plan <change>` | 制定技术方案 | `TEST_DEFINED → PLANNED` |
| `/spec:apply <change>` | 实现 + 测试 + 自修复 | `PLANNED → READY_FOR_VERIFY` |
| `/spec:verify <change>` | 验收 + 文档同步 + 归档 | `READY_FOR_VERIFY → ARCHIVED` |

### 状态机门禁

```
DRAFT → CLARIFIED → TEST_DEFINED → PLANNED → IMPLEMENTING → READY_FOR_VERIFY → ARCHIVED
```

- 不允许跳状态
- 不允许跳 required 测试
- 不允许跳文档联动检查

### full / lite 双模式

- `full`：功能迭代、需求扩展、架构调整
- `lite`：小 bug、验收后小修、文案微调

---

## 📱 新手友好交付要求

### 触发条件

**仅在以下情况**才需要说明 Build/运行相关信息：

| 场景 | 是否需要说明 |
|------|-------------|
| ✅ 代码实际发生了变更（新增/修改/删除文件） | 需要 |
| ✅ 用户主动询问"如何运行/部署/启动" | 需要 |
| ❌ 纯咨询类问题（项目功能、架构解释、代码阅读） | 不需要 |
| ❌ 方案讨论、代码审查（未实际改动代码） | 不需要 |
| ❌ 文档编写、知识库更新 | 不需要 |

### 交付说明内容

当触发条件满足时，说明以下内容：

1. **是否需要重新 Build 并安装到手机** (明确写: 需要 / 不需要)
2. **判断原因** (例如: 仅 JS/TS 代码变更，或涉及原生层配置/依赖)
3. **可直接执行的命令** (按步骤给出，可复制粘贴)

### Build 判断规则 (移动端)

**通常不需要重新 Build**：
- 仅修改 `mobile/` 下 JS/TS 业务代码、页面样式、路由逻辑
- 可通过 Metro 热更新/重载生效

**通常需要重新 Build 并重新安装**：
- 修改 `mobile/package.json` 依赖（尤其原生依赖）
- 修改 `mobile/android/`、`mobile/ios/` 原生代码或配置
- 修改 `app.json` / `app.config.*` 中会影响原生工程的配置
- 新增或修改 `patches/` 下原生库 patch

### 常用命令模板

```bash
# 启动 Metro (开发服务)
cd mobile && npm run start

# 重建并安装到手机
cd mobile && npm install && npx expo run:android

# 连接 Dev Client
cd mobile && npx expo start --dev-client

# 后端启动
cd backend && source .venv/bin/activate && uvicorn main:app --reload

# 后端测试
cd backend && source .venv/bin/activate && pytest -q

# 前端静态检查
cd mobile && npm run lint && npm run typecheck
```

---

## 🎨 UI 设计任务

当需要进行前端 UI 设计或界面开发时，使用 `frontend-design` skill：

```
/skill frontend-design
```

触发条件：新建页面/组件的 UI 设计、界面视觉改进、交互流程设计

---

## 🚨 质量门禁

### 代码不通过的情况

以下情况 AI 应拒绝交付：
- ❌ 缺少类型定义
- ❌ 没有错误处理
- ❌ 硬编码配置信息
- ❌ 破坏现有架构
- ❌ 包含敏感信息

### 必须包含的内容

所有代码必须包含：
- ✅ 适当的类型注解
- ✅ 错误处理逻辑
- ✅ 必要的注释
- ✅ 符合规范的命名
- ✅ 清晰的函数结构

---

## 🎓 持续改进

如果发现项目文档不完善，AI 应：
1. 指出具体缺失
2. 建议补充内容
3. 在使用 my-spec 流程时，通过 `spec:verify` 阶段更新文档

---

## 📚 知识库沉淀规范

### 知识库位置

**唯一正确位置**：`my-spec/system/knowledge/`

```
my-spec/system/knowledge/
├── INDEX.md           # 索引文件，必须同步更新
├── maestro/           # Maestro 测试相关
├── expo/              # Expo 开发相关
├── react-native/      # React Native 相关
├── business/          # 业务逻辑相关
└── cross-tool/        # 跨工具兼容相关
```

⚠️ **禁止**在其他位置创建知识库文件（如 `my-spec/knowledge/`、`docs/` 等）

### 何时沉淀

| 场景 | 操作 |
|------|------|
| 解决了一个新问题（尤其是踩坑） | 创建新记录 |
| `/spec:apply` 中遇到技术问题 | 解决后沉淀 |
| `/spec:hotfix` 修复 bug | 沉淀经验 |
| 发现已有记录不完整 | 补充更新 |

### 沉淀步骤

1. **选择分类目录**：根据问题类型选择 `maestro/`、`react-native/` 等
2. **创建 md 文件**：按照 `INDEX.md` 中的格式规范编写
3. **更新索引**：在 `INDEX.md` 的对应分类表格中添加条目
4. **关键词丰富**：多写关键词，提高搜索命中率

### 记录格式

```markdown
# 问题：[简短描述]

## 现象
[具体的错误信息、异常行为描述]

## 原因
[问题产生的根本原因分析]

## 解决方案
[具体的解决步骤、代码示例]

## 相关文件
[涉及的代码文件、配置文件]

## 关键词
[便于搜索的关键词，用逗号分隔]

## 记录信息
- 首次记录：YYYY-MM-DD
- 最后更新：YYYY-MM-DD
```

---

> **使用说明**:
> 1. 日常开发建议先查知识库，再读代码
> 2. 使用 `/spec:*` 命令时走完整流程
> 3. 解决新问题后，记得沉淀到 `knowledge/` 知识库
