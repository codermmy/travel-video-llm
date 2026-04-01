import { Image, Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from 'react-native-paper';

import type { EventRecord } from '@/types/event';
import { getPreferredEventCoverUri } from '@/utils/mediaRefs';

type TimelineEventCardProps = {
  event: EventRecord;
  isLastInSection: boolean;
  onPress: (eventId: string) => void;
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

function buildThumbnailUris(event: EventRecord): (string | null)[] {
  const coverUri = getPreferredEventCoverUri(event);
  if (!coverUri) {
    return [null, null, null];
  }
  return [coverUri, null, null];
}

export function TimelineEventCard({ event, isLastInSection, onPress }: TimelineEventCardProps) {
  const title = event.title?.trim() ? event.title : '未命名事件';
  const location = event.locationName || '地点待补充';
  const thumbnails = buildThumbnailUris(event);

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => onPress(event.id)}
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
          <MaterialCommunityIcons name="chevron-right" size={18} color="#97A3C2" />
        </View>

        <View style={styles.metaRow}>
          <MaterialCommunityIcons name="calendar-month-outline" size={14} color="#5D6B8A" />
          <Text numberOfLines={1} style={styles.metaText}>
            {formatDateRange(event)}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={14} color="#5D6B8A" />
          <Text numberOfLines={1} style={styles.metaText}>
            {location}
          </Text>
        </View>

        <View style={styles.thumbsRow}>
          {thumbnails.map((uri, index) =>
            uri ? (
              <Image key={`${event.id}-thumb-${index}`} source={{ uri }} style={styles.thumb} />
            ) : (
              <LinearGradient
                key={`${event.id}-thumb-${index}`}
                colors={['#ECF2FF', '#EEF9F6']}
                style={styles.thumbPlaceholder}
              >
                <MaterialCommunityIcons name="image-outline" size={15} color="#7B89A8" />
              </LinearGradient>
            ),
          )}
          <View style={styles.countBadge}>
            <Text style={styles.countText}>共 {event.photoCount} 张</Text>
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
    backgroundColor: '#2F6AF6',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5ECFB',
    padding: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: '#1D2846',
  },
  metaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    flex: 1,
    color: '#5D6987',
    fontSize: 12,
    fontWeight: '500',
  },
  thumbsRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumb: {
    width: 46,
    height: 46,
    borderRadius: 10,
    marginRight: 6,
    backgroundColor: '#DFE6F5',
  },
  thumbPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 10,
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadge: {
    marginLeft: 'auto',
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
});
