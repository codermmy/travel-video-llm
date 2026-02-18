# TEST PLAN - events-timeline-view

## 1. 测试范围

- **覆盖需求**：RQ-001 ~ RQ-010（时间线布局、月份分组、事件卡片、交互功能）
- **不覆盖项**：
  - 后端 API 变更（本次无后端改动）
  - 事件详情页（不在本次范围）
  - 时间线动画效果（首版不做）

## 2. 测试 profile 选择（来自 test-profile.yaml）

| Profile | 是否 required | 本次是否执行 | 理由 |
|---------|---------------|--------------|------|
| backend | yes | yes | 必跑，确保后端回归无破坏 |
| mobile_static | yes | yes | 必跑，确保 lint/typecheck 通过 |
| mobile_e2e_manual_assisted | conditional | yes | 本次涉及 UI 主链路变更（事件列表），需 E2E 验证 |
| mobile_unit | optional | no | 当前项目未启用 jest 配置 |

## 3. RQ -> TC 映射

| RQ-ID | TC-ID | 层级 | 说明 |
|-------|-------|------|------|
| RQ-001 | TC-001 | E2E | 时间线布局可见性验证 |
| RQ-002 | TC-002 | E2E | 月份分组标题验证 |
| RQ-003 | TC-003 | E2E | 空月份跳过验证 |
| RQ-004 | TC-004 | E2E | 事件卡片内容验证 |
| RQ-005 | TC-005 | E2E | 缩略图预览验证 |
| RQ-006 | TC-006 | E2E | 点击跳转验证 |
| RQ-007 | TC-007 | E2E | 下拉刷新验证 |
| RQ-008 | TC-008 | E2E | 分页加载验证 |
| RQ-009 | TC-001 | E2E | 时间轴边距（视觉检查，合并到 TC-001） |
| RQ-010 | TC-009 | E2E | hero 区域保持验证 |
| ALL | TC-010 | Static | 静态检查（lint + typecheck） |
| ALL | TC-011 | IT | 后端回归测试 |

## 4. 测试用例

### TC-001: 时间线布局可见性

- **目标**：验证时间线视图正确渲染，左侧有时间轴线和节点
- **前置条件**：用户已登录，有至少 1 个事件
- **执行步骤**：
  1. 进入"事件"Tab
  2. 观察页面布局
- **预期结果**：
  - 左侧可见垂直时间轴线
  - 每个事件对应一个节点圆点
  - 时间轴有适当左边距，不贴边
- **自动化方式**：Maestro 截图 + 人工视觉确认
- **失败定位建议**：检查 TimelineView 组件样式

### TC-002: 月份分组标题

- **目标**：验证事件按月分组，月份标题显示正确统计
- **前置条件**：用户有跨月事件（如 1 月和 2 月各有事件）
- **执行步骤**：
  1. 进入"事件"Tab
  2. 查看月份标题
- **预期结果**：
  - 显示"YYYY年M月 · X个事件 · X张照片"格式
  - 事件数和照片数统计正确
- **自动化方式**：Maestro assertVisible 月份文本
- **失败定位建议**：检查 groupEventsByMonth 函数逻辑

### TC-003: 空月份跳过

- **目标**：验证没有事件的月份不显示
- **前置条件**：用户有 1 月和 3 月事件，2 月无事件
- **执行步骤**：
  1. 进入"事件"Tab
  2. 滚动查看所有月份
- **预期结果**：
  - 不显示"2月"标题
  - 1 月和 3 月正常显示
- **自动化方式**：Maestro assertNotVisible "2月"
- **失败定位建议**：检查分组过滤逻辑

### TC-004: 事件卡片内容

- **目标**：验证事件卡片显示完整信息
- **前置条件**：有至少 1 个完整事件（有标题、地点、照片）
- **执行步骤**：
  1. 进入"事件"Tab
  2. 查看任意事件卡片
- **预期结果**：
  - 显示事件标题
  - 显示日期（单日或范围）
  - 显示地点（或"地点待补充"）
  - 显示缩略图区域
- **自动化方式**：Maestro assertVisible 各元素
- **失败定位建议**：检查 TimelineEventCard 组件

### TC-005: 缩略图预览

- **目标**：验证事件卡片显示 3 张缩略图横排
- **前置条件**：有至少 1 个事件包含 3+ 张照片
- **执行步骤**：
  1. 进入"事件"Tab
  2. 查看事件卡片的缩略图区域
- **预期结果**：
  - 显示 3 张缩略图横排
  - 显示照片总数标识
- **自动化方式**：Maestro 截图 + 人工确认
- **失败定位建议**：检查缩略图渲染逻辑

### TC-006: 点击跳转

- **目标**：验证点击事件卡片能正确跳转到详情页
- **前置条件**：有至少 1 个事件
- **执行步骤**：
  1. 进入"事件"Tab
  2. 点击任意事件卡片
- **预期结果**：
  - 跳转到事件详情页
  - 详情页显示正确的事件数据
- **自动化方式**：Maestro tap + assertVisible 详情页元素
- **失败定位建议**：检查 router.push 调用和 eventId 传递

### TC-007: 下拉刷新

- **目标**：验证下拉刷新功能正常
- **前置条件**：已进入"事件"Tab
- **执行步骤**：
  1. 下拉页面触发刷新
  2. 等待刷新完成
