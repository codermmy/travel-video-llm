import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  AppState,
  Easing,
  Image,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import { Audio, type AVPlaybackSource } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ProgressBar } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlaybackState, type SlideshowProps } from '@/types/slideshow';
import { formatDateTime } from '@/utils/dateUtils';

const SPEED_OPTIONS_MS = [2000, 3000, 5000] as const;
const DEFAULT_SLIDE_DURATION_MS = 3000;
const CONTROL_AUTO_HIDE_MS = 3000;
const STORY_VISIBLE_MS = 3500;
const DEFAULT_LOCAL_BGM = require('../../../assets/audio/default-bgm.wav');
const GENERIC_CAPTION_SET = new Set([
  '旅途瞬间 · 光影流动 · 当下心情',
  '旅途瞬间·光影流动·当下心情',
]);

type MusicSourceStatus = 'loading' | 'remote' | 'fallback' | 'none' | 'error';

function splitStory(story: string, maxChars = 50): string[] {
  if (!story.trim()) {
    return [];
  }

  const chunks: string[] = [];
  let currentChunk = '';
  const sentences = story.split('。').map((s) => s.trim()).filter(Boolean);

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= maxChars) {
      currentChunk += `${sentence}。`;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      currentChunk = `${sentence}。`;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function getPhotoUri(photo: SlideshowProps['photos'][number]): string | null {
  return photo.photoUrl ?? photo.thumbnailUrl ?? null;
}

function isGenericCaption(input?: string | null): boolean {
  if (!input) {
    return false;
  }
  const normalized = input.replace(/\s+/g, '').trim();
  return GENERIC_CAPTION_SET.has(normalized);
}

function notifyMusicError(message: string) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
    return;
  }
  Alert.alert('提示', message);
}

function getMusicStatusText(status: MusicSourceStatus): string {
  switch (status) {
    case 'remote':
      return '音乐：远程资源';
    case 'fallback':
      return '音乐：本地默认';
    case 'none':
      return '音乐：无可用音源';
    case 'error':
      return '音乐：加载失败';
    case 'loading':
    default:
      return '音乐：加载中';
  }
}

function getStoryTypeMeta(type: 'chapter-intro' | 'chapter-summary' | 'micro-story' | undefined): {
  label: string;
  tint: string;
  tintSoft: string;
} {
  if (type === 'chapter-intro') {
    return { label: '章节引言', tint: '#73B6FF', tintSoft: 'rgba(115,182,255,0.18)' };
  }
  if (type === 'chapter-summary') {
    return { label: '章节总结', tint: '#9DC5FF', tintSoft: 'rgba(157,197,255,0.18)' };
  }
  return { label: '微故事', tint: '#84A7FF', tintSoft: 'rgba(132,167,255,0.18)' };
}

