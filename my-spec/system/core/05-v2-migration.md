# My-Spec v2 迁移说明

## 目标

在不改命令名和目录结构的前提下，降低执行歧义和文档读取成本。

## 迁移策略

1. 原地重写 L0/L1 规则文档。
2. 旧长文档保留为 L2 参考，不再作为门禁依据。
3. 新增规则一律写入单一真相源文件，不得重复扩写。

## 命令最小读取集

- `spec:prd`: `core/03-command-contract.md`
- `spec:testplan`: `core/03-command-contract.md` + `execution/01-test-profile.yaml`
- `spec:plan`: `core/03-command-contract.md` + `execution/04-doc-sync-rules.yaml`
- `spec:apply`: `execution/02-testing-playbook.md` + `execution/05-dod-checklist.md`
- `spec:verify`: `execution/04-doc-sync-rules.yaml` + `execution/05-dod-checklist.md`

## 降级为参考的内容

- 超长背景说明
- 非门禁型知识积累文档
- 重复的执行步骤描述

## 维护机制

1. 每次变更只允许更新一个规则源文件。
2. 若需补充示例，写入 L2 参考区，不改门禁文档。
3. 每月一次文档瘦身，删除未被命令引用的重复内容。

> 最后更新：2026-02-11
