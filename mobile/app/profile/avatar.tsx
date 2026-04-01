import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { userApi } from '@/services/api/userApi';

const MAX_AVATAR_SIZE = 1024 * 1024;

export default function AvatarScreen() {
  const router = useRouter();
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const validateAndSet = useCallback((asset: ImagePicker.ImagePickerAsset) => {
    if (asset.fileSize && asset.fileSize > MAX_AVATAR_SIZE) {
      Alert.alert('图片过大', '头像图片需小于 1MB');
      return;
    }
    setAvatarUri(asset.uri);
  }, []);

  const pickFromLibrary = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('需要权限', '请允许访问相册后重试');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      validateAndSet(result.assets[0]);
    }
  }, [validateAndSet]);

  const captureFromCamera = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('需要权限', '请允许访问相机后重试');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      validateAndSet(result.assets[0]);
    }
  }, [validateAndSet]);

  const chooseAvatar = useCallback(() => {
    Alert.alert('选择头像', '请选择图片来源', [
      { text: '相册', onPress: () => void pickFromLibrary() },
      { text: '拍照', onPress: () => void captureFromCamera() },
      { text: '取消', style: 'cancel' },
    ]);
  }, [captureFromCamera, pickFromLibrary]);

  const uploadAvatar = useCallback(async () => {
    if (!avatarUri) {
      return;
    }
    try {
      setUploading(true);
      await userApi.uploadAvatarAndUpdate(avatarUri);
      Alert.alert('上传成功', '头像已更新', [{ text: '确定', onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert('上传失败', e instanceof Error ? e.message : '请稍后重试');
    } finally {
      setUploading(false);
    }
  }, [avatarUri, router]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>头像上传</Text>

      <View style={styles.previewCard}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.previewImage} />
        ) : (
          <View style={styles.placeholder}>
            <MaterialCommunityIcons name="account-circle-outline" size={80} color="#95A5C9" />
            <Text style={styles.placeholderText}>点击下方按钮选择头像</Text>
          </View>
        )}
      </View>

      <View style={styles.actionRow}>
        <Pressable style={styles.secondaryButton} onPress={chooseAvatar} disabled={uploading}>
          <Text style={styles.secondaryText}>{avatarUri ? '重新选择' : '选择头像'}</Text>
        </Pressable>
        <Pressable
          style={[styles.primaryButton, (!avatarUri || uploading) && styles.buttonDisabled]}
          onPress={uploadAvatar}
          disabled={!avatarUri || uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryText}>上传</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EEF3FF',
    padding: 16,
    gap: 14,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#22335C',
  },
  previewCard: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D9E3FB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  previewImage: {
    width: 260,
    height: 260,
    borderRadius: 130,
  },
  placeholder: {
    alignItems: 'center',
    gap: 8,
  },
  placeholderText: {
    color: '#6579A6',
    fontSize: 13,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFCDED',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  secondaryText: {
    color: '#334E88',
    fontWeight: '700',
  },
  primaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3659A8',
  },
  primaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
});
