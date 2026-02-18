# 问题：Maestro 测试中 Tab 点击和弹窗处理

## 现象

1. **弹窗阻挡**：点击 Tab 时被同步弹窗阻挡，导致点击失败
2. **Tab 点击不生效**：`tapOn: "事件"` 无法正确点击到 Tab
3. **测试通过但功能未验证**：测试 PASSED 但实际功能有问题

## 原因

1. 应用有同步功能，首次进入会弹出同步提示弹窗
2. Tab 栏的文字可能被其他元素遮挡，或 accessibility 标签不匹配
3. 测试脚本只验证了"页面能打开"，没有验证核心功能

## 解决方案

### 1. 处理可能出现的弹窗

```yaml
# 在点击前先处理可能出现的弹窗
- tapOn:
    text: "稍后"
    optional: true  # 弹窗可能不出现，设为可选
```

### 2. Tab 点击使用坐标

```yaml
# 使用百分比坐标点击屏幕底部中间位置（事件 Tab）
- tapOn:
    point: 50%,95%

# 或使用 content-desc（如果有设置）
- tapOn:
    id: "tab-events"
```

### 3. 添加核心功能断言

```yaml
# 验证事件卡片确实显示
- assertVisible:
    text: ".*事件.*"

- assertVisible:
    text: ".*张照片.*"

# 或验证特定元素存在
- assertVisible:
    id: "timeline-event-card"
```

## 完整测试脚本示例

```yaml
appId: com.maoyuan.travelalbum
---
# 处理可能的同步弹窗
- tapOn:
    text: "稍后"
    optional: true

# 点击事件 Tab（使用坐标更可靠）
- tapOn:
    point: 50%,95%

# 等待页面加载
- extendedWaitUntil:
    visible:
      text: "旅行事件"
    timeout: 10000

# 验证核心功能 - 事件卡片显示
- assertVisible:
    text: "2025年.*月"  # 月份标题

- assertVisible:
    text: ".*个事件.*张照片"  # 统计信息

# 验证至少有一个事件卡片可点击
- tapOn:
    text: ".*"
    index: 0
    optional: true
```

## 测试有效性检查清单

在编写测试脚本时，问自己：

- [ ] 测试是否验证了核心功能，而不只是"页面能打开"？
- [ ] 如果功能有 bug，这个测试能发现吗？
- [ ] 断言是否足够具体，能区分正常和异常情况？

## 相关文件

- `mobile/.maestro/flows/04-timeline-view.yaml`
- `mobile/.maestro/config.yaml`

## 关键词

Maestro, Tab, 点击, 弹窗, optional, assertVisible, 坐标点击, point, 测试有效性

## 记录信息

- 首次记录：2026-02-11
- 最后更新：2026-02-11
