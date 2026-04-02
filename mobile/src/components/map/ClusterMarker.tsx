import { useRef } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { JourneyPalette } from '@/styles/colors';

type ClusterMarkerProps = {
  coverUrl: string | null;
  clusterCount: number;
  isSelected: boolean;
  onPress: () => void;
  onDoublePress: () => void;
};

const DOUBLE_PRESS_DELAY_MS = 280;

export function ClusterMarker({
  coverUrl,
  clusterCount,
  isSelected,
  onPress,
  onDoublePress,
}: ClusterMarkerProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPressRef = useRef<number>(0);

  const handlePress = () => {
    const now = Date.now();

    if (now - lastPressRef.current <= DOUBLE_PRESS_DELAY_MS) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      onDoublePress();
    } else {
      timerRef.current = setTimeout(() => {
        onPress();
        timerRef.current = null;
      }, DOUBLE_PRESS_DELAY_MS);
    }

    lastPressRef.current = now;
  };

  const isCluster = clusterCount > 1;

  return (
    <View style={styles.container}>
      <Pressable
        style={({ pressed }) => [
          styles.markerWrapper,
          isSelected && styles.markerWrapperSelected,
          pressed && styles.markerWrapperPressed,
        ]}
        onPress={handlePress}
      >
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.placeholder]} />
        )}

        {isCluster ? (
          <View style={styles.badgeContainer}>
            <Text style={styles.badgeText}>{clusterCount}</Text>
          </View>
        ) : null}
      </Pressable>

      {isSelected ? <View style={styles.arrow} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerWrapper: {
    padding: 4,
    backgroundColor: JourneyPalette.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(37, 93, 88, 0.14)',
    shadowColor: JourneyPalette.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 5,
  },
  markerWrapperSelected: {
    transform: [{ scale: 1.16 }],
    shadowOpacity: 0.28,
  },
  markerWrapperPressed: {
    transform: [{ scale: 0.96 }],
  },
  image: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E9EEEA',
  },
  placeholder: {
    backgroundColor: '#D4DDD8',
  },
  badgeContainer: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: JourneyPalette.accentWarm,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
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
    borderTopColor: JourneyPalette.card,
    marginTop: -1,
    shadowColor: JourneyPalette.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
});
