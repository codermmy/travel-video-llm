import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  ActionButton,
  BottomSheetScaffold,
  EmptyStateCard,
  PageContent,
  PageHeader,
  SurfaceCard,
} from '@/components/ui/revamp';
import { eventApi } from '@/services/api/eventApi';
import { JourneyPalette } from '@/styles/colors';
import type { EventDetail } from '@/types/event';
import type { LocationCityCandidate, LocationPlaceCandidate } from '@/types/location';
import { getChinaCitySections, getHotChinaCities, searchChinaCities } from '@/utils/chinaCities';
import { getReadableLocationText } from '@/utils/locationDisplay';

export default function EventLocationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId: string }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [citySheetVisible, setCitySheetVisible] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState<LocationCityCandidate | null>(null);

  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<LocationPlaceCandidate[]>([]);
  const [placeSearching, setPlaceSearching] = useState(false);

  const loadEvent = useCallback(async () => {
    if (!eventId) {
      setError('缺少事件 ID');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const nextEvent = await eventApi.getEventDetail(eventId);
      setEvent(nextEvent);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  useEffect(() => {
    const query = placeQuery.trim();
    if (!selectedCity || !query) {
      setPlaceResults([]);
      return;
    }

    const timer = setTimeout(() => {
      void (async () => {
        try {
          setPlaceSearching(true);
          const results = await eventApi.searchLocationPlaces(query, selectedCity.name);
          setPlaceResults(results);
        } finally {
          setPlaceSearching(false);
        }
      })();
    }, 250);

    return () => clearTimeout(timer);
  }, [placeQuery, selectedCity]);

  const currentLocation = useMemo(() => getReadableLocationText(event), [event]);
  const hotCities = useMemo(() => getHotChinaCities(), []);
  const filteredCities = useMemo(() => searchChinaCities(cityQuery), [cityQuery]);
  const citySections = useMemo(() => getChinaCitySections(filteredCities), [filteredCities]);

  const handleSelectPlace = useCallback(
    async (place: LocationPlaceCandidate) => {
      if (!eventId) {
        return;
      }

      try {
        setSaving(true);
        await eventApi.updateEvent(eventId, {
          locationName: place.locationName,
          detailedLocation: place.detailedLocation,
          locationTags: place.locationTags,
          gpsLat: place.gpsLat,
          gpsLon: place.gpsLon,
        });
        router.back();
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : '保存失败');
      } finally {
        setSaving(false);
      }
    },
    [eventId, router],
  );

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={JourneyPalette.accent} />
      </View>
    );
  }

  if (!event || error) {
    return (
      <View style={styles.centerState}>
        <EmptyStateCard
          icon="map-marker-alert-outline"
          title="加载失败"
          description={error || '未找到事件'}
          action={<ActionButton label="重试" onPress={() => void loadEvent()} fullWidth={false} />}
        />
      </View>
    );
  }

  return (
    <>
      <PageContent>
        <PageHeader
          title="补充地点"
          rightSlot={
            <ActionButton
              label="返回"
              tone="secondary"
              icon="arrow-left"
              fullWidth={false}
              onPress={() => router.back()}
            />
          }
        />

        <SurfaceCard style={styles.eventCard}>
          <Text style={styles.eventTitle}>{event.title || '未命名事件'}</Text>
          <Text style={styles.eventMeta}>{currentLocation || '还没有地点'}</Text>
        </SurfaceCard>

        <View style={styles.searchRow}>
          <Pressable
            onPress={() => setCitySheetVisible(true)}
            style={({ pressed }) => [styles.cityButton, pressed && styles.pressed]}
          >
            <Text numberOfLines={1} style={styles.cityButtonText}>
              {selectedCity?.name || '选择城市'}
            </Text>
          </Pressable>
          <TextInput
            value={placeQuery}
            onChangeText={setPlaceQuery}
            editable={Boolean(selectedCity) && !saving}
            placeholder={selectedCity ? '搜索地点' : '先选择城市'}
            placeholderTextColor={JourneyPalette.muted}
            style={[styles.searchInput, !selectedCity && styles.searchInputDisabled]}
          />
        </View>

        {!selectedCity ? (
          <EmptyStateCard
            icon="map-search-outline"
            title="先选择城市"
            description="选择城市后，再搜索具体地点。"
            action={
              <ActionButton
                label="选择城市"
                tone="secondary"
                onPress={() => setCitySheetVisible(true)}
                fullWidth={false}
              />
            }
          />
        ) : placeSearching ? (
          <View style={styles.centerInline}>
            <ActivityIndicator color={JourneyPalette.accent} />
          </View>
        ) : placeQuery.trim() && placeResults.length === 0 ? (
          <EmptyStateCard
            icon="map-marker-off-outline"
            title="没有找到地点"
            description="换个关键词试试。"
          />
        ) : (
          <SurfaceCard style={styles.resultsCard}>
            {placeResults.map((place, index) => (
              <View key={`${place.name}-${place.gpsLat}-${place.gpsLon}`}>
                <Pressable
                  onPress={() => {
                    void handleSelectPlace(place);
                  }}
                  disabled={saving}
                  style={({ pressed }) => [
                    styles.resultRow,
                    pressed && styles.pressed,
                    saving && styles.disabledAction,
                  ]}
                >
                  <View style={styles.resultCopy}>
                    <Text style={styles.resultTitle}>{place.name}</Text>
                    <Text style={styles.resultAddress}>
                      {place.address || place.detailedLocation}
                    </Text>
                  </View>
                  {saving ? <ActivityIndicator color={JourneyPalette.accent} /> : null}
                </Pressable>
                {index < placeResults.length - 1 ? <View style={styles.divider} /> : null}
              </View>
            ))}
          </SurfaceCard>
        )}
      </PageContent>

      <Modal
        visible={citySheetVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setCitySheetVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCitySheetVisible(false)} />
          <BottomSheetScaffold
            title="选择城市"
            onClose={() => setCitySheetVisible(false)}
            style={styles.citySheet}
            bodyStyle={styles.citySheetBody}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.citySheetContent}
            >
              <TextInput
                value={cityQuery}
                onChangeText={setCityQuery}
                placeholder="搜索城市"
                placeholderTextColor={JourneyPalette.muted}
                style={styles.citySearchInput}
              />

              {cityQuery.trim() ? null : (
                <View style={styles.hotBlock}>
                  <Text style={styles.hotTitle}>热门城市</Text>
                  <View style={styles.hotGrid}>
                    {hotCities.map((city) => (
                      <Pressable
                        key={city.adcode}
                        onPress={() => {
                          setSelectedCity(city);
                          setCitySheetVisible(false);
                          setPlaceQuery('');
                          setPlaceResults([]);
                        }}
                        style={({ pressed }) => [styles.hotChip, pressed && styles.pressed]}
                      >
                        <Text style={styles.hotChipText}>{city.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              {citySections.length === 0 ? (
                <EmptyStateCard
                  icon="city-variant-outline"
                  title="没有找到城市"
                  description="换个关键词试试。"
                />
              ) : (
                <SectionList
                  sections={citySections}
                  keyExtractor={(item) => item.adcode}
                  stickySectionHeadersEnabled={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.cityListContent}
                  renderSectionHeader={({ section }) => (
                    <Text style={styles.sectionHeader}>{section.title}</Text>
                  )}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => {
                        setSelectedCity(item);
                        setCitySheetVisible(false);
                        setPlaceQuery('');
                        setPlaceResults([]);
                      }}
                      style={({ pressed }) => [styles.resultRow, pressed && styles.pressed]}
                    >
                      <View style={styles.resultCopy}>
                        <Text style={styles.resultTitle}>{item.name}</Text>
                        <Text style={styles.resultAddress}>{item.displayName}</Text>
                      </View>
                    </Pressable>
                  )}
                  ItemSeparatorComponent={() => <View style={styles.divider} />}
                />
              )}
            </KeyboardAvoidingView>
          </BottomSheetScaffold>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: JourneyPalette.cardAlt,
    padding: 16,
  },
  eventCard: {
    gap: 6,
  },
  eventTitle: {
    color: JourneyPalette.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  eventMeta: {
    color: JourneyPalette.inkSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cityButton: {
    minWidth: 110,
    maxWidth: 150,
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.card,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  cityButtonText: {
    color: JourneyPalette.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  searchInput: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.card,
    paddingHorizontal: 14,
    color: JourneyPalette.ink,
  },
  searchInputDisabled: {
    opacity: 0.6,
  },
  resultsCard: {
    paddingVertical: 6,
    paddingHorizontal: 0,
  },
  resultRow: {
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  resultCopy: {
    flex: 1,
    gap: 4,
  },
  resultTitle: {
    color: JourneyPalette.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  resultAddress: {
    color: JourneyPalette.inkSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  divider: {
    marginLeft: 16,
    height: 1,
    backgroundColor: JourneyPalette.line,
  },
  centerInline: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.34)',
  },
  citySheet: {
    height: '90%',
    paddingBottom: 0,
  },
  citySheetBody: {
    flex: 1,
    minHeight: 0,
  },
  citySheetContent: {
    flex: 1,
    minHeight: 0,
    gap: 14,
  },
  citySearchInput: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.cardAlt,
    paddingHorizontal: 14,
    color: JourneyPalette.ink,
  },
  hotBlock: {
    gap: 10,
  },
  hotTitle: {
    color: JourneyPalette.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  hotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  hotChip: {
    minHeight: 38,
    borderRadius: 999,
    paddingHorizontal: 14,
    backgroundColor: JourneyPalette.cardAlt,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hotChipText: {
    color: JourneyPalette.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  cityListContent: {
    paddingBottom: 20,
  },
  sectionHeader: {
    paddingTop: 6,
    paddingBottom: 6,
    color: JourneyPalette.inkSoft,
    fontSize: 12,
    fontWeight: '800',
  },
  disabledAction: {
    opacity: 0.55,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
});
