# AI开发工作流与自动化模板

> **本文档作用**: 定义AI辅助开发的标准化工作流和任务模板,确保每次开发都遵循统一流程。

---

## 🧭 my-spec v1 工作流（优先执行）

> 说明：当任务是“需求到交付”的完整链路时，优先使用 my-spec 工作流。本文后续的传统模板可作为补充参考。

### 目录约定

```text
my-spec/
  system/       # 项目知识系统（全局/前端/后端）
  templates/    # PRD/TestPlan/Plan 等模板
  changes/      # 进行中的变更
  archived/     # 已归档变更
  artifacts/    # 测试和日志证据
```

### 五个命令（唯一主流程）

1. `/spec:prd [需求描述或文档]`
   - 作用：创建 change、澄清需求、产出 `prd.md`
   - 要求：若需求模糊必须先澄清，不能跳过
2. `/spec:testplan <change-name>`
   - 作用：产出 `testplan.md`，定义 RQ→TC 映射和 required 用例
3. `/spec:plan <change-name>`
   - 作用：产出 `plan.md`、`tasks.md`、`doc_change_preview.md`
4. `/spec:apply <change-name>`
   - 作用：实现+测试+失败自修复+证据沉淀
5. `/spec:verify <change-name>`
   - 作用：验收后同步 system 文档并归档到 `my-spec/archived/`

### 状态机门禁

`DRAFT -> CLARIFIED -> TEST_DEFINED -> PLANNED -> IMPLEMENTING -> READY_FOR_VERIFY -> ARCHIVED`

- `spec:testplan` 仅允许 `CLARIFIED`
- `spec:plan` 仅允许 `TEST_DEFINED`
- `spec:apply` 仅允许 `PLANNED`
- `spec:verify` 仅允许 `READY_FOR_VERIFY`

### full / lite 双模式

- `full`: 功能迭代、需求扩展（完整文档链路）
- `lite`: 小 bug 或验收后小修（轻量文档，但仍需测试+归档）

### 文档联动规则（强制）

1. 变更规划阶段必须读取 `my-spec/system/global/doc-sync-rules.yaml`
2. 必须生成 `doc_scope_manifest.yaml` 标记命中的文档同步规则
3. verify 阶段必须校验文档是否同步更新，否则禁止归档


### 测试适配规则（强制）

1. `spec:testplan` 必须读取 `my-spec/system/global/test-profile.yaml`
2. 测试方案必须按 profile 生成执行命令和证据路径
3. `spec:apply` 至少执行 required profile（当前项目为 `backend` + `mobile_static`）
4. 命中 UI 主链路变更时，追加 `mobile_e2e_manual_assisted` 并使用握手机制

### 人机协作握手机制（RN/Web手工步骤）

- 当自动化测试需要人工操作时，AI 输出 `ACTION_REQUIRED + step_id`
- 人工完成后写入：`my-spec/artifacts/<change>/handshake/<step_id>.done`
- AI 检测到 done 文件后继续执行

---

## 🔄 标准开发工作流

### 完整流程图
```
用户需求
    ↓
[阶段1] 需求理解
    ├─ 查阅需求文档 (01-项目需求文档.md)
    ├─ 理解功能上下文
    └─ 识别相关模块
    ↓
[阶段2] 技术方案
    ├─ 查看技术架构 (02-系统技术架构.md)
    ├─ 确定实现方案
    └─ 评估影响范围
    ↓
[阶段2.5] UI设计 (如涉及前端界面)
    ├─ 🎨 调用 frontend-design skill
    ├─ 确定视觉风格和交互方案
    └─ 输出组件结构和样式规范
    ↓
[阶段3] 代码实现
    ├─ 遵循开发规范 (04-开发规范.md)
    ├─ 编写符合规范的代码
    └─ 添加类型定义和错误处理
    ↓
[阶段4] 自我审查
    ├─ 检查命名规范
    ├─ 检查代码风格
    ├─ 验证错误处理
    └─ 确认类型安全
    ↓
[阶段5] 测试建议
    ├─ 提供测试方法
    ├─ 说明预期行为
    └─ 列出边界情况
    ↓
代码交付
```

