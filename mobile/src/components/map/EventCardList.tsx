import { useMemo } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { EventRecord } from '@/types/event';
import { getPreferredEventCoverUri } from '@/utils/mediaRefs';

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
    return 'No date';
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
      events.map((event) => (
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
            <Text style={styles.title} numberOfLines={1}>
              {event.title}
            </Text>

            <View style={styles.metaContainer}>
              <Ionicons name="calendar-outline" size={12} color="#6A7895" style={styles.icon} />
              <Text style={styles.metaText}>{buildDateRange(event)}</Text>
            </View>

            {event.locationName ? (
              <View style={styles.metaContainer}>
                <Ionicons name="location-outline" size={12} color="#6A7895" style={styles.icon} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {event.locationName}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.arrowContainer}>
            <Ionicons name="chevron-forward" size={20} color="#9AA4BC" />
          </View>
        </Pressable>
      )),
    [events, onPressDetails, onPressEvent, selectedEventId],
  );

  return (
    <View style={styles.container}>
      <View style={isScrollable ? styles.scrollContainer : styles.stackedContainer}>
        {isScrollable ? (
          <View style={styles.scrollGradient}>
            <Ionicons name="chevron-down" size={16} color="#8E99B4" />
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
    bottom: 30,
    left: 16,
    right: 16,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#0F1C3B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 9,
  },
  stackedContainer: {
    backgroundColor: Platform.OS === 'android' ? 'rgba(255,255,255,0.97)' : '#FFFFFF',
    paddingBottom: 8,
  },
  scrollContainer: {
    maxHeight: 220,
    backgroundColor: Platform.OS === 'android' ? 'rgba(255,255,255,0.97)' : '#FFFFFF',
  },
  scrollGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollHint: {
    fontSize: 11,
    color: '#7A86A2',
    marginTop: 2,
    fontWeight: '600',
  },
  card: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2FA',
  },
  cardPressed: {
    backgroundColor: '#F7FAFF',
  },
  cardSelected: {
    backgroundColor: '#ECF4FF',
  },
  imageContainer: {
    position: 'relative',
    marginRight: 12,
  },
  image: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#ECF1FB',
  },
  placeholderImage: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoCountBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: '#253B67',
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
    fontSize: 15,
    fontWeight: '700',
    color: '#1A2850',
    marginBottom: 4,
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
    color: '#6A7895',
  },
  arrowContainer: {
    paddingLeft: 8,
    justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
  },
});
