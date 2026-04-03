import { Image, Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from 'react-native-paper';

import { JourneyPalette } from '@/styles/colors';
import type { EventRecord } from '@/types/event';
import { getEventStatusMeta } from '@/utils/eventStatus';
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
  const fmt = (date: Date) =>
    date.toLocaleDateString('zh-CN', {
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

function buildSummary(event: EventRecord, statusLabel: string): string {
  const parts = [`${event.photoCount} 张照片`];
  if (event.locationName?.trim()) {
    parts.push(event.locationName.trim());
  }
  parts.push(statusLabel);
  return parts.join(' · ');
}

function getActionMeta(event: EventRecord): string {
  const statusMeta = getEventStatusMeta(event);
  if (statusMeta.tone === 'ready') {
    return '可播放';
  }
  if (statusMeta.tone === 'stale') {
    return '待更新';
  }
  if (statusMeta.tone === 'failed') {
    return '需重试';
  }
  return '整理中';
}

export function TimelineEventCard({
  event,
  isLastInSection,
  onPress,
  onLongPress,
}: TimelineEventCardProps) {
  const title = event.title?.trim() ? event.title : '未命名事件';
  const coverUri = getPreferredEventCoverUri(event);
  const statusMeta = getEventStatusMeta(event);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        isLastInSection && styles.cardLast,
        pressed && styles.cardPressed,
      ]}
      onPress={() => onPress(event.id)}
      onLongPress={() => onLongPress?.(event)}
      delayLongPress={240}
    >
      <View style={styles.thumbFrame}>
        {coverUri ? (
          <Image source={{ uri: coverUri }} style={styles.thumbImage} resizeMode="cover" />
        ) : (
          <LinearGradient colors={['#E6EEFF', '#F6F9FF']} style={styles.thumbFallback}>
            <MaterialCommunityIcons name="image-outline" size={22} color={JourneyPalette.muted} />
          </LinearGradient>
        )}
        <View style={styles.photoCountBadge}>
          <MaterialCommunityIcons name="image-outline" size={11} color={JourneyPalette.white} />
          <Text style={styles.photoCountText}>{event.photoCount}</Text>
        </View>
      </View>

      <View style={styles.content}>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>

        <Text numberOfLines={2} style={styles.summary}>
          {buildSummary(event, statusMeta.label)}
        </Text>

        <View style={styles.bottomRow}>
          <Text style={styles.dateMeta}>{formatDateRange(event)}</Text>
          <View style={styles.enterHint}>
            <Text style={styles.enterHintText}>{getActionMeta(event)}</Text>
            <MaterialCommunityIcons
              name="chevron-right"
              size={16}
              color={JourneyPalette.mutedStrong}
            />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 14,
    marginBottom: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.card,
    padding: 10,
    flexDirection: 'row',
    gap: 10,
  },
  cardLast: {
    marginBottom: 0,
  },
  cardPressed: {
    transform: [{ scale: 0.992 }],
    opacity: 0.96,
  },
  thumbFrame: {
    width: 92,
    height: 92,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: JourneyPalette.cardSoft,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoCountBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    borderRadius: 999,
    backgroundColor: JourneyPalette.overlayDark,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  photoCountText: {
    color: JourneyPalette.white,
    fontSize: 11,
    fontWeight: '800',
  },
  content: {
    flex: 1,
    gap: 6,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  summary: {
    color: JourneyPalette.inkSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 'auto',
  },
  dateMeta: {
    color: JourneyPalette.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  enterHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  enterHintText: {
    color: JourneyPalette.mutedStrong,
    fontSize: 11,
    fontWeight: '700',
  },
});
