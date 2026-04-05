import type { LocationCityCandidate } from '@/types/location';

type RawChinaCity = {
  code: string;
  city: string;
  pinyin: string;
  province?: string;
};

export type ChinaCitySection = {
  title: string;
  data: LocationCityCandidate[];
};

const rawChinaCities = require('../data/china-city-pinyin.json') as RawChinaCity[];

const HOT_CITY_NAMES = [
  '北京',
  '上海',
  '广州',
  '深圳',
  '杭州',
  '成都',
  '重庆',
  '西安',
  '武汉',
  '南京',
  '苏州',
  '长沙',
] as const;

function normalizeCity(raw: RawChinaCity): LocationCityCandidate & {
  province: string;
  pinyin: string;
  initial: string;
  searchText: string;
} {
  const province = raw.province?.trim() || raw.city.trim();
  const name = raw.city.trim();
  const pinyin = raw.pinyin.trim().toLowerCase();
  const initial = (pinyin[0] || '#').toUpperCase();
  return {
    name,
    displayName: province === name ? name : `${name} · ${province}`,
    adcode: raw.code.trim(),
    province,
    pinyin,
    initial: /^[A-Z]$/.test(initial) ? initial : '#',
    searchText: `${name}${province}${pinyin}`.toLowerCase(),
  };
}

const normalizedCities = rawChinaCities.map(normalizeCity).sort((left, right) => {
  if (left.initial !== right.initial) {
    return left.initial.localeCompare(right.initial);
  }
  if (left.pinyin !== right.pinyin) {
    return left.pinyin.localeCompare(right.pinyin);
  }
  return left.name.localeCompare(right.name, 'zh-Hans-CN');
});

export function getHotChinaCities(): LocationCityCandidate[] {
  const hotCitySet = new Set<string>(HOT_CITY_NAMES);
  return normalizedCities.filter((city) => hotCitySet.has(city.name));
}

export function searchChinaCities(query: string): LocationCityCandidate[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return normalizedCities;
  }

  return normalizedCities.filter((city) => city.searchText.includes(normalizedQuery));
}

export function getChinaCitySections(cities: LocationCityCandidate[]): ChinaCitySection[] {
  const typedCities = cities as ReturnType<typeof normalizeCity>[];
  const sections = new Map<string, ReturnType<typeof normalizeCity>[]>();

  typedCities.forEach((city) => {
    const existing = sections.get(city.initial) ?? [];
    existing.push(city);
    sections.set(city.initial, existing);
  });

  return Array.from(sections.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([title, data]) => ({ title, data }));
}
