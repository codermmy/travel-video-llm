# AI 经验知识库

> **本知识库的作用**：沉淀项目开发中遇到的问题和解决方案，让 AI 越来越懂这个项目。

---

## 使用原则

### 何时查询

```
遇到问题/报错/异常行为
    ↓
1. 先搜索本知识库
   - grep 关键错误信息
   - 查看下方分类索引
    ↓
2. 找到相关记录 → 直接应用解决方案
   未找到 → 自主排错 → 解决后沉淀
```

### 何时写入

| 场景 | 操作 |
|------|------|
| 解决了一个新问题 | 创建新记录 |
| 发现已有记录不完整 | 补充更新 |
| 发现更好的解决方案 | 更新记录 |
| spec:apply 中遇到问题 | 解决后沉淀 |
| spec:hotfix 修复 bug | 沉淀经验 |

### 搜索方法

```bash
# 按关键词搜索
grep -r "关键词" my-spec/system/knowledge/

# 按错误信息搜索
grep -r "INSTALL_FAILED" my-spec/system/knowledge/

# 按文件名搜索
find my-spec/system/knowledge -name "*.md" | xargs grep -l "maestro"
```

---

## 分类索引

### Maestro 测试 (`maestro/`)

| 问题 | 文件 | 关键词 |
|------|------|--------|
| 小米设备无法安装驱动 | `xiaomi-usb-install.md` | USB安装, INSTALL_FAILED_USER_RESTRICTED |
| Maestro 驱动连接超时 | `driver-connection-timeout.md` | DEADLINE_EXCEEDED, waiting_for_connection |
| 找不到页面元素 | `element-not-found.md` | welcome-screen, 蒙层, 弹窗 |

### Expo 开发 (`expo/`)

| 问题 | 文件 | 关键词 |
|------|------|--------|
| Dev Client 开发者菜单 | `dev-client-menu.md` | Development Build, Continue, Close |
| testID 在第三方组件失效 | `testid-third-party.md` | LinearGradient, testID |

### React Native (`react-native/`)

| 问题 | 文件 | 关键词 |
|------|------|--------|
| （待补充） | | |

### 业务逻辑 (`business/`)

| 问题 | 文件 | 关键词 |
|------|------|--------|
| （待补充） | | |

### 跨工具兼容 (`cross-tool/`)

| 问题 | 文件 | 关键词 |
|------|------|--------|
| 命令迁移到多工具 | `command-compatibility.md` | Claude Code, OpenCode, Codex, slash commands, $ARGUMENTS |

---

## 记录格式规范

每个问题记录应包含以下部分：

```markdown
# 问题：[简短描述]

## 现象
[具体的错误信息、异常行为描述]

## 原因
[问题产生的根本原因分析]

## 解决方案
[具体的解决步骤、代码示例]

## 相关文件
[涉及的代码文件、配置文件]

## 关键词
[便于搜索的关键词，用逗号分隔]

## 记录信息
- 首次记录：YYYY-MM-DD
- 最后更新：YYYY-MM-DD
```

---

## 维护原则

1. **及时沉淀**：问题解决后立即记录，避免遗忘细节
2. **保持更新**：发现更好的方案时更新记录
3. **关键词丰富**：多写关键词，提高搜索命中率
4. **示例完整**：代码示例要可直接复制使用
5. **定期整理**：合并重复记录，删除过时内容

---

> **最后更新**：2026-02-11
