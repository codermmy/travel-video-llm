import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SelectableMediaGrid } from '@/components/photo/SelectableMediaGrid';
import { PermissionRecoveryCard } from '@/components/photo/PermissionRecoveryCard';
import {
  ActionButton,
  BottomSheetScaffold,
  InlineBanner,
  SurfaceCard,
} from '@/components/ui/revamp';
import { JourneyPalette } from '@/styles/colors';

const PAGE_SIZE = 90;

type PhotoLibraryPickerModalProps = {
  visible: boolean;
  title: string;
  hint: string;
  confirmLabel: string;
  maxSelection?: number;
  confirmLoading?: boolean;
  permissionContext?: 'manual-import' | 'event-add-photo' | 'avatar-source';
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
  permissionContext = 'manual-import',
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
  const effectiveConfirmLabel = useMemo(() => {
    if (selectedAssets.length === 0) {
      return confirmLabel;
    }
    if (confirmLabel.includes('导入')) {
      return `开始导入 ${selectedAssets.length} 张`;
    }
    return confirmLabel;
  }, [confirmLabel, selectedAssets.length]);

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
          <BottomSheetScaffold
            title={title}
            hint={hint}
            onClose={canClose ? handleClose : undefined}
            style={styles.modalSheet}
            footer={
              <View style={styles.modalActions}>
                <ActionButton
                  label={effectiveConfirmLabel}
                  onPress={() => {
                    void onConfirm(selectedAssets);
                  }}
                  disabled={selectedAssets.length === 0 || confirmLoading}
                />
                <ActionButton
                  label="取消"
                  tone="secondary"
                  onPress={handleClose}
                  disabled={!canClose}
                />
              </View>
            }
          >
            {!selectionMode ? (
              <InlineBanner
                icon="image-multiple-outline"
                title="手动补导入"
                body="默认先浏览，长按任意一张进入选择态；手动补导入保留为次级入口，但体验应足够顺手。"
                tone="neutral"
                style={styles.topBanner}
              />
            ) : null}

            {selectionMode ? (
              <SurfaceCard style={styles.selectionBannerCard}>
                <Text style={styles.selectionBannerTitle}>
                  已选择 {selectedIds.length}
                  {maxSelection ? ` / ${maxSelection}` : ''} 张
                </Text>
                <Text style={styles.selectionBannerBody}>
                  补导入是次级入口，但选择体验本身仍然应该像一个完整相册流程。
                </Text>
              </SurfaceCard>
            ) : null}

            {permissionDenied ? (
              <View style={styles.modalContent}>
                <PermissionRecoveryCard
                  mode="media"
                  context={permissionContext}
                  onDismiss={handleClose}
                />
              </View>
            ) : loadingInitial ? (
              <View style={styles.modalContent}>
                <SurfaceCard style={styles.loadingCard}>
                  <ActivityIndicator color={JourneyPalette.accent} />
                  <Text style={styles.loadingText}>正在读取相册照片...</Text>
                </SurfaceCard>
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
          </BottomSheetScaffold>
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
    backgroundColor: 'rgba(15, 23, 42, 0.34)',
  },
  modalSheet: {
    height: '88%',
    paddingBottom: 18,
  },
  modalContent: {
    paddingBottom: 12,
    gap: 14,
  },
  gridContainer: {
    flex: 1,
    minHeight: 320,
    paddingTop: 12,
  },
  topBanner: {
    marginBottom: 12,
  },
  selectionBannerCard: {
    marginBottom: 12,
    gap: 6,
  },
  selectionBannerTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: JourneyPalette.ink,
  },
  selectionBannerBody: {
    color: JourneyPalette.inkSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  gridHeader: {
    paddingTop: 4,
    paddingBottom: 12,
  },
  toolbarCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.card,
    padding: 16,
    gap: 10,
  },
  selectionStatsText: {
    fontSize: 14,
    fontWeight: '900',
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
    backgroundColor: JourneyPalette.cardAlt,
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
  loadingCard: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 10,
  },
  loadingText: {
    color: JourneyPalette.inkSoft,
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
    flexDirection: 'column',
    gap: 10,
  },
  disabledAction: {
    opacity: 0.55,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
});
