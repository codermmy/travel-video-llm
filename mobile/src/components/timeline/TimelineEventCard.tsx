import { Image, Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from 'react-native-paper';

import { JourneyPalette } from '@/styles/colors';
import type { EventRecord } from '@/types/event';
import { getPreferredEventCoverUri } from '@/utils/mediaRefs';

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

function buildSummary(event: EventRecord): string {
  const narrative = (event.storyText || event.fullStory || '').replace(/\s+/g, ' ').trim();
  if (narrative) {
    const firstSentence = narrative.split(/[。！？!?]/)[0]?.trim() || narrative;
    return firstSentence.length > 32 ? `${firstSentence.slice(0, 32).trim()}…` : firstSentence;
  }

  if (event.locationName?.trim()) {
    return event.locationName.trim();
  }

  return `${event.photoCount} 张照片`;
}

function buildMeta(event: EventRecord): string {
  return `${formatDateRange(event)} · ${event.photoCount}张照片`;
}

type TimelineEventCardProps = {
  event: EventRecord;
  onPress: (eventId: string) => void;
  onLongPress?: (event: EventRecord) => void;
};

export function TimelineEventCard({
  event,
  onPress,
  onLongPress,
}: TimelineEventCardProps) {
  const title = event.title?.trim() ? event.title : '未命名事件';
  const coverUri = getPreferredEventCoverUri(event);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
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
          <View style={styles.thumbFallback}>
            <MaterialCommunityIcons name="image-outline" size={24} color={JourneyPalette.muted} />
          </View>
        )}
      </View>

      <View style={styles.content}>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>

        <Text numberOfLines={2} style={styles.summary}>
          {buildSummary(event)}
        </Text>

        <View style={styles.bottomRow}>
          <Text style={styles.dateMeta}>{buildMeta(event)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 24,
    borderWidth: 0,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  cardPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.7,
  },
  thumbFrame: {
    width: 110,
    height: 110,
    borderRadius: 24,
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
    backgroundColor: JourneyPalette.cardMuted,
  },
  content: {
    flex: 1,
    paddingRight: 10,
  },
  title: {
    flex: 1,
    fontSize: 19,
    fontWeight: '900',
    color: JourneyPalette.ink,
    letterSpacing: -0.5,
  },
  summary: {
    color: JourneyPalette.inkSoft,
    fontSize: 14,
    lineHeight: 19.6,
    fontWeight: '500',
    marginTop: 4,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  dateMeta: {
    color: JourneyPalette.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
