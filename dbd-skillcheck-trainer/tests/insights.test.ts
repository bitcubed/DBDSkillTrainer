import { describe, expect, it } from 'vitest';
import { makeSessionRecord } from '../src/analytics/history';
import { dayStreak, personalBests, trendReadout } from '../src/analytics/insights';
import type { SessionRecord } from '../src/engine/types';

const DAY = 86_400_000;
/** Noon local time on a given day offset, so DST shifts can't flip the date. */
const NOW = new Date(2026, 5, 11, 12, 0, 0).getTime();

interface RecOpts {
  startedAt?: number;
  kind?: 'program' | 'freeplay';
  great?: number;
  good?: number;
  miss?: number;
  bestStreak?: number;
  errsMs?: number[];
}

function rec(o: RecOpts = {}): SessionRecord {
  return makeSessionRecord({
    kind: o.kind ?? 'freeplay',
    startedAt: o.startedAt ?? NOW,
    durationS: 120,
    great: o.great ?? 10,
    good: o.good ?? 5,
    miss: o.miss ?? 5,
    bestStreak: o.bestStreak ?? 3,
    errsMs: o.errsMs ?? [-20, -10, 0, 10],
    settingsSnapshot: {},
  });
}

describe('personalBests', () => {
  it('tracks best great-rate, lowest SD, longest streak, and program count', () => {
    const records = [
      rec({ startedAt: NOW - 3 * DAY, great: 5, good: 10, miss: 5, errsMs: [-40, 40, -30, 30] }),
      rec({ startedAt: NOW - 2 * DAY, great: 16, good: 2, miss: 2, errsMs: [-5, 5, -5, 5], bestStreak: 9 }),
      rec({ startedAt: NOW - DAY, kind: 'program', great: 8, good: 6, miss: 6 }),
    ];
    const pb = personalBests(records, NOW);
    expect(pb.bestGreatRate?.value).toBeCloseTo(0.8, 10);
    expect(pb.bestGreatRate?.at).toBe(NOW - 2 * DAY);
    expect(pb.lowestSd?.value).toBeCloseTo(5, 10);
    expect(pb.longestStreak?.value).toBe(9);
    expect(pb.programsCompleted).toBe(1);
    expect(pb.sessionCount).toBe(3);
  });

  it('runs under 10 checks are ineligible for rate/SD bests but streak still counts', () => {
    const tiny = rec({ great: 3, good: 0, miss: 0, errsMs: [0, 0, 0], bestStreak: 3 });
    const pb = personalBests([tiny], NOW);
    expect(pb.bestGreatRate).toBeNull();
    expect(pb.lowestSd).toBeNull();
    expect(pb.longestStreak?.value).toBe(3);
  });

  it('exactly 10 checks is eligible (boundary)', () => {
    const ten = rec({ great: 8, good: 1, miss: 1, errsMs: [0, 5] });
    expect(personalBests([ten], NOW).bestGreatRate?.value).toBeCloseTo(0.8, 10);
  });

  it('empty history → all nulls and zeros', () => {
    const pb = personalBests([], NOW);
    expect(pb.bestGreatRate).toBeNull();
    expect(pb.lowestSd).toBeNull();
    expect(pb.longestStreak).toBeNull();
    expect(pb.programsCompleted).toBe(0);
    expect(pb.dayStreakDays).toBe(0);
  });
});

describe('dayStreak', () => {
  it('counts consecutive practice days ending today', () => {
    const records = [rec({ startedAt: NOW - 2 * DAY }), rec({ startedAt: NOW - DAY }), rec({ startedAt: NOW })];
    expect(dayStreak(records, NOW)).toBe(3);
  });

  it('grace: a streak ending yesterday still counts before today’s first run', () => {
    const records = [rec({ startedAt: NOW - 2 * DAY }), rec({ startedAt: NOW - DAY })];
    expect(dayStreak(records, NOW)).toBe(2);
  });

  it('a gap older than yesterday breaks the streak', () => {
    const records = [rec({ startedAt: NOW - 5 * DAY }), rec({ startedAt: NOW - 4 * DAY })];
    expect(dayStreak(records, NOW)).toBe(0);
  });

  it('multiple sessions in one day count once', () => {
    const records = [rec({ startedAt: NOW }), rec({ startedAt: NOW + 1000 }), rec({ startedAt: NOW - DAY })];
    expect(dayStreak(records, NOW)).toBe(2);
  });

  it('streaks survive month boundaries with near-midnight sessions', () => {
    // May 31 23:50 → Jun 1 00:10 are consecutive LOCAL days regardless of TZ.
    const records = [
      rec({ startedAt: new Date(2026, 4, 31, 23, 50).getTime() }),
      rec({ startedAt: new Date(2026, 5, 1, 0, 10).getTime() }),
    ];
    expect(dayStreak(records, new Date(2026, 5, 1, 12).getTime())).toBe(2);
  });

  it('streaks survive year boundaries', () => {
    const records = [
      rec({ startedAt: new Date(2025, 11, 30, 22, 0).getTime() }),
      rec({ startedAt: new Date(2025, 11, 31, 23, 55).getTime() }),
      rec({ startedAt: new Date(2026, 0, 1, 0, 5).getTime() }),
    ];
    expect(dayStreak(records, new Date(2026, 0, 1, 12).getTime())).toBe(3);
  });

  it('day indices stay consecutive across a DST transition window (US spring-forward 2026)', () => {
    // Mar 7, 8 (spring-forward in US zones), 9 — three consecutive local days.
    const records = [
      rec({ startedAt: new Date(2026, 2, 7, 9, 0).getTime() }),
      rec({ startedAt: new Date(2026, 2, 8, 9, 0).getTime() }),
      rec({ startedAt: new Date(2026, 2, 9, 9, 0).getTime() }),
    ];
    expect(dayStreak(records, new Date(2026, 2, 9, 12).getTime())).toBe(3);
  });
});

