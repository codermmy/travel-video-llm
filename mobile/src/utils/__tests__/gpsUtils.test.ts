import { describe, expect, test } from 'vitest';

import { formatGps, isValidGps } from '../gpsUtils';

describe('isValidGps', () => {
  test('valid coordinates', () => {
    expect(isValidGps(30.259, 120.215)).toBe(true);
  });

  test('invalid coordinates', () => {
    expect(isValidGps(91, 0)).toBe(false);
    expect(isValidGps(0, 181)).toBe(false);
    expect(isValidGps(undefined, 0)).toBe(false);
  });
});

describe('formatGps', () => {
  test('formats N/E and rounds to 4 decimals', () => {
    expect(formatGps(30.25912, 120.21599)).toBe('30.2591°N, 120.2160°E');
  });

  test('formats S/W', () => {
    expect(formatGps(-1.23456, -2.34567)).toBe('1.2346°S, 2.3457°W');
  });
});
