import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton, BottomSheetScaffold, EmptyStateCard } from '@/components/ui/revamp';
import { eventApi } from '@/services/api/eventApi';
import { JourneyPalette } from '@/styles/colors';
import type { EventDetail } from '@/types/event';
import type { LocationCityCandidate, LocationPlaceCandidate } from '@/types/location';
import { getChinaCitySections, getHotChinaCities, searchChinaCities } from '@/utils/chinaCities';

function isSamePlace(left: LocationPlaceCandidate, right: LocationPlaceCandidate): boolean {
  return (
    left.gpsLat === right.gpsLat &&
    left.gpsLon === right.gpsLon &&
    left.name === right.name &&
    left.address === right.address
  );
}

function getPlaceTitle(place: LocationPlaceCandidate): string {
  const title = place.name.trim();
  return title || '未知地点';
}

function getPlaceSubtitle(place: LocationPlaceCandidate): string {
  const subtitle = (place.address || place.detailedLocation).trim();
  return subtitle || '暂无地址信息';
}

export default function EventLocationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId: string }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [citySheetVisible, setCitySheetVisible] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState<LocationCityCandidate | null>(null);

  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<LocationPlaceCandidate[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<LocationPlaceCandidate | null>(null);
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
      setPlaceSearching(false);
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

  useEffect(() => {
    setSelectedPlace((previous) => {
      if (placeResults.length === 0) {
        return null;
      }

      if (previous) {
        const matchedPlace = placeResults.find((place) => isSamePlace(place, previous));
        if (matchedPlace) {
          return matchedPlace;
        }
      }

      return placeResults[0];
    });
  }, [placeResults]);

  const hotCities = useMemo(() => getHotChinaCities(), []);
  const filteredCities = useMemo(() => searchChinaCities(cityQuery), [cityQuery]);
  const citySections = useMemo(() => getChinaCitySections(filteredCities), [filteredCities]);
  const photoCount = event?.photoCount ?? 0;

  const handleSelectPlace = useCallback(
    async (place: LocationPlaceCandidate) => {
      if (!eventId) {
        return;
      }

      try {
        setSaving(true);
        setSaveError(null);
        await eventApi.updateEvent(eventId, {
          locationName: place.locationName,
          detailedLocation: place.detailedLocation,
          locationTags: place.locationTags,
          gpsLat: place.gpsLat,
          gpsLon: place.gpsLon,
        });
        router.back();
      } catch (saveError) {
        setSaveError(saveError instanceof Error ? saveError.message : '保存失败');
      } finally {
        setSaving(false);
      }
    },
    [eventId, router],
  );

  const handleChooseCity = useCallback((city: LocationCityCandidate) => {
    setSelectedCity(city);
    setCitySheetVisible(false);
    setPlaceQuery('');
    setPlaceResults([]);
    setSelectedPlace(null);
    setSaveError(null);
  }, []);

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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.screen}>
          <View style={[styles.header, { paddingTop: Math.max(60, insets.top + 8) }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="返回"
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.backButton,
                { top: Math.max(60, insets.top + 8) },
                pressed && styles.pressed,
              ]}
            >
              <MaterialCommunityIcons name="arrow-left" size={18} color={JourneyPalette.ink} />
            </Pressable>
            <Text style={styles.title}>补全地点</Text>
            <Text style={styles.subtitle}>为 {photoCount} 张照片手动指定位置</Text>
          </View>

          <View style={styles.searchContainer}>
            <View style={styles.searchBox}>
              <MaterialCommunityIcons name="magnify" size={20} color={JourneyPalette.muted} />
              <TextInput
                value={placeQuery}
                onChangeText={(value) => {
                  setPlaceQuery(value);
                  if (saveError) {
                    setSaveError(null);
                  }
                }}
                editable={Boolean(selectedCity) && !saving}
                placeholder="搜索地点或标志物..."
                placeholderTextColor={JourneyPalette.muted}
                style={[styles.searchInput, !selectedCity && styles.searchInputDisabled]}
              />

              <Pressable
                onPress={() => setCitySheetVisible(true)}
                style={({ pressed }) => [styles.inlineCityTrigger, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons
                  name="map-marker-outline"
                  size={16}
                  color={selectedCity ? JourneyPalette.accent : JourneyPalette.muted}
                />
                {selectedCity ? (
                  <Text numberOfLines={1} style={styles.inlineCityText}>
                    {selectedCity.name}
                  </Text>
                ) : null}
                <MaterialCommunityIcons
                  name="chevron-down"
                  size={16}
                  color={JourneyPalette.muted}
                />
              </Pressable>
            </View>
          </View>

          <View style={styles.suggestionList}>
            <View style={styles.labelGroup}>
              <Text style={styles.sectionLabel}>推荐地点</Text>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.resultsContent}
            >
              {placeSearching ? (
                <View style={styles.centerInline}>
                  <ActivityIndicator color={JourneyPalette.accent} />
                </View>
              ) : null}

              {!placeSearching
                ? placeResults.map((place, index) => {
                    const isSelected = selectedPlace ? isSamePlace(selectedPlace, place) : false;

                    return (
                      <View key={`${place.name}-${place.gpsLat}-${place.gpsLon}`}>
                        <Pressable
                          onPress={() => {
                            setSelectedPlace(place);
                            void handleSelectPlace(place);
                          }}
                          disabled={saving}
                          style={({ pressed }) => [
                            styles.resultRow,
                            isSelected && styles.resultRowSelected,
                            pressed && styles.pressed,
                            saving && styles.disabledAction,
                          ]}
                        >
                          <View
                            style={[styles.rowIconBox, isSelected && styles.rowIconBoxSelected]}
                          >
                            <MaterialCommunityIcons
                              name="map-marker"
                              size={20}
                              color={JourneyPalette.accent}
                            />
                          </View>

                          <View style={styles.resultCopy}>
                            <Text numberOfLines={1} style={styles.resultTitle}>
                              {getPlaceTitle(place)}
                            </Text>
                            <Text numberOfLines={2} style={styles.resultSubtitle}>
                              {getPlaceSubtitle(place)}
                            </Text>
                          </View>

                          {saving && isSelected ? (
                            <ActivityIndicator size="small" color={JourneyPalette.accent} />
                          ) : null}
                        </Pressable>

                        {index < placeResults.length - 1 ? <View style={styles.divider} /> : null}
                      </View>
                    );
                  })
                : null}
            </ScrollView>
          </View>

          <View style={[styles.footer, { paddingBottom: 24 + insets.bottom }]}>
            {saveError ? <Text style={styles.footerError}>{saveError}</Text> : null}
            <Pressable
              disabled={!selectedPlace || saving}
              onPress={() => {
                if (selectedPlace) {
                  void handleSelectPlace(selectedPlace);
                }
              }}
              style={({ pressed }) => [
                styles.confirmButton,
                (!selectedPlace || saving) && styles.confirmButtonDisabled,
                pressed && selectedPlace && !saving && styles.confirmButtonPressed,
              ]}
            >
              {saving ? (
                <ActivityIndicator color={JourneyPalette.white} />
              ) : (
                <Text style={styles.confirmButtonText}>确认位置</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

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
              <View style={styles.citySearchBox}>
                <MaterialCommunityIcons name="magnify" size={18} color={JourneyPalette.muted} />
                <TextInput
                  value={cityQuery}
                  onChangeText={setCityQuery}
                  placeholder="搜索城市"
                  placeholderTextColor={JourneyPalette.muted}
                  style={styles.citySearchInput}
                />
              </View>

              {cityQuery.trim() ? null : (
                <View style={styles.hotBlock}>
                  <Text style={styles.hotTitle}>热门城市</Text>
                  <View style={styles.hotGrid}>
                    {hotCities.map((city) => (
                      <Pressable
                        key={city.adcode}
                        onPress={() => handleChooseCity(city)}
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
                      onPress={() => handleChooseCity(item)}
                      style={({ pressed }) => [styles.cityRow, pressed && styles.pressed]}
                    >
                      <View style={styles.rowIconBox}>
                        <MaterialCommunityIcons
                          name="map-marker-outline"
                          size={20}
                          color={JourneyPalette.accent}
                        />
                      </View>

                      <View style={styles.resultCopy}>
                        <Text numberOfLines={1} style={styles.resultTitle}>
                          {item.name}
                        </Text>
                        <Text numberOfLines={2} style={styles.resultSubtitle}>
                          {item.displayName}
                        </Text>
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
  flex: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: JourneyPalette.background,
  },
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: JourneyPalette.background,
    padding: 24,
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    gap: 4,
  },
  backButton: {
    position: 'absolute',
    right: 24,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: JourneyPalette.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: JourneyPalette.ink,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  subtitle: {
    color: JourneyPalette.inkSoft,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  searchBox: {
    height: 56,
    borderRadius: 16,
    backgroundColor: JourneyPalette.surfaceVariant,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    color: JourneyPalette.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  searchInputDisabled: {
    color: JourneyPalette.muted,
  },
  inlineCityTrigger: {
    minHeight: 36,
    maxWidth: 132,
    borderRadius: 12,
    backgroundColor: JourneyPalette.background,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inlineCityText: {
    flexShrink: 1,
    color: JourneyPalette.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  suggestionList: {
    flex: 1,
    paddingHorizontal: 24,
  },
  labelGroup: {
    marginBottom: 16,
  },
  sectionLabel: {
    color: JourneyPalette.muted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  resultsContent: {
    paddingBottom: 24,
  },
  centerInline: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultRow: {
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  resultRowSelected: {
    borderRadius: 18,
    backgroundColor: '#F8FBFF',
  },
  rowIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: JourneyPalette.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconBoxSelected: {
    backgroundColor: JourneyPalette.accentSoft,
  },
  resultCopy: {
    flex: 1,
    gap: 2,
  },
  resultTitle: {
    color: JourneyPalette.ink,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  resultSubtitle: {
    color: JourneyPalette.muted,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  footer: {
    paddingTop: 24,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: JourneyPalette.background,
  },
  footerError: {
    color: JourneyPalette.danger,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 12,
  },
  confirmButton: {
    height: 60,
    borderRadius: 20,
    backgroundColor: JourneyPalette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.32,
  },
  confirmButtonPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.88,
  },
  confirmButtonText: {
    color: JourneyPalette.white,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.2,
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
    gap: 16,
  },
  citySearchBox: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: JourneyPalette.surfaceVariant,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  citySearchInput: {
    flex: 1,
    minHeight: 52,
    color: JourneyPalette.ink,
    fontSize: 15,
    fontWeight: '600',
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
    backgroundColor: JourneyPalette.surfaceVariant,
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
    paddingBottom: 8,
    color: JourneyPalette.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  cityRow: {
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  disabledAction: {
    opacity: 0.55,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
});