describe('trendReadout', () => {
  it('fewer than 4 sessions → explicit not-enough-data line', () => {
    expect(trendReadout([rec(), rec(), rec()])).toMatch(/few more runs/i);
  });

  it('improving rate and tightening SD are reported with computed numbers', () => {
    // Older half: 25% rate, ±40ms; newer half: 75% rate, ±10ms.
    const older = [0, 1].map((i) =>
      rec({ startedAt: NOW - (4 - i) * DAY, great: 5, good: 10, miss: 5, errsMs: [-40, 40, -40, 40] }),
    );
    const newer = [0, 1].map((i) =>
      rec({ startedAt: NOW - (2 - i) * DAY, great: 15, good: 3, miss: 2, errsMs: [-10, 10, -10, 10] }),
    );
    // Assert the computed CLAIMS (the §8.2 requirement), not the connecting prose.
    const text = trendReadout([...older, ...newer]);
    expect(text).toMatch(/up 50 pts/);
    expect(text).toMatch(/25% → 75%/);
    expect(text).toMatch(/tightened 30ms/);
    expect(text).toMatch(/40 → 10ms/);
  });

  it('a worsening SD is reported as widened, not spun', () => {
    const older = [0, 1].map((i) => rec({ startedAt: NOW - (4 - i) * DAY, errsMs: [-5, 5, -5, 5] }));
    const newer = [0, 1].map((i) => rec({ startedAt: NOW - (2 - i) * DAY, errsMs: [-50, 50, -50, 50] }));
    const text = trendReadout([...older, ...newer]);
    expect(text).toMatch(/widened 45ms/);
    expect(text).toMatch(/5 → 50ms/);
  });

  it('delta and endpoints can never contradict (deltas come from rounded endpoints)', () => {
    // Rates 50.2% vs 50.4% both round to 50% — must read "held steady", not "up".
    const older = [0, 1].map((i) =>
      rec({ startedAt: NOW - (4 - i) * DAY, great: 251, good: 149, miss: 100 }), // 50.2%
    );
    const newer = [0, 1].map((i) =>
      rec({ startedAt: NOW - (2 - i) * DAY, great: 252, good: 148, miss: 100 }), // 50.4%
    );
    const text = trendReadout([...older, ...newer]);
    expect(text).toMatch(/held steady at 50%/i);
    expect(text).not.toMatch(/up \d+ pts/);
  });

  it('zero-press records (null mean/SD) are skipped without NaN and the SD clause is omitted when thin', () => {
    const withErrs = [0, 1, 2].map((i) => rec({ startedAt: NOW - (6 - i) * DAY, errsMs: [-10, 10] }));
    const noErrs = [0, 1, 2].map((i) =>
      rec({ startedAt: NOW - (3 - i) * DAY, great: 0, good: 0, miss: 10, errsMs: [] }),
    );
    const text = trendReadout([...withErrs, ...noErrs]);
    expect(text).not.toMatch(/NaN|null|undefined/);
    expect(text).toMatch(/great-rate/i);
    expect(text).not.toMatch(/±SD/); // only 3 non-null SDs → clause omitted
  });

  it('reports a centered bias when |avg| ≤ 12ms and a directional nudge otherwise', () => {
    const centered = [0, 1, 2, 3].map(() => rec({ errsMs: [-5, 5] }));
    expect(trendReadout(centered)).toMatch(/well-centered/);
    const early = [0, 1, 2, 3].map(() => rec({ errsMs: [-30, -30] }));
    const text = trendReadout(early);
    expect(text).toMatch(/30ms early/);
    expect(text).toMatch(/later/);
  });
});