---

## 📋 需求拆分自动化模板

### 模板1: 功能模块拆分
当用户提出"实现XX功能"时,AI应自动执行以下拆分:

```markdown
## 需求分析

### 功能目标
[用户想要实现什么]

### 涉及模块
- 前端: [哪些页面/组件]
- 后端: [哪些API/服务]
- 数据库: [哪些表/字段]

### 实现步骤
1. [第一步: xxx]
2. [第二步: xxx]
3. [第三步: xxx]

### 风险评估
- [可能的技术难点]
- [需要额外确认的点]
```

### 模板2: API开发任务
当需要开发API时,按以下结构执行:

```markdown
## API开发任务: [功能名称]

### 1. 定义接口
**文件**: `backend/app/schemas/[module].py`
- [ ] 定义请求模型 (XxxRequest / XxxCreate)
- [ ] 定义响应模型 (XxxResponse)
- [ ] 添加字段验证

### 2. 实现业务逻辑
**文件**: `backend/app/services/[module]_service.py`
- [ ] 创建服务类
- [ ] 实现核心方法
- [ ] 添加错误处理
- [ ] 添加日志记录

### 3. 创建路由
**文件**: `backend/app/api/v1/[module].py`
- [ ] 定义路由函数
- [ ] 添加依赖注入
- [ ] 实现请求验证
- [ ] 返回标准格式

### 4. 注册路由
**文件**: `backend/app/api/router.py`
- [ ] 导入路由模块
- [ ] 注册到主路由

### 5. 测试验证
- [ ] 使用 Swagger UI 测试
- [ ] 验证错误场景
```

### 模板3: 前端页面开发任务
当需要开发前端页面时,按以下结构执行:

```markdown
## 前端页面开发任务: [页面名称]

### 1. 类型定义
**文件**: `mobile/src/types/[module].ts`
- [ ] 定义数据类型
- [ ] 定义API接口类型
- [ ] 导出类型

### 2. API服务
**文件**: `mobile/src/services/api/[module]Api.ts`
- [ ] 定义API调用函数
- [ ] 添加请求拦截
- [ ] 添加错误处理

### 3. 状态管理
**文件**: `mobile/src/stores/[module]Store.ts` (如需要)
- [ ] 定义状态接口
- [ ] 实现状态管理逻辑
- [ ] 添加异步操作

### 4. 页面组件
**文件**: `mobile/src/screens/[ScreenName]/index.tsx`
- [ ] 实现UI布局
- [ ] 实现交互逻辑
- [ ] 集成状态管理
- [ ] 添加导航

### 5. 导航配置
**文件**: `mobile/src/navigation/[Navigator].tsx`
- [ ] 注册路由
- [ ] 定义参数类型

### 6. 测试验证
- [ ] 检查UI渲染
- [ ] 测试交互逻辑
- [ ] 验证错误处理
```

### 模板4: 前端UI设计任务
当需要进行前端UI设计或界面开发时,必须使用 `frontend-design` skill:

