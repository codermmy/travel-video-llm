import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { PermissionRecoveryCard } from '@/components/photo/PermissionRecoveryCard';
import { ActionButton, EmptyStateCard } from '@/components/ui/revamp';
import { JourneyPalette } from '@/styles/colors';
import { userApi, type UserProfile } from '@/services/api/userApi';

const NICKNAME_PATTERN = /^[\u4e00-\u9fa5A-Za-z0-9_-]{2,64}$/;
const MAX_AVATAR_SIZE = 1024 * 1024;
const NICKNAME_FALLBACK = '这台设备';
const ABOUT_FALLBACK = '一个热爱旅行的摄影师';

type PermissionType = 'media' | 'camera' | null;

export default function EditProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [nickname, setNickname] = useState(NICKNAME_FALLBACK);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sourceSheetVisible, setSourceSheetVisible] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState<PermissionType>(null);
  const [about, setAbout] = useState(ABOUT_FALLBACK);

  const loadUser = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const user = await userApi.getCurrentUser();
      setCurrentUser(user);
      setNickname(user.nickname?.trim() || NICKNAME_FALLBACK);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  const avatarLetter = useMemo(() => nickname.slice(0, 1).toUpperCase(), [nickname]);

  const handleNicknameFocus = useCallback(() => {
    if (nickname.trim() === NICKNAME_FALLBACK && !currentUser?.nickname?.trim()) {
      setNickname('');
    }
  }, [currentUser?.nickname, nickname]);

  const handleNicknameBlur = useCallback(() => {
    if (!nickname.trim()) {
      setNickname(NICKNAME_FALLBACK);
    }
  }, [nickname]);

  const handleAboutFocus = useCallback(() => {
    if (about.trim() === ABOUT_FALLBACK) {
      setAbout('');
    }
  }, [about]);

  const handleAboutBlur = useCallback(() => {
    if (!about.trim()) {
      setAbout(ABOUT_FALLBACK);
    }
  }, [about]);

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
        <ScrollView
          style={styles.scrollView}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.headerAction,
                styles.headerActionStart,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.headerCancelText}>取消</Text>
            </Pressable>

            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle}>编辑资料</Text>
            </View>

            <Pressable
              onPress={() => void onSave()}
              disabled={saving || avatarUploading}
              style={({ pressed }) => [
                styles.headerAction,
                styles.headerActionEnd,
                (pressed || saving || avatarUploading) && styles.pressed,
                (saving || avatarUploading) && styles.headerActionDisabled,
              ]}
            >
              {saving ? <ActivityIndicator size="small" color={JourneyPalette.accent} /> : null}
              <Text style={styles.headerSaveText}>保存</Text>
            </Pressable>
          </View>

          <View style={styles.content}>
            {permissionDenied ? (
              <View style={styles.permissionBlock}>
                <PermissionRecoveryCard
                  mode={permissionDenied}
                  context="avatar-source"
                  onDismiss={() => setPermissionDenied(null)}
                />
              </View>
            ) : null}

            <Pressable
              onPress={() => setSourceSheetVisible(true)}
              style={({ pressed }) => [styles.avatarBlock, pressed && styles.pressed]}
            >
              <View style={styles.avatarCircle}>
                {currentUser?.avatar_url ? (
                  <Image source={{ uri: currentUser.avatar_url }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarFallbackText}>{avatarLetter}</Text>
                  </View>
                )}

                {avatarUploading ? (
                  <View style={styles.avatarLoadingMask}>
                    <ActivityIndicator color={JourneyPalette.white} />
                  </View>
                ) : null}

                <View style={styles.avatarBadge}>
                  <MaterialCommunityIcons name="camera" size={16} color={JourneyPalette.white} />
                </View>
              </View>

              <Text style={styles.avatarActionText}>更换头像</Text>
            </Pressable>

            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>你的昵称</Text>
              <TextInput
                style={styles.input}
                value={nickname}
                onChangeText={setNickname}
                onFocus={handleNicknameFocus}
                onBlur={handleNicknameBlur}
                placeholder=""
                maxLength={64}
                placeholderTextColor={JourneyPalette.muted}
                selectionColor={JourneyPalette.accent}
              />
              <Text style={styles.helperText}>昵称仅在生成故事标题时作为参考。</Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>关于你</Text>
              <TextInput
                style={[styles.input, styles.aboutInput]}
                value={about}
                onChangeText={setAbout}
                onFocus={handleAboutFocus}
                onBlur={handleAboutBlur}
                placeholder=""
                placeholderTextColor={JourneyPalette.muted}
                selectionColor={JourneyPalette.accent}
                multiline
                textAlignVertical="top"
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={sourceSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSourceSheetVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSourceSheetVisible(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
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
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: JourneyPalette.background,
  },
  scrollView: {
    flex: 1,
    backgroundColor: JourneyPalette.background,
  },
  scrollContent: {
    paddingBottom: 0,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.background,
  },
  errorWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: JourneyPalette.background,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerAction: {
    minWidth: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerActionStart: {
    justifyContent: 'flex-start',
  },
  headerActionEnd: {
    justifyContent: 'flex-end',
  },
  headerActionDisabled: {
    opacity: 0.72,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  headerCancelText: {
    color: JourneyPalette.inkSoft,
    fontSize: 15,
    fontWeight: '700',
  },
  headerTitle: {
    color: JourneyPalette.ink,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  headerSaveText: {
    color: JourneyPalette.accent,
    fontSize: 15,
    fontWeight: '900',
  },
  content: {
    paddingTop: 32,
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  permissionBlock: {
    marginBottom: 32,
  },
  avatarBlock: {
    alignItems: 'center',
    gap: 16,
    marginBottom: 48,
  },
  avatarCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: JourneyPalette.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.surfaceVariant,
  },
  avatarFallbackText: {
    color: JourneyPalette.ink,
    fontSize: 48,
    fontWeight: '900',
  },
  avatarLoadingMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 60,
  },
  avatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: JourneyPalette.accent,
    borderWidth: 4,
    borderColor: JourneyPalette.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarActionText: {
    color: JourneyPalette.accent,
    fontSize: 14,
    fontWeight: '800',
  },
  formGroup: {
    marginBottom: 32,
  },
  fieldLabel: {
    color: JourneyPalette.muted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  input: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: JourneyPalette.surfaceVariant,
    paddingVertical: 18,
    paddingHorizontal: 20,
    color: JourneyPalette.ink,
    fontSize: 17,
    fontWeight: '700',
  },
  aboutInput: {
    minHeight: 120,
  },
  helperText: {
    marginTop: 10,
    color: JourneyPalette.muted,
    fontSize: 13,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.34)',
  },
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    backgroundColor: JourneyPalette.background,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: JourneyPalette.cardMuted,
    alignSelf: 'center',
    marginBottom: 18,
  },
  sheetActions: {
    gap: 12,
  },
});
