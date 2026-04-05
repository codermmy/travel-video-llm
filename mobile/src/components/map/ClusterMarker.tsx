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
    padding: 3,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 0,
    shadowColor: JourneyPalette.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  markerWrapperSelected: {
    transform: [{ scale: 1.15 }],
    shadowOpacity: 0.2,
    backgroundColor: JourneyPalette.accent,
  },
  markerWrapperPressed: {
    transform: [{ scale: 0.94 }],
  },
  image: {
    width: 48,
    height: 48,
    borderRadius: 21,
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
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 3,
    minWidth: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  stateDot: {
    position: 'absolute',
    left: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  arrow: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 0,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: JourneyPalette.accent,
    marginTop: -2,
  },
});
