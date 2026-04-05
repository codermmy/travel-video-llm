import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Image, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GestureDetector } from 'react-native-gesture-handler';
import { useDragSelect } from '@osamaq/drag-select';
import Animated, { useAnimatedRef, useAnimatedScrollHandler } from 'react-native-reanimated';

import { JourneyPalette } from '@/styles/colors';

const COLUMNS = 3;
const GRID_GAP = 8;
const GRID_HORIZONTAL_PADDING = 2;
const GRID_BOTTOM_PADDING = 8;
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
};

type DragSelectableItem = SelectableMediaGridItem & {
  dragId: string;
};

type MediaTileProps = {
  item: SelectableMediaGridItem;
  size: number;
  selected: boolean;
};

const MediaTile = memo(function MediaTile({ item, size, selected }: MediaTileProps) {
  return (
    <View style={[styles.tile, { width: size, height: size }]}>
      <Image source={{ uri: item.uri ?? undefined }} style={styles.tileImage} />
      <View style={[styles.tileOverlay, selected && styles.tileOverlaySelected]} />
      <View style={[styles.checkBadge, selected && styles.checkBadgeSelected]}>
        <MaterialCommunityIcons
          name={selected ? 'check-bold' : 'plus'}
          size={14}
          color={selected ? '#FFF9F2' : JourneyPalette.ink}
        />
      </View>
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

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const tileSize = useMemo(() => {
    if (containerWidth <= 0) {
      return 0;
    }

    return Math.floor(
      (containerWidth - GRID_HORIZONTAL_PADDING * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS,
    );
  }, [containerWidth]);

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
      numColumns: COLUMNS,
      itemSize: {
        width: tileSize,
        height: tileSize,
      },
      contentInset: {
        left: GRID_HORIZONTAL_PADDING,
        right: GRID_HORIZONTAL_PADDING,
        bottom: GRID_BOTTOM_PADDING + footerHeight,
      },
      rowGap: GRID_GAP,
      columnGap: GRID_GAP,
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
          <MediaTile item={item} size={tileSize} selected={selectedIdSet.has(item.id)} />
        </View>
      </GestureDetector>
    ),
    [dragSelect.gestures, selectedIdSet, tileSize],
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
          numColumns={COLUMNS}
          renderItem={renderItem}
          keyExtractor={(item) => item.dragId}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          contentContainerStyle={styles.contentContainer}
          columnWrapperStyle={styles.columnWrapper}
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
  contentContainer: {
    paddingHorizontal: GRID_HORIZONTAL_PADDING,
    paddingBottom: GRID_BOTTOM_PADDING,
  },
  columnWrapper: {
    gap: GRID_GAP,
  },
  tile: {
    marginBottom: GRID_GAP,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#E8E2D7',
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  tileOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(23, 33, 42, 0.08)',
  },
  tileOverlaySelected: {
    backgroundColor: 'rgba(37, 93, 88, 0.32)',
  },
  checkBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(33, 45, 56, 0.16)',
    backgroundColor: 'rgba(255, 249, 242, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadgeSelected: {
    borderColor: 'rgba(255, 249, 242, 0.18)',
    backgroundColor: JourneyPalette.accent,
  },
  emptyState: {
    flex: 1,
    minHeight: 220,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
  emptyText: {
    textAlign: 'center',
    lineHeight: 20,
    color: JourneyPalette.inkSoft,
  },
});
