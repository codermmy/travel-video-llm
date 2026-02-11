# 问题：testID 在第三方组件上不生效

## 现象

在 React Native 组件上添加了 `testID`，但 Maestro 测试找不到该元素：

```
❌ Assert that id: welcome-screen is visible... FAILED
```

使用 `maestro hierarchy` 查看页面元素时，也找不到对应的 ID。

## 原因

`testID` 是 React Native 的属性，会被转换为原生平台的可访问性标识：
- iOS: `accessibilityIdentifier`
- Android: `resource-id` 或 `content-description`

但是，**第三方组件**（如 `expo-linear-gradient` 的 `LinearGradient`）可能不会正确地将 `testID` 传递给底层原生视图。

常见不生效的组件：
- `LinearGradient` (expo-linear-gradient)
- 某些自定义原生组件
- 某些动画组件

## 解决方案

### 方案：用原生 View 包裹

将 `testID` 放在 React Native 原生的 `View` 组件上，而不是第三方组件上：

```tsx
// ❌ 错误：testID 在第三方组件上（可能不生效）
<LinearGradient
  testID="welcome-screen"
  colors={['#EEF3FF', '#E6F3ED']}
  style={StyleSheet.absoluteFill}
>
  <Content />
</LinearGradient>

// ✅ 正确：testID 在原生 View 上
<View testID="welcome-screen" style={styles.container}>
  <LinearGradient
    colors={['#EEF3FF', '#E6F3ED']}
    style={StyleSheet.absoluteFill}
  >
    <Content />
  </LinearGradient>
</View>
```

### 验证方法

修改后，使用 `maestro hierarchy` 验证 testID 是否正确暴露：

```bash
~/.maestro/bin/maestro hierarchy | grep "welcome-screen"
```

应该能看到类似输出：
```json
"resource-id": "welcome-screen"
```

## 最佳实践

1. **testID 始终放在原生组件上**：`View`, `Text`, `TextInput`, `Pressable`, `TouchableOpacity` 等
2. **第三方组件用 View 包裹**：如果需要给第三方组件添加 testID
3. **测试前验证**：使用 `maestro hierarchy` 确认 testID 已正确暴露

## 相关文件

- `mobile/app/(auth)/index.tsx` - 欢迎页（已修复，testID 在 View 上）

## 关键词

testID, LinearGradient, 第三方组件, resource-id, accessibilityIdentifier, 元素找不到, View包裹

## 记录信息

- 首次记录：2026-02-11
- 最后更新：2026-02-11
