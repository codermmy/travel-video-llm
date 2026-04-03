import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import type { EventPhotoItem } from '@/types/event';
import { formatDateTime } from '@/utils/dateUtils';
import { getPhotoOriginalCandidates, getPreferredPhotoThumbnailUri } from '@/utils/mediaRefs';

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
    Math.min(Math.max(initialIndex, 0), Math.max(photos.length - 1, 0)),
  );
  const [failedCandidateIndices, setFailedCandidateIndices] = useState<Record<string, number>>({});
  const listRef = useRef<FlatList<EventPhotoItem>>(null);
  const stripRef = useRef<ScrollView>(null);

  useEffect(() => {
    StatusBar.setHidden(true, 'fade');
    const timer = setTimeout(() => {
      if (initialIndex > 0) {
        listRef.current?.scrollToIndex({
          index: Math.min(initialIndex, Math.max(photos.length - 1, 0)),
          animated: false,
        });
      }
    }, 0);

    return () => {
      clearTimeout(timer);
      StatusBar.setHidden(false, 'fade');
    };
  }, [initialIndex, photos.length]);

  useEffect(() => {
    stripRef.current?.scrollTo({
      x: Math.max(currentIndex - 1, 0) * 76,
      animated: true,
    });
  }, [currentIndex]);

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

  const locationText = useMemo(() => {
    if (!currentPhoto) {
      return null;
    }
    return gpsText;
  }, [currentPhoto, gpsText]);

  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    setCurrentIndex(Math.min(Math.max(nextIndex, 0), Math.max(photos.length - 1, 0)));
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.topChip, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="chevron-left" size={20} color="#FFFFFF" />
          <Text style={styles.topChipText}>返回</Text>
        </Pressable>
        <View style={styles.topChip}>
          <Text style={styles.topChipText}>
            {Math.max(currentIndex + 1, 1)} / {Math.max(photos.length, 1)}
          </Text>
        </View>
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
              <View style={styles.stageFrame}>
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
                    <View style={styles.errorIconWrap}>
                      <MaterialCommunityIcons
                        name="image-broken-variant"
                        size={28}
                        color="#A9B7D6"
                      />
                    </View>
                    <Text style={styles.errorTitle}>图片加载失败</Text>
                    <Text style={styles.errorText}>本地候选地址已失效，可以稍后再试。</Text>
                  </View>
                )}
              </View>
            </View>
          );
        }}
      />

      <View style={styles.bottomPanel}>
        <View style={styles.metaBlock}>
          {footerText ? <Text style={styles.metaTitle}>{footerText}</Text> : null}
          {locationText ? <Text style={styles.metaLine}>{locationText}</Text> : null}
          {captionText ? <Text style={styles.captionText}>{captionText}</Text> : null}
        </View>

        <ScrollView
          ref={stripRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filmstrip}
        >
          {photos.map((photo, index) => {
            const thumbUri =
              getPreferredPhotoThumbnailUri(photo) ||
              getPhotoOriginalCandidates(photo)[0] ||
              undefined;
            const active = currentIndex === index;

            return (
              <Pressable
                key={photo.id}
                onPress={() => {
                  listRef.current?.scrollToIndex({ index, animated: true });
                  setCurrentIndex(index);
                }}
                style={({ pressed }) => [
                  styles.thumbCell,
                  active && styles.thumbCellActive,
                  pressed && styles.pressed,
                ]}
              >
                {thumbUri ? (
                  <Image source={{ uri: thumbUri }} style={styles.thumbImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.thumbImage, styles.thumbFallback]}>
                    <MaterialCommunityIcons name="image-outline" size={16} color="#97A5C4" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09101D',
  },
  topBar: {
    position: 'absolute',
    top: 10,
    left: 14,
    right: 14,
    zIndex: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topChip: {
    minHeight: 38,
    borderRadius: 999,
    backgroundColor: 'rgba(10, 20, 38, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(157, 179, 230, 0.18)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  topChipText: {
    color: '#F4F7FF',
    fontSize: 13,
    fontWeight: '800',
  },
  slide: {
    width,
    height,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 188,
  },
  stageFrame: {
    width: width,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width,
    height: height * 0.7,
  },
  errorPlaceholder: {
    width: width * 0.76,
    minHeight: width * 0.72,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(149, 173, 223, 0.16)',
    backgroundColor: 'rgba(16, 27, 47, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  errorIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  errorTitle: {
    color: '#F1F5FF',
    fontSize: 16,
    fontWeight: '900',
  },
  errorText: {
    marginTop: 8,
    color: '#A8B7D9',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  bottomPanel: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 18,
    borderRadius: 24,
    backgroundColor: 'rgba(9, 17, 31, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(157, 179, 230, 0.16)',
    padding: 14,
    gap: 14,
  },
  metaBlock: {
    gap: 4,
  },
  metaTitle: {
    color: '#F4F7FF',
    fontSize: 15,
    fontWeight: '900',
  },
  metaLine: {
    color: '#D1DBF3',
    fontSize: 12,
  },
  captionText: {
    color: '#AFC0E7',
    fontSize: 13,
    lineHeight: 19,
  },
  filmstrip: {
    gap: 10,
  },
  thumbCell: {
    width: 64,
    height: 64,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(157, 179, 230, 0.16)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  thumbCellActive: {
    borderColor: '#F4F7FF',
    transform: [{ scale: 1.04 }],
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.92,
  },
});
