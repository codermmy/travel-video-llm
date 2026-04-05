import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Image, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GestureDetector } from 'react-native-gesture-handler';
import { useDragSelect } from '@osamaq/drag-select';
import Animated, { useAnimatedRef, useAnimatedScrollHandler } from 'react-native-reanimated';

import { JourneyPalette } from '@/styles/colors';

const DEFAULT_COLUMNS = 3;
const DEFAULT_GRID_GAP = 8;
const DEFAULT_GRID_HORIZONTAL_PADDING = 2;
const DEFAULT_GRID_BOTTOM_PADDING = 8;
const LONG_PRESS_DURATION_MS = 180;
const AUTO_SCROLL_START_THRESHOLD = 0.12;
const AUTO_SCROLL_END_THRESHOLD = 0.88;
const AUTO_SCROLL_MAX_VELOCITY = 16;
const DOUBLE_TAP_WINDOW_MS = 280;

export type SelectableMediaGridItem = {
  id: string;
  key?: string;
  uri: string | null;
};

type BrowseTapBehavior = 'open' | 'select' | 'select-or-open-on-double';

type SelectableMediaGridVariant = 'default' | 'photo-manager';

type SelectableMediaGridProps = {
  items: SelectableMediaGridItem[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  emptyText: string;
  maxSelection?: number;
  header?: ReactNode;
  footer?: ReactNode;
  onEndReached?: () => void;
  onItemPress?: (item: SelectableMediaGridItem, index: number) => void;
  browseTapBehavior?: BrowseTapBehavior;
  variant?: SelectableMediaGridVariant;
};

type DragSelectableItem = SelectableMediaGridItem & {
  dragId: string;
};

type MediaTileProps = {
  item: SelectableMediaGridItem;
  size: number;
  selected: boolean;
  variant: SelectableMediaGridVariant;
  gap: number;
};

const MediaTile = memo(function MediaTile({ item, size, selected, variant, gap }: MediaTileProps) {
  const isPhotoManagerVariant = variant === 'photo-manager';

  return (
    <View
      style={[
        styles.tile,
        !isPhotoManagerVariant && selected && styles.tileSelected,
        isPhotoManagerVariant ? styles.photoManagerTile : styles.defaultTile,
        { width: size, height: size, marginBottom: gap },
      ]}
    >
      <Image source={{ uri: item.uri ?? undefined }} style={styles.tileImage} />
      <View
        style={[
          styles.tileOverlay,
          isPhotoManagerVariant && styles.photoManagerTileOverlay,
          selected &&
            (isPhotoManagerVariant
              ? styles.photoManagerTileOverlaySelected
              : styles.tileOverlaySelected),
        ]}
      />
      {selected ? (
        <View
          style={[
            isPhotoManagerVariant ? styles.photoManagerCheckBadge : styles.checkBadge,
            styles.checkBadgeSelected,
          ]}
        >
          <MaterialCommunityIcons name="check-bold" size={12} color={JourneyPalette.white} />
        </View>
      ) : null}
    </View>
  );
});

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((value, index) => value === b[index]);
}

