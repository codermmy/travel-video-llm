import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { JourneyPalette } from '@/styles/colors';
import type { JourneyStateKind } from '@/utils/statusLanguage';

type ClusterMarkerProps = {
  coverUrl: string | null;
  clusterCount: number;
  isSelected: boolean;
  tone: JourneyStateKind;
  onPress: () => void;
};

export function ClusterMarker({
  coverUrl,
  clusterCount,
  isSelected,
  tone,
  onPress,
}: ClusterMarkerProps) {
  const isCluster = clusterCount > 1;
  const toneColor =
    tone === 'failed'
      ? JourneyPalette.danger
      : tone === 'stale'
        ? JourneyPalette.warning
        : tone === 'importing' || tone === 'processing'
          ? JourneyPalette.accent
          : JourneyPalette.success;
  const toneSoft =
    tone === 'failed'
      ? JourneyPalette.dangerSoft
      : tone === 'stale'
        ? JourneyPalette.warningSoft
        : tone === 'importing' || tone === 'processing'
          ? JourneyPalette.accentSoft
          : JourneyPalette.successSoft;

  return (
    <View style={styles.container}>
      <Pressable
        style={({ pressed }) => [
          styles.markerWrapper,
          { borderColor: isSelected ? toneColor : JourneyPalette.line },
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

        <View style={[styles.stateDot, { backgroundColor: toneColor, borderColor: toneSoft }]} />

        {isCluster ? (
          <View style={[styles.badgeContainer, { backgroundColor: toneColor }]}>
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
    borderRadius: 22,
    borderWidth: 1,
    shadowColor: JourneyPalette.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 5,
  },
  markerWrapperSelected: {
    transform: [{ scale: 1.12 }],
    shadowOpacity: 0.28,
    borderColor: JourneyPalette.accent,
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
    backgroundColor: JourneyPalette.accent,
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
  stateDot: {
    position: 'absolute',
    left: -3,
    bottom: -3,
    width: 14,
    height: 14,
    borderRadius: 999,
    borderWidth: 2,
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
