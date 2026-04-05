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
import { getCompactLocationText } from '@/utils/locationDisplay';

type EventCardListProps = {
  events: EventRecord[];
  onPressDetails: (eventId: string) => void;
  onClose: () => void;
};

function formatDateLabel(dateString?: string | null): string {
  if (!dateString) {
    return '未知日期';
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return '未知日期';
  }

  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${month}月${day}日`;
}

function buildRowMeta(event: EventRecord): string {
  return `${formatDateLabel(event.startTime || event.endTime)} · ${event.photoCount ?? 0}张照片`;
}

function getClusterTitle(events: EventRecord[]): string {
  const districtLabel = events.map((event) => getCompactLocationText(event)).find(Boolean);
  if (districtLabel) {
    return `${districtLabel}附近的回忆`;
  }
  return '附近的回忆';
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

    return (
      <Animated.View style={[styles.container, { opacity, transform: [{ translateY }] }]}>
        <View style={styles.handleTouchArea} {...handlePanResponder.panHandlers}>
          <View style={styles.handle} />
        </View>
        <View style={styles.listHeader}>
          <Text numberOfLines={1} style={styles.listHeaderTitle}>
            {title}
          </Text>
        </View>

        <View style={styles.listContent}>
          <Pressable
            style={({ pressed }) => [styles.listRow, pressed && styles.listRowPressed]}
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
                {event.title || '未命名回忆'}
              </Text>
              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                numberOfLines={1}
                style={styles.rowMeta}
              >
                {buildRowMeta(event)}
              </Text>
            </View>

            <View style={styles.rowEnter}>
              <Text style={styles.rowEnterText}>详情</Text>
              <Ionicons name="chevron-forward" size={14} color={JourneyPalette.accent} />
            </View>
          </Pressable>
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
        <Text numberOfLines={1} style={styles.listHeaderTitle}>
          {title}
        </Text>
      </View>

      <ScrollView
        style={styles.listScroll}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
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
                  {event.title || '未命名回忆'}
                </Text>
                <Text
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                  numberOfLines={1}
                  style={styles.rowMeta}
                >
                  {buildRowMeta(event)}
                </Text>
              </View>

              <View style={styles.rowEnter}>
                <Text style={styles.rowEnterText}>详情</Text>
                <Ionicons name="chevron-forward" size={14} color={JourneyPalette.accent} />
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
    borderRadius: 32,
    borderWidth: 0,
    backgroundColor: JourneyPalette.white,
    shadowColor: JourneyPalette.shadow,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.15,
    shadowRadius: 30,
    elevation: 12,
    overflow: 'hidden',
    padding: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
  },
  handleTouchArea: {
    paddingBottom: 12,
  },
  listHeader: {
    paddingTop: 4,
    paddingHorizontal: 12,
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  listHeaderTitle: {
    color: JourneyPalette.ink,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  listScroll: {
    maxHeight: 320,
  },
  listContent: {
    gap: 4,
  },
  listRow: {
    paddingHorizontal: 4,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: JourneyPalette.white,
    borderRadius: 18,
  },
  listRowPressed: {
    backgroundColor: JourneyPalette.surfaceVariant,
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  listRowLast: {
    borderBottomWidth: 0,
  },
  rowThumbWrap: {
    width: 64,
    height: 64,
    borderRadius: 14,
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
    gap: 2,
    minWidth: 0,
  },
  rowTitle: {
    color: JourneyPalette.ink,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  rowMeta: {
    color: JourneyPalette.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  rowEnter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rowEnterText: {
    color: JourneyPalette.accent,
    fontSize: 12,
    fontWeight: '900',
  },
});
