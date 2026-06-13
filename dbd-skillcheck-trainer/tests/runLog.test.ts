import { describe, expect, it } from 'vitest';
import { loadHistory, type StorageLike } from '../src/analytics/history';
import { RunLogger } from '../src/analytics/runLog';
import { ProgramController } from '../src/engine/program';
import { goodCenterTime, greatCenterTime, makeHarness, tickUntilActive, type Harness } from './helpers';

function memStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

/** Land `n` checks (greats) starting from `from`; returns the last press time. */
function landChecks(h: Harness, from: number, n: number, kind: 'great' | 'good' = 'great'): number {
  let now = from;
  for (let i = 0; i < n; i++) {
    now = tickUntilActive(h, now);
    now = kind === 'great' ? greatCenterTime(h) : goodCenterTime(h);
    h.session.press(now);
  }
  return now;
}

describe('RunLogger — free play', () => {
  it('logs a Start→Stop run with ≥10 checks, diffed from the run snapshot', () => {
    const h = makeHarness();
    const s = memStorage();
    const log = new RunLogger(s);
    h.session.start(1000);
    log.begin(h.session.stats, h.session.errCountTotal, 1_718_000_000_000, 1000, { pacing: 'drill' });
    const endT = landChecks(h, 1000, 11);
    const records = log.endFreeplay(h.session.stats, h.session.errCountTotal, endT);
    expect(records).not.toBeNull();
    expect(loadHistory(s)).toHaveLength(1);
    const r = loadHistory(s)[0]!;
    expect(r.kind).toBe('freeplay');
    expect(r.startedAt).toBe(1_718_000_000_000);
    expect(r.overall.great).toBe(11);
    expect(r.overall.good).toBe(0);
    expect(r.overall.miss).toBe(0);
    expect(r.overall.greatRate).toBe(1);
    expect(r.overall.meanMs).not.toBeNull();
    expect(r.durationS).toBeCloseTo((endT - 1000) / 1000, 1);
    expect(r.settingsSnapshot.pacing).toBe('drill');
    expect(log.active).toBe(false);
  });

  it('a run under 10 checks is not logged', () => {
    const h = makeHarness();
    const s = memStorage();
    const log = new RunLogger(s);
    h.session.start(1000);
    log.begin(h.session.stats, h.session.errCountTotal, 1, 1000, {});
    const endT = landChecks(h, 1000, 9);
    expect(log.endFreeplay(h.session.stats, h.session.errCountTotal, endT)).toBeNull();
    expect(loadHistory(s)).toHaveLength(0);
  });

  it('two consecutive runs without a stats reset diff correctly (second record sees only its own presses)', () => {
    const h = makeHarness();
    const s = memStorage();
    const log = new RunLogger(s);
    h.session.start(1000);
    log.begin(h.session.stats, h.session.errCountTotal, 1, 1000, {});
    let now = landChecks(h, 1000, 10, 'great');
    log.endFreeplay(h.session.stats, h.session.errCountTotal, now);
    // Second run: 10 goods on the SAME accumulated stats.
    log.begin(h.session.stats, h.session.errCountTotal, 2, now, {});
    now = landChecks(h, now, 10, 'good');
    log.endFreeplay(h.session.stats, h.session.errCountTotal, now);
    const [first, second] = loadHistory(s);
    expect(first!.overall).toMatchObject({ great: 10, good: 0, miss: 0 });
    expect(second!.overall).toMatchObject({ great: 0, good: 10, miss: 0 });
    // The second record's timing errors come only from the good-zone presses
    // (well after great-center → strongly positive mean), proving the
    // error-count windowing doesn't bleed run 1 into run 2.
    expect(second!.overall.meanMs).toBeGreaterThan(30);
    expect(first!.overall.meanMs).toBeCloseTo(0, 0);
  });

  it('discard() drops the live run without logging', () => {
    const h = makeHarness();
    const s = memStorage();
    const log = new RunLogger(s);
    h.session.start(1000);
    log.begin(h.session.stats, h.session.errCountTotal, 1, 1000, {});
    const endT = landChecks(h, 1000, 12);
    log.discard();
    expect(log.endFreeplay(h.session.stats, h.session.errCountTotal, endT)).toBeNull();
    expect(loadHistory(s)).toHaveLength(0);
  });

  it('endFreeplay without begin is a no-op', () => {
    const h = makeHarness();
    const log = new RunLogger(memStorage());
    expect(log.endFreeplay(h.session.stats, 0, 1000)).toBeNull();
  });
});

describe('RunLogger — programs', () => {
  it('a completed Program logs one record with exactly 5 segments', () => {
    const h = makeHarness();
    const s = memStorage();
    const log = new RunLogger(s);
    const t0 = 1000;
    let logged = false;
    const program = new ProgramController(h.session, {
      onComplete: (segs, now) => {
        log.logProgram(h.session.stats, segs, 1_718_000_000_000, (now - t0) / 1000, { pacing: 'drill' });
        logged = true;
      },
    });
    program.start(t0);
    for (let now = t0; now <= t0 + 301_000; now += 50) {
      program.tick(now);
      h.session.tick(now);
    }
    expect(logged).toBe(true);
    const records = loadHistory(s);
    expect(records).toHaveLength(1);
    const r = records[0]!;
    expect(r.kind).toBe('program');
    expect(r.segments).toHaveLength(5);
    expect(r.segments!.map((x) => x.name)).toEqual(['Warm-up', 'Overload', 'Varied', 'Bias-fix', 'Pressure']);
    expect(r.durationS).toBeCloseTo(300, 0);
    expect(r.overall.miss).toBe(h.session.stats.miss); // all no-press misses captured
  });
});
