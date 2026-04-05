import { Image, Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from 'react-native-paper';

import { JourneyPalette } from '@/styles/colors';
import type { EventRecord } from '@/types/event';
import { getEventStatusMeta } from '@/utils/eventStatus';
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
  const parts = [`${event.photoCount} 张照片`];
  if (event.locationName?.trim()) {
    parts.push(event.locationName.trim());
  }
  return parts.join(' · ');
}

function getActionMeta(event: EventRecord): string {
  const statusMeta = getEventStatusMeta(event);
  if (statusMeta.tone === 'ready') {
    return '已完成';
  }
  if (statusMeta.tone === 'stale') {
    return '待更新';
  }
  if (statusMeta.tone === 'failed') {
    return '需重试';
  }
  return '整理中';
}

type TimelineEventCardProps = {
  event: EventRecord;
  isLastInSection: boolean;
  onPress: (eventId: string) => void;
  onLongPress?: (event: EventRecord) => void;
  statusLabel?: string;
  statusTone?: 'ready' | 'stale' | 'failed' | 'processing' | 'importing';
};

export function TimelineEventCard({
  event,
  isLastInSection,
  onPress,
  onLongPress,
  statusLabel,
  statusTone,
}: TimelineEventCardProps) {
  const statusMeta = getEventStatusMeta(event);
  const title = event.title?.trim() ? event.title : '未命名事件';
  const coverUri = getPreferredEventCoverUri(event);

  const displayStatusLabel = statusLabel || (statusMeta.tone !== 'ready' ? statusMeta.label : null);
  const displayStatusTone = statusTone || statusMeta.tone;

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
          <View style={styles.thumbFallback}>
            <MaterialCommunityIcons name="image-outline" size={24} color={JourneyPalette.muted} />
          </View>
        )}
        <View style={styles.photoCountBadge}>
          <Text style={styles.photoCountText}>{event.photoCount}</Text>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          {displayStatusLabel && displayStatusTone !== 'ready' && (
            <View style={[
              styles.statusTag, 
              displayStatusTone === 'failed' && styles.statusTagFailed,
              (displayStatusTone === 'processing' || displayStatusTone === 'importing') && styles.statusTagRunning
            ]}>
              <Text style={[
                styles.statusTagText,
                displayStatusTone === 'failed' && styles.statusTagTextFailed,
                (displayStatusTone === 'processing' || displayStatusTone === 'importing') && styles.statusTagTextRunning
              ]}>
                {displayStatusLabel}
              </Text>
            </View>
          )}
        </View>

        <Text numberOfLines={2} style={styles.summary}>
          {buildSummary(event)}
        </Text>

        <View style={styles.bottomRow}>
          <Text style={styles.dateMeta}>{formatDateRange(event)}</Text>
          <View style={styles.enterHint}>
            <MaterialCommunityIcons
              name="chevron-right"
              size={16}
              color={JourneyPalette.muted}
            />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 32,
    borderWidth: 0,
    backgroundColor: JourneyPalette.card,
    padding: 10,
    flexDirection: 'row',
    gap: 16,
    shadowColor: JourneyPalette.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 4,
  },
  cardLast: {
    marginBottom: 0,
  },
  cardPressed: {
    transform: [{ scale: 0.97 }],
    backgroundColor: JourneyPalette.surfaceVariant,
    opacity: 0.95,
  },
  thumbFrame: {
    width: 120,
    height: 120,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: JourneyPalette.cardMuted,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.cardSoft,
  },
  photoCountBadge: {
    position: 'absolute',
    right: 8,
    top: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  photoCountText: {
    color: JourneyPalette.white,
    fontSize: 11,
    fontWeight: '900',
  },
  content: {
    flex: 1,
    gap: 2,
    paddingVertical: 6,
    paddingRight: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    color: JourneyPalette.ink,
    letterSpacing: -0.5,
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: JourneyPalette.cardSoft,
  },
  statusTagFailed: {
    backgroundColor: JourneyPalette.dangerSoft,
  },
  statusTagRunning: {
    backgroundColor: JourneyPalette.accentSoft,
  },
  statusTagText: {
    fontSize: 10,
    fontWeight: '900',
    color: JourneyPalette.muted,
    textTransform: 'uppercase',
  },
  statusTagTextFailed: {
    color: JourneyPalette.danger,
  },
  statusTagTextRunning: {
    color: JourneyPalette.accent,
  },
  summary: {
    color: JourneyPalette.inkSoft,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    marginTop: 4,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 'auto',
    paddingTop: 12,
  },
  dateMeta: {
    color: JourneyPalette.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  enterHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  enterHintText: {
    color: JourneyPalette.accent,
    fontSize: 12,
    fontWeight: '800',
  },
});
