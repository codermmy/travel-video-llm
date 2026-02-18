# 文档补全提示词（给 AI 使用）

本文件提供可直接复用的提示词，用于让 AI 按 my-spec 架构补全项目文档。

---

## Prompt A：全量补全 system 文档（推荐）

```text
你现在是本仓库的"文档工程师 + 架构分析师"。
请基于 my-spec 体系，全面补全项目文档，目标是让任何新人或任何 AI 不看大量代码也能快速理解系统。

【必须遵循的输入文档】
1) my-spec/system/README.md
2) my-spec/system/core/01-what-is-my-spec.md
3) my-spec/system/project/03-module-catalog.md
4) my-spec/system/execution/04-doc-sync-rules.yaml
5) my-spec/system/execution/01-test-profile.yaml
6) my-spec/system/execution/02-testing-playbook.md

【执行目标】
A. 补全全局文档
- project/01-overview：补齐业务目标、关键链路、边界
- project/02-architecture：补齐分层架构、数据流、依赖关系
- core/03-command-contract：补齐五命令的输入/输出/门禁/失败处理

B. 补全模块文档（frontend + backend）
- 每个模块文档必须包含：职责、代码入口、关键流程、异常处理、验收要点、测试建议、关联模块
- 必须补充"跨端映射"：前端模块 <-> 后端模块

C. 建立文档互链（必须）
- 每个 frontend 模块文档都要链接到对应 backend 模块文档
- 每个 backend 模块文档都要链接到对应 frontend 模块文档
- 至少覆盖以下映射：
  1) auth: frontend/auth.md <-> backend/auth.md
  2) map: frontend/map.md <-> backend/map.md
  3) upload/sync: frontend/upload.md <-> backend/photo.md + backend/sync.md
  4) story: frontend/story.md <-> backend/event.md

D. 同步测试文档
- 若发现测试命令或依赖变化，更新：
  - my-spec/system/execution/01-test-profile.yaml
  - my-spec/system/execution/02-testing-playbook.md
  - frontend/modules/testing.md
  - backend/modules/testing.md
 - 前端测试策略遵循：`mobile_static + mobile_manual_acceptance`，不把前端 1:1 自动化作为门禁

【输出要求】
1) 列出本次更新文件清单
2) 每个文件给出"新增了什么信息"摘要
3) 给出仍然缺失的信息和建议下一步

【质量门禁】
- 不允许写泛泛而谈的空话
- 结论必须能落到实际代码路径
- 文档之间不得互相矛盾
- 必须保留 my-spec 目录结构，不得随意新增无关层级
```

---

## Prompt B：单模块深度补全

```text
请只补全以下模块文档：<模块文档路径>

要求：
1) 读取对应前后端代码入口并补齐文档细节（职责、流程、异常、验收、测试）
2) 在文档中新增"关联模块"章节，明确指向跨端对应文档
3) 在文档末尾新增"变更影响"章节，说明若本模块变更应同步更新哪些文档
4) 保持现有 my-spec 结构，不改动其他无关文档

输出：
- 更新前后差异摘要
- 补全后的文档要点（5-10条）
- 仍待确认的问题
```

---

## Prompt C：变更验收后的文档回写

```text
当前 change-name: <change-name>
请根据以下材料完成文档回写：
- my-spec/changes/<change-name>/doc_scope_manifest.yaml
- my-spec/changes/<change-name>/doc_change_preview.md
- my-spec/changes/<change-name>/verification.md
- my-spec/system/execution/04-doc-sync-rules.yaml

任务：
1) 将预变更内容正式回写到 my-spec/system/**
2) 校验命中的 doc-sync 规则都已被覆盖
3) 补充跨端互链（若缺失）
4) 校验测试口径一致：后端按触发执行、前端人工验收门禁
4) 输出"回写完成报告"：
   - 更新文档清单
   - 每个文档的关键更新点
   - 仍需人工确认项（如有）

门禁：
- 若任何 must_update 文档未更新，明确阻塞归档并给出缺失项
```

---

## Prompt D：初始化一个缺失的模块文档（例如 backend/map）

```text
请为缺失模块文档创建"首版可用文档"，路径：<目标路径>

最低结构：
1) 模块职责
2) 代码入口
3) 关键流程
4) 异常处理
5) 验收要点
6) 测试建议
7) 关联模块（必须含跨端链接）

要求：
- 内容必须贴合当前代码现状，不允许虚构
- 初版可简洁，但必须让后续变更可持续维护
```
