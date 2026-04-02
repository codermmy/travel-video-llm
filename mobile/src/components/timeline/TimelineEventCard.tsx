import { Image, Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from 'react-native-paper';

import { JourneyPalette } from '@/styles/colors';
import type { EventRecord } from '@/types/event';
import { getPreferredEventCoverUri } from '@/utils/mediaRefs';

type TimelineEventCardProps = {
  event: EventRecord;
  isLastInSection: boolean;
  onPress: (eventId: string) => void;
  onLongPress?: (event: EventRecord) => void;
};

function formatDateRange(event: EventRecord): string {
  const start = event.startTime ? new Date(event.startTime) : null;
  const end = event.endTime ? new Date(event.endTime) : null;
  const fmt = (d: Date) =>
    d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' });

  if (start && end) {
    return `${fmt(start)} - ${fmt(end)}`;
  }
  if (start) {
    return fmt(start);
  }
  if (end) {
    return fmt(end);
  }
  return '时间未知';
}

export function TimelineEventCard({
  event,
  isLastInSection,
  onPress,
  onLongPress,
}: TimelineEventCardProps) {
  const title = event.title?.trim() ? event.title : '未命名事件';
  const location = event.locationName || '地点待补充';
  const coverUri = getPreferredEventCoverUri(event);

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => onPress(event.id)}
      onLongPress={() => onLongPress?.(event)}
      delayLongPress={240}
    >
      <View style={styles.axisWrap}>
        <View style={styles.dot} />
        {!isLastInSection ? <View style={styles.line} /> : null}
      </View>

      <View style={styles.card}>
        <View style={styles.cardTopRow}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {event.storyFreshness === 'stale' ? (
            <View style={styles.staleBadge}>
              <Text style={styles.staleText}>待更新</Text>
            </View>
          ) : null}
          <MaterialCommunityIcons name="chevron-right" size={18} color={JourneyPalette.muted} />
        </View>

        <View style={styles.metaRow}>
          <MaterialCommunityIcons
            name="calendar-month-outline"
            size={14}
            color={JourneyPalette.inkSoft}
          />
          <Text numberOfLines={1} style={styles.metaText}>
            {formatDateRange(event)}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <MaterialCommunityIcons
            name="map-marker-outline"
            size={14}
            color={JourneyPalette.inkSoft}
          />
          <Text numberOfLines={1} style={styles.metaText}>
            {location}
          </Text>
        </View>

        <View style={styles.thumbsRow}>
          {coverUri ? (
            <Image source={{ uri: coverUri }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={['#F3EADA', '#E6EFE8']}
              style={[styles.thumb, styles.thumbPlaceholder]}
            >
              <MaterialCommunityIcons name="image-outline" size={18} color={JourneyPalette.muted} />
            </LinearGradient>
          )}
          <View style={styles.countBadge}>
            <Text style={styles.countText}>共 {event.photoCount} 张</Text>
          </View>
          <View style={styles.versionBadge}>
            <Text style={styles.versionText}>版本 {event.eventVersion}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  rowPressed: {
    opacity: 0.9,
  },
  axisWrap: {
    width: 22,
    alignItems: 'center',
    paddingTop: 16,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: JourneyPalette.accent,
    borderWidth: 2,
    borderColor: '#DCE7FF',
    zIndex: 2,
  },
  line: {
    marginTop: 3,
    width: 2,
    flex: 1,
    borderRadius: 999,
    backgroundColor: '#D8E3FA',
    minHeight: 70,
  },
  card: {
    flex: 1,
    backgroundColor: JourneyPalette.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    padding: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  staleBadge: {
    borderRadius: 999,
    backgroundColor: JourneyPalette.warningSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  staleText: {
    color: JourneyPalette.warning,
    fontSize: 10,
    fontWeight: '700',
  },
  metaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    flex: 1,
    color: JourneyPalette.inkSoft,
    fontSize: 12,
    fontWeight: '500',
  },
  thumbsRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  thumb: {
    width: 58,
    height: 58,
    borderRadius: 12,
    backgroundColor: '#DFE6F5',
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadge: {
    backgroundColor: '#EFF3FF',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  countText: {
    color: '#3A58AF',
    fontSize: 11,
    fontWeight: '700',
  },
  versionBadge: {
    marginLeft: 'auto',
    backgroundColor: JourneyPalette.cardAlt,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  versionText: {
    color: JourneyPalette.inkSoft,
    fontSize: 11,
    fontWeight: '700',
  },
});
