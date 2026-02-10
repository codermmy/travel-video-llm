import { useRef } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

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
    padding: 3,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    shadowColor: '#14274D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  markerWrapperSelected: {
    transform: [{ scale: 1.2 }],
    shadowOpacity: 0.3,
  },
  markerWrapperPressed: {
    transform: [{ scale: 0.96 }],
  },
  image: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E9EEFA',
  },
  placeholder: {
    backgroundColor: '#CAD7EF',
  },
  badgeContainer: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#1E2E53',
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
    borderTopColor: '#FFFFFF',
    marginTop: -1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
});
