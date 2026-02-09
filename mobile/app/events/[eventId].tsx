import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { PhotoGrid } from '@/components/photo/PhotoGrid';
import { eventApi } from '@/services/api/eventApi';
import { taskApi } from '@/services/api/taskApi';
import { usePhotoViewerStore } from '@/stores/photoViewerStore';
import { useSlideshowStore } from '@/stores/slideshowStore';
import type { EventDetail, EventStatus } from '@/types/event';
import { formatDateRange } from '@/utils/dateUtils';

const STATUS_META: Record<EventStatus, { label: string; color: string }> = {
  clustered: { label: '已聚类（待AI）', color: '#6A7BA4' },
  ai_pending: { label: '待生成', color: '#7C87AA' },
  ai_processing: { label: 'AI 生成中', color: '#2D6EF5' },
  generated: { label: '已完成', color: '#0C9C7E' },
  ai_failed: { label: '生成失败', color: '#C34A5F' },
};

function getFallbackDateRange(event: EventDetail): string {
  if (!event.startTime && !event.endTime) {
    return '时间待补充';
  }

  const start = event.startTime || event.endTime || '';
  const end = event.endTime || event.startTime || '';

  try {
    return formatDateRange(start, end);
  } catch {
    return `${start || '-'} - ${end || '-'}`;
  }
}

function resolveLocation(event: EventDetail): string {
  if (event.locationName?.trim()) {
    return event.locationName;
  }
  if (typeof event.gpsLat === 'number' && typeof event.gpsLon === 'number') {
    return `${event.gpsLat.toFixed(4)}, ${event.gpsLon.toFixed(4)}`;
  }
  return '地点待补充';
}

