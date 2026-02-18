# DoD 交付检查清单

## A. 进入 READY_FOR_VERIFY 前

- [ ] `meta.yaml` 状态为 `IMPLEMENTING`
- [ ] 需求范围与边界已确认
- [ ] 测试计划已定义并关联需求
- [ ] required profile 测试全部通过
- [ ] 核心异常路径已覆盖或已说明不覆盖理由
- [ ] `doc_change_preview.md` 已更新
- [ ] artifacts 证据完整（reports/logs/screenshots/traces）
- [ ] 回滚方案可执行并记录到 `changelog.md`
- [ ] 无敏感信息泄露

## B. 进入 ARCHIVED 前

- [ ] `verification.md` 结论明确（PASS/FAIL）
- [ ] doc-sync 命中规则对应文档已更新
- [ ] `my-spec/CHANGELOG.md` 已追加条目
- [ ] 变更目录已迁移到 `my-spec/archived/<change-name>/`

## C. 交付阻塞条件

出现以下任一情况，不得进入 `ARCHIVED`：

1. required 测试未通过
2. 文档同步缺失
3. 验证结论为空
4. 证据文件缺失
5. 关键字段类型不一致且未修复

> 最后更新：2026-02-11
