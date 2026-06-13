import { describe, expect, it } from 'vitest';
import { FAIL_PAUSE_MS, SNAP_FAIL_PAUSE_MS, TYPES } from '../src/engine/constants';
import { triggerOddsPct } from '../src/engine/perks';
import { goodCenterTime, greatCenterTime, makeHarness, tickUntilActive } from './helpers';

describe('realistic trigger odds', () => {
  it('gen base = 8/sec; toolbox replaces it with 40/sec on repair dials', () => {
    const base = { isRepair: true, toolbox: false, hyperfocus: false, hfTokens: 0, unnervingTier: 0 as const };
    expect(triggerOddsPct(TYPES.gen, base)).toBe(8);
    expect(triggerOddsPct(TYPES.gen, { ...base, toolbox: true })).toBe(40);
  });

  it('+4 per Hyperfocus token and +10 with Unnerving stack on top', () => {
    expect(
      triggerOddsPct(TYPES.gen, {
        isRepair: true,
        toolbox: true,
        hyperfocus: true,
        hfTokens: 3,
        unnervingTier: 2,
      }),
    ).toBeCloseTo(40 + 12 + 10, 10);
  });

  it('session rolls once per second and spawns on a passing roll', () => {
    const h = makeHarness(0.99); // fallback rng: rolls fail (99 >= odds)
    h.session.pacing = 'realistic';
    h.session.toolbox = true;
    h.session.start(1000);
    h.session.tick(1500); // <1s since lastSecRoll → no roll
    expect(h.session.phase).toBe('between');
    h.session.tick(2000); // roll #1: 0.99*100=99 ≥ 40 → no spawn
    expect(h.session.phase).toBe('between');
    h.rngQueue.push(0.39); // roll #2: 39 < 40 → warn
    h.session.tick(3000);
    expect(h.session.phase).toBe('warn');
  });

  it('Hyperfocus tokens and Unnerving raise the odds the session actually rolls', () => {
    const h = makeHarness(0.5); // every roll is 50
    h.session.pacing = 'realistic';
    h.session.toolbox = true;
    h.session.start(1000);
    h.session.tick(2000); // 50 ≥ 40 (toolbox only) → no spawn
    expect(h.session.phase).toBe('between');
    h.session.hyperfocus = true;
    h.session.hfTokens = 3; // +12
    h.session.unnerving = 2; // +10 → odds 62
    h.session.tick(3000); // 50 < 62 → spawn
    expect(h.session.phase).toBe('warn');
  });

  it('a failing roll boundary: rng*100 must be strictly below the odds', () => {
    const h = makeHarness(0.4); // exactly 40 — NOT < 40 → never spawns
    h.session.pacing = 'realistic';
    h.session.toolbox = true;
    h.session.start(1000);
    for (let t = 2000; t <= 10000; t += 1000) h.session.tick(t);
    expect(h.session.phase).toBe('between');
  });
});

describe('miss → cooldown', () => {
  it('drill pacing: early press → 900ms cooldown', () => {
    const h = makeHarness();
    h.session.start(1000);
    const now = tickUntilActive(h, 1000);
    h.session.press(now); // pointer barely moved → early
    expect(h.events[0]?.result).toBe('miss');
    expect(h.events[0]?.failKind).toBe('early');
    expect(h.session.phase).toBe('cooldown');
    expect(h.session.nextAt - now).toBe(900);
  });

  it('realistic pacing: fail pause is 3000ms', () => {
    const h = makeHarness();
    h.session.pacing = 'realistic';
    h.rngQueue.push(0.01); // first per-second roll passes (1 < 8)
    h.session.start(1000);
    const now = tickUntilActive(h, 1000);
    h.session.press(now);
    expect(h.session.phase).toBe('cooldown');
    expect(h.session.nextAt - now).toBe(FAIL_PAUSE_MS);
  });

  it('Snap Out of It uses its verified 2s fail pause in realistic pacing', () => {
    const h = makeHarness();
    h.session.mode = 'special';
    h.session.special = 'snap';
    h.session.pacing = 'realistic';
    h.session.start(1000);
    const now = tickUntilActive(h, 1000); // specials spawn drill-style
    h.session.press(now);
    expect(h.session.phase).toBe('cooldown');
    expect(h.session.nextAt - now).toBe(SNAP_FAIL_PAUSE_MS);
  });

  it('no-press timeout counts as a miss with no timing-error entry', () => {
    const h = makeHarness();
    h.session.start(1000);
    let now = tickUntilActive(h, 1000);
    for (let i = 0; i < 100 && h.session.phase === 'active'; i++) {
      now += 25;
      h.session.tick(now);
    }
    expect(h.events[0]?.result).toBe('miss');
    expect(h.events[0]?.failKind).toBe('nopress');
    expect(h.session.stats.errs).toHaveLength(0);
    expect(h.session.phase).toBe('cooldown');
  });
});

describe('press with no active check', () => {
  it('is a no-op (game behavior)', () => {
    const h = makeHarness();
    h.session.start(1000);
    h.session.tick(1100); // still in the 700ms start delay
    expect(h.session.phase).toBe('between');
    h.session.press(1150);
    expect(h.events).toHaveLength(0);
    expect(h.session.stats.miss).toBe(0);
    expect(h.session.phase).toBe('between');
  });

  it('does nothing when not running', () => {
    const h = makeHarness();
    h.session.press(1000);
    expect(h.events).toHaveLength(0);
  });
});

describe('generator charge', () => {
  it('accrues at 1 charge/sec while repairing', () => {
    const h = makeHarness(0.99); // realistic rolls all fail → stays in "between"
    h.session.pacing = 'realistic';
    h.session.start(1000);
    h.session.tick(1000); // primes dt clock
    h.session.tick(2000);
    h.session.tick(3000);
    expect(h.session.charges).toBeCloseTo(2, 6);
  });

  it('does not accrue during cooldown', () => {
    const h = makeHarness();
    h.session.start(1000);
    const now = tickUntilActive(h, 1000);
    h.session.press(now); // miss → cooldown
    const at = h.session.charges;
    h.session.tick(now + 500); // still inside the 900ms cooldown
    expect(h.session.charges).toBeCloseTo(at, 6);
  });

  it('a great applies the +1% gen bonus on top of passive charge', () => {
    const h = makeHarness();
    h.session.start(1000);
    tickUntilActive(h, 1000);
    const before = h.session.charges;
    h.session.press(greatCenterTime(h));
    expect(h.events[0]?.result).toBe('great');
    expect(h.session.charges).toBeCloseTo(before + 0.9, 6); // +1% of 90 charges
  });

  it('a good lands in the good band and adds no bonus', () => {
    const h = makeHarness();
    h.session.start(1000);
    tickUntilActive(h, 1000);
    h.session.press(goodCenterTime(h));
    expect(h.events[0]?.result).toBe('good');
    expect(h.events[0]?.bonusPct).toBe(0);
  });
});

describe('timing-error log', () => {
  it('records signed errors: early presses are negative, late positive', () => {
    const h = makeHarness();
    h.session.start(1000);
    tickUntilActive(h, 1000);
    const c = h.session.check!;
    h.session.press(greatCenterTime(h) - 10); // 10ms early
    expect(h.session.stats.errs[0]?.ms).toBeCloseTo(-10, 6);
    expect(c.resolved).toBe(true);
  });
});
