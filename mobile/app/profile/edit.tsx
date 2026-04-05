import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { PermissionRecoveryCard } from '@/components/photo/PermissionRecoveryCard';
import {
  ActionButton,
  BottomSheetScaffold,
  EmptyStateCard,
  PageContent,
  PageHeader,
  SurfaceCard,
} from '@/components/ui/revamp';
import { JourneyPalette } from '@/styles/colors';
import { userApi, type UserProfile } from '@/services/api/userApi';

const NICKNAME_PATTERN = /^[\u4e00-\u9fa5A-Za-z0-9_-]{2,64}$/;
const MAX_AVATAR_SIZE = 1024 * 1024;

type PermissionType = 'media' | 'camera' | null;

export default function EditProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [nickname, setNickname] = useState('');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sourceSheetVisible, setSourceSheetVisible] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState<PermissionType>(null);

  const loadUser = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const user = await userApi.getCurrentUser();
      setCurrentUser(user);
      setNickname(user.nickname || '');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  const avatarLetter = useMemo(() => {
    const source = nickname.trim() || currentUser?.nickname?.trim() || 'D';
    return source.slice(0, 1).toUpperCase();
  }, [currentUser?.nickname, nickname]);

  const uploadAvatarAsset = useCallback(async (asset: ImagePicker.ImagePickerAsset) => {
    if (asset.fileSize && asset.fileSize > MAX_AVATAR_SIZE) {
      Alert.alert('图片过大', '头像图片需小于 1MB');
      return;
    }

    try {
      setAvatarUploading(true);
      const updatedUser = await userApi.uploadAvatarAndUpdate(asset.uri);
      setCurrentUser(updatedUser);
      setPermissionDenied(null);
    } catch (error) {
      Alert.alert('上传失败', error instanceof Error ? error.message : '请稍后重试');
    } finally {
      setAvatarUploading(false);
    }
  }, []);

  const pickFromLibrary = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      setPermissionDenied('media');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadAvatarAsset(result.assets[0]);
    }
  }, [uploadAvatarAsset]);

  const captureFromCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      setPermissionDenied('camera');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadAvatarAsset(result.assets[0]);
    }
  }, [uploadAvatarAsset]);

  const onSave = useCallback(async () => {
    const cleanNickname = nickname.trim();

    if (!cleanNickname) {
      Alert.alert('提示', '昵称不能为空');
      return;
    }
    if (!NICKNAME_PATTERN.test(cleanNickname)) {
      Alert.alert('提示', '昵称仅支持中文、英文、数字、下划线和连字符，长度 2-64');
      return;
    }

    try {
      setSaving(true);
      const updatedUser = await userApi.updateCurrentUser({ nickname: cleanNickname });
      setCurrentUser(updatedUser);
      router.back();
    } catch (error) {
      Alert.alert('保存失败', error instanceof Error ? error.message : '请稍后重试');
    } finally {
      setSaving(false);
    }
  }, [nickname, router]);

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={JourneyPalette.accent} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.errorWrap}>
        <EmptyStateCard
          icon="account-edit-outline"
          title="加载失败"
          description={loadError}
          action={<ActionButton label="重试" onPress={() => void loadUser()} fullWidth={false} />}
        />
      </View>
    );
  }

  return (
    <>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <PageContent>
          <PageHeader
            title="个人资料"
            rightSlot={
              <ActionButton
                label="返回"
                tone="secondary"
                icon="arrow-left"
                fullWidth={false}
                onPress={() => router.back()}
              />
            }
          />

          {permissionDenied ? (
            <View style={styles.permissionBlock}>
              <PermissionRecoveryCard
                mode={permissionDenied}
                context="avatar-source"
                onDismiss={() => setPermissionDenied(null)}
              />
            </View>
          ) : null}

          <SurfaceCard style={styles.profileCard}>
            <Pressable
              onPress={() => setSourceSheetVisible(true)}
              style={({ pressed }) => [styles.avatarRow, pressed && styles.rowPressed]}
            >
              <Text style={styles.rowLabel}>头像</Text>
              <View style={styles.avatarRowTrailing}>
                <View style={styles.avatarWrap}>
                  {currentUser?.avatar_url ? (
                    <Image source={{ uri: currentUser.avatar_url }} style={styles.avatarImage} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarFallbackText}>{avatarLetter}</Text>
                    </View>
                  )}
                  {avatarUploading ? (
                    <View style={styles.avatarLoadingMask}>
                      <ActivityIndicator color="#FFFFFF" />
                    </View>
                  ) : null}
                </View>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={18}
                  color={JourneyPalette.muted}
                />
              </View>
            </Pressable>

            <View style={styles.divider} />

            <View style={styles.fieldBlock}>
              <Text style={styles.rowLabel}>昵称</Text>
              <TextInput
                style={styles.input}
                value={nickname}
                onChangeText={setNickname}
                placeholder="请输入昵称"
                maxLength={64}
                placeholderTextColor={JourneyPalette.muted}
              />
            </View>
          </SurfaceCard>

          <ActionButton
            label={saving ? '保存中...' : '保存'}
            onPress={onSave}
            disabled={saving || avatarUploading}
          />
        </PageContent>
      </KeyboardAvoidingView>

      <Modal
        visible={sourceSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSourceSheetVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSourceSheetVisible(false)} />
          <BottomSheetScaffold
            title="更换头像"
            onClose={() => setSourceSheetVisible(false)}
            style={styles.sheet}
          >
            <View style={styles.sheetActions}>
              <ActionButton
                label="从相册选择"
                tone="secondary"
                icon="image-outline"
                onPress={() => {
                  setSourceSheetVisible(false);
                  void pickFromLibrary();
                }}
              />
              <ActionButton
                label="拍照"
                tone="secondary"
                icon="camera-outline"
                onPress={() => {
                  setSourceSheetVisible(false);
                  void captureFromCamera();
                }}
              />
              <ActionButton
                label="取消"
                tone="secondary"
                onPress={() => setSourceSheetVisible(false)}
              />
            </View>
          </BottomSheetScaffold>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: JourneyPalette.cardAlt,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.cardAlt,
  },
  errorWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: JourneyPalette.cardAlt,
  },
  permissionBlock: {
    width: '100%',
  },
  profileCard: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    overflow: 'hidden',
  },
  avatarRow: {
    minHeight: 76,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  avatarRowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 26,
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.cardAlt,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
  },
  avatarFallbackText: {
    color: JourneyPalette.ink,
    fontSize: 20,
    fontWeight: '900',
  },
  avatarLoadingMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: JourneyPalette.line,
    marginLeft: 18,
  },
  fieldBlock: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 12,
  },
  rowLabel: {
    color: JourneyPalette.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  input: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.cardAlt,
    paddingHorizontal: 14,
    color: JourneyPalette.ink,
    fontSize: 15,
  },
  rowPressed: {
    opacity: 0.92,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.34)',
  },
  sheet: {
    paddingBottom: 18,
  },
  sheetActions: {
    gap: 12,
  },
});
