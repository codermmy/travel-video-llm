# AI 经验知识库

> 这里用于沉淀项目里已经验证过的问题、原因和解决方案。

## 使用原则

### 何时查询

- 遇到报错、异常行为、环境问题时
- 怀疑是历史踩坑重复出现时
- 需要确认某个兼容性结论是否已经记录时

### 何时写入

- 解决了一个新的真实问题
- 发现已有记录不完整或已经过期
- 重大变更带来了新的稳定约束或排错经验

### 搜索方法

```bash
grep -r "关键词" my-spec/system/knowledge/
grep -r "INSTALL_FAILED" my-spec/system/knowledge/
find my-spec/system/knowledge -name "*.md" | xargs grep -l "maestro"
```

## 分类索引

### Maestro 测试 (`maestro/`)

| 问题 | 文件 | 关键词 |
|------|------|--------|
| 小米设备无法安装驱动 | `xiaomi-usb-install.md` | USB安装, INSTALL_FAILED_USER_RESTRICTED |
| Maestro 驱动连接超时 | `driver-connection-timeout.md` | DEADLINE_EXCEEDED, waiting_for_connection |
| 找不到页面元素 | `element-not-found.md` | welcome-screen, 蒙层, 弹窗 |
| Tab 点击和弹窗处理 | `tab-click-and-popup.md` | Tab, 点击, 弹窗, optional, 坐标点击, 测试有效性 |

### Expo 开发 (`expo/`)

| 问题 | 文件 | 关键词 |
|------|------|--------|
| Dev Client 开发者菜单 | `dev-client-menu.md` | Development Build, Continue, Close |
| testID 在第三方组件失效 | `testid-third-party.md` | LinearGradient, testID |
| Dev Client API 地址回退 | `dev-client-api-host-fallback.md` | Network Error, API_BASE_URL, hostUri, debuggerHost, 10.0.2.2 |

### React Native (`react-native/`)

| 问题 | 文件 | 关键词 |
|------|------|--------|
| SectionList renderItem 不显示 | `sectionlist-flex-layout.md` | SectionList, flex, 布局, visible false, bounds 异常 |
| 页面标题顶部间距不一致 | `unified-top-header-spacing.md` | safe area, PageHeader, 顶部标题, 顶部间距 |

### 业务逻辑 (`business/`)

| 问题 | 文件 | 关键词 |
|------|------|--------|
| （待补充） | | |

### 跨工具兼容 (`cross-tool/`)

| 问题 | 文件 | 关键词 |
|------|------|--------|
| 命令迁移到多工具 | `command-compatibility.md` | Claude Code, OpenCode, Codex, slash commands, $ARGUMENTS |

## 记录格式

```markdown
# 问题：[简短描述]

## 现象
[具体错误或异常行为]

## 原因
[根因分析]

## 解决方案
[具体步骤、代码示例]

## 相关文件
[涉及文件]

## 关键词
[便于搜索的关键词]

## 记录信息
- 首次记录：YYYY-MM-DD
- 最后更新：YYYY-MM-DD
```
