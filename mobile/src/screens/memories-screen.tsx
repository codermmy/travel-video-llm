import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TimelineEventCard } from '@/components/timeline/TimelineEventCard';
import { MonthHeader } from '@/components/timeline/MonthHeader';
import { eventApi } from '@/services/api/eventApi';
import { AUTO_IMPORT_LIMIT, importRecentPhotos } from '@/services/album/photoImportService';
import { JourneyPalette } from '@/styles/colors';
import type { EventRecord } from '@/types/event';
import { getEventStatusMeta } from '@/utils/eventStatus';
import { getPreferredEventCoverUri } from '@/utils/mediaRefs';
import { type MonthSection, groupEventsByMonth } from '@/utils/eventGrouping';
import { useImportTaskPoller } from '@/services/tasks/useImportTaskPoller';
import * as MediaLibrary from 'expo-media-library';
import * as Linking from 'expo-linking';

export default function MemoriesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const { activeTasks, failedTasks } = useImportTaskPoller();
  const activeEventCount = activeTasks.length;
  const failedEventCount = failedTasks.length;

  const runningTaskSummary = useMemo(() => {
    if (activeTasks.length === 0) return null;
    const first = activeTasks[0];
    return first.phases[first.activePhase].label;
  }, [activeTasks]);

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await eventApi.listAllEvents();
      setEvents(data);
    } catch (loadError) {
      console.error('Failed to load events:', loadError);
      setError('无法获取回忆，请检查网络或重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadEvents();
    }, [loadEvents]),
  );

  useEffect(() => {
    void (async () => {
      const { granted } = await MediaLibrary.getPermissionsAsync();
      setShowSettings(!granted);
    })();
  }, []);

  const monthSections = useMemo(() => groupEventsByMonth(events), [events]);

  const heroEvent = useMemo(() => {
    if (events.length === 0) return null;
    return events[0];
  }, [events]);

  const heroCoverUri = useMemo(() => {
    if (!heroEvent) return null;
    return getPreferredEventCoverUri(heroEvent);
  }, [heroEvent]);

  const heroEventTone = useMemo(() => {
    if (!heroEvent) return 'ready';
    return getEventStatusMeta(heroEvent).tone;
  }, [heroEvent]);

  const goToEventDetail = useCallback(
    (eventId: string) => {
      router.push(`/events/${eventId}`);
    },
    [router],
  );

  const openHeroStory = useCallback(() => {
    if (heroEvent) {
      router.push(`/slideshow?eventId=${heroEvent.id}`);
    }
  }, [heroEvent, router]);

  const openAppSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  const handleRecentImport = useCallback(async () => {
    try {
      const result = await importRecentPhotos({ limit: AUTO_IMPORT_LIMIT });
      if (result.dedupedNew > 0) {
        Alert.alert('已启动整理', `正在为您整理最近的 ${result.dedupedNew} 张照片。`);
        router.push('/profile/import-tasks');
      } else {
        Alert.alert('没有新照片', '最近的照片都已经整理过啦。');
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'photo_library_permission_denied') {
        setShowSettings(true);
        Alert.alert('需要相册权限', '请前往系统设置开启相册权限。', [
          { text: '取消', style: 'cancel' },
          { text: '去设置', onPress: openAppSettings },
        ]);
        return;
      }
      Alert.alert('导入失败', '请稍后重试');
    }
  }, [openAppSettings, router]);

  const handleManualImport = useCallback(() => {
    router.push('/profile/import-tasks');
  }, [router]);

  const renderTimelineCard = useCallback(
    ({ item }: { item: EventRecord; index: number; section: MonthSection }) => {
      return (
        <TimelineEventCard
          event={item}
          onPress={goToEventDetail}
        />
      );
    },
    [goToEventDetail],
  );

  const heroSection = (
    <View style={styles.headerBlock}>
      <View style={[styles.pageHeader, { paddingTop: insets.top + 40 }]}>
        <Text selectable style={styles.pageTitle}>
          回忆
        </Text>
        <Text selectable style={styles.pageSubtitle}>
          来自你的 {events.reduce((sum, e) => sum + e.photoCount, 0).toLocaleString()} 张照片
        </Text>
      </View>

      {(failedEventCount > 0 || activeEventCount > 0) && events.length > 0 ? (
        <Pressable
          style={({ pressed }) => [styles.statusBanner, pressed && styles.pressed]}
          onPress={() => router.push('/profile/import-tasks')}
        >
          <View style={styles.statusIcon}>
            <MaterialCommunityIcons
              name={failedEventCount > 0 ? 'alert-circle-outline' : 'timeline-clock-outline'}
              size={22}
              color={JourneyPalette.accent}
            />
          </View>
          <View style={styles.statusCopy}>
            <Text style={styles.statusBannerTitle}>
              {failedEventCount > 0 ? '有回忆需要处理' : '正在为你整理回忆'}
            </Text>
            <Text style={styles.statusBannerBody}>
              {failedEventCount > 0
                ? `${failedEventCount} 个批次需重试。`
                : runningTaskSummary
                  ? `AI 正在分析${runningTaskSummary.replace(/^正在/, '')}`
                  : `AI 正在分析${heroEvent?.locationName?.trim() || '旅行'}的照片...`}
            </Text>
          </View>
        </Pressable>
      ) : null}

      {heroEvent ? (
        <Pressable
          style={({ pressed }) => [styles.heroCard, pressed && styles.pressed]}
          onPress={() => goToEventDetail(heroEvent.id)}
        >
          {heroCoverUri ? (
            <Image source={{ uri: heroCoverUri }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={styles.heroImageFallback}>
              <MaterialCommunityIcons
                name="image-filter-hdr"
                size={34}
                color={JourneyPalette.muted}
              />
            </View>
          )}
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={styles.heroShade} />
          <View style={styles.heroCopy}>
            <Text selectable style={styles.heroKicker}>
              HIGHLIGHT
            </Text>
            <Text selectable style={styles.heroTitle}>
              {heroEvent.title || '未命名事件'}
            </Text>
            <View style={styles.heroActions}>
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  if (heroEventTone === 'ready') {
                    openHeroStory();
                  } else {
                    goToEventDetail(heroEvent.id);
                  }
                }}
                style={({ pressed }) => [
                  styles.heroPrimaryBtn,
                  pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] },
                ]}
              >
                <MaterialCommunityIcons
                  name={heroEventTone === 'ready' ? 'play' : 'arrow-right'}
                  size={18}
                  color="#FFFFFF"
                />
                <Text style={styles.heroPrimaryBtnText}>
                  {heroEventTone === 'ready' ? '播放回忆' : '查看详情'}
                </Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      ) : null}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={JourneyPalette.ink} />
        <Text selectable style={styles.loadingTitle}>
          加载中...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <MaterialCommunityIcons
          name="alert-circle-outline"
          size={36}
          color={JourneyPalette.danger}
        />
        <Text selectable style={styles.errorText}>
          {error}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          onPress={() => void loadEvents()}
        >
          <Text style={styles.retryButtonText}>重试</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {events.length === 0 ? (
        <View style={styles.welcomeContainer}>
          <View style={styles.welcomeHero}>
            <Text selectable style={styles.welcomeTitle}>
              尚无回忆
            </Text>
            <Text selectable style={styles.welcomeBody}>
              导入你的旅行照片，我们将为你自动聚合地点、提炼故事，并生成专属的电影级回忆。
            </Text>

            <View style={styles.welcomeActions}>
              <Pressable
                style={({ pressed }) => [styles.primaryImportBtn, pressed && { opacity: 0.85 }]}
                onPress={handleRecentImport}
              >
                <MaterialCommunityIcons name="magic-staff" size={20} color="#FFFFFF" />
                <Text style={styles.primaryImportBtnText}>一键整理最近 200 张</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.secondaryImportBtn,
                  pressed && { backgroundColor: JourneyPalette.surfaceVariant },
                ]}
                onPress={handleManualImport}
              >
                <Text style={styles.secondaryImportBtnText}>手动选择照片导入</Text>
              </Pressable>
            </View>

            {showSettings ? (
              <View style={styles.permissionBox}>
                <MaterialCommunityIcons
                  name="cog-outline"
                  size={20}
                  color={JourneyPalette.warning}
                />
                <Text style={styles.permissionText}>需要相册权限，请前往系统设置开启</Text>
                <Pressable onPress={openAppSettings} style={styles.permissionBtn}>
                  <Text style={styles.permissionBtnText}>去设置</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      ) : (
        <SectionList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          sections={monthSections}
          keyExtractor={(item) => item.id}
          renderItem={renderTimelineCard}
          renderSectionHeader={({ section }: { section: MonthSection }) => (
            <MonthHeader section={section} isFirst={section === monthSections[0]} />
          )}
          ListHeaderComponent={heroSection}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 32,
  },
  scroll: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 100,
  },
  headerBlock: {
    gap: 0,
  },
  pageHeader: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  pageTitle: {
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -1.5,
    color: JourneyPalette.ink,
  },
  pageSubtitle: {
    fontSize: 15,
    color: JourneyPalette.inkSoft,
    fontWeight: '500',
    marginTop: 4,
  },
  statusBanner: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: JourneyPalette.surfaceVariant,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  statusIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: JourneyPalette.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 2,
  },
  statusCopy: {
    flex: 1,
    gap: 2,
  },
  statusBannerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  statusBannerBody: {
    fontSize: 13,
    color: JourneyPalette.inkSoft,
    fontWeight: '500',
  },
  heroCard: {
    height: 500,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 32,
    borderRadius: 40,
    overflow: 'hidden',
    backgroundColor: JourneyPalette.cardSoft,
    shadowColor: JourneyPalette.ink,
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.1,
    shadowRadius: 48,
    elevation: 10,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroImageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.cardMuted,
  },
  heroShade: {
    ...StyleSheet.absoluteFillObject,
  },
  heroCopy: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 28,
  },
  heroKicker: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 35.2,
    marginTop: 8,
    marginBottom: 12,
  },
  heroActions: {
    flexDirection: 'row',
  },
  heroPrimaryBtn: {
    backgroundColor: JourneyPalette.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: JourneyPalette.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 4,
  },
  heroPrimaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
  },
  loadingTitle: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '800',
    color: JourneyPalette.inkSoft,
  },
  errorText: {
    fontSize: 15,
    color: JourneyPalette.danger,
    marginVertical: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: JourneyPalette.ink,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  welcomeContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  welcomeHero: {
    gap: 16,
    marginBottom: 40,
  },
  welcomeTitle: {
    fontSize: 40,
    fontWeight: '900',
    color: JourneyPalette.ink,
    letterSpacing: -1.5,
  },
  welcomeBody: {
    fontSize: 16,
    lineHeight: 26,
    color: JourneyPalette.inkSoft,
    fontWeight: '500',
    marginBottom: 16,
  },
  welcomeActions: {
    gap: 16,
  },
  primaryImportBtn: {
    backgroundColor: JourneyPalette.ink,
    minHeight: 64,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    shadowColor: JourneyPalette.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
  },
  primaryImportBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  secondaryImportBtn: {
    backgroundColor: JourneyPalette.surfaceVariant,
    minHeight: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryImportBtnText: {
    color: JourneyPalette.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  permissionBox: {
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
    backgroundColor: JourneyPalette.warningSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  permissionText: {
    flex: 1,
    fontSize: 13,
    color: JourneyPalette.warning,
    fontWeight: '700',
  },
  permissionBtn: {
    backgroundColor: JourneyPalette.warning,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  permissionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  pressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.7,
  },
});
