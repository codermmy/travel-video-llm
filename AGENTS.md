# AI 协作说明

> 本文件只保留轻量协作约定，不再使用 spec 流程。

## 基本原则

1. 以当前代码和实际需求为准，按需查看文档，不强制先读整套知识库。
2. 如果需求相对现状发生变化，先和用户充分澄清并对齐，再开始实现或改动。
3. 复杂需求变更先整理需求文档，再进入实现；小改动和明确 bug 修复可以直接处理。
4. 重大变更完成后，如果形成了可复用经验，需要更新知识库。
5. 保持改动直接、可验证，不为了流程额外制造文档负担。

## 当前产品方向优先

- 当前项目没有历史包袱，不以历史兼容为优先目标
- 凡是违背当前产品方向的旧链路、旧页面心智、旧接口依赖，可以直接删除、替换或重构
- 对本项目当前口径而言，“手动选图是主入口”不再成立，只保留为后续补充导入能力

## 文档位置

- 产品与实现文档：`my-spec/docs/`
- 项目知识与问题沉淀：`my-spec/system/knowledge/`

## 需求变更规则

- 需求发生变化时，先确认目标、边界、不做什么，以及是否会影响已有行为
- 复杂变更应先补一份需求文档，至少包含：
  - 需求拆解
  - 技术参考
  - 待办任务列表
- 小型变更不强制写文档，但仍需先和用户确认需求口径

## 何时更新知识库

- 解决了新的环境问题、框架坑点或业务坑点
- 修复过程里形成了稳定结论，后续大概率还会复用
- 重大方案调整后，需要补充新的约束、排错方式或兼容性说明

## 代码交付要求

- 实际改了代码时，说明是否需要重新 build / 安装
- 说明原因，并给出可直接执行的命令
- 保持类型、错误处理和命名清晰

## 常用命令

```bash
# 启动后端
cd backend && source .venv/bin/activate && uvicorn main:app --reload

# 启动 Celery
cd backend && source .venv/bin/activate && celery -A app.core.celery_app worker --loglevel=info

# 启动前端 Metro
cd mobile && npm run start

# Android Dev Client
cd mobile && npx expo start --dev-client

# 前端检查
cd mobile && npm run lint && npm run typecheck

# 后端测试
cd backend && source .venv/bin/activate && pytest -q
```