export default function EventDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId: string }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [coverFailed, setCoverFailed] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const setPhotoViewerSession = usePhotoViewerStore((s) => s.setSession);
  const setSlideshowSession = useSlideshowStore((s) => s.setSession);

  const loadDetail = useCallback(async () => {
    if (!eventId) {
      setError('缺少事件 ID');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await eventApi.getEventDetail(eventId);
      setEvent(data);
      setCoverFailed(false);
    } catch (err) {
      console.error('[event-detail] failed to load detail', err);
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const onPhotoPress = useCallback(
    (_: EventDetail['photos'][number], index: number) => {
      if (!event || event.photos.length === 0) {
        return;
      }
      setPhotoViewerSession(event.photos, index);
      router.push('/photo-viewer');
    },
    [event, router, setPhotoViewerSession],
  );

  const onPlaySlideshow = useCallback(() => {
    if (!event || event.photos.length === 0) {
      Alert.alert('暂无照片', '该事件目前没有可播放的照片。');
      return;
    }

    setSlideshowSession(
      {
        id: event.id,
        title: event.title,
        musicUrl: event.musicUrl ?? null,
        storyText: event.storyText ?? null,
      },
      event.photos,
    );

    router.push('/slideshow');
  }, [event, router, setSlideshowSession]);

  const retryAiStory = useCallback(async () => {
    if (!event) {
      return;
    }

    try {
      setIsRegenerating(true);
      const result = await eventApi.regenerateStory(event.id);

      if (result.taskId) {
        const start = Date.now();
        while (Date.now() - start < 60_000) {
          const task = await taskApi.getTaskStatus(result.taskId);
          if (task.status === 'success' || task.status === 'failure') {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      await loadDetail();
      Alert.alert('已提交', '故事生成任务已刷新。');
    } catch (err) {
      Alert.alert('重试失败', err instanceof Error ? err.message : '请稍后再试');
    } finally {
      setIsRegenerating(false);
    }
  }, [event, loadDetail]);

  const dateRangeText = useMemo(() => {
    if (!event) {
      return '';
    }
    return getFallbackDateRange(event);
  }, [event]);

  if (loading) {
    return (
      <SafeAreaView style={styles.centerScreen}>
        <StatusBar barStyle="dark-content" />
        <ActivityIndicator size="large" color="#2F6AF6" />
        <Text style={styles.centerText}>正在加载事件详情...</Text>
      </SafeAreaView>
    );
  }

  if (!event || error) {
    return (
      <SafeAreaView style={styles.centerScreen}>
        <StatusBar barStyle="dark-content" />
        <MaterialCommunityIcons name="cloud-alert-outline" size={42} color="#D55D5D" />
        <Text style={styles.errorText}>{error || '未找到事件'}</Text>
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
          onPress={loadDetail}
        >
          <Text style={styles.primaryBtnText}>重试</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]}
          onPress={() => router.back()}
        >
          <Text style={styles.ghostBtnText}>返回</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const statusMeta = STATUS_META[event.status] || STATUS_META.clustered;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          {!coverFailed && event.coverPhotoUrl ? (
            <Image
              source={{ uri: event.coverPhotoUrl }}
              style={styles.heroImage}
              resizeMode="cover"
              onError={() => setCoverFailed(true)}
            />
          ) : (
            <LinearGradient colors={['#D5E1FF', '#DFF1E8']} style={styles.heroFallback}>
              <MaterialCommunityIcons name="image-filter-hdr" size={52} color="#4A64A7" />
              <Text style={styles.heroFallbackText}>{event.coverPhotoUrl ? '封面加载失败' : '暂无封面'}</Text>
            </LinearGradient>
          )}

          <LinearGradient colors={['rgba(8,18,42,0.08)', 'rgba(8,18,42,0.7)']} style={styles.heroShade} />

          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            onPress={() => router.back()}
          >
            <MaterialCommunityIcons name="chevron-left" size={18} color="#10204A" />
            <Text style={styles.backBtnText}>返回</Text>
          </Pressable>

          <View style={styles.heroMeta}>
            <Text style={styles.heroTitle}>{event.title || '未命名事件'}</Text>
            <Text style={styles.heroSub}>{resolveLocation(event)}</Text>
            <Text style={styles.heroSub}>{dateRangeText}</Text>
          </View>
        </View>

        <View style={styles.quickStats}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{event.photoCount}</Text>
            <Text style={styles.statLabel}>照片</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{event.emotionTag || '未标注'}</Text>
            <Text style={styles.statLabel}>心情</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: statusMeta.color }]}>{statusMeta.label}</Text>
            <Text style={styles.statLabel}>状态</Text>
          </View>
        </View>

        {event.storyText ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>旅行故事</Text>
            <Text style={styles.sectionBody}>{event.storyText}</Text>
          </View>
        ) : (
          <View style={styles.warningCard}>
            <View style={styles.warningHeader}>
              <MaterialCommunityIcons name="robot-outline" size={18} color="#9A5A37" />
              <Text style={styles.warningTitle}>故事尚未完成</Text>
            </View>
            <Text style={styles.warningText}>
              {event.aiError ? `原因：${event.aiError}` : 'AI 正在生成中，或尚未开始。'}
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.retryAiBtn,
                pressed && styles.pressed,
                isRegenerating && styles.retryAiBtnDisabled,
              ]}
              disabled={isRegenerating}
              onPress={retryAiStory}
            >
              {isRegenerating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.retryAiBtnText}>重试生成故事</Text>
              )}
            </Pressable>
          </View>
        )}

        {event.musicUrl ? (
          <View style={styles.sectionCard}>
            <View style={styles.musicHeader}>
              <View style={styles.musicTitleWrap}>
                <MaterialCommunityIcons name="music-circle-outline" size={18} color="#3D57A7" />
                <Text style={styles.sectionTitle}>背景音乐</Text>
              </View>
            </View>
            <Text style={styles.sectionHint}>已关联音乐资源，幻灯片播放时将自动加载。</Text>
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <View style={styles.albumHeader}>
            <Text style={styles.sectionTitle}>相册 · {event.photos.length} 张</Text>
            <Pressable
              style={({ pressed }) => [styles.playBtn, pressed && styles.pressed]}
              onPress={onPlaySlideshow}
            >
              <MaterialCommunityIcons name="play-circle-outline" size={16} color="#FFFFFF" />
              <Text style={styles.playBtnText}>播放幻灯片</Text>
            </Pressable>
          </View>

          <PhotoGrid
            photos={event.photos}
            onPhotoPress={onPhotoPress}
            emptyText="这个事件还没有可展示的照片"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F6FB',
  },
  content: {
    padding: 16,
    paddingBottom: 30,
    gap: 14,
  },
  centerScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F6FB',
    padding: 24,
  },
  centerText: {
    marginTop: 10,
    color: '#617194',
  },
  errorText: {
    marginTop: 10,
    marginBottom: 16,
    color: '#4E5C7F',
  },
  heroCard: {
    height: 280,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D8E2F7',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroFallbackText: {
    marginTop: 8,
    fontSize: 12,
    color: '#4A5E93',
    fontWeight: '600',
  },
  heroShade: {
    ...StyleSheet.absoluteFillObject,
  },
  backBtn: {
    position: 'absolute',
    top: 14,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  backBtnText: {
    marginLeft: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#10204A',
  },
  heroMeta: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
  },
  heroSub: {
    marginTop: 5,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
  },
  quickStats: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E8FA',
    alignItems: 'center',
    paddingVertical: 11,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#28385E',
    textAlign: 'center',
  },
  statLabel: {
    marginTop: 4,
    fontSize: 11,
    color: '#7E8CAE',
  },
  sectionCard: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E8FA',
    padding: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#28385E',
  },
  sectionBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 22,
    color: '#4C5C80',
  },
  warningCard: {
    borderRadius: 16,
    backgroundColor: '#FFF7EE',
    borderWidth: 1,
    borderColor: '#F4DDC8',
    padding: 14,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  warningTitle: {
    fontSize: 15,
    color: '#854E32',
    fontWeight: '700',
  },
  warningText: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: '#8A5B3F',
  },
  retryAiBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#D46A3E',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  retryAiBtnDisabled: {
    opacity: 0.7,
  },
  retryAiBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  sectionHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#6E7FA2',
  },
  musicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  musicTitleWrap: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  albumHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: '#2F6AF6',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  playBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  primaryBtn: {
    borderRadius: 999,
    backgroundColor: '#2F6AF6',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  ghostBtn: {
    marginTop: 10,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ghostBtnText: {
    color: '#66779D',
    fontWeight: '600',
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
});