export function SlideshowPlayer({ photos, event, onClose }: SlideshowProps) {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playbackState, setPlaybackState] = useState<PlaybackState>(PlaybackState.Playing);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [storyVisible, setStoryVisible] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [slideDurationMs, setSlideDurationMs] = useState(DEFAULT_SLIDE_DURATION_MS);
  const [musicStatus, setMusicStatus] = useState<MusicSourceStatus>('loading');
  const [footerHeight, setFooterHeight] = useState(168);

  const opacity = useRef(new Animated.Value(1)).current;
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const playbackStateRef = useRef(playbackState);
  const storyOpacity = useRef(new Animated.Value(0)).current;
  const storyTranslateY = useRef(new Animated.Value(10)).current;

  const currentPhoto = photos[currentIndex];
  const photoGroups = event.photoGroups || [];
  const currentChapter = useMemo(() => {
    const chapters = event.chapters || [];
    return chapters.find(
      (chapter) => currentIndex >= chapter.photoStartIndex && currentIndex <= chapter.photoEndIndex,
    );
  }, [currentIndex, event.chapters]);

  const currentGroup = useMemo(
    () =>
      photoGroups.find(
        (group) => currentIndex >= group.photoStartIndex && currentIndex <= group.photoEndIndex,
      ),
    [currentIndex, photoGroups],
  );

  const storyChunks = useMemo(() => {
    const sourceStory = event.fullStory || event.storyText || '';
    return splitStory(sourceStory, 50);
  }, [event.fullStory, event.storyText]);

  const currentStoryChunk = useMemo(() => {
    if (storyChunks.length === 0) {
      return '';
    }
    const chunkIndex = Math.floor(currentIndex / 10) % storyChunks.length;
    return storyChunks[chunkIndex] || '';
  }, [currentIndex, storyChunks]);

  const displayContent = useMemo(() => {
    const isFirstPhotoInChapter = currentIndex === currentChapter?.photoStartIndex;
    const isLastPhotoInChapter = currentIndex === currentChapter?.photoEndIndex;
    const isFirstPhotoInGroup = currentIndex === currentGroup?.photoStartIndex;

    if (isFirstPhotoInChapter && currentChapter?.chapterIntro) {
      return {
        type: 'chapter-intro' as const,
        title: '章节引言',
        text: currentChapter.chapterIntro,
        durationMs: 3000,
      };
    }

    if (isLastPhotoInChapter && currentChapter?.chapterSummary) {
      return {
        type: 'chapter-summary' as const,
        title: '章节总结',
        text: currentChapter.chapterSummary,
        durationMs: 2000,
      };
    }

    const microStory = currentPhoto?.microStory?.trim() || '';
    const caption =
      currentPhoto?.caption && !isGenericCaption(currentPhoto.caption)
        ? currentPhoto.caption.trim()
        : '';
    const chapterCaption = currentChapter?.slideshowCaption?.trim() || '';
    const chapterStory = currentChapter?.chapterStory?.trim() || '';

    const microStoryText =
      microStory ||
      caption ||
      chapterCaption ||
      chapterStory ||
      currentStoryChunk ||
      currentPhoto?.storyText ||
      event.fullStory ||
      event.storyText ||
      '';
    const groupTheme = isFirstPhotoInGroup ? currentGroup?.groupTheme || '' : '';

    if (groupTheme || microStoryText) {
      return {
        type: 'micro-story' as const,
        title: groupTheme || undefined,
        text: microStoryText,
        durationMs: 1500,
      };
    }

    return null;
  }, [
    currentChapter?.chapterIntro,
    currentChapter?.chapterSummary,
    currentChapter?.photoEndIndex,
    currentChapter?.photoStartIndex,
    currentGroup?.groupTheme,
    currentGroup?.photoStartIndex,
    currentIndex,
    currentPhoto?.caption,
    currentPhoto?.microStory,
    currentPhoto?.storyText,
    currentStoryChunk,
    event.fullStory,
    event.storyText,
  ]);

  const storyText = displayContent?.text || '';
  const storyTitle = displayContent?.title || '';
  const storyTypeMeta = getStoryTypeMeta(displayContent?.type);
  const activeSlideDurationMs = displayContent?.durationMs ?? slideDurationMs;
  const storyVisibleMs = displayContent?.durationMs ?? STORY_VISIBLE_MS;

  useEffect(() => {
    playbackStateRef.current = playbackState;
  }, [playbackState]);

  useEffect(() => {
    if (photos.length === 0) {
      return;
    }

    const currentUri = getPhotoUri(photos[currentIndex]);
    const nextUri = getPhotoUri(photos[(currentIndex + 1) % photos.length]);
    const prevUri = getPhotoUri(photos[(currentIndex - 1 + photos.length) % photos.length]);

    [currentUri, nextUri, prevUri]
      .filter((uri): uri is string => Boolean(uri))
      .forEach((uri) => {
        void Image.prefetch(uri);
      });
  }, [currentIndex, photos]);

  const resetControlAutoHide = useCallback(() => {
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }
    setControlsVisible(true);
    controlsTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, CONTROL_AUTO_HIDE_MS);
  }, []);

  const restartStoryTimer = useCallback(() => {
    if (!storyText) {
      setStoryVisible(false);
      return;
    }

    if (storyTimerRef.current) {
      clearTimeout(storyTimerRef.current);
    }

    setStoryVisible(true);
    storyTimerRef.current = setTimeout(() => {
      setStoryVisible(false);
    }, storyVisibleMs);
  }, [storyText, storyVisibleMs]);

  const animateSlideTransition = useCallback(
    (nextIndex: number) => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setCurrentIndex(nextIndex);
        setElapsedMs(0);
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    },
    [opacity],
  );

  const jumpToIndex = useCallback(
    (index: number, options?: { showControls?: boolean }) => {
      if (photos.length === 0) {
        return;
      }
      const normalized = (index + photos.length) % photos.length;
      animateSlideTransition(normalized);
      if (options?.showControls) {
        resetControlAutoHide();
      }
    },
    [animateSlideTransition, photos.length, resetControlAutoHide],
  );

  const onNextAuto = useCallback(() => {
    jumpToIndex(currentIndex + 1);
  }, [currentIndex, jumpToIndex]);

  const onNextByUser = useCallback(() => {
    jumpToIndex(currentIndex + 1, { showControls: true });
  }, [currentIndex, jumpToIndex]);

  const onPreviousByUser = useCallback(() => {
    jumpToIndex(currentIndex - 1, { showControls: true });
  }, [currentIndex, jumpToIndex]);

  const togglePlayPause = useCallback(() => {
    setPlaybackState((prev) =>
      prev === PlaybackState.Playing ? PlaybackState.Paused : PlaybackState.Playing,
    );
    resetControlAutoHide();
  }, [resetControlAutoHide]);

  useEffect(() => {
    StatusBar.setHidden(true, 'fade');
    resetControlAutoHide();
    restartStoryTimer();

    return () => {
      StatusBar.setHidden(false, 'fade');
      if (controlsTimerRef.current) {
        clearTimeout(controlsTimerRef.current);
      }
      if (storyTimerRef.current) {
        clearTimeout(storyTimerRef.current);
      }
    };
  }, [resetControlAutoHide, restartStoryTimer]);

  useEffect(() => {
    restartStoryTimer();
  }, [currentIndex, restartStoryTimer]);

  useEffect(() => {
    if (!storyVisible || !storyText) {
      Animated.parallel([
        Animated.timing(storyOpacity, {
          toValue: 0,
          duration: 170,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(storyTranslateY, {
          toValue: 6,
          duration: 170,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    storyOpacity.setValue(0);
    storyTranslateY.setValue(12);
    Animated.parallel([
      Animated.timing(storyOpacity, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(storyTranslateY, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [
    currentIndex,
    storyOpacity,
    storyText,
    storyTitle,
    storyTranslateY,
    storyVisible,
    displayContent?.type,
  ]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && playbackState === PlaybackState.Playing) {
        setPlaybackState(PlaybackState.Paused);
        setShowResumePrompt(true);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [playbackState]);

  useEffect(() => {
    if (playbackState !== PlaybackState.Playing || photos.length === 0) {
      return;
    }

    const interval = setInterval(() => {
      setElapsedMs((prev) => {
        const next = prev + 100;
        if (next >= activeSlideDurationMs) {
          onNextAuto();
          return 0;
        }
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [activeSlideDurationMs, onNextAuto, photos.length, playbackState]);

  useEffect(() => {
    const loadMusic = async () => {
      setMusicStatus('loading');

      const sources: { kind: MusicSourceStatus; source: AVPlaybackSource }[] = [];
      if (event.musicUrl) {
        sources.push({ kind: 'remote', source: { uri: event.musicUrl } });
      }
      sources.push({ kind: 'fallback', source: DEFAULT_LOCAL_BGM });

      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });
      } catch (error) {
        console.warn('Failed to set audio mode:', error);
      }

      for (const candidate of sources) {
        try {
          const { sound } = await Audio.Sound.createAsync(candidate.source, {
            shouldPlay: false,
            isLooping: true,
            volume: 1,
          });
          soundRef.current = sound;
          setMusicStatus(candidate.kind);
          if (playbackStateRef.current === PlaybackState.Playing) {
            await sound.playAsync();
          }
          return;
        } catch (error) {
          console.warn('Failed to load slideshow music source:', candidate.kind, error);
        }
      }

      setMusicStatus(event.musicUrl ? 'error' : 'none');
      if (event.musicUrl) {
        notifyMusicError('远程音乐不可用，且本地默认音乐未找到。');
      }
    };

    void loadMusic();

    return () => {
      void (async () => {
        try {
          if (soundRef.current) {
            await soundRef.current.stopAsync();
            await soundRef.current.unloadAsync();
            soundRef.current = null;
          }
        } catch (error) {
          console.warn('Failed to cleanup slideshow audio:', error);
        }
      })();
    };
  }, [event.musicUrl]);

  useEffect(() => {
    const sound = soundRef.current;
    if (!sound) {
      return;
    }

    if (playbackState === PlaybackState.Playing) {
      void sound.playAsync();
      return;
    }

    void sound.pauseAsync();
  }, [playbackState]);

  const progress = useMemo(() => {
    if (photos.length === 0) {
      return 0;
    }
    const base = currentIndex / photos.length;
    const perPhoto = (elapsedMs / activeSlideDurationMs) * (1 / photos.length);
    return Math.max(0, Math.min(1, base + perPhoto));
  }, [activeSlideDurationMs, currentIndex, elapsedMs, photos.length]);

  const formattedShotTime = useMemo(() => {
    if (!currentPhoto?.shootTime) {
      return null;
    }
    try {
      return formatDateTime(currentPhoto.shootTime);
    } catch {
      return currentPhoto.shootTime;
    }
  }, [currentPhoto?.shootTime]);

  const displayCaption = useMemo(() => {
    const caption = currentPhoto?.caption?.trim();
    if (!caption || isGenericCaption(caption)) {
      return null;
    }
    return caption;
  }, [currentPhoto?.caption]);

  const storyBottom = controlsVisible ? insets.bottom + 20 + footerHeight + 12 : insets.bottom + 24;
  const headerTop = insets.top + 12;
  const footerBottom = insets.bottom + 20;

  const onFooterLayout = useCallback((event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    if (height > 0 && Math.abs(height - footerHeight) > 2) {
      setFooterHeight(height);
    }
  }, [footerHeight]);

  if (photos.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons name="image-off-outline" size={36} color="#95A8D0" />
        <Text style={styles.emptyText}>该事件暂无可播放照片</Text>
        <Pressable style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>返回</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      style={styles.container}
      onPress={() => {
        if (controlsVisible) {
          setControlsVisible(false);
          return;
        }
        resetControlAutoHide();
      }}
    >
      <Animated.View style={[styles.imageWrap, { opacity }]}> 
        <Image
          source={{ uri: getPhotoUri(currentPhoto) ?? undefined }}
          style={styles.photo}
          resizeMode="cover"
        />
        <View style={styles.photoShade} />
      </Animated.View>

      {storyVisible && storyText ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.storyOverlay,
            {
              bottom: storyBottom,
              opacity: storyOpacity,
              transform: [{ translateY: storyTranslateY }],
            },
          ]}
        >
          <LinearGradient
            colors={['rgba(5,17,43,0.90)', 'rgba(10,27,63,0.82)', 'rgba(4,11,24,0.78)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.storyOverlayGradient}
          >
            <View style={styles.storyHeaderRow}>
              <View style={[styles.storyTypeBadge, { backgroundColor: storyTypeMeta.tintSoft }]}> 
                <View style={[styles.storyTypeDot, { backgroundColor: storyTypeMeta.tint }]} />
                <Text style={[styles.storyTypeBadgeText, { color: storyTypeMeta.tint }]}> 
                  {storyTypeMeta.label}
                </Text>
              </View>
              {storyTitle ? (
                <Text numberOfLines={1} style={styles.storyTitleText}>
                  {storyTitle}
                </Text>
              ) : null}
            </View>
            <Text numberOfLines={4} style={styles.storyText}>
              {storyText}
            </Text>
          </LinearGradient>
        </Animated.View>
      ) : null}

      {controlsVisible ? (
        <>
          <View style={styles.header}>
            <View style={[styles.headerInner, { top: headerTop }]}> 
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.counterText}>
              {currentIndex + 1} / {photos.length}
            </Text>
            </View>
          </View>

          <View style={[styles.footer, { bottom: footerBottom }]} onLayout={onFooterLayout}>
            {formattedShotTime ? <Text style={styles.metaText}>{formattedShotTime}</Text> : null}
            {displayCaption ? <Text style={styles.captionText}>{displayCaption}</Text> : null}
            <Text style={styles.metaText}>{getMusicStatusText(musicStatus)}</Text>
            <ProgressBar progress={progress} style={styles.progressBar} />

            <View style={styles.speedRow}>
              {SPEED_OPTIONS_MS.map((value) => (
                <Pressable
                  key={value}
                  onPress={() => {
                    setSlideDurationMs(value);
                    setElapsedMs(0);
                    resetControlAutoHide();
                  }}
                  style={({ pressed }) => [
                    styles.speedPill,
                    slideDurationMs === value && styles.speedPillActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.speedPillText,
                      slideDurationMs === value && styles.speedPillTextActive,
                    ]}
                  >
                    {value / 1000}s
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.controlsRow}>
              <Pressable
                onPress={onPreviousByUser}
                style={({ pressed }) => [styles.controlBtn, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons name="skip-previous" size={24} color="#FFFFFF" />
              </Pressable>
              <Pressable
                onPress={togglePlayPause}
                style={({ pressed }) => [styles.controlBtn, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons
                  name={playbackState === PlaybackState.Playing ? 'pause' : 'play'}
                  size={24}
                  color="#FFFFFF"
                />
              </Pressable>
              <Pressable
                onPress={onNextByUser}
                style={({ pressed }) => [styles.controlBtn, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons name="skip-next" size={24} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        </>
      ) : null}

      {showResumePrompt ? (
        <View style={styles.resumePrompt}>
          <Text style={styles.resumeText}>应用从后台返回，是否继续播放？</Text>
          <Pressable
            style={({ pressed }) => [styles.resumeBtn, pressed && styles.pressed]}
            onPress={() => {
              setShowResumePrompt(false);
              setPlaybackState(PlaybackState.Playing);
              resetControlAutoHide();
            }}
          >
            <Text style={styles.resumeBtnText}>继续播放</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050B18',
  },
  imageWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4,11,24,0.30)',
  },
  header: {
    position: 'absolute',
    left: 18,
    right: 18,
  },
  headerInner: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  counterText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(7,16,34,0.62)',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(7,16,34,0.62)',
  },
  storyOverlay: {
    position: 'absolute',
    left: 18,
    right: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(180,206,255,0.34)',
    overflow: 'hidden',
    shadowColor: '#081833',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  storyOverlayGradient: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  storyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  storyTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  storyTypeDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    marginRight: 5,
  },
  storyTypeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  storyText: {
    color: '#ECF4FF',
    fontSize: 15,
    lineHeight: 23,
    letterSpacing: 0.25,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowRadius: 4,
  },
  storyTitleText: {
    flex: 1,
    color: '#A8BCF0',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  footer: {
    position: 'absolute',
    left: 18,
    right: 18,
    gap: 8,
  },
  metaText: {
    color: '#D6E1FF',
    fontSize: 12,
  },
  captionText: {
    color: '#B8C5FF',
    fontSize: 13,
    fontWeight: '600',
  },
  progressBar: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  speedRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  speedPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(7,16,34,0.62)',
  },
  speedPillActive: {
    backgroundColor: '#2F6AF6',
  },
  speedPillText: {
    color: '#D5E0FF',
    fontSize: 11,
    fontWeight: '700',
  },
  speedPillTextActive: {
    color: '#FFFFFF',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
  },
  controlBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: 'rgba(7,16,34,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
  resumePrompt: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: '40%',
    borderRadius: 14,
    backgroundColor: 'rgba(7,16,34,0.72)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  resumeText: {
    color: '#F0F5FF',
    textAlign: 'center',
    fontSize: 13,
  },
  resumeBtn: {
    marginTop: 10,
    borderRadius: 999,
    backgroundColor: '#2F6AF6',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  resumeBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#050B18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    marginTop: 8,
    color: '#A8BADF',
  },
  closeButton: {
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#2F6AF6',
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
