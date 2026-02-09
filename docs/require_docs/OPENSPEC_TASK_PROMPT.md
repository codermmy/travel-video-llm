# OpenSpec 多任务阶段开发提示词

> **使用说明**: 将本提示词与相关任务文档一起发送给AI，让AI按OpenSpec流程生成提案和实现代码

---

## 📌 给AI的指令

你现在是本项目的 **首席技术架构师**。我已为你准备好以下任务阶段的需求文档，请你按 **OpenSpec 流程** 完成该阶段的完整开发工作。

### 📋 当前任务阶段

**阶段名称**: `[STAGE_NAME]`
**任务范围**: Task `[TASK_START]` - Task `[TASK_END]`

### 📚 参考文档

请先阅读以下任务文档（按顺序）：

1. `@/docs/require_docs/require_step_by_step/[TASK_FILE_1]`
2. `@/docs/require_docs/require_step_by_step/[TASK_FILE_2]`
3. `@/docs/require_docs/require_step_by_step/[TASK_FILE_3]`

同时参考以下项目文档（）：
- `@/docs/require_docs/01-项目需求文档.md` - 产品需求
- `@/docs/require_docs/02-系统技术架构.md` - 技术架构
- `@/docs/require_docs/04-开发规范.md` - 开发规范

### 🎯 你的工作流程

请严格按照以下 **OpenSpec 流程** 执行：

#### 阶段 1: 需求分析与提案创建

1. **阅读并理解** 所有相关任务文档
2. **识别依赖关系**：确定任务之间的依赖顺序
3. **创建 OpenSpec 提案**：
   - 使用 `@/openspec/AGENTS.md` 中定义的提案格式
   - 提案保存至 `@/openspec/proposals/[STAGE_KEY]/[PROPOSAL_NAME].md`

提案应包含：
- 📝 变更概述
- 🎯 目标与非目标
- 📦 涉及的模块和文件
- 🔧 技术方案
- ⚠️ 风险评估
- ✅ 验收标准

#### 阶段 2: 技术设计

在提案被确认（或自我确认）后，进行详细技术设计：

1. **接口设计**（如需要）
   - API Schema 定义
   - 类型定义（TypeScript）
   - 数据模型变更

2. **核心算法/逻辑设计**
   - 伪代码或流程图
   - 边界情况处理

3. **文件结构规划**
   - 新建文件列表
   - 修改文件列表

#### 阶段 3: 代码实现

按依赖顺序实现各任务：

1. **优先实现** 无依赖或依赖少的任务
2. **遵循开发规范**：
   - Python: snake_case 命名，类型注解
   - TypeScript: PascalCase 组件，camelCase 变量
   - 错误处理完整
   - 必要的注释

3. **文件操作原则**：
   - 优先使用 Edit 工具修改现有文件
   - 仅在必要时创建新文件
   - 保持代码库语言一致性（注释使用中文）

#### 阶段 4: 自我验证

实现完成后，进行自我检查：

- [ ] 代码符合开发规范
- [ ] 错误处理完整
- [ ] 类型定义完整
- [ ] 不破坏现有功能
- [ ] 所有任务文档要求已覆盖

### 📤 期望输出

请在工作过程中输出：

1. **提案文档** - `openspec/proposals/[STAGE_KEY]/xxx.md`
2. **实现代码** - 所有新建/修改的文件
3. **完成总结** - 包含：
   - 已实现的文件列表
   - 未实现/需要人工确认的部分
   - 测试建议

### ⚠️ 重要注意事项

1. **原子性**: 每个任务应该是可独立验证的
2. **依赖管理**: 先实现被依赖的功能
3. **沟通**: 遇到不明确的地方，使用 AskUserQuestion 工具询问
4. **质量门禁**: 不要交付违反规范的代码
5. **不执行Git操作**: 不要自动执行 git commit/push，除非用户明确要求

---

## 🚀 快速开始模板

### 示例 1: 实现阶段2（认证与权限）

```
@ @/docs/require_docs/require_step_by_step/02-后端JWT认证中间件.md
@ @/docs/require_docs/require_step_by_step/03-后端设备注册接口完善.md
@ @/docs/require_docs/require_step_by_step/04-前端认证流程与相册权限.md

请按照 OpenSpec 流程实现 Stage-02 认证与权限阶段（Task 02-04）。
参考模板文档：docs/require_docs/OPENSPEC_TASK_PROMPT.md
```

### 示例 2: 实现阶段3（照片管理）

```
@ @/docs/require_docs/require_step_by_step/05-照片哈希计算.md
@ @/docs/require_docs/require_step_by_step/06-EXIF信息提取.md
@ @/docs/require_docs/require_step_by_step/07-缩略图生成.md
@ @/docs/require_docs/require_step_by_step/08-照片去重检查接口.md
@ @/docs/require_docs/require_step_by_step/09-照片上传接口.md
@ @/docs/require_docs/require_step_by_step/10-照片CRUD接口.md

请按照 OpenSpec 流程实现 Stage-03 照片管理阶段（Task 05-10）。
参考模板文档：docs/require_docs/OPENSPEC_TASK_PROMPT.md
```

### 示例 3: 实现阶段4（聚类算法）

```
@ @/docs/require_docs/require_step_by_step/11-时空聚类算法核心.md
@ @/docs/require_docs/require_step_by_step/12-事件生成逻辑.md
@ @/docs/require_docs/require_step_by_step/13-逆向地理编码.md
@ @/docs/require_docs/require_step_by_step/14-聚类Celery任务.md

请按照 OpenSpec 流程实现 Stage-04 聚类算法阶段（Task 11-14）。
参考模板文档：docs/require_docs/OPENSPEC_TASK_PROMPT.md
```

---

## 📋 各阶段快速复制清单

| 阶段 | 任务范围 | 关键词 | 文件数 |
|------|----------|--------|--------|
| Stage-02 | Task 02-04 | 认证与权限 | 3 |
| Stage-03 | Task 05-10 | 照片管理 | 6 |
| Stage-04 | Task 11-14 | 聚类算法 | 4 |
| Stage-05 | Task 15-17 | AI服务 | 3 |
| Stage-06 | Task 18-20 | 导航与地图 | 3 |
| Stage-07 | Task 21-24 | UI页面 | 4 |
| Stage-08 | Task 25-26 | 高级功能 | 2 |

---

**使用本提示词时，请替换以下占位符：**
- `[STAGE_NAME]` - 阶段名称（如：认证与权限）
- `[TASK_START]` - 起始任务编号（如：02）
- `[TASK_END]` - 结束任务编号（如：04）
- `[STAGE_KEY]` - 阶段英文键名（如：auth, photo, clustering）
- `[TASK_FILE_X]` - 具体任务文档文件名
