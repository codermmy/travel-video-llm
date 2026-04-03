import { useCallback, useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import {
  ActionButton,
  BottomSheetScaffold,
  EmptyStateCard,
  InlineBanner,
  PageContent,
  PageHeader,
  SectionLabel,
  SurfaceCard,
} from '@/components/ui/revamp';
import { userApi } from '@/services/api/userApi';
import { JourneyPalette } from '@/styles/colors';
import { openAppSettings } from '@/utils/permissionUtils';

const MAX_AVATAR_SIZE = 1024 * 1024;

type PermissionType = 'media' | 'camera' | null;

export default function AvatarScreen() {
  const router = useRouter();
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sourceSheetVisible, setSourceSheetVisible] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState<PermissionType>(null);

  const validateAndSet = useCallback((asset: ImagePicker.ImagePickerAsset) => {
    if (asset.fileSize && asset.fileSize > MAX_AVATAR_SIZE) {
      Alert.alert('图片过大', '头像图片需小于 1MB');
      return false;
    }

    setAvatarUri(asset.uri);
    setPermissionDenied(null);
    return true;
  }, []);

  const pickFromLibrary = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      setPermissionDenied('media');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0] && !validateAndSet(result.assets[0])) {
      setPermissionDenied(null);
    }
  }, [validateAndSet]);

  const captureFromCamera = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      setPermissionDenied('camera');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0] && !validateAndSet(result.assets[0])) {
      setPermissionDenied(null);
    }
  }, [validateAndSet]);

  const uploadAvatar = useCallback(async () => {
    if (!avatarUri) {
      return;
    }

    try {
      setUploading(true);
      await userApi.uploadAvatarAndUpdate(avatarUri);
      router.back();
    } catch (error) {
      Alert.alert('上传失败', error instanceof Error ? error.message : '请稍后重试');
    } finally {
      setUploading(false);
    }
  }, [avatarUri, router]);

  return (
    <>
      <PageContent>
        <PageHeader
          title="头像来源"
          subtitle="和相册、拍照、权限恢复共用同一套轻量底部流程。"
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
          <EmptyStateCard
            icon={permissionDenied === 'media' ? 'image-lock-outline' : 'camera-off-outline'}
            title={permissionDenied === 'media' ? '没有相册权限' : '没有相机权限'}
            description={
              permissionDenied === 'media'
                ? '需要开启系统相册权限后才能从相册选择头像。'
                : '需要开启系统相机权限后才能拍照更新头像。'
            }
            action={
              <ActionButton
                label="打开系统设置"
                icon="cog-outline"
                onPress={openAppSettings}
                fullWidth={false}
              />
            }
          />
        ) : null}

        <SurfaceCard style={styles.previewCard}>
          <SectionLabel title="头像预览" />
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.previewImage} />
          ) : (
            <View style={styles.placeholder}>
              <View style={styles.placeholderIconWrap}>
                <MaterialCommunityIcons
                  name="account-circle-outline"
                  size={74}
                  color={JourneyPalette.muted}
                />
              </View>
              <Text style={styles.placeholderTitle}>还没有选定头像</Text>
              <Text style={styles.placeholderText}>先选择来源，再裁切并确认当前设备头像。</Text>
            </View>
          )}
        </SurfaceCard>

        <InlineBanner
          icon="image-outline"
          title="头像来源"
          body="来源选择做成轻量 action sheet，而不是只靠系统 Alert。"
          tone="neutral"
        />

        <View style={styles.actionRow}>
          <ActionButton
            label={avatarUri ? '重新选择' : '选择头像'}
            tone="secondary"
            onPress={() => setSourceSheetVisible(true)}
            style={styles.flexButton}
          />
          <ActionButton
            label={uploading ? '上传中...' : '上传头像'}
            onPress={uploadAvatar}
            disabled={!avatarUri || uploading}
            style={styles.flexButton}
          />
        </View>
      </PageContent>

      <Modal
        visible={sourceSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSourceSheetVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSourceSheetVisible(false)} />
          <BottomSheetScaffold
            title="选择头像来源"
            hint="相册和拍照并列展示，但确认动作回到底部主按钮。"
            onClose={() => setSourceSheetVisible(false)}
            style={styles.sheet}
          >
            <InlineBanner
              icon="shield-check-outline"
              title="低步骤、强确定感"
              body="先选来源，再裁切预览，最后回到头像页确认上传。"
              tone="accent"
              style={styles.sheetBanner}
            />
            <SurfaceCard style={styles.optionCard}>
              <ActionButton
                label="从相册选择头像"
                tone="secondary"
                icon="image-outline"
                onPress={() => {
                  setSourceSheetVisible(false);
                  void pickFromLibrary();
                }}
              />
              <ActionButton
                label="拍照更新头像"
                tone="secondary"
                icon="camera-outline"
                onPress={() => {
                  setSourceSheetVisible(false);
                  void captureFromCamera();
                }}
              />
            </SurfaceCard>
          </BottomSheetScaffold>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  previewCard: {
    alignItems: 'center',
    gap: 14,
  },
  previewImage: {
    width: 240,
    height: 240,
    borderRadius: 120,
  },
  placeholder: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 22,
  },
  placeholderIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 32,
    backgroundColor: JourneyPalette.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderTitle: {
    color: JourneyPalette.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  placeholderText: {
    color: JourneyPalette.inkSoft,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  flexButton: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.34)',
  },
  sheet: {
    paddingBottom: 18,
  },
  sheetBanner: {
    marginBottom: 12,
  },
  optionCard: {
    gap: 12,
  },
});
