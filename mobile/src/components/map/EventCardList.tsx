import { useMemo } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { JourneyPalette } from '@/styles/colors';
import type { EventRecord } from '@/types/event';
import { getPreferredEventCoverUri } from '@/utils/mediaRefs';
import { getEventStatusMeta } from '@/utils/eventStatus';

type EventCardListProps = {
  events: EventRecord[];
  selectedEventId: string | null;
  onPressEvent: (eventId: string) => void;
  onPressDetails: (eventId: string) => void;
  onClose: () => void;
};

function formatDate(dateString?: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function buildDateRange(event: EventRecord): string {
  if (!event.startTime) {
    return '时间待补充';
  }
  const start = formatDate(event.startTime);
  const end = event.endTime ? formatDate(event.endTime) : '';
  return end ? `${start} - ${end}` : start;
}

export function EventCardList({
  events,
  selectedEventId,
  onPressEvent,
  onPressDetails,
  onClose,
}: EventCardListProps) {
  const isScrollable = events.length > 3;

  const cards = useMemo(
    () =>
      events.map((event) => {
        const statusMeta = getEventStatusMeta(event);
        return (
          <Pressable
            key={event.id}
            style={({ pressed }) => [
              styles.card,
              selectedEventId === event.id && styles.cardSelected,
              pressed && styles.cardPressed,
            ]}
            onPress={() => {
              if (selectedEventId === event.id) {
                onPressDetails(event.id);
                return;
              }
              onPressEvent(event.id);
            }}
          >
            <View style={styles.imageContainer}>
              {getPreferredEventCoverUri(event) ? (
                <Image
                  source={{ uri: getPreferredEventCoverUri(event) ?? undefined }}
                  style={styles.image}
                />
              ) : (
                <View style={[styles.image, styles.placeholderImage]}>
                  <Ionicons name="image-outline" size={24} color="#8896B2" />
                </View>
              )}
              <View style={styles.photoCountBadge}>
                <Text style={styles.photoCountText}>{event.photoCount}</Text>
              </View>
            </View>

            <View style={styles.infoContainer}>
              <View style={styles.titleRow}>
                <Text style={styles.title} numberOfLines={1}>
                  {event.title}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: statusMeta.soft }]}>
                  <Text style={[styles.statusText, { color: statusMeta.color }]}>
                    {statusMeta.label}
                  </Text>
                </View>
              </View>

              <View style={styles.metaContainer}>
                <Ionicons
                  name="calendar-outline"
                  size={12}
                  color={JourneyPalette.inkSoft}
                  style={styles.icon}
                />
                <Text style={styles.metaText}>{buildDateRange(event)}</Text>
              </View>

              {event.locationName ? (
                <View style={styles.metaContainer}>
                  <Ionicons
                    name="location-outline"
                    size={12}
                    color={JourneyPalette.inkSoft}
                    style={styles.icon}
                  />
                  <Text style={styles.metaText} numberOfLines={1}>
                    {event.locationName}
                  </Text>
                </View>
              ) : null}

              {event.storyFreshness === 'stale' ? (
                <View style={styles.metaContainer}>
                  <Ionicons
                    name="refresh-outline"
                    size={12}
                    color={JourneyPalette.warning}
                    style={styles.icon}
                  />
                  <Text style={styles.staleText} numberOfLines={1}>
                    旧故事待更新
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.arrowContainer}>
              <Ionicons name="chevron-forward" size={20} color={JourneyPalette.inkSoft} />
            </View>
          </Pressable>
        );
      }),
    [events, onPressDetails, onPressEvent, selectedEventId],
  );

  return (
    <View style={styles.container}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>这一片足迹</Text>
        <Text style={styles.headerMeta}>{events.length} 个旅行事件</Text>
      </View>
      <View style={isScrollable ? styles.scrollContainer : styles.stackedContainer}>
        {isScrollable ? (
          <View style={styles.scrollGradient}>
            <Ionicons name="chevron-down" size={16} color={JourneyPalette.muted} />
            <Text style={styles.scrollHint}>向下滚动查看更多</Text>
          </View>
        ) : null}

        <ScrollView scrollEnabled={isScrollable} showsVerticalScrollIndicator={false}>
          {cards}
        </ScrollView>
      </View>

      <Pressable style={styles.closeButton} onPress={onClose}>
        <Ionicons name="close-circle" size={24} color="#B2BBD0" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 24,
    left: 14,
    right: 14,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: Platform.OS === 'android' ? JourneyPalette.card : 'rgba(255,252,247,0.98)',
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    shadowColor: JourneyPalette.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 22,
    elevation: 9,
  },
  handle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: JourneyPalette.lineStrong,
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  headerMeta: {
    marginTop: 4,
    fontSize: 12,
    color: JourneyPalette.muted,
  },
  stackedContainer: {
    backgroundColor: Platform.OS === 'android' ? JourneyPalette.card : JourneyPalette.card,
    paddingBottom: 8,
  },
  scrollContainer: {
    maxHeight: 220,
    backgroundColor: Platform.OS === 'android' ? JourneyPalette.card : JourneyPalette.card,
  },
  scrollGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    height: 40,
    backgroundColor: 'rgba(255,252,247,0.94)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollHint: {
    fontSize: 11,
    color: JourneyPalette.muted,
    marginTop: 2,
    fontWeight: '600',
  },
  card: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: JourneyPalette.card,
    borderBottomWidth: 1,
    borderBottomColor: JourneyPalette.line,
  },
  cardPressed: {
    backgroundColor: '#FAF5EC',
  },
  cardSelected: {
    backgroundColor: '#F1F6F4',
  },
  imageContainer: {
    position: 'relative',
    marginRight: 12,
  },
  image: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#EDE5DA',
  },
  placeholderImage: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoCountBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: JourneyPalette.ink,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
    minWidth: 16,
    alignItems: 'center',
  },
  photoCountText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: JourneyPalette.ink,
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  icon: {
    marginRight: 4,
  },
  metaText: {
    fontSize: 12,
    color: JourneyPalette.inkSoft,
  },
  staleText: {
    fontSize: 12,
    color: JourneyPalette.warning,
    fontWeight: '700',
  },
  arrowContainer: {
    paddingLeft: 8,
    justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 12,
    zIndex: 10,
  },
});
