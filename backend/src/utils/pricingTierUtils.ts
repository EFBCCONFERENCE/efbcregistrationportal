/**
 * Eastern-time pricing tier selection — shared by registration API and maintenance scripts.
 * Tier windows use half-open intervals [start, end) in UTC ms derived from America/New_York calendar dates.
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

/** Add one calendar day to YYYY-MM-DD using UTC date math (no server local timezone). */
export function addOneCalendarDayYyyyMmDd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Eastern end-of-day exclusive bound: start of the calendar day after `dateString` in America/New_York.
 */
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
    const nextDayStr = addOneCalendarDayYyyyMmDd(ymd);
    return getEasternTimeMidnight(nextDayStr);
  } catch (error) {
    console.warn(`Failed to parse end date ${dateString} as Eastern Time, using UTC:`, error);
    const fallbackDate = new Date(dateString + 'T00:00:00Z');
    fallbackDate.setUTCDate(fallbackDate.getUTCDate() + 1);
    return fallbackDate.getTime();
  }
}

export function easternYyyyMmDdFromTimestamp(ms: number): string {
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

export function parsePricingTierArray(v: any): any[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'object') return [v];
  try {
    const x = JSON.parse(v);
    return Array.isArray(x) ? x : x && typeof x === 'object' ? [x] : [];
  } catch {
    return [];
  }
}

/**
 * Choose active pricing tier for an instant (use real UTC ms, e.g. Date.now() or new Date(created_at).getTime()).
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

/**
 * When no tier matches the current instant, use `event.default_price` when set.
 * If the DB has no default (or no column), use the lowest listed tier price so we never substitute
 * an arbitrary hard-coded amount or silently total 0 when tier JSON exists.
 */
export function fallbackRegistrationBasePrice(eventRow: any, tiersInput: any[]): number {
  const dp = Number(eventRow?.default_price ?? 0);
  if (dp > 0) return dp;
  const nums = parsePricingTierArray(tiersInput)
    .map((t: any) => Number(t.price))
    .filter((n: number) => typeof n === 'number' && !isNaN(n));
  return nums.length > 0 ? Math.min(...nums) : 0;
}
