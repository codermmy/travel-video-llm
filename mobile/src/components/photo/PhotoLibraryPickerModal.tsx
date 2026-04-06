import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SelectableMediaGrid } from '@/components/photo/SelectableMediaGrid';
import { PermissionRecoveryCard } from '@/components/photo/PermissionRecoveryCard';
import { JourneyPalette } from '@/styles/colors';

const PAGE_SIZE = 90;

type PhotoLibraryPickerScreenProps = {
  maxSelection?: number;
  confirmLoading?: boolean;
  permissionContext?: 'manual-import' | 'event-add-photo' | 'avatar-source';
  onClose: () => void;
  onConfirm: (assets: MediaLibrary.Asset[]) => Promise<void> | void;
};

type PhotoLibraryPickerModalProps = PhotoLibraryPickerScreenProps & {
  visible: boolean;
  title: string;
  hint: string;
  confirmLabel: string;
};

function getAssetIdentity(asset: MediaLibrary.Asset): string {
  return asset.id;
}

function getAssetRenderKey(asset: MediaLibrary.Asset, index: number): string {
  return `${asset.id}:${asset.creationTime ?? 0}:${asset.uri ?? 'missing'}:${index}`;
}

function resolveMonthLabel(assets: MediaLibrary.Asset[]): string {
  const creationTime = assets[0]?.creationTime;
  if (!creationTime) {
    return '未知时间';
  }

  const date = new Date(creationTime);
  if (Number.isNaN(date.getTime())) {
    return '未知时间';
  }

  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

export function PhotoLibraryPickerScreen({
  maxSelection,
  confirmLoading = false,
  permissionContext = 'manual-import',
  onClose,
  onConfirm,
}: PhotoLibraryPickerScreenProps) {
  const insets = useSafeAreaInsets();
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
  }, [loadAssets]);

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

  const totalCount = totalAssetCount || assets.length;
  const subtitle = useMemo(
    () => `共 ${totalCount} 张 · ${resolveMonthLabel(assets)}`,
    [assets, totalCount],
  );

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

  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <View style={styles.screen}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="关闭"
          onPress={onClose}
          disabled={!canClose}
          style={({ pressed }) => [
            styles.dismissButton,
            { top: Math.max(insets.top + 12, 18) },
            pressed && styles.pressed,
            !canClose && styles.disabledAction,
          ]}
        >
          <MaterialCommunityIcons name="close" size={20} color={JourneyPalette.ink} />
        </Pressable>

        <View style={[styles.header, { paddingTop: Math.max(insets.top + 16, 60) }]}>
          <Text style={styles.title}>选择照片</Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </Text>
        </View>

        <View style={styles.toolbarWrap}>
          <View style={styles.toolbar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="全选"
              onPress={() => {
                void handleSelectAll();
              }}
              disabled={selectingAll || loadingInitial || confirmLoading}
              style={({ pressed }) => [
                styles.pill,
                styles.pillActive,
                pressed && styles.pressed,
                (selectingAll || loadingInitial || confirmLoading) && styles.disabledAction,
              ]}
            >
              <Text style={[styles.pillText, styles.pillTextActive]}>全选</Text>
            </Pressable>

            <View style={styles.pill}>
              <Text style={[styles.pillText, styles.pillTextMuted]}>按日期</Text>
            </View>

            <View style={styles.pill}>
              <Text style={[styles.pillText, styles.pillTextMuted]}>仅风景</Text>
            </View>
          </View>
        </View>

        <View style={styles.gridArea}>
          {permissionDenied ? (
            <View style={styles.stateBlock}>
              <PermissionRecoveryCard
                mode="media"
                context={permissionContext}
                onDismiss={onClose}
              />
            </View>
          ) : loadingInitial ? (
            <View style={styles.stateBlock}>
              <View style={styles.loadingState}>
                <ActivityIndicator color={JourneyPalette.accent} />
                <Text style={styles.loadingText}>正在读取相册照片...</Text>
              </View>
            </View>
          ) : (
            <SelectableMediaGrid
              items={selectableItems}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              emptyText="相册里还没有可导入的照片"
              maxSelection={maxSelection}
              onEndReached={handleLoadMore}
              browseTapBehavior="select"
              footer={
                loadingMore ? (
                  <View style={styles.footerLoading}>
                    <ActivityIndicator color={JourneyPalette.accent} />
                    <Text style={styles.footerLoadingText}>正在加载更多照片...</Text>
                  </View>
                ) : null
              }
            />
          )}
        </View>

        <View
          style={[
            styles.footer,
            {
              paddingBottom: Math.max(insets.bottom + 24, 24),
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`开始整理 ${selectedAssets.length} 张`}
            onPress={() => {
              void onConfirm(selectedAssets);
            }}
            disabled={selectedAssets.length === 0 || confirmLoading}
            style={({ pressed }) => [
              styles.confirmButton,
              pressed && styles.pressed,
              (selectedAssets.length === 0 || confirmLoading) && styles.confirmButtonDisabled,
            ]}
          >
            {confirmLoading ? (
              <ActivityIndicator color={JourneyPalette.white} />
            ) : (
              <Text style={styles.confirmButtonText}>{`开始整理 ${selectedAssets.length} 张`}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

export function PhotoLibraryPickerModal({
  visible,
  maxSelection,
  confirmLoading,
  permissionContext,
  onClose,
  onConfirm,
}: PhotoLibraryPickerModalProps) {
  if (!visible) {
    return null;
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <PhotoLibraryPickerScreen
        maxSelection={maxSelection}
        confirmLoading={confirmLoading}
        permissionContext={permissionContext}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: JourneyPalette.background,
  },
  dismissButton: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: JourneyPalette.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  title: {
    color: JourneyPalette.ink,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  subtitle: {
    marginTop: 4,
    color: JourneyPalette.inkSoft,
    fontSize: 14,
    fontWeight: '600',
  },
  toolbarWrap: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 24,
    backgroundColor: JourneyPalette.surfaceVariant,
    padding: 12,
  },
  pill: {
    borderRadius: 999,
    backgroundColor: JourneyPalette.background,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  pillActive: {
    backgroundColor: JourneyPalette.ink,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '900',
    color: JourneyPalette.ink,
  },
  pillTextActive: {
    color: JourneyPalette.white,
  },
  pillTextMuted: {
    color: JourneyPalette.muted,
  },
  gridArea: {
    flex: 1,
    minHeight: 0,
  },
  stateBlock: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 12,
    justifyContent: 'center',
  },
  loadingState: {
    alignItems: 'center',
    gap: 12,
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
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  confirmButton: {
    height: 64,
    borderRadius: 20,
    backgroundColor: JourneyPalette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.4,
  },
  confirmButtonText: {
    color: JourneyPalette.white,
    fontSize: 18,
    fontWeight: '900',
  },
  disabledAction: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
});
