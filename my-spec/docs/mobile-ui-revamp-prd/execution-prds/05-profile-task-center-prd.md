# 执行 PRD：设备中心与任务中心重构

- 文档状态：Ready for Implementation
- 执行顺序：5
- 对应总 PRD：
  - [mobile-ui-revamp-prd.md](/Users/maoyuan/code/travel-video-llm/my-spec/docs/mobile-ui-revamp-prd/mobile-ui-revamp-prd.md)
- 对应设计基线：
  - [mobile-ui-wireframes.html](/Users/maoyuan/code/travel-video-llm/my-spec/docs/mobile-ui-revamp-prd/mobile-ui-wireframes.html)

## 1. 目标

- 把“我的”从传统设置页重构为设备信任中心。
- 一次完成页面 05、10、11：
  - 05 我的 / 设备中心
  - 10 导入任务中心
  - 11 本机资料 / 头像更新

## 2. 关联总任务

- [ ] `D1` 页面 05 我的 / 设备中心按 HTML 完整实现
- [ ] `D2` 页面 10 导入任务中心按 HTML 完整实现
- [ ] `D3` 页面 11 本机资料 / 头像更新按 HTML 完整实现
- [ ] `D4` 任务中心、顶部状态条、即时进度反馈统一状态语言

## 3. 页面边界

- 页面 05：设备中心首页
- 页面 10：任务中心
- 页面 11：本机资料编辑和头像更新

## 4. 主要文件边界

- 允许修改：
  - `mobile/app/(tabs)/profile.tsx`
  - `mobile/app/profile/import-tasks.tsx`
  - `mobile/app/profile/edit.tsx`
  - `mobile/app/profile/avatar.tsx`
  - `mobile/src/components/import/ImportProgressModal.tsx`
  - `mobile/src/components/upload/UploadProgress.tsx`
- 谨慎修改：
  - `mobile/src/components/ui/revamp.tsx`
- 不应修改：
  - 首页主结构
  - 地图页
  - 播放器页面

## 5. 实现要求

- 我的页要求：
  - 顶部标题和轻说明
  - 设备摘要卡
  - 指标区
  - 分组顺序固定：
    - 任务与导入
    - 设备与隐私
    - 数据管理
- 任务中心要求：
  - 顶部说明
  - 系统状态 Banner
  - 指标区
  - 筛选胶囊
  - 阶段化任务卡
- 资料编辑与头像要求：
  - 与主页面同一套卡片、留白、按钮体系
  - 头像来源不能只靠 Alert
  - 上传确认必须明确

## 6. 非目标

- 不把“我的”改造成账号中心或社交中心。
- 不新增账号系统。
- 不新增任务类型，只重构现有状态和展示方式。

## 7. 任务清单

- [x] T1：我的页设备摘要卡和指标区按页面 05 重构
- [x] T2：我的页三段分组和危险操作层级按页面 05 重构
- [x] T3：任务中心顶部说明、筛选、任务卡按页面 10 重构
- [x] T4：`ImportProgressModal`、`UploadProgress`、任务中心三处状态语言统一
- [x] T5：本机资料编辑页按页面 11 重构
- [x] T6：头像来源页按页面 11 重构，并保留确认上传动作

## 8. 验收标准

- “我的”第一眼明确表达设备身份、隐私承诺、任务入口和数据管理。
- 危险操作不会混入普通设置项。
- 任务中心能独立承接跨页状态，不再靠零散 Snackbar/Modal 才能理解。
- 本机资料和头像页不会掉回旧风格。

## 9. 验证方式

- `cd mobile && npm run lint`
- `cd mobile && npm run typecheck`
- 手动核对：
  - 我的页
  - 任务中心
  - 本机资料编辑
  - 头像来源选择
  - 任务进行中/完成/失败三种状态

## 10. 完成规则

- 只有页面 05、10、11 与 HTML 对照通过，且 `D4` 的状态语言统一落地后，才允许勾总 PRD 的 `D1-D4`。
