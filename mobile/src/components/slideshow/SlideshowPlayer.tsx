import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  AppState,
  Image,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import { Audio, type AVPlaybackSource } from 'expo-av';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ProgressBar } from 'react-native-paper';

import { PlaybackState, type SlideshowProps } from '@/types/slideshow';
import { formatDateTime } from '@/utils/dateUtils';

const SPEED_OPTIONS_MS = [2000, 3000, 5000] as const;
const DEFAULT_SLIDE_DURATION_MS = 3000;
const CONTROL_AUTO_HIDE_MS = 3000;
const STORY_VISIBLE_MS = 3000;
const DEFAULT_LOCAL_BGM = require('../../../assets/audio/default-bgm.wav');

type MusicSourceStatus = 'loading' | 'remote' | 'fallback' | 'none' | 'error';

function getPhotoUri(photo: SlideshowProps['photos'][number]): string | null {
  return photo.photoUrl ?? photo.thumbnailUrl ?? null;
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

export function SlideshowPlayer({ photos, event, onClose }: SlideshowProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playbackState, setPlaybackState] = useState<PlaybackState>(PlaybackState.Playing);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [storyVisible, setStoryVisible] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [slideDurationMs, setSlideDurationMs] = useState(DEFAULT_SLIDE_DURATION_MS);
  const [musicStatus, setMusicStatus] = useState<MusicSourceStatus>('loading');

  const opacity = useRef(new Animated.Value(1)).current;
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const playbackStateRef = useRef(playbackState);

  const currentPhoto = photos[currentIndex];
  const storyText = currentPhoto?.storyText || event.storyText || '';

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
    }, STORY_VISIBLE_MS);
  }, [storyText]);

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
    (index: number) => {
      if (photos.length === 0) {
        return;
      }
      const normalized = (index + photos.length) % photos.length;
      animateSlideTransition(normalized);
      resetControlAutoHide();
    },
    [animateSlideTransition, photos.length, resetControlAutoHide],
  );

  const onNext = useCallback(() => {
    jumpToIndex(currentIndex + 1);
  }, [currentIndex, jumpToIndex]);

  const onPrevious = useCallback(() => {
    jumpToIndex(currentIndex - 1);
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
    if (playbackState !== PlaybackState.Playing || photos.length <= 1) {
      return;
    }

    const startedAt = Date.now();
    setElapsedMs(0);

    const ticker = setInterval(() => {
      const nextElapsed = Date.now() - startedAt;
      setElapsedMs(Math.min(nextElapsed, slideDurationMs));
    }, 100);

    const timer = setTimeout(() => {
      jumpToIndex(currentIndex + 1);
    }, slideDurationMs);

    return () => {
      clearInterval(ticker);
      clearTimeout(timer);
    };
  }, [currentIndex, jumpToIndex, photos.length, playbackState, slideDurationMs]);

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
    const perPhoto = (elapsedMs / slideDurationMs) * (1 / photos.length);
    return Math.max(0, Math.min(1, base + perPhoto));
  }, [currentIndex, elapsedMs, photos.length, slideDurationMs]);

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
        <View style={styles.storyOverlay}>
          <Text numberOfLines={4} style={styles.storyText}>
            {storyText}
          </Text>
        </View>
      ) : null}

      {controlsVisible ? (
        <>
          <View style={styles.header}>
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

          <View style={styles.footer}>
            {formattedShotTime ? <Text style={styles.metaText}>{formattedShotTime}</Text> : null}
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
                onPress={onPrevious}
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
                onPress={onNext}
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
    top: 56,
    left: 18,
    right: 18,
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
    bottom: 190,
    borderRadius: 14,
    backgroundColor: 'rgba(7,16,34,0.54)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  storyText: {
    color: '#F2F5FF',
    fontSize: 14,
    lineHeight: 22,
  },
  footer: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 36,
    gap: 8,
  },
  metaText: {
    color: '#D6E1FF',
    fontSize: 12,
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
