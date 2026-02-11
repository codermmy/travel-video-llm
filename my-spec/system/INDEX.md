# my-spec system 索引

> **入口文档**：请先阅读 `README.md` 了解系统概览和阅读路径。

---

## 目录结构

```
my-spec/system/
├── README.md           ← 系统入口（推荐首先阅读）
├── core/               ← 核心概念（按序号阅读）
├── execution/          ← 执行指南（按序号阅读）
├── project/            ← 本项目知识（按序号阅读）
├── knowledge/          ← AI 经验知识库（遇到问题时查询）
├── prompts/            ← AI 提示词模板
├── frontend/           ← 前端模块文档
└── backend/            ← 后端模块文档
```

---

## 按场景阅读

### 场景 1：首次了解 my-spec

```
1. core/01-what-is-my-spec.md   # 系统完整说明
2. core/02-status-machine.md    # 状态机定义
3. core/03-command-contract.md  # 五命令契约
4. core/04-glossary.md          # 术语表
```

### 场景 2：执行一个变更

```
1. core/03-command-contract.md       # 了解命令输入输出
2. core/02-status-machine.md         # 了解状态门禁（含 BLOCKED 处理）
3. execution/01-test-profile.yaml    # 了解测试配置
4. execution/02-testing-playbook.md  # 了解执行方式
5. execution/04-doc-sync-rules.yaml  # 了解文档联动
6. execution/05-dod-checklist.md     # 了解完成标准
7. execution/06-artifacts-standard.md # 了解证据留痕规范
```

### 场景 3：了解本项目业务

```
1. project/01-overview.md       # 项目概览
2. project/02-architecture.md   # 架构图
3. project/03-module-catalog.md # 模块目录
4. project/04-conventions.md    # 编码规范
```

### 场景 4：查找模块文档

```
前端：frontend/INDEX.md
后端：backend/INDEX.md
```

### 场景 5：遇到问题/报错时

```
1. knowledge/INDEX.md           # 查看知识库索引
2. grep 搜索关键词               # 快速定位相关记录
3. 应用解决方案或自主排错后沉淀
```

---

## 完整文件清单

### core/ - 核心概念

| 序号 | 文件 | 说明 |
|------|------|------|
| 01 | `01-what-is-my-spec.md` | 系统背景、目标、运行模型 |
| 02 | `02-status-machine.md` | 7 状态定义 + 门禁规则 |
| 03 | `03-command-contract.md` | 5 命令的输入/输出/前置条件 |
| 04 | `04-glossary.md` | 术语表 |

### execution/ - 执行指南

| 序号 | 文件 | 说明 |
|------|------|------|
| 01 | `01-test-profile.yaml` | 测试 profile 配置 |
| 02 | `02-testing-playbook.md` | 测试执行手册 |
| 03 | `03-test-strategy.md` | 测试策略 |
| 04 | `04-doc-sync-rules.yaml` | 文档联动规则 |
| 05 | `05-dod-checklist.md` | 完成定义检查清单 |
| 06 | `06-artifacts-standard.md` | 测试证据（留痕）标准化规范 |
| 07 | `07-handshake-protocol.md` | 人机握手协议 |
| 08 | `08-maestro-setup.md` | Maestro E2E 测试设置指南 |

### project/ - 本项目知识

| 序号 | 文件 | 说明 |
|------|------|------|
| 01 | `01-overview.md` | 项目概览、技术栈、用户流程 |
| 02 | `02-architecture.md` | 架构图、数据流 |
| 03 | `03-module-catalog.md` | 模块目录 |
| 04 | `04-conventions.md` | 编码规范、命名约定 |

### prompts/ - AI 提示词

| 文件 | 说明 |
|------|------|
| `doc-enrichment.md` | 文档补全提示词模板 |

### knowledge/ - AI 经验知识库

| 目录 | 说明 |
|------|------|
| `INDEX.md` | 知识库索引和使用说明 |
| `maestro/` | Maestro E2E 测试相关问题 |
| `expo/` | Expo 开发相关问题 |
| `react-native/` | React Native 相关问题 |
| `business/` | 业务逻辑相关问题 |

---

## 维护规则

1. 任何经过 `spec:verify` 的变更都要回写相关 system 文档
2. system 文档更新必须记录到对应 change 的 `changelog.md`
3. 文档冲突时以最近一次 `ARCHIVED` 的变更说明为准
4. 新增文档时按序号规则命名，保持阅读顺序清晰
5. **遇到问题并解决后，及时沉淀到 `knowledge/` 知识库**

---

> **最后更新**：2026-02-11
