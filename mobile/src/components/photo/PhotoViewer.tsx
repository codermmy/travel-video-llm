import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import type { EventPhotoItem } from '@/types/event';
import { formatDateTime } from '@/utils/dateUtils';
import { getPhotoOriginalCandidates } from '@/utils/mediaRefs';

const { width, height } = Dimensions.get('window');

type PhotoViewerProps = {
  photos: EventPhotoItem[];
  initialIndex?: number;
  onBack: () => void;
};

function formatGps(photo: EventPhotoItem): string | null {
  const { gpsLat, gpsLon } = photo;
  if (typeof gpsLat !== 'number' || typeof gpsLon !== 'number') {
    return null;
  }
  return `${gpsLat.toFixed(4)}, ${gpsLon.toFixed(4)}`;
}

export function PhotoViewer({ photos, initialIndex = 0, onBack }: PhotoViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(
    Math.min(Math.max(initialIndex, 0), photos.length - 1),
  );
  const [failedCandidateIndices, setFailedCandidateIndices] = useState<Record<string, number>>({});
  const listRef = useRef<FlatList<EventPhotoItem>>(null);

  useEffect(() => {
    StatusBar.setHidden(true, 'fade');
    const timer = setTimeout(() => {
      if (initialIndex > 0) {
        listRef.current?.scrollToIndex({
          index: Math.min(initialIndex, photos.length - 1),
          animated: false,
        });
      }
    }, 0);

    return () => {
      clearTimeout(timer);
      StatusBar.setHidden(false, 'fade');
    };
  }, [initialIndex, photos.length]);

  const currentPhoto = photos[currentIndex];

  const footerText = useMemo(() => {
    if (!currentPhoto?.shootTime) {
      return null;
    }
    try {
      return formatDateTime(currentPhoto.shootTime);
    } catch {
      return currentPhoto.shootTime;
    }
  }, [currentPhoto?.shootTime]);

  const captionText = useMemo(() => currentPhoto?.caption || null, [currentPhoto?.caption]);

  const gpsText = useMemo(() => {
    if (!currentPhoto) {
      return null;
    }
    return formatGps(currentPhoto);
  }, [currentPhoto]);

  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    setCurrentIndex(Math.min(Math.max(nextIndex, 0), photos.length - 1));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="chevron-left" size={22} color="#FFFFFF" />
          <Text style={styles.backText}>返回</Text>
        </Pressable>
        <Text style={styles.counterText}>
          {Math.max(currentIndex + 1, 1)} / {Math.max(photos.length, 1)}
        </Text>
      </View>

      <FlatList
        ref={listRef}
        data={photos}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        initialScrollIndex={Math.min(initialIndex, Math.max(photos.length - 1, 0))}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        renderItem={({ item }) => {
          const uriCandidates = getPhotoOriginalCandidates(item);
          const uri = uriCandidates[failedCandidateIndices[item.id] ?? 0] ?? null;
          return (
            <View style={styles.slide}>
              {uri ? (
                <Image
                  source={{ uri }}
                  style={styles.image}
                  resizeMode="contain"
                  onError={() => {
                    setFailedCandidateIndices((prev) => ({
                      ...prev,
                      [item.id]: (prev[item.id] ?? 0) + 1,
                    }));
                  }}
                />
              ) : (
                <View style={styles.errorPlaceholder}>
                  <MaterialCommunityIcons name="image-broken-variant" size={32} color="#93A2C4" />
                  <Text style={styles.errorText}>图片加载失败</Text>
                </View>
              )}
            </View>
          );
        }}
      />

      {(footerText || captionText || gpsText) && (
        <View style={styles.metaContainer}>
          {footerText ? <Text style={styles.metaText}>{footerText}</Text> : null}
          {captionText ? <Text style={styles.captionText}>{captionText}</Text> : null}
          {gpsText ? <Text style={styles.metaText}>GPS: {gpsText}</Text> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030913',
  },
  header: {
    position: 'absolute',
    top: 48,
    left: 14,
    right: 14,
    zIndex: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(7,16,34,0.62)',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  backText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
    marginLeft: 2,
  },
  counterText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
    backgroundColor: 'rgba(7,16,34,0.62)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  slide: {
    width,
    height,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: width,
    height: height * 0.76,
  },
  errorPlaceholder: {
    width: width * 0.72,
    height: width * 0.72,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#253451',
    backgroundColor: '#111D33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    marginTop: 8,
    color: '#96A6C8',
    fontSize: 12,
  },
  metaContainer: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 28,
    borderRadius: 12,
    backgroundColor: 'rgba(7,16,34,0.58)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  metaText: {
    color: '#EAF0FF',
    fontSize: 12,
  },
  captionText: {
    color: '#B8C5FF',
    fontSize: 13,
    fontWeight: '600',
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
});
