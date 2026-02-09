import { describe, expect, test } from 'vitest';

import { compareHashes, isValidHash } from '../hashPrimitives';

describe('isValidHash', () => {
  test('accepts 64-hex', () => {
    expect(isValidHash('a'.repeat(64))).toBe(true);
    expect(isValidHash('A'.repeat(64))).toBe(true);
  });

  test('rejects invalid', () => {
    expect(isValidHash('a'.repeat(63))).toBe(false);
    expect(isValidHash('g'.repeat(64))).toBe(false);
  });
});

describe('compareHashes', () => {
  test('case-insensitive equality', () => {
    expect(compareHashes('a'.repeat(64), 'A'.repeat(64))).toBe(true);
  });
});
