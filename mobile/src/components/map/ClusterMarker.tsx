import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { JourneyPalette } from '@/styles/colors';

type ClusterMarkerProps = {
  coverUrl: string | null;
  clusterCount: number;
  isSelected: boolean;
  onPress: () => void;
};

export function ClusterMarker({ coverUrl, clusterCount, isSelected, onPress }: ClusterMarkerProps) {
  return (
    <View style={styles.container}>
      <Pressable
        style={({ pressed }) => [
          styles.markerWrapper,
          isSelected && styles.markerWrapperSelected,
          pressed && styles.markerWrapperPressed,
        ]}
        onPress={onPress}
      >
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.placeholder]} />
        )}

        <View style={styles.badgeContainer}>
          <Text style={styles.badgeText}>{clusterCount}</Text>
        </View>
      </Pressable>
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
    backgroundColor: JourneyPalette.white,
    borderRadius: 26,
    borderWidth: 0,
    shadowColor: JourneyPalette.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  markerWrapperSelected: {
    transform: [{ scale: 1.08 }],
    shadowOpacity: 0.22,
    borderWidth: 2,
    borderColor: JourneyPalette.accent,
  },
  markerWrapperPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.7,
  },
  image: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: JourneyPalette.surfaceVariant,
  },
  placeholder: {
    backgroundColor: JourneyPalette.cardSoft,
  },
  badgeContainer: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: JourneyPalette.accent,
    borderRadius: 10,
    paddingHorizontal: 5,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: JourneyPalette.white,
  },
  badgeText: {
    color: JourneyPalette.white,
    fontSize: 10,
    fontWeight: '900',
  },
});
