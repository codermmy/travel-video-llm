import { useCallback, useMemo, useRef } from 'react';
import {
  Animated,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { JourneyPalette } from '@/styles/colors';
import type { EventRecord } from '@/types/event';
import { getPreferredEventCoverUri } from '@/utils/mediaRefs';
import { getCompactLocationText, getReadableLocationText } from '@/utils/locationDisplay';

type EventCardListProps = {
  events: EventRecord[];
  onPressDetails: (eventId: string) => void;
  onClose: () => void;
};

function formatDate(dateString?: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function buildDateRange(event: EventRecord): string {
  if (!event.startTime) {
    return '时间待补充';
  }
  const start = formatDate(event.startTime);
  const end = event.endTime ? formatDate(event.endTime) : '';
  return end ? `${start} - ${end}` : start;
}

function getClusterTitle(events: EventRecord[]): string {
  const firstLocation = events.map((event) => getReadableLocationText(event)).find(Boolean);
  if (firstLocation) {
    return `${firstLocation} 附近的回忆`;
  }
  return '这个地点附近的回忆';
}

export function EventCardList({ events, onPressDetails, onClose }: EventCardListProps) {
  const isSingle = events.length === 1;
  const title = getClusterTitle(events);
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const sortedEvents = useMemo(
    () =>
      [...events].sort((left, right) => {
        const leftTime = new Date(left.updatedAt || left.endTime || left.startTime || 0).getTime();
        const rightTime = new Date(
          right.updatedAt || right.endTime || right.startTime || 0,
        ).getTime();
        return rightTime - leftTime;
      }),
    [events],
  );

  const resetCardPosition = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 120,
        friction: 14,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  const dismissCard = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 140,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) {
        return;
      }
      translateY.setValue(0);
      opacity.setValue(1);
      onClose();
    });
  }, [onClose, opacity, translateY]);

  const handlePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          gestureState.dy > 6 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderMove: (_, gestureState) => {
          translateY.setValue(Math.max(0, Math.min(gestureState.dy, 140)));
          opacity.setValue(Math.max(0.6, 1 - gestureState.dy / 220));
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy > 60 || gestureState.vy > 0.9) {
            dismissCard();
            return;
          }
          resetCardPosition();
        },
        onPanResponderTerminate: resetCardPosition,
      }),
    [dismissCard, opacity, resetCardPosition, translateY],
  );

  if (isSingle) {
    const event = sortedEvents[0];
    const coverUri = getPreferredEventCoverUri(event);
    const locationText = getCompactLocationText(event);

    return (
      <Animated.View style={[styles.container, { opacity, transform: [{ translateY }] }]}>
        <View style={styles.handleTouchArea} {...handlePanResponder.panHandlers}>
          <View style={styles.handle} />
        </View>
        <View style={styles.singleCard}>
          <View style={styles.singleCoverWrap}>
            {coverUri ? (
              <Image source={{ uri: coverUri }} style={styles.singleCover} resizeMode="cover" />
            ) : (
              <View style={[styles.singleCover, styles.coverFallback]}>
                <Ionicons name="image-outline" size={22} color={JourneyPalette.muted} />
              </View>
            )}
          </View>

          <View style={styles.singleInfo}>
            <View style={styles.singleTitleRow}>
              <Text numberOfLines={1} style={styles.singleTitle}>
                {event.title || '未命名事件'}
              </Text>
            </View>
            <Text numberOfLines={1} style={styles.singleMeta}>
              {buildDateRange(event)} · {event.photoCount} 张照片
            </Text>
            <View style={styles.singleBottomRow}>
              <View style={styles.singleLocationRow}>
                <Ionicons
                  name="location-outline"
                  size={14}
                  color={locationText ? JourneyPalette.accent : JourneyPalette.muted}
                />
                <Text numberOfLines={1} style={styles.singleLocationText}>
                  {locationText || '地点待补充'}
                </Text>
              </View>
              <Pressable
                style={styles.singleActionPrimary}
                onPress={() => onPressDetails(event.id)}
              >
                <Text style={styles.singleActionPrimaryText}>进入详情</Text>
                <Ionicons name="chevron-forward" size={16} color={JourneyPalette.white} />
              </Pressable>
            </View>
          </View>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity, transform: [{ translateY }] }]}>
      <View style={styles.handleTouchArea} {...handlePanResponder.panHandlers}>
        <View style={styles.handle} />
      </View>

      <View style={styles.listHeader}>
        <View style={styles.listHeaderCopy}>
          <Text style={styles.listHeaderTitle}>{title}</Text>
          <Text style={styles.listHeaderMeta}>{sortedEvents.length} 个事件</Text>
        </View>
      </View>

      <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
        {sortedEvents.map((event, index) => {
          const coverUri = getPreferredEventCoverUri(event);

          return (
            <Pressable
              key={event.id}
              style={({ pressed }) => [
                styles.listRow,
                index === sortedEvents.length - 1 && styles.listRowLast,
                pressed && styles.listRowPressed,
              ]}
              onPress={() => onPressDetails(event.id)}
            >
              <View style={styles.rowThumbWrap}>
                {coverUri ? (
                  <Image source={{ uri: coverUri }} style={styles.rowThumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.rowThumb, styles.coverFallback]}>
                    <Ionicons name="image-outline" size={16} color={JourneyPalette.muted} />
                  </View>
                )}
              </View>

              <View style={styles.rowInfo}>
                <Text numberOfLines={1} style={styles.rowTitle}>
                  {event.title || '未命名事件'}
                </Text>
                <Text numberOfLines={1} style={styles.rowMeta}>
                  {buildDateRange(event)} · {event.photoCount} 张照片
                </Text>
              </View>

              <View style={styles.rowEnter}>
                <Text style={styles.rowEnterText}>进入</Text>
                <Ionicons name="chevron-forward" size={16} color={JourneyPalette.accent} />
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    borderRadius: 36,
    borderWidth: 0,
    backgroundColor: '#FFFFFF',
    shadowColor: JourneyPalette.shadow,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.1,
    shadowRadius: 30,
    elevation: 12,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginTop: 12,
    marginBottom: 12,
  },
  handleTouchArea: {
    paddingTop: 4,
  },
  singleCard: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  singleCoverWrap: {
    width: 100,
    height: 120,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: JourneyPalette.surfaceVariant,
  },
  singleCover: {
    width: '100%',
    height: '100%',
  },
  singleInfo: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  singleTitleRow: {
    gap: 4,
  },
  singleTitle: {
    color: JourneyPalette.ink,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  singleMeta: {
    color: JourneyPalette.muted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  singleBottomRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  singleLocationRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  singleLocationText: {
    flex: 1,
    color: JourneyPalette.inkSoft,
    fontSize: 13,
    fontWeight: '600',
  },
  singleActionPrimary: {
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: JourneyPalette.ink,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 18,
  },
  singleActionPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  listHeader: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listHeaderCopy: {
    flex: 1,
  },
  listHeaderTitle: {
    color: JourneyPalette.ink,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  listHeaderMeta: {
    marginTop: 2,
    color: JourneyPalette.muted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  listScroll: {
    maxHeight: 320,
  },
  listRow: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.04)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFFFF',
  },
  listRowPressed: {
    backgroundColor: JourneyPalette.surfaceVariant,
  },
  listRowLast: {
    borderBottomWidth: 0,
  },
  rowThumbWrap: {
    width: 64,
    height: 64,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: JourneyPalette.surfaceVariant,
  },
  rowThumb: {
    width: '100%',
    height: '100%',
  },
  coverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    color: JourneyPalette.ink,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  rowMeta: {
    color: JourneyPalette.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  rowEnter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  rowEnterText: {
    color: JourneyPalette.accent,
    fontSize: 13,
    fontWeight: '800',
  },
});
