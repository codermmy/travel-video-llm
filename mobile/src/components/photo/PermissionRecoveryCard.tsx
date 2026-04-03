import { StyleSheet, View } from 'react-native';

import { ActionButton, EmptyStateCard } from '@/components/ui/revamp';
import { openAppSettings } from '@/utils/permissionUtils';

type PermissionRecoveryCardProps = {
  mode: 'media' | 'camera';
  context: 'manual-import' | 'event-add-photo' | 'avatar-source';
  onDismiss?: () => void;
};

const TITLE_MAP: Record<PermissionRecoveryCardProps['mode'], string> = {
  media: '没有相册权限',
  camera: '没有相机权限',
};

const ICON_MAP: Record<
  PermissionRecoveryCardProps['mode'],
  'image-lock-outline' | 'camera-off-outline'
> = {
  media: 'image-lock-outline',
  camera: 'camera-off-outline',
};

const DESCRIPTION_MAP: Record<
  PermissionRecoveryCardProps['mode'],
  Record<PermissionRecoveryCardProps['context'], string>
> = {
  media: {
    'manual-import': '需要开启系统相册权限后才能继续手动补导入。',
    'event-add-photo': '需要开启系统相册权限后才能继续向当前事件添加照片。',
    'avatar-source': '需要开启系统相册权限后才能从相册选择头像。',
  },
  camera: {
    'manual-import': '当前流程不使用相机权限，请返回并改用相册导入。',
    'event-add-photo': '当前事件加图依赖相册来源，请返回并从相册选择照片。',
    'avatar-source': '需要开启系统相机权限后才能拍照更新头像。',
  },
};

export function PermissionRecoveryCard({ mode, context, onDismiss }: PermissionRecoveryCardProps) {
  return (
    <EmptyStateCard
      icon={ICON_MAP[mode]}
      title={TITLE_MAP[mode]}
      description={DESCRIPTION_MAP[mode][context]}
      action={
        <View style={styles.actions}>
          <ActionButton label="打开系统设置" icon="cog-outline" onPress={openAppSettings} />
          {onDismiss ? (
            <ActionButton label="稍后再说" tone="secondary" onPress={onDismiss} />
          ) : null}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  actions: {
    width: '100%',
    gap: 10,
  },
});
