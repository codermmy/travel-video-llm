import type { EventRecord } from '@/types/event';

export type MonthSection = {
  key: string;
  title: string;
  year: number | null;
  month: number | null;
  eventCount: number;
  photoCount: number;
  data: EventRecord[];
};

type SectionAccumulator = {
  key: string;
  title: string;
  year: number | null;
  month: number | null;
  eventCount: number;
  photoCount: number;
  data: EventRecord[];
};

function getPrimaryDate(event: EventRecord): Date | null {
  const raw = event.startTime ?? event.endTime ?? event.updatedAt;
  if (!raw) {
    return null;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function compareEventByDateDesc(a: EventRecord, b: EventRecord): number {
  const aDate = getPrimaryDate(a);
  const bDate = getPrimaryDate(b);
  const aTs = aDate ? aDate.getTime() : -Infinity;
  const bTs = bDate ? bDate.getTime() : -Infinity;
  return bTs - aTs;
}

function buildSectionMeta(date: Date | null): {
  key: string;
  title: string;
  year: number | null;
  month: number | null;
} {
  if (!date) {
    return {
      key: 'unknown',
      title: '时间未知',
      year: null,
      month: null,
    };
  }

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return {
    key: `${year}-${String(month).padStart(2, '0')}`,
    title: `${year}年${month}月`,
    year,
    month,
  };
}

function compareSections(a: MonthSection, b: MonthSection): number {
  if (a.year === null && b.year === null) {
    return 0;
  }
  if (a.year === null) {
    return 1;
  }
  if (b.year === null) {
    return -1;
  }

  if (a.year !== b.year) {
    return b.year - a.year;
  }

  return (b.month ?? 0) - (a.month ?? 0);
}

export function groupEventsByMonth(events: EventRecord[]): MonthSection[] {
  if (events.length === 0) {
    return [];
  }

  const sorted = [...events].sort(compareEventByDateDesc);
  const map = new Map<string, SectionAccumulator>();

  for (const event of sorted) {
    const date = getPrimaryDate(event);
    const meta = buildSectionMeta(date);
    const existing = map.get(meta.key);

    if (existing) {
      existing.data.push(event);
      existing.eventCount += 1;
      existing.photoCount += event.photoCount;
      continue;
    }

    map.set(meta.key, {
      key: meta.key,
      title: meta.title,
      year: meta.year,
      month: meta.month,
      eventCount: 1,
      photoCount: event.photoCount,
      data: [event],
    });
  }

  return Array.from(map.values())
    .map((section) => ({
      ...section,
      data: section.data.sort(compareEventByDateDesc),
    }))
    .sort(compareSections);
}