- **预期结果**：
  - 显示刷新指示器
  - 刷新完成后数据更新
  - 时间线视图正确重新渲染
- **自动化方式**：Maestro swipe down + wait
- **失败定位建议**：检查 onRefresh 回调

### TC-008: 分页加载

- **目标**：验证滚动到底部自动加载更多
- **前置条件**：用户有超过 1 页的事件（>50 个）
- **执行步骤**：
  1. 进入"事件"Tab
  2. 滚动到底部
- **预期结果**：
  - 显示加载指示器
  - 新事件追加到正确的月份分组
- **自动化方式**：Maestro scroll + assertVisible 新内容
- **失败定位建议**：检查 onEndReached 和分组追加逻辑
- **备注**：需要足够测试数据，可能需要手动辅助

### TC-009: hero 区域保持

- **目标**：验证顶部 hero 区域样式和功能不变
- **前置条件**：已进入"事件"Tab
- **执行步骤**：
  1. 查看顶部 hero 区域
  2. 点击"手动导入"按钮
- **预期结果**：
  - hero 标题和副标题显示正常
  - 导入按钮可点击，触发导入流程
- **自动化方式**：Maestro assertVisible + tap
- **失败定位建议**：检查 hero 区域代码是否被误改

### TC-010: 静态检查

- **目标**：确保代码通过 lint 和 typecheck
- **前置条件**：代码已修改完成
- **执行步骤**：
  1. 运行 `npm run lint`
  2. 运行 `npm run typecheck`
- **预期结果**：
  - 无 lint 错误
  - 无类型错误
- **自动化方式**：CI 命令
- **失败定位建议**：根据错误信息定位具体文件和行号

### TC-011: 后端回归

- **目标**：确保后端 API 无回归
- **前置条件**：后端环境就绪
- **执行步骤**：
  1. 运行 `pytest -q`
- **预期结果**：
  - 所有测试通过
- **自动化方式**：CI 命令
- **失败定位建议**：检查失败的测试用例

## 5. 执行命令矩阵

| Profile | 命令 | 产物路径 |
|---------|------|----------|
| backend | `cd backend && source .venv/bin/activate && pytest -q 2>&1 \| tee ../my-spec/artifacts/events-timeline-view/reports/backend-pytest.txt` | `my-spec/artifacts/events-timeline-view/reports/backend-pytest.txt` |
| mobile_static (lint) | `cd mobile && npm run lint 2>&1 \| tee ../my-spec/artifacts/events-timeline-view/reports/mobile-lint.txt` | `my-spec/artifacts/events-timeline-view/reports/mobile-lint.txt` |
| mobile_static (typecheck) | `cd mobile && npm run typecheck 2>&1 \| tee ../my-spec/artifacts/events-timeline-view/reports/mobile-typecheck.txt` | `my-spec/artifacts/events-timeline-view/reports/mobile-typecheck.txt` |
| mobile_e2e_manual_assisted | `maestro test mobile/.maestro/events-timeline.yaml 2>&1 \| tee my-spec/artifacts/events-timeline-view/reports/mobile-maestro.txt` | `my-spec/artifacts/events-timeline-view/reports/mobile-maestro.txt` |

## 6. Required 清单（门禁）

以下测试必须通过才能进入 `READY_FOR_VERIFY` 状态：

- [x] TC-010: 静态检查（lint + typecheck）
- [x] TC-011: 后端回归测试
- [x] TC-001: 时间线布局可见性
- [x] TC-002: 月份分组标题
- [x] TC-006: 点击跳转

## 7. 证据要求

- **报告路径**：`my-spec/artifacts/events-timeline-view/reports/`
- **日志路径**：`my-spec/artifacts/events-timeline-view/logs/`
- **截图/trace 路径**：`my-spec/artifacts/events-timeline-view/screenshots/`
- **握手文件路径**：`my-spec/artifacts/events-timeline-view/handshake/`

## 8. 人机协作说明

本次变更涉及 UI 主链路，需要 `mobile_e2e_manual_assisted` profile。

### ⚠️ 重要：测试数据要求

**本次测试不能清除应用数据**，需要在已有数据的基础上验证：

| 前置条件 | 说明 |
|----------|------|
| 已登录 | 用户已完成登录，进入主界面 |
| 有事件数据 | 至少有 2 个以上事件 |
| 跨月事件 | 至少有 2 个不同月份的事件（验证月份分组） |
| 有照片 | 事件中有照片（验证缩略图和统计） |

### 测试启动方式

```yaml
# ✅ 正确：保持现有数据
- launchApp

# ❌ 错误：会清除所有数据
- launchApp:
    clearState: true
```

### 协作流程

1. AI 完成代码实现后，输出 `ACTION_REQUIRED`
2. 用户确认设备满足前置条件（已登录、有跨月事件数据）
3. 用户创建 `my-spec/artifacts/events-timeline-view/handshake/data-ready.done`
4. 执行 Maestro 测试或人工验证
5. 用户完成验证后，创建对应的 `.done` 文件

## 9. 风险说明

| 风险 | 测试覆盖情况 |
|------|--------------|
| SectionList 性能（大量分组） | TC-008 部分覆盖，需要足够测试数据 |
| 跨时区月份计算 | 未完全覆盖，依赖本地时区测试 |
| 分页追加到正确分组 | TC-008 覆盖，但边界情况可能遗漏 |
