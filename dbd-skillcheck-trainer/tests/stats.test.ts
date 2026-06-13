import { describe, expect, it } from 'vitest';
import {
  appendRecord,
  clearHistory,
  freeplayWorthLogging,
  HISTORY_CAP,
  HISTORY_KEY,
  HISTORY_SCHEMA_VERSION,
  loadHistory,
  makeSessionRecord,
  type StorageLike,
} from '../src/analytics/history';
import { errsSince, greatRate, mean, meanSd, stdDev } from '../src/analytics/stats';
import type { SessionRecord, TimingErr } from '../src/engine/types';

describe('mean / stdDev (constant + variable error)', () => {
  it('computes mean of a known array', () => {
    expect(mean([10, -10, 20, -20])).toBe(0);
    expect(mean([5, 15])).toBe(10);
  });

  it('computes population SD of a known array', () => {
    // variance = (100+100+400+400)/4 = 250
    expect(stdDev([10, -10, 20, -20])).toBeCloseTo(Math.sqrt(250), 10);
    expect(stdDev([7, 7, 7])).toBe(0);
  });

  it('empty input → null, not NaN', () => {
    expect(mean([])).toBeNull();
    expect(stdDev([])).toBeNull();
    expect(meanSd([])).toEqual({ mean: null, sd: null });
  });

  it('single sample → mean = sample, sd = 0', () => {
    expect(meanSd([-42])).toEqual({ mean: -42, sd: 0 });
  });

  it('a consistently-early presser shows negative constant error', () => {
    const { mean: m, sd } = meanSd([-30, -25, -35, -28]);
    expect(m).toBeCloseTo(-29.5, 10);
    expect(sd).toBeGreaterThan(0);
  });
});

describe('greatRate', () => {
  it('great / (great+good+miss)', () => {
    expect(greatRate(6, 3, 1)).toBeCloseTo(0.6, 10);
    expect(greatRate(0, 5, 5)).toBe(0);
    expect(greatRate(10, 0, 0)).toBe(1);
  });

  it('no checks → 0 (UI shows a dash)', () => {
    expect(greatRate(0, 0, 0)).toBe(0);
  });
});

// ---- persistent session history (spec §8.1 / §9) ----

function memStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

function rec(startedAt: number, great = 8, good = 1, miss = 1): SessionRecord {
  return makeSessionRecord({
    kind: 'freeplay',
    startedAt,
    durationS: 60,
    great,
    good,
    miss,
    bestStreak: great,
    errsMs: [-10, 5, 15],
    settingsSnapshot: { pacing: 'drill' },
  });
}

