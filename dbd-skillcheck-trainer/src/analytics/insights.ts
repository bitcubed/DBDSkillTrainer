// Pure dashboard math: personal bests, day streaks, and the auto-generated
// trend readout. Every claim here is computed strictly from stored records —
// no invented numbers (spec §8.2).

import type { SessionRecord } from '../engine/types';

/** Minimum checks for a record to count toward rate/SD personal bests. */
export const PB_MIN_CHECKS = 10;

export interface PersonalBests {
  bestGreatRate: { value: number; at: number } | null; // 0..1
  lowestSd: { value: number; at: number } | null; // ms
  longestStreak: { value: number; at: number } | null;
  programsCompleted: number;
  sessionCount: number;
  dayStreakDays: number;
}

function checks(r: SessionRecord): number {
  return r.overall.great + r.overall.good + r.overall.miss;
}

/**
 * Integer day index for an epoch timestamp's LOCAL calendar date. The local
 * date parts are re-encoded through Date.UTC so the result is an exact
 * integer — dividing a local-midnight epoch directly would leave a
 * timezone-offset fraction that goes non-monotonic across DST in UTC+12/+13.
 */
function dayOf(epochMs: number): number {
  const d = new Date(epochMs);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
}

/**
 * Consecutive practice days, counting back from today (or yesterday, so an
 * unbroken streak doesn't read as 0 before today's first session).
 */
export function dayStreak(records: readonly SessionRecord[], nowMs: number): number {
  if (records.length === 0) return 0;
  const days = new Set(records.map((r) => dayOf(r.startedAt)));
  let cursor = dayOf(nowMs);
  if (!days.has(cursor)) {
    cursor -= 1; // grace: streak survives until the end of the next day
    if (!days.has(cursor)) return 0;
  }
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor -= 1;
  }
  return streak;
}

export function personalBests(records: readonly SessionRecord[], nowMs: number): PersonalBests {
  let bestGreatRate: PersonalBests['bestGreatRate'] = null;
  let lowestSd: PersonalBests['lowestSd'] = null;
  let longestStreak: PersonalBests['longestStreak'] = null;
  let programs = 0;
  for (const r of records) {
    if (r.kind === 'program') programs++;
    if (checks(r) >= PB_MIN_CHECKS) {
      if (bestGreatRate === null || r.overall.greatRate > bestGreatRate.value) {
        bestGreatRate = { value: r.overall.greatRate, at: r.startedAt };
      }
      if (r.overall.sdMs !== null && (lowestSd === null || r.overall.sdMs < lowestSd.value)) {
        lowestSd = { value: r.overall.sdMs, at: r.startedAt };
      }
    }
    if (longestStreak === null || r.overall.bestStreak > longestStreak.value) {
      longestStreak = { value: r.overall.bestStreak, at: r.startedAt };
    }
  }
  return {
    bestGreatRate,
    lowestSd,
    longestStreak,
    programsCompleted: programs,
    sessionCount: records.length,
    dayStreakDays: dayStreak(records, nowMs),
  };
}

const avg = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Older-half vs newer-half comparison over the last `n` values. */
function halves(xs: readonly number[]): [number, number] | null {
  if (xs.length < 4) return null;
  const mid = Math.floor(xs.length / 2);
  return [avg(xs.slice(0, mid)), avg(xs.slice(mid))];
}

/**
 * Short auto-generated readout over the last ≤10 sessions. Claims are strictly
 * computed: great-rate delta, ±SD delta, and current bias, or a "not enough
 * data" line when fewer than 4 sessions exist.
 */
export function trendReadout(records: readonly SessionRecord[]): string {
  if (records.length < 4) {
    return 'Log a few more runs to unlock trend insights — improvement shows up across sessions, not within one.';
  }
  const recent = records.slice(-10);
  const parts: string[] = [];

  // Deltas are computed from the ROUNDED endpoints so the readout can never
  // contradict itself (e.g. "up 1 pts (50% → 50%)").
  const rateHalves = halves(recent.map((r) => r.overall.greatRate));
  if (rateHalves) {
    const aPct = Math.round(rateHalves[0] * 100);
    const bPct = Math.round(rateHalves[1] * 100);
    const pts = bPct - aPct;
    const dir = pts > 0 ? 'up' : 'down';
    parts.push(
      pts === 0
        ? `great-rate held steady at ${bPct}% over your last ${recent.length} runs`
        : `great-rate is ${dir} ${Math.abs(pts)} pts over your last ${recent.length} runs (${aPct}% → ${bPct}%)`,
    );
  }

  const sdHalves = halves(
    recent.map((r) => r.overall.sdMs).filter((x): x is number => x !== null),
  );
  if (sdHalves) {
    const aR = Math.round(sdHalves[0]);
    const bR = Math.round(sdHalves[1]);
    const d = bR - aR;
    parts.push(
      d === 0
        ? `±SD held at ${bR}ms`
        : d < 0
          ? `±SD tightened ${Math.abs(d)}ms (${aR} → ${bR}ms)`
          : `±SD widened ${d}ms (${aR} → ${bR}ms)`,
    );
  }

  const biases = recent.map((r) => r.overall.meanMs).filter((x): x is number => x !== null);
  if (biases.length > 0) {
    const b = avg(biases);
    parts.push(
      Math.abs(b) <= 12
        ? `bias is well-centered (avg ${b < 0 ? '−' : '+'}${Math.abs(b).toFixed(0)}ms)`
        : `bias runs ${Math.abs(b).toFixed(0)}ms ${b < 0 ? 'early' : 'late'} — nudge your press ${b < 0 ? 'later' : 'earlier'}`,
    );
  }

  // With ≥4 records the rate clause always renders, so parts is never empty.
  const sentence = parts.join('; ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
}