```markdown
## 前端UI设计任务: [页面/组件名称]

### 触发条件
以下场景必须使用 `frontend-design` skill:
- [ ] 新建页面或组件的UI设计
- [ ] 界面视觉改进和优化
- [ ] 用户交互流程设计
- [ ] 响应式布局实现
- [ ] 设计系统/组件库规范制定

### 调用方式
通过 Skill 工具调用:
```
/skill frontend-design
或
请使用 frontend-design skill 来设计 [页面/组件]
```

### frontend-design skill 能力
- 🎨 **专业级UI设计**: 创建高质量、现代感强的界面
- 🎯 **避免AI审美陷阱**: 拒绝通用模板,打造独特设计
- 📐 **布局规划**: 结构化、层次分明的组件设计
- 🎭 **视觉系统**: 色彩、字体、间距的统一规范
- 📱 **响应式设计**: 适配多种屏幕尺寸

### 输出内容
使用 frontend-design skill 后将获得:
1. **设计方案**: 完整的UI组件结构
2. **代码实现**: 生产级React Native组件代码
3. **样式定义**: 符合设计系统的样式规范
4. **交互说明**: 用户交互和状态管理建议

### 与标准前端开发流程的区别
| 场景 | 使用模板 | 说明 |
|------|---------|------|
| 纯逻辑/数据处理 | 模板3 (前端页面开发) | 侧重功能实现 |
| UI设计/界面构建 | 模板4 (frontend-design) | 侧重视觉体验 |

### 示例对话
用户: "帮我设计一个照片上传页面"
AI: 我将使用 frontend-design skill 来为你设计照片上传页面...
[调用 Skill tool]

用户: "优化一下个人中心的视觉效果"
AI: 我将使用 frontend-design skill 来优化个人中心的视觉设计...
[调用 Skill tool]
```

---

## 🎯 常见场景处理流程

### 场景1: 用户说"实现照片上传功能"

**AI应自动执行:**

```markdown
## 需求拆解: 照片上传功能

### 涉及的模块
1. **前端**: UploadScreen (上传进度页面)
2. **后端**: photo upload API
3. **数据库**: photos表

### 实现计划

#### Phase 1: 后端API (优先级: 高)
- [ ] 创建 `PhotoUploadRequest` schema
- [ ] 实现文件上传接口 (支持分片上传)
- [ ] 实现哈希去重逻辑
- [ ] 添加上传进度跟踪 (Celery任务)

#### Phase 2: 前端上传页面
- [ ] 选择照片界面
- [ ] 上传进度显示
- [ ] 错误处理和重试

#### Phase 3: 优化
- [ ] 断点续传
- [ ] 压缩优化
- [ ] 批量上传

### 遵循的规范
- 开发规范: `docs/require_docs/04-开发规范.md`
  - API设计规范 (RESTful)
  - 错误处理规范
  - 命名规范

### 技术细节
- 最大文件大小: 10MB
- 哈希算法: SHA-256
- 缩略图尺寸: 1080px宽度

### 是否开始实现?
请确认要实现哪个Phase,或者全部实现?
```

### 场景2: 用户说"修复登录失败的Bug"

**AI应自动执行:**

```markdown
## Bug修复流程: 登录失败

### 初步诊断
1. 查看认证相关代码
   - 前端: `mobile/src/screens/AuthScreen/`
   - 后端: `backend/app/api/v1/auth.py`
2. 查看错误日志
3. 复现问题

### 修复计划
1. [ ] 定位根本原因
2. [ ] 编写测试用例复现
3. [ ] 修复代码
4. [ ] 验证修复
5. [ ] 检查回归

### 需要用户提供
- 错误截图/日志
- 复现步骤
- 预期行为 vs 实际行为
```

---

## 🔧 自动化检查清单

### 代码生成时自动检查
生成代码前,AI必须确认:
- [ ] 已查阅相关文档
- [ ] 理解功能需求
- [ ] 确认文件位置
- [ ] 明确命名规范
- [ ] 知道如何测试

### 代码生成后自我审查
生成代码后,AI必须自查:
- [ ] 命名符合规范 (PascalCase/camelCase/snake_case)
- [ ] 有类型定义 (TypeScript/Pydantic)
- [ ] 有错误处理 (try-catch/异常)
- [ ] 有必要注释
- [ ] 符合项目架构
- [ ] 不破坏现有功能

---

## 💬 高效对话模式

### 推荐的用户指令示例
1. **精确指令**: "在 `backend/app/services/photo_service.py` 添加照片去重方法,使用SHA-256算法"
2. **上下文指令**: "参考注册接口的实现方式,创建登录接口"
3. **规范指令**: "按照API设计规范,为事件模块添加CRUD接口"
4. **UI设计指令** (将自动调用 frontend-design skill):
   - "设计一个照片上传页面"
   - "帮我优化登录页面的视觉效果"
   - "创建一个时间轴组件,用于展示旅行路线"

