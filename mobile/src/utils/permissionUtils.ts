import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

/**
 * 请求相册权限
 * @returns 权限请求结果
 */
export async function requestPhotoLibraryPermission(): Promise<{
  granted: boolean;
  canAskAgain: boolean;
}> {
  if (Platform.OS === 'ios') {
    const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return {
      granted: status === 'granted',
      canAskAgain,
    };
  }

  const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return {
    granted: status === 'granted',
    canAskAgain,
  };
}

/**
 * 检查相册权限状态
 * @returns 当前权限状态
 */
export async function checkPhotoLibraryPermission(): Promise<{
  granted: boolean;
  canAskAgain: boolean;
}> {
  const { status, canAskAgain } = await ImagePicker.getMediaLibraryPermissionsAsync();
  return {
    granted: status === 'granted',
    canAskAgain,
  };
}

/**
 * 打开系统设置
 * 注意：React Native 没有直接打开设置的 API
 * 这里返回提示信息，实际实现可能需要第三方库
 */
export function openAppSettings(): void {
  void Linking.openSettings();
}
