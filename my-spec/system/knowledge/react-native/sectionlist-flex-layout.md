# 问题：SectionList renderItem 内容不显示（flex 布局陷阱）

## 现象

使用 SectionList 时：
- `renderSectionHeader` 正常显示
- `renderItem` 被调用（日志确认），但内容不可见
- UI 层级显示元素 bounds 异常：`Rect(154, 5814 - 1335, 2973)`，top > bottom
- AccessibilityNodeInfoDumper 日志显示 `visible: false`

## 原因

在 renderItem 返回的组件中，子元素使用了 `flex: 1`，但父容器没有固定高度约束：

```typescript
// 错误写法
timeline: {
  width: 40,
  alignItems: 'center',
  // 没有设置高度！
},
line: {
  flex: 1,  // 这会导致 line 尝试占据无限空间
  width: 2,
  backgroundColor: '#D0D9ED',
  minHeight: 100,
},
```

当 `flex: 1` 的子元素在没有固定高度的父容器中时，React Native 的布局计算会出错，导致整个组件被推到屏幕外（Y 坐标变成几千像素）。

## 解决方案

### 方案 1：使用绝对定位（推荐）

对于时间线连接线这类"跨越多个元素"的视觉效果，使用绝对定位：

```typescript
timelineColumn: {
  width: 40,
  alignItems: 'center',
  paddingTop: 6,
},
line: {
  position: 'absolute',
  top: 18,      // 节点底部位置
  bottom: -12,  // 延伸到下一个卡片的 marginBottom
  left: 19,     // 居中 (40/2 - 2/2 = 19)
  width: 2,
  backgroundColor: '#D0D9ED',
},
```

### 方案 2：给父容器设置高度约束

如果必须使用 flex 布局，确保父容器有明确的高度：

```typescript
timeline: {
  width: 40,
  height: '100%',  // 或具体数值
  alignItems: 'center',
},
```

## 调试技巧

### 获取 UI 层级检查 bounds

```bash
adb shell uiautomator dump /sdcard/ui.xml
adb pull /sdcard/ui.xml /tmp/ui.xml
cat /tmp/ui.xml | grep -E "bounds|text"
```

如果看到 bounds 的 top > bottom，说明布局计算出错。

### 检查元素可见性

在 logcat 中搜索 `AccessibilityNodeInfoDumper`，如果看到 `visible: false`，说明元素被渲染但不可见。

## 相关文件

- `mobile/src/components/timeline/TimelineEventCard.tsx`
- `mobile/app/(tabs)/events.tsx`

## 关键词

SectionList, renderItem, flex, 布局, 不显示, visible false, bounds 异常, 时间线

## 记录信息

- 首次记录：2026-02-11
- 最后更新：2026-02-11
