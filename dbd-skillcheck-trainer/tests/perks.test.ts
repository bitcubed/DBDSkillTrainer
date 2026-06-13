import { describe, expect, it } from 'vitest';
import { GEN_CHARGES, STORM_CHAIN_GAP_MS } from '../src/engine/constants';
import { effectiveWarnLeadMs, hyperfocusBonusMul } from '../src/engine/perks';
import { goodCenterTime, greatCenterTime, makeHarness, tickUntilActive, type Harness } from './helpers';

/** Land a great on the currently-active check; returns the press time. */
function landGreat(h: Harness): number {
  const t = greatCenterTime(h);
  h.session.press(t);
  return t;
}

describe('Hyperfocus', () => {
  it('first great of an action gets no bonus; tokens then ramp the multiplier', () => {
    const h = makeHarness();
    h.session.hyperfocus = true;
    h.session.start(1000);
    let now = 1000;
    const bonuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      now = tickUntilActive(h, now);
      now = landGreat(h);
      bonuses.push(h.events[h.events.length - 1]!.bonusPct);
    }
    // mul = 1 + 0.30 × tokensBefore; tokens cap at 6.
    expect(bonuses).toEqual([1, 1.3, 1.6, 1.9, 2.2, 2.5, 2.8, 2.8]);
    expect(h.session.hfTokens).toBe(6);
  });

  it('tokensBefore = 6 → mul = 2.8 (pure)', () => {
    expect(hyperfocusBonusMul(6)).toBeCloseTo(2.8, 10);
    expect(hyperfocusBonusMul(0)).toBe(1);
  });

  it('a good resets tokens to 0', () => {
    const h = makeHarness();
    h.session.hyperfocus = true;
    h.session.start(1000);
    let now = tickUntilActive(h, 1000);
    now = landGreat(h);
    expect(h.session.hfTokens).toBe(1);
    tickUntilActive(h, now);
    h.session.press(goodCenterTime(h));
    expect(h.events[h.events.length - 1]!.result).toBe('good');
    expect(h.session.hfTokens).toBe(0);
  });

  it('a miss resets tokens to 0', () => {
    const h = makeHarness();
    h.session.hyperfocus = true;
    h.session.start(1000);
    let now = tickUntilActive(h, 1000);
    now = landGreat(h);
    now = tickUntilActive(h, now);
    h.session.press(now); // early
    expect(h.session.hfTokens).toBe(0);
  });

  it('tokens speed up the pointer: +4%/token', () => {
    const h = makeHarness();
    h.session.hyperfocus = true;
    h.session.start(1000);
    let now = tickUntilActive(h, 1000);
    const slow = h.session.check!.degPerMs;
    now = landGreat(h);
    tickUntilActive(h, now);
    const fast = h.session.check!.degPerMs;
    expect(fast).toBeCloseTo(slow * 1.04, 10);
  });
});