### AI的响应模板
```markdown
## 任务理解
我要实现: [简要描述]

## 文档查阅
- 已查阅: `docs/require_docs/04-开发规范.md`
- 相关章节: [具体章节]

## 实现方案
1. [步骤1]
2. [步骤2]
3. [步骤3]

## 代码位置
- 文件: [具体路径]
- 行号: [大约位置]

## 测试方法
[如何验证功能]

## 风险提示
[可能的问题]
```

---

## 📱 新手友好交付要求

为照顾新手用户,AI 在"每次改动完成后"都必须额外说明以下内容:

1. **是否需要重新 Build 并安装到手机** (明确写: 需要 / 不需要)
2. **判断原因** (例如: 仅 JS/TS 代码变更,或涉及原生层配置/依赖)
3. **可直接执行的命令** (按步骤给出,可复制粘贴)

### Build 判断规则 (移动端)
- **通常不需要重新 Build**:
  - 仅修改 `mobile/` 下 JS/TS 业务代码、页面样式、路由逻辑
  - 可通过 Metro 热更新/重载生效
- **通常需要重新 Build 并重新安装**:
  - 修改 `mobile/package.json` 依赖 (尤其原生依赖)
  - 修改 `mobile/android/`、`mobile/ios/` 原生代码或配置
  - 修改 `app.json` / `app.config.*` 中会影响原生工程的配置 (权限、插件、原生能力等)
  - 新增或修改 `patches/` 下原生库 patch

### 常用命令模板 (Android)
```bash
# 1) 启动 Metro (开发服务)
cd mobile
npm run start

# 2) 当需要重建并安装到手机时
cd mobile
npm install
npx expo run:android

# 3) 安装完成后连接 Dev Client
cd mobile
npx expo start --dev-client
```

---

## 🚨 质量门禁

### 代码不通过的情况
以下情况AI应拒绝交付:
1. ❌ 违反命名规范
2. ❌ 缺少类型定义
3. ❌ 没有错误处理
4. ❌ 硬编码配置信息
5. ❌ 破坏现有架构
6. ❌ 包含敏感信息

### 必须包含的内容
所有代码必须包含:
1. ✅ 适当的类型注解
2. ✅ 错误处理逻辑
3. ✅ 必要的注释
4. ✅ 符合规范的命名
5. ✅ 清晰的函数结构

---

## 📚 快速参考

### 命名规范速查
| 语言 | 文件 | 变量/函数 | 类/组件 | 常量 |
|------|------|----------|---------|------|
| TypeScript | PascalCase | camelCase | PascalCase | UPPER_SNAKE_CASE |
| Python | snake_case | snake_case | PascalCase | UPPER_SNAKE_CASE |

### 目录结构速查
```
前端页面 → mobile/src/screens/[ScreenName]/
前端组件 → mobile/src/components/[category]/
前端API → mobile/src/services/api/[module]Api.ts
后端路由 → backend/app/api/v1/[module].py
后端服务 → backend/app/services/[module]_service.py
后端模型 → backend/app/models/[module].py
后端Schema → backend/app/schemas/[module].py
```

### Git提交规范
```
feat(scope): 新功能
fix(scope): Bug修复
docs(scope): 文档更新
refactor(scope): 重构
test(scope): 测试相关
```

---

## 🎓 持续学习

### 从错误中学习
每次发现错误或问题时,AI应:
1. 记录问题
2. 分析根因
3. 更新文档
4. 避免重犯

### 文档优化建议
如果发现文档不完善,AI应:
1. 指出具体缺失
2. 建议补充内容
3. 提供优化方案

---

> **使用说明**:
> 1. 本文档与 `CLAUDE.md` 配合使用
> 2. 需求到交付链路优先使用 my-spec 命令流（`/spec:*`）
> 3. 发现流程问题时,及时反馈给用户优化
