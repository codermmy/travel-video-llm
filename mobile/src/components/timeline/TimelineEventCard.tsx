import { Image, Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from 'react-native-paper';

import { JourneyPalette } from '@/styles/colors';
import type { EventRecord } from '@/types/event';
import { getPreferredEventCoverUri } from '@/utils/mediaRefs';
import { getEventStatusMeta } from '@/utils/eventStatus';

type TimelineEventCardProps = {
  event: EventRecord;
  isLastInSection: boolean;
  onPress: (eventId: string) => void;
  onLongPress?: (event: EventRecord) => void;
};

function formatDateRange(event: EventRecord): string {
  const start = event.startTime ? new Date(event.startTime) : null;
  const end = event.endTime ? new Date(event.endTime) : null;
  const fmt = (date: Date) =>
    date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });

  if (start && end) {
    return `${fmt(start)} - ${fmt(end)}`;
  }
  if (start) {
    return fmt(start);
  }
  if (end) {
    return fmt(end);
  }
  return '时间待补充';
}

function buildSummary(event: EventRecord): string {
  const text = (event.storyText || event.fullStory || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return event.hasPendingStructureChanges || event.storyFreshness === 'stale'
      ? '照片或故事线刚有变更，系统会按当前版本继续更新。'
      : '打开这段回忆，继续查看片段、照片和完整故事。';
  }
  return text.length > 52 ? `${text.slice(0, 52).trim()}…` : text;
}

export function TimelineEventCard({
  event,
  isLastInSection: _isLastInSection,
  onPress,
  onLongPress,
}: TimelineEventCardProps) {
  const title = event.title?.trim() ? event.title : '未命名事件';
  const location = event.locationName || '地点待补充';
  const coverUri = getPreferredEventCoverUri(event);
  const statusMeta = getEventStatusMeta(event);
  const shouldShowStatus =
    event.storyFreshness === 'stale' ||
    event.slideshowFreshness === 'stale' ||
    event.hasPendingStructureChanges ||
    event.status !== 'generated';

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.rowPressed]}
      onPress={() => onPress(event.id)}
      onLongPress={() => onLongPress?.(event)}
      delayLongPress={240}
    >
      <View style={styles.coverFrame}>
        {coverUri ? (
          <Image source={{ uri: coverUri }} style={styles.coverImage} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={['#E5EEFF', '#F4F8FF']}
            style={[styles.coverImage, styles.coverPlaceholder]}
          >
            <MaterialCommunityIcons name="image-outline" size={22} color={JourneyPalette.muted} />
          </LinearGradient>
        )}
        <LinearGradient
          colors={['rgba(15,23,42,0.02)', 'rgba(15,23,42,0.42)']}
          style={styles.coverShade}
        />
        <View style={styles.coverBadges}>
          <View style={styles.countBadge}>
            <MaterialCommunityIcons name="image-outline" size={12} color="#FFFFFF" />
            <Text style={styles.countBadgeText}>{event.photoCount}</Text>
          </View>
          {shouldShowStatus ? (
            <View style={[styles.statusBadge, { backgroundColor: statusMeta.soft }]}>
              <Text style={[styles.statusText, { color: statusMeta.color }]}>
                {statusMeta.label}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.cardTopRow}>
          <View style={styles.cardTitleBlock}>
            <Text numberOfLines={1} style={styles.title}>
              {title}
            </Text>
            <Text numberOfLines={2} style={styles.summaryText}>
              {buildSummary(event)}
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={JourneyPalette.muted} />
        </View>

        <View style={styles.metaWrap}>
          <View style={styles.metaPill}>
            <MaterialCommunityIcons
              name="calendar-month-outline"
              size={14}
              color={JourneyPalette.inkSoft}
            />
            <Text numberOfLines={1} style={styles.metaText}>
              {formatDateRange(event)}
            </Text>
          </View>
          <View style={styles.metaPill}>
            <MaterialCommunityIcons
              name="map-marker-outline"
              size={14}
              color={JourneyPalette.inkSoft}
            />
            <Text numberOfLines={1} style={styles.metaText}>
              {location}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  rowPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.96,
  },
  coverFrame: {
    height: 184,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#E9F0FD',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverShade: {
    ...StyleSheet.absoluteFillObject,
  },
  coverBadges: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  countBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(15,23,42,0.44)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  countBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  content: {
    backgroundColor: JourneyPalette.card,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    borderTopWidth: 0,
    padding: 16,
    gap: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardTitleBlock: {
    flex: 1,
    gap: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  summaryText: {
    color: JourneyPalette.inkSoft,
    fontSize: 13,
    lineHeight: 20,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  metaWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaPill: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: JourneyPalette.cardAlt,
  },
  metaText: {
    color: JourneyPalette.inkSoft,
    fontSize: 12,
    fontWeight: '600',
  },
});
