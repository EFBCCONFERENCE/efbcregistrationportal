/**
 * Eastern-time pricing tier selection — mirrors backend `registrationController.pickActivePricingTier`.
 * Never falls back to "last tier in JSON" for ambiguous gaps (that wrongly picked on-site pricing).
 */

export function getEasternTimeMidnight(dateString: string): number {
  if (!dateString) return -Infinity;

  try {
    const [year, month, day] = dateString.split('-').map(Number);
    if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) {
      return new Date(dateString + 'T00:00:00Z').getTime();
    }

    let guessUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    let easternTime = formatter.format(guessUtc);
    let [easternHour, easternMinute] = easternTime.split(':').map(Number);

    let iterations = 0;
    while ((easternHour !== 0 || easternMinute !== 0) && iterations < 10) {
      const hoursToSubtract = easternHour;
      const minutesToSubtract = easternMinute;
      const adjustmentMs = (hoursToSubtract * 60 + minutesToSubtract) * 60 * 1000;
      guessUtc = new Date(guessUtc.getTime() - adjustmentMs);
      easternTime = formatter.format(guessUtc);
      [easternHour, easternMinute] = easternTime.split(':').map(Number);
      iterations++;
    }

    return guessUtc.getTime();
  } catch (error) {
    console.warn(`Failed to parse date ${dateString} as Eastern Time, using UTC:`, error);
    return new Date(dateString + 'T00:00:00Z').getTime();
  }
}

export function getEasternTimeEndOfDay(dateString: string): number {
  if (!dateString) return Infinity;

  try {
    const [year, month, day] = dateString.split('-').map(Number);
    if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) {
      const fallbackDate = new Date(dateString + 'T00:00:00Z');
      fallbackDate.setUTCDate(fallbackDate.getUTCDate() + 1);
      return getEasternTimeMidnight(
        `${fallbackDate.getUTCFullYear()}-${String(fallbackDate.getUTCMonth() + 1).padStart(2, '0')}-${String(fallbackDate.getUTCDate()).padStart(2, '0')}`
      );
    }

    const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const [yy, mm, dd] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(yy, mm - 1, dd));
    dt.setUTCDate(dt.getUTCDate() + 1);
    const nextDayStr = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
    return getEasternTimeMidnight(nextDayStr);
  } catch (error) {
    console.warn(`Failed to parse end date ${dateString} as Eastern Time, using UTC:`, error);
    const fallbackDate = new Date(dateString + 'T00:00:00Z');
    fallbackDate.setUTCDate(fallbackDate.getUTCDate() + 1);
    return fallbackDate.getTime();
  }
}

/** Current instant as a UTC ms value comparable to Eastern midnight / end-of-day bounds from above. */
export function getCurrentEasternTimeMs(): number {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
  const month = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
  const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
  const second = parseInt(parts.find(p => p.type === 'second')?.value || '0');

  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const easternMidnight = getEasternTimeMidnight(dateStr);

  const hoursMs = hour * 60 * 60 * 1000;
  const minutesMs = minute * 60 * 1000;
  const secondsMs = second * 1000;

  return easternMidnight + hoursMs + minutesMs + secondsMs;
}

export function parsePricingTierArray(v: unknown): any[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'object') return [v];
  try {
    const x = JSON.parse(String(v));
    return Array.isArray(x) ? x : x && typeof x === 'object' ? [x] : [];
  } catch {
    return [];
  }
}

function easternYyyyMmDdFromTimestamp(ms: number): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date(ms));
  const y = parts.find(p => p.type === 'year')?.value || '0';
  const mo = parts.find(p => p.type === 'month')?.value || '01';
  const d = parts.find(p => p.type === 'day')?.value || '01';
  return `${y}-${mo}-${d}`;
}

/**
 * Choose active pricing tier for an instant in Eastern Time.
 * 1) Half-open window [start, end).
 * 2) If none match, inclusive calendar match on tier startDate/endDate (America/New_York).
 * Does not fall back to the last JSON tier for ambiguous gaps.
 */
export function pickActivePricingTier(tiersInput: any[], nowMs: number): any | null {
  const list = parsePricingTierArray(tiersInput).filter(Boolean);
  if (list.length === 0) return null;

  const mapped = list.map(t => ({
    ...t,
    s: t.startDate ? getEasternTimeMidnight(String(t.startDate)) : -Infinity,
    e: t.endDate ? getEasternTimeEndOfDay(String(t.endDate)) : Infinity,
  }));

  const hit = mapped.find((t: any) => nowMs >= t.s && nowMs < t.e);
  if (hit) return hit;

  const d = easternYyyyMmDdFromTimestamp(nowMs);
  const dated = mapped.filter((t: any) => t.startDate && t.endDate);
  const calHits = dated.filter((t: any) => d >= String(t.startDate) && d <= String(t.endDate));
  if (calHits.length === 1) return calHits[0];
  if (calHits.length > 1) {
    return [...calHits].sort((a: any, b: any) => String(b.startDate).localeCompare(String(a.startDate)))[0];
  }

  const sortedByStart = [...mapped]
    .filter((t: any) => t.startDate)
    .sort((a: any, b: any) => String(a.startDate).localeCompare(String(b.startDate)));
  if (sortedByStart.length && d < String(sortedByStart[0].startDate)) {
    return sortedByStart[0];
  }

  const sortedByEnd = [...mapped]
    .filter((t: any) => t.endDate)
    .sort((a: any, b: any) => String(a.endDate).localeCompare(String(b.endDate)));
  const lastEnd = sortedByEnd[sortedByEnd.length - 1];
  if (lastEnd && lastEnd.endDate && d > String(lastEnd.endDate)) return lastEnd;

  return null;
}

/** Same as backend: `default_price` if set, else minimum listed tier price. */
export function fallbackRegistrationBasePrice(eventRow: any, tiersInput: any[]): number {
  const dp = Number(eventRow?.default_price ?? eventRow?.defaultPrice ?? 0);
  if (dp > 0) return dp;
  const nums = parsePricingTierArray(tiersInput)
    .map((t: any) => Number(t.price))
    .filter((n: number) => typeof n === 'number' && !isNaN(n));
  return nums.length > 0 ? Math.min(...nums) : 0;
}