describe('history append/prune', () => {
  it('appends records and persists the schema version', () => {
    const s = memStorage();
    appendRecord(rec(1000), s);
    appendRecord(rec(2000), s);
    const raw = JSON.parse(s.data.get(HISTORY_KEY)!) as { version: number; records: unknown[] };
    expect(raw.version).toBe(HISTORY_SCHEMA_VERSION);
    expect(raw.records).toHaveLength(2);
    const loaded = loadHistory(s);
    expect(loaded.map((r) => r.startedAt)).toEqual([1000, 2000]);
  });

  it('caps at HISTORY_CAP, dropping the oldest', () => {
    const s = memStorage();
    for (let i = 0; i < HISTORY_CAP + 25; i++) appendRecord(rec(i), s);
    const loaded = loadHistory(s);
    expect(loaded).toHaveLength(HISTORY_CAP);
    expect(loaded[0]!.startedAt).toBe(25); // oldest 25 pruned
    expect(loaded[loaded.length - 1]!.startedAt).toBe(HISTORY_CAP + 24);
  });

  it('corrupt storage → empty history, no crash', () => {
    expect(loadHistory(memStorage({ [HISTORY_KEY]: 'not json{{{' }))).toEqual([]);
    expect(loadHistory(memStorage({ [HISTORY_KEY]: '{"nope":true}' }))).toEqual([]);
    expect(loadHistory(memStorage({ [HISTORY_KEY]: '42' }))).toEqual([]);
  });

  it('JSON-valid but shape-corrupt records are dropped, valid ones kept', () => {
    const good = rec(1234);
    const file = {
      version: HISTORY_SCHEMA_VERSION,
      records: [
        null,
        42,
        { kind: 'freeplay' }, // missing overall
        { ...good, overall: { ...good.overall, great: 'lots' } }, // wrong field type
        { ...good, kind: 'wiggle' }, // removed feature can't sneak back in
        good,
      ],
    };
    const loaded = loadHistory(memStorage({ [HISTORY_KEY]: JSON.stringify(file) }));
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.startedAt).toBe(1234);
  });

  it('missing storage key → empty history', () => {
    expect(loadHistory(memStorage())).toEqual([]);
  });

  it('a throwing storage backend is swallowed (append still returns the list)', () => {
    const bad: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    expect(loadHistory(bad)).toEqual([]);
    expect(appendRecord(rec(1), bad)).toHaveLength(1);
    expect(() => clearHistory(bad)).not.toThrow();
  });

  it('appending to corrupt storage recovers into a fresh valid file', () => {
    const s = memStorage({ [HISTORY_KEY]: '!!corrupt!!' });
    appendRecord(rec(7), s);
    expect(loadHistory(s)).toHaveLength(1);
  });
});

describe('makeSessionRecord', () => {
  it('computes overall greatRate / mean / sd from the run summary', () => {
    const r = rec(5000, 6, 3, 1);
    expect(r.overall.greatRate).toBeCloseTo(0.6, 10);
    expect(r.overall.meanMs).toBeCloseTo((-10 + 5 + 15) / 3, 10);
    expect(r.overall.sdMs).toBeGreaterThan(0);
    expect(r.overall.bestStreak).toBe(6);
    expect(r.id).toBeTruthy();
    expect(r.kind).toBe('freeplay');
  });

  it('attaches segments only when provided', () => {
    expect(rec(1).segments).toBeUndefined();
    const withSegs = makeSessionRecord({
      kind: 'program',
      startedAt: 1,
      durationS: 300,
      great: 10,
      good: 5,
      miss: 5,
      bestStreak: 4,
      errsMs: [],
      segments: [{ name: 'Warm-up', greats: 2, goods: 1, misses: 1, hits: 4, meanMs: null, sdMs: null }],
      settingsSnapshot: {},
    });
    expect(withSegs.segments).toHaveLength(1);
    expect(withSegs.overall.meanMs).toBeNull(); // no presses → null, not NaN
  });
});

describe('freeplayWorthLogging', () => {
  it('requires ≥10 checks', () => {
    expect(freeplayWorthLogging(3, 3, 3)).toBe(false);
    expect(freeplayWorthLogging(4, 3, 3)).toBe(true);
    expect(freeplayWorthLogging(10, 0, 0)).toBe(true);
  });
});

describe('errsSince (snapshot windowing that survives the errs cap)', () => {
  const e = (ms: number): TimingErr => ({ ms, res: 'great' });

  it('returns the entries logged since the snapshot', () => {
    const errs = [e(1), e(2), e(3), e(4), e(5)];
    expect(errsSince(errs, 5, 2)).toEqual([3, 4, 5]);
    expect(errsSince(errs, 5, 5)).toEqual([]);
    expect(errsSince(errs, 5, 9)).toEqual([]); // snapshot ahead → empty, not negative
  });

  it('clamps to the buffer when the cap dropped older entries', () => {
    // 250 errors ever logged, only the last 5 still buffered; snapshot at 100.
    const errs = [e(246), e(247), e(248), e(249), e(250)];
    expect(errsSince(errs, 250, 100)).toEqual([246, 247, 248, 249, 250]);
  });
});
