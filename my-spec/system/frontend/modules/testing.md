# 前端模块：测试（Testing）

> **文档目的**：详细说明前端测试模块的测试框架、静态检查、E2E 测试、执行命令和最佳实践，帮助开发者快速理解和执行前端测试。

---

## 1. 模块概述

### 1.1 职责范围

- 定义前端测试框架和工具链
- 执行静态代码检查（Lint、TypeCheck）
- 管理 E2E 测试流程（Maestro）
- 生成测试报告和证据
- 确保 UI 交互和业务逻辑的正确性

### 1.2 代码入口

| 类型 | 文件路径 |
|------|----------|
| 项目配置 | `mobile/package.json` |
| TypeScript 配置 | `mobile/tsconfig.json` |
| ESLint 配置 | `mobile/.eslintrc.js` |
| Prettier 配置 | `mobile/.prettierrc` |
| E2E 测试目录 | `mobile/.maestro/` (待创建) |

---

## 2. 测试框架

### 2.1 技术栈

| 工具 | 版本 | 用途 | 状态 |
|------|------|------|------|
| ESLint | ^8.57.0 | 代码规范检查 | 已启用 |
| TypeScript | ~5.9.2 | 类型检查 | 已启用 |
| Prettier | ^3.6.2 | 代码格式化 | 已启用 |
| Maestro | latest | E2E 测试 | 条件启用 |
| Jest | - | 单元测试 | 可选 |

### 2.2 依赖安装

```bash
# 基础依赖
cd mobile
npm install

# E2E 测试工具（Maestro）
brew install maestro
maestro --version

# 可选：单元测试依赖
npm install -D jest jest-expo @testing-library/react-native @types/jest
```

---

## 3. 静态检查

### 3.1 ESLint 检查

**命令**：
```bash
cd mobile
npm run lint
```

**配置说明**：
```javascript
// .eslintrc.js
module.exports = {
  extends: [
    'expo',
    'prettier',
  ],
  plugins: [
    '@typescript-eslint',
    'import',
    'prettier',
  ],
  rules: {
    'prettier/prettier': 'error',
    '@typescript-eslint/no-unused-vars': 'warn',
    'import/order': ['error', {
      'groups': ['builtin', 'external', 'internal'],
      'newlines-between': 'always',
    }],
  },
};
```

**检查范围**：
- 代码风格一致性
- 未使用变量警告
- 导入顺序规范
- React Hooks 规则
- TypeScript 规范

### 3.2 TypeScript 类型检查

**命令**：
```bash
cd mobile
npm run typecheck
```

**配置说明**：
```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "jsx": "react-native"
  }
}
```

**检查范围**：
- 类型定义完整性
- 类型推断正确性
- 接口实现一致性
- 泛型使用规范

### 3.3 Prettier 格式化

**命令**：
```bash
cd mobile
npm run format
```

