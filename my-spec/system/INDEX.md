# my-spec system 索引

此目录是项目级知识系统，AI 在执行任何变更前应优先阅读本索引并按顺序加载。

## 建议阅读顺序

1. `global/system-background-and-operating-model.md`
2. `global/project-overview.md`
3. `global/architecture-map.md`
4. `global/module-catalog.md`
5. `global/conventions.md`
6. `global/test-profile.yaml`
7. `global/test-strategy.md`
8. `global/testing-playbook.md`
9. `global/dod-checklist.md`
10. `global/status-machine.md`
11. `global/doc-sync-rules.yaml`
12. `global/doc-enrichment-prompts.md`

## 模块知识入口

- 前端：`frontend/INDEX.md`
- 后端：`backend/INDEX.md`

## 维护规则

1. 任何经过 `spec:verify` 的变更都要回写相关 system 文档。
2. system 文档更新必须记录到对应 change 的 `changelog.md`。
3. 文档冲突时以最近一次 `ARCHIVED` 的变更说明为准，并在后续变更中修复。
