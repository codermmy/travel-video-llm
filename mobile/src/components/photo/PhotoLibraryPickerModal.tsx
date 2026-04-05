import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SelectableMediaGrid } from '@/components/photo/SelectableMediaGrid';
import { PermissionRecoveryCard } from '@/components/photo/PermissionRecoveryCard';
import { ActionButton, BottomSheetScaffold, SurfaceCard } from '@/components/ui/revamp';
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
  maxSelection,
  confirmLoading = false,
  permissionContext = 'manual-import',
  onClose,
  onConfirm,
}: PhotoLibraryPickerModalProps) {
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [totalAssetCount, setTotalAssetCount] = useState(0);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const assetsRef = useRef<MediaLibrary.Asset[]>([]);
  const endCursorRef = useRef<string | undefined>(undefined);
  const hasNextPageRef = useRef<boolean>(true);
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

  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

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
        const nextAssets =
          mode === 'append'
            ? mergeUniqueAssets(assetsRef.current, page.assets ?? [])
            : mergeUniqueAssets([], page.assets ?? []);
        assetsRef.current = nextAssets;
        setAssets(nextAssets);
        setTotalAssetCount(page.totalCount ?? nextAssets.length);
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

  const loadAllAssets = useCallback(async (): Promise<MediaLibrary.Asset[]> => {
    if (!hasNextPageRef.current) {
      return assetsRef.current;
    }

    setSelectingAll(true);
    setLoadingMore(true);
    loadingMoreRef.current = true;

    try {
      let nextAssets = assetsRef.current;
      let cursor = endCursorRef.current;
      let hasNextPage: boolean = hasNextPageRef.current;

      while (hasNextPage) {
        const page = await MediaLibrary.getAssetsAsync({
          first: PAGE_SIZE,
          mediaType: [MediaLibrary.MediaType.photo],
          sortBy: [['creationTime', false]],
          after: cursor,
        });
        nextAssets = mergeUniqueAssets(nextAssets, page.assets ?? []);
        assetsRef.current = nextAssets;
        setAssets(nextAssets);
        setTotalAssetCount(page.totalCount ?? nextAssets.length);
        cursor = page.endCursor ?? undefined;
        hasNextPage = Boolean(page.hasNextPage);
      }

      endCursorRef.current = cursor;
      hasNextPageRef.current = false;
      return nextAssets;
    } finally {
      setSelectingAll(false);
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, [mergeUniqueAssets]);

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
        setTotalAssetCount(0);
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

  const handleSelectAll = useCallback(async () => {
    const allAssets = await loadAllAssets();
    const nextIds = maxSelection
      ? allAssets.slice(0, maxSelection).map((asset) => asset.id)
      : allAssets.map((asset) => asset.id);
    setSelectedIds(nextIds);
  }, [loadAllAssets, maxSelection]);

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
            : `共 ${totalAssetCount || assets.length} 张，轻触选择`}
        </Text>

        <View style={styles.toolbarRow}>
          <Pressable
            onPress={() => {
              void handleSelectAll();
            }}
            disabled={selectingAll || loadingInitial || confirmLoading}
            style={({ pressed }) => [
              styles.toolbarButton,
              pressed && styles.pressed,
              (selectingAll || loadingInitial || confirmLoading) && styles.disabledAction,
            ]}
          >
            <MaterialCommunityIcons
              name="checkbox-multiple-marked-outline"
              size={16}
              color={JourneyPalette.ink}
            />
            <Text style={styles.toolbarButtonText}>{selectingAll ? '全选中...' : '全选全部'}</Text>
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
            bodyStyle={styles.modalSheetBody}
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
                  browseTapBehavior="select"
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
    backgroundColor: 'rgba(2, 6, 23, 0.4)',
  },
  modalSheet: {
    height: '92%',
    paddingBottom: 24,
  },
  modalSheetBody: {
    flex: 1,
    minHeight: 0,
  },
  modalContent: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
    paddingBottom: 24,
  },
  gridContainer: {
    flex: 1,
    minHeight: 0,
    paddingTop: 12,
  },
  gridHeader: {
    paddingBottom: 16,
  },
  toolbarCard: {
    borderRadius: 28,
    backgroundColor: JourneyPalette.surfaceVariant,
    padding: 20,
    gap: 12,
  },
  selectionStatsText: {
    fontSize: 15,
    fontWeight: '900',
    color: JourneyPalette.ink,
    letterSpacing: -0.2,
  },
  toolbarRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  toolbarButton: {
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: JourneyPalette.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  toolbarButtonText: {
    fontWeight: '800',
    color: JourneyPalette.ink,
    fontSize: 13,
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingCard: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  loadingText: {
    color: JourneyPalette.inkSoft,
    fontSize: 15,
    fontWeight: '600',
  },
  footerLoading: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 10,
  },
  footerLoadingText: {
    color: JourneyPalette.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'column',
    gap: 12,
    paddingTop: 8,
  },
  disabledAction: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
});
