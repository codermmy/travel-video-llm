const MAX_SAFE_YEAR = 9999;
const MIN_SAFE_YEAR = 1;

function isSafeYear(year: number): boolean {
  return Number.isInteger(year) && year >= MIN_SAFE_YEAR && year <= MAX_SAFE_YEAR;
}

function normalizeDateTimeString(input: string): string {
  return input
    .trim()
    .replace(/^([0-9]{4}):([0-9]{2}):([0-9]{2})/, '$1-$2-$3')
    .replace(' ', 'T');
}

function epochToMillis(epoch: number): number | null {
  if (!Number.isFinite(epoch)) {
    return null;
  }

  if (epoch <= 0) {
    return null;
  }

  const now = Date.now();
  const candidates = [epoch, epoch * 1000, epoch / 1000]
    .map((ms) => Math.floor(ms))
    .filter((ms) => Number.isFinite(ms));

  const scored = candidates
    .map((ms) => {
      const date = new Date(ms);
      const year = date.getUTCFullYear();
      return {
        ms,
        year,
        valid: Number.isFinite(date.getTime()) && isSafeYear(year),
        distance: Math.abs(ms - now),
      };
    })
    .filter((x) => x.valid);

  if (scored.length === 0) {
    return null;
  }

  const plausible = scored.filter((x) => x.year >= 1970 && x.year <= 2100);
  const pool = plausible.length > 0 ? plausible : scored;
  pool.sort((a, b) => a.distance - b.distance);
  return pool[0]?.ms ?? null;
}

export function toSafeIsoDateTime(input?: string | number | null): string | undefined {
  if (input === undefined || input === null || input === '') {
    return undefined;
  }

  const date =
    typeof input === 'number'
      ? new Date(epochToMillis(input) ?? Number.NaN)
      : new Date(normalizeDateTimeString(input));

  if (!Number.isFinite(date.getTime())) {
    return undefined;
  }

  const year = date.getUTCFullYear();
  if (!isSafeYear(year)) {
    return undefined;
  }

  return date.toISOString();
}

export function toSafeEpochMs(epoch?: number | null): number | undefined {
  if (typeof epoch !== 'number') {
    return undefined;
  }
  const ms = epochToMillis(epoch);
  return ms === null ? undefined : ms;
}

export function normalizeDateTime(dateTime?: string | number): string {
  return toSafeIsoDateTime(dateTime) ?? new Date().toISOString();
}
