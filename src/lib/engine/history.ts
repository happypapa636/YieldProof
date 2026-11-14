/**
 * Historical series helpers. History is only ever made of real observations
 * (DefiLlama's archived pool series and YieldProof's own daily snapshots);
 * these helpers report how much data actually exists instead of interpolating.
 */

export const HISTORY_RANGES = [
  { id: "7d", label: "7D", days: 7 },
  { id: "30d", label: "30D", days: 30 },
  { id: "90d", label: "90D", days: 90 },
  { id: "1y", label: "1Y", days: 365 },
] as const;
export type HistoryRangeId = (typeof HISTORY_RANGES)[number]["id"];

export interface TimedPoint {
  t: string; // ISO timestamp
}

const DAY = 86_400_000;

export function rangeDays(id: HistoryRangeId): number {
  return HISTORY_RANGES.find((r) => r.id === id)?.days ?? 30;
}

export function filterRange<T extends TimedPoint>(points: T[], days: number, now: Date = new Date()): T[] {
  const from = now.getTime() - days * DAY;
  return points
    .filter((p) => {
      const ts = Date.parse(p.t);
      return Number.isFinite(ts) && ts >= from && ts <= now.getTime() + 60_000;
    })
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

export interface Coverage {
  samples: number;
  distinctDays: number;
  expectedDays: number;
  coveragePct: number; // 0..1
  first: string | null;
  last: string | null;
  /** Longest run of calendar days with no observation inside the window. */
  longestGapDays: number;
}

export function coverage<T extends TimedPoint>(points: T[], days: number, now: Date = new Date()): Coverage {
  const inRange = filterRange(points, days, now);
  const dayKeys = new Set(inRange.map((p) => new Date(p.t).toISOString().slice(0, 10)));
  let longestGap = 0;
  let run = 0;
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(now.getTime() - i * DAY).toISOString().slice(0, 10);
    if (dayKeys.has(key)) run = 0;
    else {
      run++;
      longestGap = Math.max(longestGap, run);
    }
  }
  return {
    samples: inRange.length,
    distinctDays: dayKeys.size,
    expectedDays: days,
    coveragePct: Math.min(1, dayKeys.size / days),
    first: inRange[0]?.t ?? null,
    last: inRange[inRange.length - 1]?.t ?? null,
    longestGapDays: longestGap,
  };
}

/**
 * A range is offered only when the series actually reaches back that far
 * (earliest observation at or before the range start, with one day of grace)
 * and the window contains at least two observations.
 */
export function rangeAvailable<T extends TimedPoint>(points: T[], days: number, now: Date = new Date()): boolean {
  if (points.length < 2) return false;
  const earliest = Math.min(...points.map((p) => Date.parse(p.t)).filter(Number.isFinite));
  const reaches = earliest <= now.getTime() - (days - 1) * DAY;
  return reaches && filterRange(points, days, now).length >= 2;
}

/** Keep one observation per UTC day (the latest) — DefiLlama sometimes posts intraday updates. */
export function dailyLast<T extends TimedPoint>(points: T[]): T[] {
  const byDay = new Map<string, T>();
  for (const p of [...points].sort((a, b) => Date.parse(a.t) - Date.parse(b.t))) {
    byDay.set(new Date(p.t).toISOString().slice(0, 10), p);
  }
  return [...byDay.values()];
}
