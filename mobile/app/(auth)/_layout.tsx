import { Stack } from 'expo-router';

/**
 * 认证流程布局
 * 包含欢迎页和注册/登录页
 */
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
