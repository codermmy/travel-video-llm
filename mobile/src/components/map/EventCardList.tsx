import { useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { StateChip } from '@/components/ui/revamp';
import { JourneyPalette } from '@/styles/colors';
import type { EventRecord } from '@/types/event';
import { getEventStatusMeta } from '@/utils/eventStatus';
import { getPreferredEventCoverUri } from '@/utils/mediaRefs';

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
  const firstLocation = events.find((event) => event.locationName?.trim())?.locationName?.trim();
  if (firstLocation) {
    return `${firstLocation} 附近的回忆`;
  }
  return '这个地点附近的回忆';
}

export function EventCardList({ events, onPressDetails, onClose }: EventCardListProps) {
  const isSingle = events.length === 1;
  const title = getClusterTitle(events);

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

  if (isSingle) {
    const event = sortedEvents[0];
    const statusMeta = getEventStatusMeta(event);
    const coverUri = getPreferredEventCoverUri(event);

    return (
      <View style={styles.container}>
        <View style={styles.handle} />
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
              <StateChip state={statusMeta.tone} label={statusMeta.label} compact />
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
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.handle} />

      <View style={styles.listHeader}>
        <View style={styles.listHeaderCopy}>
          <Text style={styles.listHeaderTitle}>{title}</Text>
          <Text style={styles.listHeaderMeta}>{sortedEvents.length} 个事件</Text>
        </View>
      </View>

      <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
        {sortedEvents.map((event, index) => {
          const coverUri = getPreferredEventCoverUri(event);
          const statusMeta = getEventStatusMeta(event);

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
                <StateChip state={statusMeta.tone} label={statusMeta.label} compact />
              </View>

              <View style={styles.rowEnter}>
                <Text style={styles.rowEnterText}>进入</Text>
                <Ionicons name="chevron-forward" size={16} color={JourneyPalette.accent} />
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 16,
    left: 14,
    right: 14,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.overlay,
    shadowColor: JourneyPalette.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 9,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: JourneyPalette.lineStrong,
    marginTop: 10,
    marginBottom: 10,
  },
  singleCard: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  singleCoverWrap: {
    width: 96,
    height: 116,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: JourneyPalette.cardSoft,
  },
  singleCover: {
    width: '100%',
    height: '100%',
  },
  singleInfo: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 8,
  },
  singleTitleRow: {
    gap: 6,
  },
  singleTitle: {
    color: JourneyPalette.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  singleMeta: {
    color: JourneyPalette.inkSoft,
    fontSize: 12,
  },
  singleBottomRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  singleActionPrimary: {
    minHeight: 36,
    borderRadius: 999,
    backgroundColor: JourneyPalette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 14,
  },
  singleActionPrimaryText: {
    color: JourneyPalette.white,
    fontSize: 13,
    fontWeight: '800',
  },
  listHeader: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  listHeaderCopy: {
    flex: 1,
  },
  listHeaderTitle: {
    color: JourneyPalette.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  listHeaderMeta: {
    marginTop: 3,
    color: JourneyPalette.inkSoft,
    fontSize: 12,
  },
  listScroll: {
    maxHeight: 290,
  },
  listRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: JourneyPalette.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: JourneyPalette.card,
  },
  listRowPressed: {
    backgroundColor: JourneyPalette.cardMuted,
  },
  listRowLast: {
    borderBottomWidth: 0,
  },
  rowThumbWrap: {
    width: 60,
    height: 60,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: JourneyPalette.cardSoft,
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
    fontSize: 15,
    fontWeight: '800',
  },
  rowMeta: {
    color: JourneyPalette.inkSoft,
    fontSize: 12,
  },
  rowEnter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  rowEnterText: {
    color: JourneyPalette.accent,
    fontSize: 12,
    fontWeight: '700',
  },
});