**配置说明**：
```json
// .prettierrc
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

---

## 4. E2E 测试

### 4.1 Maestro 简介

Maestro 是一个移动端 E2E 测试框架，支持：
- 真机和模拟器测试
- 声明式测试脚本（YAML）
- 截图和录屏
- 跨平台（iOS/Android）

### 4.2 触发条件

以下场景必须执行 E2E 测试：

| 变更类型 | 文件路径模式 | 说明 |
|----------|--------------|------|
| 页面交互 | `mobile/src/screens/**` | 屏幕组件变更 |
| 导航流程 | `mobile/app/**` | 路由配置变更 |
| 认证流程 | `mobile/src/stores/authStore.ts` | 登录状态变更 |
| 上传同步 | `mobile/src/services/**` | 核心服务变更 |

### 4.3 测试脚本结构

```yaml
# mobile/.maestro/login-flow.yaml
appId: com.example.travelapp
---
- launchApp
- tapOn: "登录"
- inputText:
    id: "email-input"
    text: "test@example.com"
- inputText:
    id: "password-input"
    text: "testPass123"
- tapOn: "确认登录"
- assertVisible: "首页"
- takeScreenshot: "login-success"
```

### 4.4 执行命令

```bash
# 运行所有 E2E 测试
maestro test mobile/.maestro

# 运行特定测试
maestro test mobile/.maestro/login-flow.yaml

# 录制测试
maestro record mobile/.maestro/new-test.yaml

# 调试模式
maestro studio
```

### 4.5 人机握手机制

当自动化测试无法完成设备侧动作时：

**AI 输出格式**：
```
ACTION_REQUIRED
change-name: <change-name>
step_id: <step_id>
description: 请在设备上完成以下操作：
  1. 打开相册
  2. 选择 3 张照片
  3. 点击确认
done_file: my-spec/artifacts/<change>/handshake/<step_id>.done
```

**用户完成后**：
```bash
# 创建 done 文件
touch my-spec/artifacts/<change>/handshake/<step_id>.done
```

**AI 检测到 done 文件后继续执行**。

---

## 5. 测试执行流程

### 5.1 标准执行顺序

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        前端测试执行流程                                  │
└─────────────────────────────────────────────────────────────────────────┘

1. 静态检查（必须）
   ├─ npm run lint
   └─ npm run typecheck
   ↓
2. 单元测试（可选）
   └─ npm run test
   ↓
3. E2E 测试（条件触发）
   ├─ 检查是否命中触发条件
   ├─ 启动模拟器/连接真机
   ├─ maestro test mobile/.maestro
   └─ 人机握手（如需要）
   ↓
4. 生成证据
   ├─ 保存测试报告
   ├─ 保存截图
   └─ 保存日志
```

### 5.2 输出重定向

```bash
# 保存 lint 输出
npm run lint > my-spec/artifacts/<change>/reports/mobile-lint.txt 2>&1

# 保存 typecheck 输出
npm run typecheck > my-spec/artifacts/<change>/reports/mobile-typecheck.txt 2>&1

# 保存 E2E 输出
maestro test mobile/.maestro > my-spec/artifacts/<change>/reports/mobile-maestro.txt 2>&1
```

---

## 6. 测试场景

### 6.1 认证流程测试

| 测试场景 | 测试步骤 | 预期结果 |
|----------|----------|----------|
| 登录成功 | 输入正确邮箱密码 → 点击登录 | 跳转到首页 |
| 登录失败 | 输入错误密码 → 点击登录 | 显示错误提示 |
| 注册流程 | 输入邮箱 → 获取验证码 → 设置密码 | 注册成功并登录 |
| 退出登录 | 点击退出 → 确认 | 跳转到登录页 |

### 6.2 地图交互测试

| 测试场景 | 测试步骤 | 预期结果 |
|----------|----------|----------|
| 聚类点击 | 单击聚类标记 | 显示事件卡片列表 |
| 聚类缩放 | 双击聚类标记 | 地图缩放到聚类区域 |
| 事件详情 | 点击事件卡片 | 跳转到事件详情页 |
| 返回初始 | 点击返回按钮 | 地图恢复初始视图 |

### 6.3 上传流程测试

| 测试场景 | 测试步骤 | 预期结果 |
|----------|----------|----------|
| 选择照片 | 点击上传 → 选择照片 | 显示选中照片 |
| 上传进度 | 确认上传 | 显示进度条 |
| 上传成功 | 等待完成 | 显示成功提示 |
| 去重处理 | 上传重复照片 | 跳过已存在照片 |

### 6.4 播放器测试

| 测试场景 | 测试步骤 | 预期结果 |
|----------|----------|----------|
| 自动播放 | 进入播放器 | 照片自动切换 |
| 暂停播放 | 点击暂停按钮 | 播放暂停 |
| 速度调节 | 选择播放速度 | 切换间隔改变 |
| 音乐控制 | 点击静音按钮 | 音乐暂停 |

---

## 7. 单元测试（可选）

### 7.1 Jest 配置

```javascript
// jest.config.js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
```

### 7.2 测试示例

```typescript
// __tests__/authStore.test.ts
import { renderHook, act } from '@testing-library/react-hooks';
import { useAuthStore } from '@/stores/authStore';

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: null,
      isAuthenticated: false,
    });
  });

  it('should set authenticated after login', async () => {
    const { result } = renderHook(() => useAuthStore());

    await act(async () => {
      await result.current.loginWithEmail('test@example.com', 'password');
    });

    expect(result.current.isAuthenticated).toBe(true);
  });
});
```

### 7.3 组件测试示例

```typescript
// __tests__/AuthButton.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { AuthButton } from '@/components/auth/AuthButton';

describe('AuthButton', () => {
  it('should call onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <AuthButton title="登录" onPress={onPress} />
    );

    fireEvent.press(getByText('登录'));
    expect(onPress).toHaveBeenCalled();
  });

  it('should show loading indicator when loading', () => {
    const { getByTestId } = render(
      <AuthButton title="登录" onPress={() => {}} loading />
    );

    expect(getByTestId('loading-indicator')).toBeTruthy();
  });
});
```

---

## 8. 测试门禁

### 8.1 必须通过的检查

| 检查项 | 命令 | 门禁级别 |
|--------|------|----------|
| ESLint | `npm run lint` | 必须通过 |
| TypeCheck | `npm run typecheck` | 必须通过 |
| E2E（条件） | `maestro test` | 命中条件时必须通过 |

### 8.2 失败处理

1. **Lint 失败**：
   - 查看错误详情
   - 修复代码风格问题
   - 重新运行 lint

2. **TypeCheck 失败**：
   - 查看类型错误
   - 修复类型定义
   - 重新运行 typecheck

3. **E2E 失败**：
   - 查看截图和日志
   - 分析失败原因
   - 修复代码或测试脚本
   - 重新运行测试

---

## 9. 证据产物

### 9.1 必须产出

| 文件 | 路径 | 说明 |
|------|------|------|
| Lint 报告 | `my-spec/artifacts/<change>/reports/mobile-lint.txt` | ESLint 输出 |
| TypeCheck 报告 | `my-spec/artifacts/<change>/reports/mobile-typecheck.txt` | TypeScript 检查输出 |
| E2E 报告 | `my-spec/artifacts/<change>/reports/mobile-maestro.txt` | Maestro 输出（如执行） |
| 截图 | `my-spec/artifacts/<change>/screenshots/` | 失败截图 |
| 握手文件 | `my-spec/artifacts/<change>/handshake/` | 人机握手信号 |

### 9.2 报告格式示例

```text
# mobile-lint.txt 示例
> mobile@1.0.0 lint
> eslint .

✔ No ESLint warnings or errors
```

```text
# mobile-typecheck.txt 示例
> mobile@1.0.0 typecheck
> tsc -p tsconfig.json --noEmit

✔ No TypeScript errors
```

---

## 10. 最佳实践

### 10.1 代码规范

```typescript
// ✅ 正确：有类型注解
function handleLogin(email: string, password: string): Promise<boolean> {
  // ...
}

// ❌ 错误：缺少类型注解
function handleLogin(email, password) {
  // ...
}

// ✅ 正确：使用 interface 定义 Props
interface AuthButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
}

// ✅ 正确：异步操作有错误处理
async function fetchData(): Promise<void> {
  try {
    const data = await api.getData();
    setData(data);
  } catch (error) {
    console.error('Failed to fetch data:', error);
    setError(error);
  }
}
```

### 10.2 测试命名规范

```typescript
// 格式：should <预期行为> when <条件>
it('should show error message when login fails', () => {});
it('should navigate to home when login succeeds', () => {});
it('should disable button when loading', () => {});
```

### 10.3 E2E 测试规范

```yaml
# 使用有意义的 testId
- tapOn:
    id: "login-button"  # ✅ 明确的 testId

# 添加等待和断言
- waitForAnimationToEnd
- assertVisible: "首页"

# 截图关键步骤
- takeScreenshot: "step-1-login-form"
```

---

## 11. 常见问题

### 11.1 Lint 错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `no-unused-vars` | 未使用的变量 | 删除或使用变量 |
| `import/order` | 导入顺序错误 | 按规范排序导入 |
| `prettier/prettier` | 格式不符合规范 | 运行 `npm run format` |

### 11.2 TypeScript 错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `TS2322` | 类型不匹配 | 修正类型定义 |
| `TS2339` | 属性不存在 | 添加属性或修正类型 |
| `TS7006` | 隐式 any | 添加类型注解 |

### 11.3 E2E 测试问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 元素找不到 | testId 不匹配 | 检查组件 testID 属性 |
| 超时 | 动画或网络延迟 | 增加等待时间 |
| 权限弹窗 | 系统权限请求 | 使用人机握手机制 |

---

## 12. 关联模块

| 模块 | 文档 | 关联说明 |
|------|------|----------|
| 后端测试 | `backend/modules/testing.md` | 前后端测试协调 |
| 测试策略 | `global/test-strategy.md` | 全局测试策略 |
| 测试手册 | `global/testing-playbook.md` | 执行手册 |
| 测试配置 | `global/test-profile.yaml` | profile 定义 |

---

## 13. 变更影响

若本模块变更，需同步检查：

- [ ] `my-spec/system/global/test-profile.yaml`
- [ ] `my-spec/system/global/testing-playbook.md`
- [ ] `my-spec/system/backend/modules/testing.md`
- [ ] `my-spec/system/global/test-strategy.md`
- [ ] `mobile/package.json`（若测试命令变化）

---

> **最后更新**：2026-02-10