describe('Stake Out', () => {
  it('converts a good into a great (+1% bonus) and consumes a token', () => {
    const h = makeHarness();
    h.session.stakeOut = true;
    h.session.start(1000);
    tickUntilActive(h, 1000);
    expect(h.session.soTokens).toBe(4);
    h.session.press(goodCenterTime(h));
    const ev = h.events[0]!;
    expect(ev.rawKind).toBe('good');
    expect(ev.result).toBe('great');
    expect(ev.stakeOutConverted).toBe(true);
    expect(ev.bonusPct).toBe(1);
    expect(h.session.soTokens).toBe(3);
    expect(h.session.stats.great).toBe(1);
    expect(h.session.stats.good).toBe(0);
  });

  it('a converted great feeds Hyperfocus', () => {
    const h = makeHarness();
    h.session.stakeOut = true;
    h.session.hyperfocus = true;
    h.session.start(1000);
    tickUntilActive(h, 1000);
    h.session.press(goodCenterTime(h));
    expect(h.session.hfTokens).toBe(1);
  });

  it('actual greats consume no token', () => {
    const h = makeHarness();
    h.session.stakeOut = true;
    h.session.start(1000);
    tickUntilActive(h, 1000);
    landGreat(h);
    expect(h.session.soTokens).toBe(4);
  });

  it('with no tokens left, a good stays a good', () => {
    const h = makeHarness();
    h.session.stakeOut = true;
    h.session.start(1000);
    h.session.soTokens = 0;
    tickUntilActive(h, 1000);
    h.session.press(goodCenterTime(h));
    expect(h.events[0]!.result).toBe('good');
    expect(h.events[0]!.stakeOutConverted).toBe(false);
  });

  it('regenerates +1 token / 15s, capped at 4', () => {
    const h = makeHarness();
    h.session.stakeOut = true;
    h.session.start(1000);
    h.session.tick(1000);
    h.session.soTokens = 2;
    h.session.tick(15999); // one ms shy of the 15s mark → no regen yet
    expect(h.session.soTokens).toBe(2);
    h.session.tick(16000); // 15s after start → +1
    expect(h.session.soTokens).toBe(3);
    h.session.tick(31000); // +1 more
    expect(h.session.soTokens).toBe(4);
    h.session.tick(46001); // capped
    expect(h.session.soTokens).toBe(4);
  });
});

describe('Merciless Storm (unlimited drill)', () => {
  it('a miss costs progress but never blocks or ends the run; checks keep chaining', () => {
    const h = makeHarness();
    h.session.storm = true;
    h.session.start(1000);
    expect(h.session.charges).toBeCloseTo(GEN_CHARGES * 0.9, 6);
    const now = tickUntilActive(h, 1000);
    const before = h.session.charges;
    h.session.press(now); // early → miss
    expect(h.events[0]!.result).toBe('miss');
    expect(h.events[0]!.failPct).toBe(10);
    expect(h.session.charges).toBeCloseTo(before - 9, 6); // −10% of 90
    // No cooldown, no stop: the storm chains the next check in 250ms.
    expect(h.session.running).toBe(true);
    expect(h.session.phase).toBe('between');
    expect(h.session.nextAt - now).toBe(STORM_CHAIN_GAP_MS);
  });

  it('completing the gen outside a Program stops the session via the hook', () => {
    const h = makeHarness();
    h.session.storm = true;
    h.session.start(1000);
    h.session.tick(1000);
    h.session.charges = GEN_CHARGES - 0.01;
    h.session.tick(1100); // +0.1 charge → full
    expect(h.session.running).toBe(false);
    expect(h.session.phase).toBe('idle');
    expect(h.stormCompletes).toHaveLength(1);
  });

  it('during a Program the gen loops back to 90% and keeps running', () => {
    const h = makeHarness();
    h.session.storm = true;
    h.session.programActive = true;
    h.session.start(1000);
    h.session.tick(1000);
    h.session.charges = GEN_CHARGES - 0.01;
    h.session.tick(1100);
    expect(h.session.running).toBe(true);
    expect(h.session.charges).toBeCloseTo(GEN_CHARGES * 0.9, 6);
    expect(h.stormCompletes).toHaveLength(0);
  });

  it('storm only applies on repair dials, not specials', () => {
    const h = makeHarness();
    h.session.storm = true;
    h.session.mode = 'special';
    expect(h.session.stormOn()).toBe(false);
  });
});

describe('Lullaby warning lead (approximated linear scaling)', () => {
  it('scales the lead down linearly and is silent at 5', () => {
    expect(effectiveWarnLeadMs(500, 0, false)).toBe(500);
    expect(effectiveWarnLeadMs(500, 2, false)).toBeCloseTo(300, 10);
    expect(effectiveWarnLeadMs(500, 5, false)).toBe(0);
    expect(effectiveWarnLeadMs(500, 7, false)).toBe(0); // clamped
  });

  it('storm forces the short 120ms lead regardless of the slider', () => {
    expect(effectiveWarnLeadMs(1000, 0, true)).toBe(120);
    expect(effectiveWarnLeadMs(1000, 5, true)).toBe(0);
  });
});
