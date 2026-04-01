import React from 'react';
import { StyleSheet, View, Image } from 'react-native';
import type { EventRecord } from '@/types/event';
import { getPreferredEventCoverUri } from '@/utils/mediaRefs';
import type { MarkerProps } from './amapTypes';

interface EventMarkerProps {
  event: EventRecord;
  isSelected: boolean;
  onPress: () => void;
  MarkerComponent: React.ComponentType<MarkerProps>;
}

export const EventMarker: React.FC<EventMarkerProps> = ({
  event,
  isSelected,
  onPress,
  MarkerComponent,
}) => {
  const coverUri = getPreferredEventCoverUri(event);
  if (typeof event.gpsLat !== 'number' || typeof event.gpsLon !== 'number') {
    return null;
  }

  return (
    <MarkerComponent
      position={{ latitude: event.gpsLat, longitude: event.gpsLon }}
      onPress={onPress}
      zIndex={isSelected ? 100 : 1}
    >
      <View style={[styles.container, isSelected && styles.selectedContainer]}>
        <View style={styles.imageWrapper}>
          {coverUri ? (
            <Image source={{ uri: coverUri }} style={styles.image} />
          ) : (
            <View style={[styles.image, styles.placeholder]} />
          )}
        </View>
        {isSelected && <View style={styles.arrow} />}
      </View>
    </MarkerComponent>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedContainer: {
    transform: [{ scale: 1.2 }],
  },
  imageWrapper: {
    padding: 2,
    backgroundColor: '#fff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  image: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#eee',
  },
  placeholder: {
    backgroundColor: '#ccc',
  },
  arrow: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 0,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#fff',
    marginTop: -1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
});
