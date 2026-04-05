# TravelVideoLLM 极致重构设计规范 (Design Spec)

本目录包含项目 UI/UX 大规模重构的**高保真设计稿（HTML/CSS）**。这些文件是后续 React Native 开发的“真理来源”。

## 1. 核心设计哲学 (Core Philosophy)

*   **极致简约 (Minimalism)**：移除所有不必要的边框（`borderWidth: 0`）和分割线。
*   **大面积留白 (Whitespace Mastery)**：利用留白而非线条来区分功能区域，增加页面的“呼吸感”。
*   **排版张力 (Tight Typography)**：
    *   标题使用 `fontWeight: '900'` (Inter Black)。
    *   采用负的字间距（`letterSpacing: -1.5`）营造类似高端杂志的硬朗感。
*   **静默美学 (Silent UX)**：移除“已完成”等冗余标签。只有在“异常”或“进行中”等需要用户关注的状态下才显性提示。
*   **通透物理感 (Translucency)**：使用半透明毛玻璃（`backdrop-filter` / `rgba`）和弥散阴影（`shadowRadius: 30`）构建层级。

## 2. 设计令牌 (Design Tokens)

在还原时，请务必优先更新 `mobile/src/styles/colors.ts` 以符合以下标准：

| 变量名 | 数值 | 用途 |
| :--- | :--- | :--- |
| `--ink` | `#020617` | 核心标题、深炭黑文字 |
| `--ink-soft` | `#475569` | 次级文字、正文 |
| `--accent` | `#2563EB` | 品牌亮蓝、主操作、进度条 |
| `--surface` | `#F8FAFC` | 极浅灰背景色块 |
| `--bg` | `#FFFFFF` | 纯白画布 |
| `--radius-lg` | `32px - 40px` | 核心卡片、Modal 圆角 |
| `--radius-sm` | `16px` | 按钮、缩略图圆角 |

## 3. 页面映射关系 (File Mapping)

还原时请参考对应的 HTML 文件进行像素级对齐：

| 业务页面 | 对应设计稿 (design-spec/pages/) | 实现关键点 |
| :--- | :--- | :--- |
| **回忆主页** | `memories.html` | 440px 沉浸 Hero、修正的按钮比例 |
| **事件详情** | `event-detail.html` | **浮动播放中心**、右上角三点菜单 |
| **操作菜单** | `event-detail.html` (JS 模拟) | 无分割线的极简 Action Sheet |
| **地图探索** | `map-gallery.html` | 1:1 还原现有逻辑，UI 通透化处理 |
| **照片选择** | `import-selector.html` | 全幅网格、胶囊状工具栏 |
| **照片管理** | `photo-manager.html` | 深色上下文操作栏、添加照片入口 |
| **整理中心** | `processing-lab.html` | 纤细进度条、实验室质感排版 |
| **我的中心** | `profile-reborn.html` | 巨型圆形头像、旅行足迹仪表盘 |
| **资料编辑** | `profile-edit.html` | 无边框输入框、呼吸感表单 |
| **大图查看** | `photo-viewer.html` | 全黑背景、沉浸式半透明控制层 |

## 4. 还原指南 (Implementation Guidelines)

1.  **组件化先行**：首先修改 `mobile/src/components/ui/revamp.tsx` 中的基础组件（Button, Card, Sheet），确保它们的阴影和圆角全局统一。
2.  **“减法”原则**：在还原任何页面时，首要任务是检查并移除所有的 `borderWidth`。
3.  **阴影处理**：React Native 的阴影与 CSS 不同。请使用以下映射：
    *   CSS `shadow: 0 20px 40px rgba(2, 6, 23, 0.05)` 
    *   RN: `{ shadowColor: '#020617', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.05, shadowRadius: 30, elevation: 10 }`
4.  **动效一致性**：所有点击态统一使用 `transform: [{ scale: 0.97 }]` 配合 `opacity: 0.7` 的轻微缩回感。

---
*注：本规范旨在建立一套可长久维护的审美基准，后续任何 UI 改动应先在 HTML 设计稿中验证后再同步至代码。*
