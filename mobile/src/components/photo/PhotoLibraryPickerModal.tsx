import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SelectableMediaGrid } from '@/components/photo/SelectableMediaGrid';
import { JourneyPalette } from '@/styles/colors';
import { openAppSettings } from '@/utils/permissionUtils';

const PAGE_SIZE = 90;

type PhotoLibraryPickerModalProps = {
  visible: boolean;
  title: string;
  hint: string;
  confirmLabel: string;
  maxSelection?: number;
  confirmLoading?: boolean;
  onClose: () => void;
  onConfirm: (assets: MediaLibrary.Asset[]) => Promise<void> | void;
};

function getAssetIdentity(asset: MediaLibrary.Asset): string {
  return asset.id;
}

function getAssetRenderKey(asset: MediaLibrary.Asset, index: number): string {
  return `${asset.id}:${asset.creationTime ?? 0}:${asset.uri ?? 'missing'}:${index}`;
}

export function PhotoLibraryPickerModal({
  visible,
  title,
  hint,
  confirmLabel,
  maxSelection = 200,
  confirmLoading = false,
  onClose,
  onConfirm,
}: PhotoLibraryPickerModalProps) {
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const endCursorRef = useRef<string | undefined>(undefined);
  const hasNextPageRef = useRef(true);
  const loadingInitialRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const canClose = !confirmLoading;
  const selectionMode = selectedIds.length > 0;

  const mergeUniqueAssets = useCallback(
    (current: MediaLibrary.Asset[], incoming: MediaLibrary.Asset[]): MediaLibrary.Asset[] => {
      const result: MediaLibrary.Asset[] = [];
      const existingIds = new Set<string>();

      [...current, ...incoming].forEach((asset) => {
        const identity = getAssetIdentity(asset);
        if (existingIds.has(identity)) {
          return;
        }
        existingIds.add(identity);
        result.push(asset);
      });

      return result;
    },
    [],
  );

  const loadAssets = useCallback(
    async (mode: 'reset' | 'append') => {
      if (mode === 'reset') {
        setLoadingInitial(true);
        loadingInitialRef.current = true;
      } else {
        setLoadingMore(true);
        loadingMoreRef.current = true;
      }

      try {
        const page = await MediaLibrary.getAssetsAsync({
          first: PAGE_SIZE,
          mediaType: [MediaLibrary.MediaType.photo],
          sortBy: [['creationTime', false]],
          after: mode === 'append' ? endCursorRef.current : undefined,
        });
        setAssets((previous) =>
          mode === 'append'
            ? mergeUniqueAssets(previous, page.assets ?? [])
            : mergeUniqueAssets([], page.assets ?? []),
        );
        endCursorRef.current = page.endCursor ?? undefined;
        hasNextPageRef.current = Boolean(page.hasNextPage);
        setPermissionDenied(false);
      } finally {
        setLoadingInitial(false);
        loadingInitialRef.current = false;
        setLoadingMore(false);
        loadingMoreRef.current = false;
      }
    },
    [mergeUniqueAssets],
  );

  useEffect(() => {
    if (!visible) {
      return;
    }

    setSelectedIds([]);
    void (async () => {
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) {
        setPermissionDenied(true);
        setAssets([]);
        hasNextPageRef.current = false;
        endCursorRef.current = undefined;
        return;
      }
      await loadAssets('reset');
    })();
  }, [loadAssets, visible]);

  const selectableItems = useMemo(
    () =>
      assets.map((asset, index) => ({
        id: asset.id,
        key: getAssetRenderKey(asset, index),
        uri: asset.uri,
      })),
    [assets],
  );

  const selectedAssets = useMemo(() => {
    const selectedIdSet = new Set(selectedIds);
    return assets.filter((asset) => selectedIdSet.has(asset.id));
  }, [assets, selectedIds]);

  const handleSelectAllLoaded = useCallback(() => {
    setSelectedIds(assets.slice(0, maxSelection).map((asset) => asset.id));
  }, [assets, maxSelection]);

  const handleLoadMore = useCallback(() => {
    if (loadingMoreRef.current || loadingInitialRef.current || !hasNextPageRef.current) {
      return;
    }
    void loadAssets('append');
  }, [loadAssets]);

  const handleClose = useCallback(() => {
    if (!canClose) {
      return;
    }
    onClose();
  }, [canClose, onClose]);

  const header = (
    <View style={styles.gridHeader}>
      <View style={styles.toolbarCard}>
        <Text style={styles.selectionStatsText}>
          {selectionMode
            ? `已选择 ${selectedIds.length}${maxSelection ? ` / ${maxSelection}` : ''}`
            : '长按任意照片后开始滑动多选'}
        </Text>
        <Text style={styles.selectionStatsHint}>
          {selectionMode
            ? '选择后可继续点击补选，或像系统相册一样滑过照片连续选择。'
            : '默认先浏览，长按一张照片即可进入选择状态；支持全选已加载。'}
        </Text>

        <View style={styles.toolbarRow}>
          <Pressable
            onPress={handleSelectAllLoaded}
            style={({ pressed }) => [styles.toolbarButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons
              name="checkbox-multiple-marked-outline"
              size={16}
              color={JourneyPalette.ink}
            />
            <Text style={styles.toolbarButtonText}>全选已加载</Text>
          </Pressable>

          {selectionMode ? (
            <Pressable
              onPress={() => setSelectedIds([])}
              style={({ pressed }) => [styles.toolbarButton, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons
                name="close-circle-outline"
                size={16}
                color={JourneyPalette.ink}
              />
              <Text style={styles.toolbarButtonText}>取消选择</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} disabled={!canClose} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalCopy}>
                <Text style={styles.modalTitle}>{title}</Text>
                <Text style={styles.modalHint}>{hint}</Text>
              </View>
              <Pressable
                onPress={handleClose}
                disabled={!canClose}
                style={({ pressed }) => [
                  styles.modalCloseBtn,
                  pressed && styles.pressed,
                  !canClose && styles.disabledAction,
                ]}
              >
                <MaterialCommunityIcons name="close" size={18} color={JourneyPalette.inkSoft} />
              </Pressable>
            </View>

            {permissionDenied ? (
              <View style={styles.modalContent}>
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons name="image-lock-outline" size={24} color="#8A97B8" />
                  <Text style={styles.emptyTitle}>没有相册权限</Text>
                  <Text style={styles.emptyDescription}>需要开启系统相册权限后才能选择照片。</Text>
                  <Pressable
                    onPress={openAppSettings}
                    style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.settingsButtonText}>打开系统设置</Text>
                  </Pressable>
                </View>
              </View>
            ) : loadingInitial ? (
              <View style={styles.modalContent}>
                <View style={styles.loadingState}>
                  <ActivityIndicator color={JourneyPalette.accent} />
                  <Text style={styles.loadingText}>正在读取相册照片...</Text>
                </View>
              </View>
            ) : (
              <View style={styles.gridContainer}>
                <SelectableMediaGrid
                  items={selectableItems}
                  selectedIds={selectedIds}
                  onSelectionChange={setSelectedIds}
                  emptyText="相册里还没有可导入的照片"
                  maxSelection={maxSelection}
                  onEndReached={handleLoadMore}
                  header={header}
                  footer={
                    loadingMore ? (
                      <View style={styles.footerLoading}>
                        <ActivityIndicator color={JourneyPalette.accent} />
                        <Text style={styles.footerLoadingText}>正在加载更多照片...</Text>
                      </View>
                    ) : null
                  }
                />
              </View>
            )}

            <View style={styles.modalActions}>
              <Pressable
                onPress={handleClose}
                disabled={!canClose}
                style={({ pressed }) => [
                  styles.modalGhostBtn,
                  pressed && styles.pressed,
                  !canClose && styles.disabledAction,
                ]}
              >
                <Text style={styles.modalGhostBtnText}>取消</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void onConfirm(selectedAssets);
                }}
                style={({ pressed }) => [
                  styles.modalPrimaryBtn,
                  pressed && styles.pressed,
                  (selectedAssets.length === 0 || confirmLoading) && styles.disabledAction,
                ]}
                disabled={selectedAssets.length === 0 || confirmLoading}
              >
                {confirmLoading ? (
                  <ActivityIndicator color="#FFF9F2" />
                ) : (
                  <Text style={styles.modalPrimaryBtnText}>{confirmLabel}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(21, 32, 31, 0.42)',
  },
  modalSheet: {
    height: '88%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: JourneyPalette.card,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 20,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: JourneyPalette.lineStrong,
    marginBottom: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalCopy: {
    flex: 1,
    gap: 6,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  modalHint: {
    lineHeight: 20,
    color: JourneyPalette.inkSoft,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.cardAlt,
  },
  modalContent: {
    paddingTop: 16,
    paddingBottom: 12,
    gap: 14,
  },
  gridContainer: {
    flex: 1,
    minHeight: 320,
    paddingTop: 8,
  },
  gridHeader: {
    paddingTop: 16,
    paddingBottom: 12,
  },
  toolbarCard: {
    borderRadius: 18,
    backgroundColor: JourneyPalette.cardAlt,
    padding: 14,
    gap: 10,
  },
  selectionStatsText: {
    fontSize: 14,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  selectionStatsHint: {
    lineHeight: 19,
    color: JourneyPalette.inkSoft,
  },
  toolbarRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  toolbarButton: {
    minHeight: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: '#FFF9F2',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolbarButtonText: {
    fontWeight: '700',
    color: JourneyPalette.ink,
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    gap: 10,
  },
  loadingText: {
    color: JourneyPalette.inkSoft,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    gap: 8,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.cardAlt,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  emptyDescription: {
    textAlign: 'center',
    color: JourneyPalette.inkSoft,
    paddingHorizontal: 12,
    lineHeight: 20,
  },
  settingsButton: {
    marginTop: 6,
    minHeight: 44,
    borderRadius: 999,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.accent,
  },
  settingsButtonText: {
    color: '#FFF9F2',
    fontWeight: '800',
  },
  footerLoading: {
    paddingVertical: 16,
    alignItems: 'center',
    gap: 8,
  },
  footerLoadingText: {
    color: JourneyPalette.inkSoft,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  modalGhostBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.cardAlt,
  },
  modalGhostBtnText: {
    color: JourneyPalette.ink,
    fontWeight: '800',
  },
  modalPrimaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: JourneyPalette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryBtnText: {
    color: '#FFF9F2',
    fontWeight: '800',
  },
  disabledAction: {
    opacity: 0.55,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
});
