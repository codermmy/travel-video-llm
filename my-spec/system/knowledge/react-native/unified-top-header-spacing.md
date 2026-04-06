# 问题：页面标题顶部间距不一致，后续页面只能手动补

## 现象

在移动端页面里，像“回忆”“我的”“整理中心”“任务详情”“补全地点”这类页面标题，和手机顶部的距离不一致。

典型表现：
- 有的页面标题几乎贴着顶部
- 有的页面靠 `marginTop` 单独补位
- 有的页面依赖 `contentInsetAdjustmentBehavior="automatic"`
- 有的页面直接用 `useSafeAreaInsets()` 手算 `paddingTop`

结果是：每新增一个普通页面，往往都要重新手动调标题顶部位置。

## 原因

根因不是某一个页面写错，而是项目里同时存在多套顶部布局机制：

1. 导航层全局关闭了原生 header
   - `mobile/app/_layout.tsx`
   - 所以每个页面都要自己负责顶部标题和安全区

2. 普通页面混用了三种顶部处理方式
   - `contentInsetAdjustmentBehavior="automatic"`
   - `useSafeAreaInsets()` 手算 `paddingTop` / `marginTop`
   - 页面局部标题自己额外加 `marginTop`

3. 顶部留白职责分散
   - 有时留白写在滚动容器上
   - 有时写在标题块上
   - 有时又写在返回按钮上

这样会导致 safe area 和页面自定义间距互相叠加，最终形成“这一页正常、下一页又不一样”的局面。

## 解决方案

统一成一套规则：

> 普通页面的标题区一律由共享 Header 负责顶部安全区，标题块起点固定为 `safeArea.top + 20`。

这次落地采用了下面的共享模式。

### 1. 共享 `PageContent`

文件：`mobile/src/components/ui/revamp.tsx`

- `PageContent` 改为 `contentInsetAdjustmentBehavior="never"`
- 不再依赖系统自动 inset 去“猜”顶部留白
- 页面顶部留白改由共享 Header 显式控制

### 2. 共享 `PageHeader`

文件：`mobile/src/components/ui/revamp.tsx`

- `PageHeader` 新增 `topInset` 参数
- 当 `topInset` 为 `true` 时，标题区使用：

```tsx
paddingTop: insets.top + 20
```

- 这样页面标题块总是距离安全区顶部 20px
- 页面本身不再给标题单独写 `marginTop`

### 3. 共享 `HeaderIconButton`

文件：`mobile/src/components/ui/revamp.tsx`

为带返回按钮或操作按钮的普通标题页提供统一按钮样式，避免每个页面重复写：
- 绝对定位按钮
- 单独 top 值
- 单独圆角和背景色

现在普通页面可以直接：

```tsx
<PageHeader
  title="补全地点"
  subtitle="为 12 张照片手动指定位置"
  topInset
  rightSlot={
    <HeaderIconButton icon="arrow-left" accessibilityLabel="返回" onPress={goBack} />
  }
/>
```

## 推荐约束

后续新增页面时，按页面类型区分：

### 普通页面（推荐统一到共享 Header）

适用场景：
- 列表页
- 设置页
- 表单页
- 任务详情页
- 补全地点这类普通工具页

写法要求：
- 使用 `PageContent` 作为滚动容器时，不要再额外写顶部安全区补偿
- 使用 `PageHeader topInset`
- 不要再给标题单独写 `marginTop`
- 不要再把返回按钮单独绝对定位到 `insets.top + ...`

### 沉浸式页面（不要强行套普通 Header）

适用场景：
- 大图 Hero 详情页
- 全屏沉浸式播放器
- 顶部控件叠在封面图上的页面

这类页面可以继续保留独立布局，但也要遵守一个约束：
- 顶部控件若需要避开刘海/状态栏，safe-area 计算要集中处理，不要标题、按钮、容器各算一套

## 本次已迁移页面

- `mobile/src/screens/import-task-detail-screen.tsx`
- `mobile/app/profile/import-tasks.tsx`
- `mobile/src/screens/memories-screen.tsx`
- `mobile/app/(tabs)/profile.tsx`
- `mobile/app/event-location/[eventId].tsx`
- `mobile/app/map/missing-locations.tsx`

## 复用检查清单

新增一个普通页面时，先检查：

- 是否真的需要自定义顶部布局？如果不需要，优先用 `PageHeader`
- 是否已经使用了 `PageContent`？如果用了，不要再依赖自动 inset
- 是否给标题写了 `marginTop` / `paddingTop`？通常应删除
- 是否给返回按钮单独计算 `insets.top`？通常应改为 `HeaderIconButton`
- 目标视觉是否满足“标题块起点 = safe area top + 20px”

## 相关文件

- `mobile/src/components/ui/revamp.tsx`
- `mobile/src/screens/import-task-detail-screen.tsx`
- `mobile/app/profile/import-tasks.tsx`
- `mobile/src/screens/memories-screen.tsx`
- `mobile/app/(tabs)/profile.tsx`
- `mobile/app/event-location/[eventId].tsx`
- `mobile/app/map/missing-locations.tsx`

## 关键词

React Native, safe area, PageHeader, 顶部标题, 顶部间距, 刘海屏, contentInsetAdjustmentBehavior, useSafeAreaInsets, 页面布局统一

## 记录信息

- 首次记录：2026-04-06
- 最后更新：2026-04-06