export function SelectableMediaGrid({
  items,
  selectedIds,
  onSelectionChange,
  emptyText,
  maxSelection,
  header,
  footer,
  onEndReached,
  onItemPress,
  browseTapBehavior = 'open',
  variant = 'default',
}: SelectableMediaGridProps) {
  const animatedListRef = useAnimatedRef<FlatList<DragSelectableItem>>();
  const selectedIdsRef = useRef(selectedIds);
  const ignoredSelectedDragIdsRef = useRef<Set<string>>(new Set());
  const ignoredDeselectedDragIdsRef = useRef<Set<string>>(new Set());
  const selectionApiRef = useRef<{
    add: (id: string) => void;
    clear: () => void;
    delete: (id: string) => void;
    has: (id: string) => boolean;
  } | null>(null);
  const lastTapRef = useRef<{ itemId: string; at: number } | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    if (!footer && footerHeight !== 0) {
      setFooterHeight(0);
    }
  }, [footer, footerHeight]);

  const gridLayout = useMemo(
    () =>
      variant === 'photo-manager'
        ? {
            columns: 4,
            gap: 2,
            horizontalPadding: 2,
            bottomPadding: 2,
          }
        : {
            columns: DEFAULT_COLUMNS,
            gap: DEFAULT_GRID_GAP,
            horizontalPadding: DEFAULT_GRID_HORIZONTAL_PADDING,
            bottomPadding: DEFAULT_GRID_BOTTOM_PADDING,
          },
    [variant],
  );

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const tileSize = useMemo(() => {
    if (containerWidth <= 0) {
      return 0;
    }

    return Math.floor(
      (containerWidth -
        gridLayout.horizontalPadding * 2 -
        gridLayout.gap * (gridLayout.columns - 1)) /
        gridLayout.columns,
    );
  }, [containerWidth, gridLayout]);

  const dragItems = useMemo<DragSelectableItem[]>(
    () =>
      items.map((item, index) => ({
        ...item,
        dragId: item.key ?? `${item.id}:${index}`,
      })),
    [items],
  );

  const dragItemById = useMemo(
    () => new Map(dragItems.map((item) => [item.dragId, item])),
    [dragItems],
  );

  const updateSelection = useCallback(
    (updater: (previous: string[]) => string[]) => {
      const previous = selectedIdsRef.current;
      const next = updater(previous);

      if (arraysEqual(previous, next)) {
        return;
      }

      selectedIdsRef.current = next;
      onSelectionChange(next);
    },
    [onSelectionChange],
  );

  const toggleSelection = useCallback(
    (itemId: string) => {
      updateSelection((previous) => {
        if (previous.includes(itemId)) {
          return previous.filter((selectedId) => selectedId !== itemId);
        }

        if (maxSelection && previous.length >= maxSelection) {
          return previous;
        }

        return [...previous, itemId];
      });
    },
    [maxSelection, updateSelection],
  );

  const dragSelect = useDragSelect({
    data: dragItems,
    key: 'dragId',
    list: {
      animatedRef: animatedListRef,
      numColumns: gridLayout.columns,
      itemSize: {
        width: tileSize,
        height: tileSize,
      },
      contentInset: {
        left: gridLayout.horizontalPadding,
        right: gridLayout.horizontalPadding,
        bottom: gridLayout.bottomPadding + footerHeight,
      },
      rowGap: gridLayout.gap,
      columnGap: gridLayout.gap,
    },
    longPressGesture: {
      enabled: true,
      minDurationMs: LONG_PRESS_DURATION_MS,
    },
    panGesture: {
      scrollEnabled: true,
      resetSelectionOnStart: false,
      scrollStartThreshold: AUTO_SCROLL_START_THRESHOLD,
      scrollEndThreshold: AUTO_SCROLL_END_THRESHOLD,
      scrollStartMaxVelocity: AUTO_SCROLL_MAX_VELOCITY,
      scrollEndMaxVelocity: AUTO_SCROLL_MAX_VELOCITY,
    },
    tapGesture: {
      selectOnTapEnabled: true,
    },
    onItemPress: (dragId: string, index: number) => {
      const item = dragItemById.get(dragId);
      if (!item) {
        return;
      }

      if (browseTapBehavior === 'select') {
        toggleSelection(item.id);
        return;
      }

      if (browseTapBehavior === 'select-or-open-on-double') {
        const now = Date.now();
        if (
          lastTapRef.current &&
          lastTapRef.current.itemId === item.id &&
          now - lastTapRef.current.at <= DOUBLE_TAP_WINDOW_MS
        ) {
          lastTapRef.current = null;
          onItemPress?.(item, index);
          return;
        }

        lastTapRef.current = { itemId: item.id, at: now };
        toggleSelection(item.id);
        return;
      }

      onItemPress?.(item, index);
    },
    onItemSelected: (dragId: string) => {
      if (ignoredSelectedDragIdsRef.current.delete(dragId)) {
        return;
      }

      const item = dragItemById.get(dragId);
      if (!item) {
        return;
      }

      if (selectedIdsRef.current.includes(item.id)) {
        return;
      }

      if (maxSelection && selectedIdsRef.current.length >= maxSelection) {
        ignoredDeselectedDragIdsRef.current.add(dragId);
        selectionApiRef.current?.delete(dragId);
        return;
      }

      updateSelection((previous) => [...previous, item.id]);
    },
    onItemDeselected: (dragId: string) => {
      if (ignoredDeselectedDragIdsRef.current.delete(dragId)) {
        return;
      }

      const item = dragItemById.get(dragId);
      if (!item) {
        return;
      }

      updateSelection((previous) => previous.filter((selectedId) => selectedId !== item.id));
    },
  });

  useEffect(() => {
    selectionApiRef.current = dragSelect.selection;
  }, [dragSelect.selection]);

  useEffect(() => {
    if (dragItems.length === 0 || selectedIds.length === 0) {
      dragSelect.selection.clear();
      return;
    }

    const desiredDragIds = new Set(
      dragItems.filter((item) => selectedIdSet.has(item.id)).map((item) => item.dragId),
    );

    dragItems.forEach((item) => {
      const selectedInLibrary = dragSelect.selection.has(item.dragId);
      const selectedInParent = desiredDragIds.has(item.dragId);

      if (selectedInParent && !selectedInLibrary) {
        ignoredSelectedDragIdsRef.current.add(item.dragId);
        dragSelect.selection.add(item.dragId);
      } else if (!selectedInParent && selectedInLibrary) {
        ignoredDeselectedDragIdsRef.current.add(item.dragId);
        dragSelect.selection.delete(item.dragId);
      }
    });
  }, [dragItems, dragSelect.selection, selectedIdSet, selectedIds.length]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: dragSelect.onScroll,
  });

  const renderFooter = useCallback(() => {
    if (!footer) {
      return null;
    }

    return (
      <View
        onLayout={(event) => {
          setFooterHeight(event.nativeEvent.layout.height);
        }}
      >
        {footer}
      </View>
    );
  }, [footer]);

  const renderItem = useCallback(
    ({ item, index }: { item: DragSelectableItem; index: number }) => (
      <GestureDetector gesture={dragSelect.gestures.createItemPressHandler(item.dragId, index)}>
        <View>
          <MediaTile
            item={item}
            size={tileSize}
            selected={selectedIdSet.has(item.id)}
            variant={variant}
            gap={gridLayout.gap}
          />
        </View>
      </GestureDetector>
    ),
    [dragSelect.gestures, gridLayout.gap, selectedIdSet, tileSize, variant],
  );

  const handleContainerLayout = useCallback((event: LayoutChangeEvent) => {
    setContainerWidth(event.nativeEvent.layout.width);
  }, []);

  if (items.length === 0) {
    return (
      <View style={styles.container}>
        {header ? <View>{header}</View> : null}
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="image-off-outline" size={22} color={JourneyPalette.muted} />
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
        {footer ? <View>{footer}</View> : null}
      </View>
    );
  }

  return (
    <View style={styles.container} onLayout={handleContainerLayout}>
      {header ? <View>{header}</View> : null}
      <GestureDetector gesture={dragSelect.gestures.panHandler}>
        <Animated.FlatList
          ref={animatedListRef}
          style={styles.list}
          data={dragItems}
          numColumns={gridLayout.columns}
          renderItem={renderItem}
          keyExtractor={(item) => item.dragId}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          contentContainerStyle={[
            styles.contentContainer,
            {
              paddingHorizontal: gridLayout.horizontalPadding,
              paddingBottom: gridLayout.bottomPadding,
            },
          ]}
          columnWrapperStyle={{ gap: gridLayout.gap }}
          ListFooterComponent={renderFooter}
        />
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
  list: {
    flex: 1,
  },
  contentContainer: {},
  tile: {
    overflow: 'hidden',
    backgroundColor: JourneyPalette.cardMuted,
  },
  defaultTile: {
    borderRadius: 14,
  },
  photoManagerTile: {
    borderRadius: 0,
  },
  tileSelected: {
    borderWidth: 4,
    borderColor: JourneyPalette.accent,
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  tileOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.04)',
  },
  photoManagerTileOverlay: {
    backgroundColor: 'transparent',
  },
  tileOverlaySelected: {
    backgroundColor: 'transparent',
  },
  photoManagerTileOverlaySelected: {
    backgroundColor: 'rgba(2, 6, 23, 0.14)',
  },
  checkBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadgeSelected: {
    backgroundColor: JourneyPalette.accent,
  },
  photoManagerCheckBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
  },
  emptyText: {
    textAlign: 'center',
    lineHeight: 20,
    color: JourneyPalette.inkSoft,
  },
});
