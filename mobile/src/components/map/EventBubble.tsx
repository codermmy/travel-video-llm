import React from 'react';
import { StyleSheet, View, Text, Image, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { EventRecord } from '@/types/event';
import { getPreferredEventCoverUri } from '@/utils/mediaRefs';

interface EventBubbleProps {
  event: EventRecord;
  onPressDetails: () => void;
  onClose: () => void;
}

export const EventBubble: React.FC<EventBubbleProps> = ({ event, onPressDetails, onClose }) => {
  const coverUri = getPreferredEventCoverUri(event);
  const formatDate = (dateString?: string | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const dateRange = event.startTime
    ? `${formatDate(event.startTime)}${event.endTime ? ' - ' + formatDate(event.endTime) : ''}`
    : '';

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.contentContainer}
          onPress={onPressDetails}
          activeOpacity={0.8}
        >
          <View style={styles.imageContainer}>
            {coverUri ? (
              <Image source={{ uri: coverUri }} style={styles.image} />
            ) : (
              <View style={[styles.image, styles.placeholderImage]}>
                <Ionicons name="image-outline" size={24} color="#999" />
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
              <Ionicons name="calendar-outline" size={12} color="#666" style={styles.icon} />
              <Text style={styles.metaText}>{dateRange || 'No date'}</Text>
            </View>
            {event.locationName && (
              <View style={styles.metaContainer}>
                <Ionicons name="location-outline" size={12} color="#666" style={styles.icon} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {event.locationName}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.arrowContainer}>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.closeButton}
          onPress={onClose}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close-circle" size={24} color="#ccc" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 30,
    left: 16,
    right: 16,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  card: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: Platform.OS === 'android' ? 'rgba(255,255,255,0.96)' : '#fff',
  },
  contentContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  imageContainer: {
    position: 'relative',
    marginRight: 12,
  },
  image: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#eee',
  },
  placeholderImage: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoCountBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
    minWidth: 16,
    alignItems: 'center',
  },
  photoCountText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
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
    color: '#666',
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
