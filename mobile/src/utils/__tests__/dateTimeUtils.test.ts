import { describe, expect, test } from 'vitest';

import { normalizeDateTime } from '../dateTimeUtils';

describe('normalizeDateTime', () => {
  test('converts EXIF datetime format', () => {
    const iso = normalizeDateTime('2024:01:15 14:30:00');
    const parsed = new Date(iso);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
    expect(parsed.getUTCFullYear()).toBe(2024);
  });

  test('returns ISO for numeric timestamp', () => {
    const iso = normalizeDateTime(0);
    expect(iso).toBe('1970-01-01T00:00:00.000Z');
  });

  test('invalid date returns current-ish ISO', () => {
    const iso = normalizeDateTime('not-a-date');
    expect(Number.isNaN(new Date(iso).getTime())).toBe(false);
  });
});
