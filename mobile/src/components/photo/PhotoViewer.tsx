import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { JourneyPalette } from '@/styles/colors';
import type { EventPhotoItem } from '@/types/event';
import { formatDateTime } from '@/utils/dateUtils';
import { getPhotoOriginalCandidates, getPreferredPhotoThumbnailUri } from '@/utils/mediaRefs';
import { isCoordinateLocationText } from '@/utils/locationDisplay';

type PhotoViewerProps = {
  photos: EventPhotoItem[];
  initialIndex?: number;
  onBack: () => void;
};

const THUMB_STRIP_STEP = 62;
const GLASS_WHITE = 'rgba(255,255,255,0.15)';
const GLASS_WHITE_STRONG = 'rgba(255,255,255,0.2)';
const WHITE_SOFT = 'rgba(255,255,255,0.72)';
const WHITE_MUTED = 'rgba(255,255,255,0.62)';
const NOOP = () => {};

function normalizeText(value?: string | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractSemanticLocationLabels(photo: EventPhotoItem | null | undefined): {
  cityLabel: string | null;
  placeLabel: string | null;
} {
  const landmarkHint = normalizeText(photo?.vision?.landmark_hint);
  if (!landmarkHint || isCoordinateLocationText(landmarkHint)) {
    return { cityLabel: null, placeLabel: null };
  }

  const segments = landmarkHint
    .split(/\s*[·•｜|/，,]\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length >= 2) {
    return {
      cityLabel: segments[0] ?? null,
      placeLabel: segments.slice(1).join(' · ') || null,
    };
  }

  return {
    cityLabel: null,
    placeLabel: landmarkHint,
  };
}

function formatLocationText(photo: EventPhotoItem | null | undefined): string {
  const { cityLabel, placeLabel } = extractSemanticLocationLabels(photo);
  if (cityLabel && placeLabel) {
    return `${cityLabel} · ${placeLabel}`;
  }

  return cityLabel || placeLabel || '未知地点';
}

export function PhotoViewer({ photos, initialIndex = 0, onBack }: PhotoViewerProps) {
  const { width, height } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(
    Math.min(Math.max(initialIndex, 0), Math.max(photos.length - 1, 0)),
  );
  const [failedCandidateIndices, setFailedCandidateIndices] = useState<Record<string, number>>({});
  const listRef = useRef<FlatList<EventPhotoItem>>(null);
  const stripRef = useRef<ScrollView>(null);

  useEffect(() => {
    StatusBar.setHidden(true, 'fade');
    const timer = setTimeout(() => {
      if (initialIndex > 0 && photos.length > 0) {
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
    setCurrentIndex((previous) => Math.min(previous, Math.max(photos.length - 1, 0)));
  }, [photos.length]);

  useEffect(() => {
    stripRef.current?.scrollTo({
      x: Math.max(currentIndex - 1, 0) * THUMB_STRIP_STEP,
      animated: true,
    });
  }, [currentIndex]);

  const currentPhoto = photos[currentIndex];
  const currentImageFailed = Boolean(
    currentPhoto &&
    getPhotoOriginalCandidates(currentPhoto)[failedCandidateIndices[currentPhoto.id] ?? 0] == null,
  );

  const countText = useMemo(() => {
    const total = Math.max(photos.length, 1);
    const current = photos.length > 0 ? currentIndex + 1 : 1;
    return `${current} / ${total}`;
  }, [currentIndex, photos.length]);

  const dateText = useMemo(() => {
    if (!currentPhoto?.shootTime) {
      return '未知时间';
    }

    try {
      return formatDateTime(currentPhoto.shootTime);
    } catch {
      return normalizeText(currentPhoto.shootTime) || '未知时间';
    }
  }, [currentPhoto?.shootTime]);

  const captionText = useMemo(() => normalizeText(currentPhoto?.caption), [currentPhoto?.caption]);

  const locationText = useMemo(() => formatLocationText(currentPhoto), [currentPhoto]);

  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) {
      return;
    }

    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    setCurrentIndex(Math.min(Math.max(nextIndex, 0), Math.max(photos.length - 1, 0)));
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.topButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="chevron-left" size={20} color={JourneyPalette.white} />
        </Pressable>

        <View style={styles.countPill}>
          <Text style={styles.countText}>{countText}</Text>
        </View>

        <Pressable
          onPress={NOOP}
          style={({ pressed }) => [styles.topButton, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="dots-horizontal" size={20} color={JourneyPalette.white} />
        </Pressable>
      </View>

      {photos.length > 0 ? (
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
              <View style={[styles.slide, { width, height }]}>
                {uri ? (
                  <Image
                    source={{ uri }}
                    style={[styles.image, { width, height }]}
                    resizeMode="contain"
                    onError={() => {
                      setFailedCandidateIndices((prev) => ({
                        ...prev,
                        [item.id]: (prev[item.id] ?? 0) + 1,
                      }));
                    }}
                  />
                ) : (
                  <View style={[styles.errorPlaceholder, { width: Math.min(width - 72, 296) }]}>
                    <View style={styles.errorIconWrap}>
                      <MaterialCommunityIcons
                        name="image-broken-variant"
                        size={24}
                        color="rgba(255,255,255,0.7)"
                      />
                    </View>
                    <Text style={styles.errorTitle}>图片加载失败</Text>
                    <Text style={styles.errorText}>本地候选地址已失效，可以稍后再试。</Text>
                  </View>
                )}
              </View>
            );
          }}
        />
      ) : (
        <View style={styles.emptyStage}>
          <View style={styles.errorIconWrap}>
            <MaterialCommunityIcons
              name="image-off-outline"
              size={24}
              color="rgba(255,255,255,0.7)"
            />
          </View>
          <Text style={styles.errorTitle}>没有可查看的照片</Text>
          <Text style={styles.errorText}>返回上一页后可以从事件详情继续补图。</Text>
        </View>
      )}

      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.8)']}
        locations={[0.08, 0.62]}
        style={styles.bottomGradient}
      >
        <View style={styles.bottomContent}>
          <View style={styles.metaBlock}>
            <Text numberOfLines={1} style={styles.locationText}>
              {locationText}
            </Text>
            <Text style={styles.dateText}>{dateText}</Text>
            {captionText ? (
              <Text numberOfLines={2} style={styles.captionText}>
                {captionText}
              </Text>
            ) : null}
          </View>

          {currentPhoto ? (
            <View style={styles.actionRow}>
              <Pressable
                onPress={NOOP}
                style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons
                  name="pencil-outline"
                  size={20}
                  color={JourneyPalette.white}
                />
              </Pressable>
              <Pressable
                onPress={NOOP}
                style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons
                  name="circle-outline"
                  size={20}
                  color={JourneyPalette.white}
                />
              </Pressable>
              <Pressable
                onPress={NOOP}
                style={({ pressed }) => [
                  styles.actionButton,
                  styles.actionButtonDanger,
                  styles.actionButtonPush,
                  pressed && styles.pressed,
                ]}
              >
                <MaterialCommunityIcons
                  name="trash-can-outline"
                  size={20}
                  color={JourneyPalette.danger}
                />
              </Pressable>
            </View>
          ) : null}

          {photos.length > 0 ? (
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
                      <Image
                        source={{ uri: thumbUri }}
                        style={styles.thumbImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.thumbImage, styles.thumbFallback]}>
                        <MaterialCommunityIcons
                          name="image-outline"
                          size={16}
                          color="rgba(255,255,255,0.55)"
                        />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
        </View>
      </LinearGradient>

      {currentImageFailed ? (
        <View style={styles.failureBanner}>
          <Text style={styles.failureBannerTitle}>当前图片未能加载</Text>
          <Text style={styles.failureBannerText}>本地候选地址已失效，已切换为柔和占位。</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    position: 'absolute',
    top: 54,
    left: 20,
    right: 20,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GLASS_WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countPill: {
    borderRadius: 20,
    backgroundColor: GLASS_WHITE,
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    color: JourneyPalette.white,
    fontSize: 13,
    fontWeight: '800',
  },
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  image: {
    maxWidth: '100%',
    maxHeight: '100%',
  },
  errorPlaceholder: {
    minHeight: 220,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 28,
  },
  errorIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  errorTitle: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 15,
    fontWeight: '800',
  },
  errorText: {
    marginTop: 8,
    color: WHITE_MUTED,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  emptyStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  bottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 64,
  },
  bottomContent: {
    marginBottom: 44,
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  metaBlock: {
    marginBottom: 24,
  },
  locationText: {
    marginBottom: 8,
    color: WHITE_SOFT,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  dateText: {
    marginBottom: 16,
    color: JourneyPalette.white,
    fontSize: 18,
    fontWeight: '800',
  },
  captionText: {
    color: WHITE_SOFT,
    fontSize: 13,
    lineHeight: 19,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: GLASS_WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonDanger: {
    backgroundColor: GLASS_WHITE_STRONG,
  },
  actionButtonPush: {
    marginLeft: 'auto',
  },
  filmstrip: {
    gap: 10,
    marginTop: 18,
    paddingRight: 24,
  },
  thumbCell: {
    width: 52,
    height: 52,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    opacity: 0.54,
  },
  thumbCellActive: {
    borderColor: 'rgba(255,255,255,0.88)',
    opacity: 1,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  failureBanner: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 212,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  failureBannerTitle: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 12,
    fontWeight: '700',
  },
  failureBannerText: {
    marginTop: 4,
    color: WHITE_MUTED,
    fontSize: 12,
    lineHeight: 17,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.7,
  },
});
