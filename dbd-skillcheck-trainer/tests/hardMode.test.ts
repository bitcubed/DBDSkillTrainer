import { describe, expect, it } from 'vitest';
import { HARD_DEFAULTS } from '../src/engine/constants';
import {
  angleDelta,
  clampSym,
  defaultHardConfig,
  HardMode,
  panVelocity,
  wrapYaw,
  yawToScreenX,
  type HardConfig,
  type HardEvents,
} from '../src/engine/hardMode';

describe('yaw math', () => {
  it('wrapYaw normalizes to [0, 360)', () => {
    expect(wrapYaw(0)).toBe(0);
    expect(wrapYaw(360)).toBe(0);
    expect(wrapYaw(-10)).toBe(350);
    expect(wrapYaw(725)).toBe(5);
  });

  it('angleDelta is the signed shortest difference', () => {
    expect(angleDelta(10, 0)).toBe(10);
    expect(angleDelta(0, 10)).toBe(-10);
    expect(angleDelta(350, 10)).toBe(-20); // wraps the short way
    expect(angleDelta(10, 350)).toBe(20);
    expect(Math.abs(angleDelta(180, 0))).toBe(180);
  });

  it('clampSym bounds a value symmetrically', () => {
    expect(clampSym(5, 10)).toBe(5);
    expect(clampSym(15, 10)).toBe(10);
    expect(clampSym(-15, 10)).toBe(-10);
    expect(clampSym(0, 10)).toBe(0);
  });
});

describe('yawToScreenX (FOV mapping)', () => {
  const fov = 90;
  const w = 800;
  it('view-center maps to width/2', () => {
    expect(yawToScreenX(100, 100, fov, w)).toBeCloseTo(400, 6);
  });
  it('+fov/2 maps to the right edge, −fov/2 to the left edge', () => {
    expect(yawToScreenX(145, 100, fov, w)).toBeCloseTo(800, 6);
    expect(yawToScreenX(55, 100, fov, w)).toBeCloseTo(0, 6);
  });
  it('outside the FOV slice returns null', () => {
    expect(yawToScreenX(200, 100, fov, w)).toBeNull();
  });
  it('maps correctly across the 0/360 wrap', () => {
    expect(yawToScreenX(10, 350, fov, w)).toBeCloseTo((20 / 90 + 0.5) * 800, 6);
  });
});

describe('panVelocity', () => {
  const cfg = defaultHardConfig();
  it('is zero inside the deadzone', () => {
    expect(panVelocity(0.5, cfg)).toBe(0);
    expect(panVelocity(0.5 + cfg.panDeadzone / 4, cfg)).toBe(0); // clearly within
  });
  it('turns right past the right deadzone, left past the left', () => {
    expect(panVelocity(0.9, cfg)).toBeGreaterThan(0);
    expect(panVelocity(0.1, cfg)).toBeLessThan(0);
  });
  it('reaches ~panMax×sensitivity at the edge and is symmetric', () => {
    expect(panVelocity(1, cfg)).toBeCloseTo(cfg.panMaxDegPerSec * cfg.panSensitivity, 6);
    expect(panVelocity(0, cfg)).toBeCloseTo(-cfg.panMaxDegPerSec * cfg.panSensitivity, 6);
  });
  it('scales with panSensitivity', () => {
    const slow: HardConfig = { ...cfg, panSensitivity: 0.5 };
    expect(panVelocity(1, slow)).toBeCloseTo(cfg.panMaxDegPerSec * 0.5, 6);
  });
});

/** RNG that yields a fixed queue, then a constant fallback. */
function rngOf(queue: number[], fallback = 0): () => number {
  return () => (queue.length ? queue.shift()! : fallback);
}

function cfg(over: Partial<HardConfig> = {}): HardConfig {
  return { ...defaultHardConfig(), ...over };
}

describe('HardMode state machine', () => {
  it('starts looking at rng×360 and schedules the first encounter in [min,max]', () => {
    const hm = new HardMode(cfg(), rngOf([0.25, 0])); // yaw=90, gap=min
    hm.start(1000);
    expect(hm.yaw).toBeCloseTo(90, 6);
    expect(hm.killerActive()).toBe(false);
    // No spawn before the min gap.
    hm.tick(1000 + HARD_DEFAULTS.encounterMinMs - 1, 0.016);
    expect(hm.killerActive()).toBe(false);
    hm.tick(1000 + HARD_DEFAULTS.encounterMinMs, 0.016);
    expect(hm.killerActive()).toBe(true);
  });

  it('mouse pan and key turn both rotate the view', () => {
    const hm = new HardMode(cfg(), rngOf([0, 999999])); // yaw=0, never spawn
    hm.start(0);
    hm.setMousePan(1); // full right
    hm.tick(16, 0.1); // +panMax*0.1 deg
    expect(hm.yaw).toBeCloseTo(HARD_DEFAULTS.panMaxDegPerSec * 0.1, 4);
    hm.setMousePan(0.5); // deadzone → stop
    hm.setKeyTurn(-1); // turn left
    const before = hm.yaw;
    hm.tick(32, 0.1);
    expect(hm.yaw).toBeCloseTo(wrapYaw(before - HARD_DEFAULTS.keyTurnDegPerSec * 0.1), 4);
  });

  it('catching: holding the killer centered for the dwell counts a spot + reaction time', () => {
    const events: { spotted: number[]; reached: number } = { spotted: [], reached: 0 };
    const hooks: HardEvents = {
      onSpotted: (ms) => events.spotted.push(ms),
      onReached: () => events.reached++,
    };
    // yaw=0, gap=min, spawn offset frac=0 → killer at 70°.
    const hm = new HardMode(cfg(), rngOf([0, 0, 0]), hooks);
    hm.start(0);
    let now = HARD_DEFAULTS.encounterMinMs;
    hm.tick(now, 0.016); // spawn
    expect(hm.killerActive()).toBe(true);
    expect(hm.killerYaw()).toBeCloseTo(70, 6);
    // Snap the view onto the killer and hold past the dwell.
    hm.yaw = 70;
    hm.setMousePan(0.5); // no pan
    for (let i = 0; i < 20 && hm.killerActive(); i++) {
      now += 30;
      hm.tick(now, 0.03);
    }
    expect(hm.spotted).toBe(1);
    expect(hm.missed).toBe(0);
    expect(events.spotted).toHaveLength(1);
    expect(events.spotted[0]!).toBeGreaterThan(0);
    expect(hm.killerActive()).toBe(false); // cleared, next scheduled
  });

  it('looking away resets the dwell so a brief glance does not catch', () => {
    const hm = new HardMode(cfg({ catchDwellMs: 180 }), rngOf([0, 0, 0]));
    hm.start(0);
    let now = HARD_DEFAULTS.encounterMinMs;
    hm.tick(now, 0.016); // spawn at 70°
    hm.yaw = 70;
    now += 100;
    hm.tick(now, 0.1); // 100ms centered (<180 dwell)
    expect(hm.spotted).toBe(0);
    hm.yaw = 200; // look away → dwell resets
    now += 50;
    hm.tick(now, 0.05);
    hm.yaw = 70; // back on it, but only briefly
    now += 100;
    hm.tick(now, 0.1); // another 100ms (<180) — still not caught
    expect(hm.spotted).toBe(0);
    expect(hm.killerActive()).toBe(true);
  });

  it('reaching: an uncaught killer times out as a miss after approachMs', () => {
    const events = { reached: 0 };
    const hm = new HardMode(cfg(), rngOf([0, 0, 0]), { onReached: () => events.reached++ });
    hm.start(0);
    let now = HARD_DEFAULTS.encounterMinMs;
    hm.tick(now, 0.016); // spawn at 70°
    hm.yaw = 0; // never look at it
    now += HARD_DEFAULTS.approachMs;
    hm.tick(now, 0.016);
    expect(hm.missed).toBe(1);
    expect(hm.spotted).toBe(0);
    expect(events.reached).toBe(1);
    expect(hm.killerActive()).toBe(false);
  });

  it('aggregates spotted-rate, encounters and average reaction time', () => {
    // Two encounters: catch the first, miss the second.
    const hm = new HardMode(
      cfg({ encounterMinMs: 1000, encounterMaxMs: 1000 }),
      rngOf([0, 0, 0, 0]), // yaw 0; gaps fixed; offsets 0 → killer at 70°
    );
    hm.start(0);
    let now = 1000;
    hm.tick(now, 0.016); // spawn #1 at 70
    hm.yaw = 70;
    for (let i = 0; i < 10 && hm.killerActive(); i++) {
      now += 30;
      hm.tick(now, 0.03);
    }
    expect(hm.spotted).toBe(1);
    // next gap is 1000ms after the catch
    hm.yaw = 0;
    now += 1000;
    hm.tick(now, 0.016); // spawn #2 at 70
    now += HARD_DEFAULTS.approachMs;
    hm.tick(now, 0.016); // miss #2
    expect(hm.missed).toBe(1);
    expect(hm.encounters()).toBe(2);
    expect(hm.spottedRate()).toBeCloseTo(0.5, 6);
    expect(hm.avgReactionMs()).not.toBeNull();
    expect(hm.avgReactionMs()!).toBeGreaterThan(0);
  });

  it('starts level and applyLook turns yaw (wrapping) + tilts pitch (clamped)', () => {
    const hm = new HardMode(cfg({ pitchMaxDeg: 38 }), rngOf([0, 999999])); // yaw=0, never spawn
    hm.start(0);
    expect(hm.pitch).toBe(0);
    hm.applyLook(30, 10);
    expect(hm.yaw).toBeCloseTo(30, 6);
    expect(hm.pitch).toBeCloseTo(10, 6);
    hm.applyLook(-50, 0); // yaw wraps past 0
    expect(hm.yaw).toBeCloseTo(340, 6);
    hm.applyLook(0, 100); // pitch clamps up
    expect(hm.pitch).toBeCloseTo(38, 6);
    hm.applyLook(0, -1000); // pitch clamps down
    expect(hm.pitch).toBeCloseTo(-38, 6);
  });

  it('keyboard pitch tilts over time and clamps to pitchMaxDeg', () => {
    const hm = new HardMode(cfg({ pitchMaxDeg: 38, keyTurnDegPerSec: 110 }), rngOf([0, 999999]));
    hm.start(0);
    hm.setKeyPitch(1); // up
    hm.tick(16, 0.1); // +11°
    expect(hm.pitch).toBeCloseTo(11, 4);
    hm.setKeyPitch(-1); // down
    hm.tick(32, 0.1); // back to ~0
    expect(hm.pitch).toBeCloseTo(0, 4);
    hm.setKeyPitch(1);
    for (let i = 0; i < 10; i++) hm.tick(48 + i * 16, 0.1); // +110° worth → clamped
    expect(hm.pitch).toBeCloseTo(38, 6);
  });

  it('catch needs the view roughly level: too far up/down misses even with yaw centered', () => {
    const hm = new HardMode(cfg({ catchPitchTolDeg: 12 }), rngOf([0, 0, 0]));
    hm.start(0);
    let now = HARD_DEFAULTS.encounterMinMs;
    hm.tick(now, 0.016); // spawn at 70°
    hm.yaw = 70; // yaw dead center
    hm.pitch = 30; // but looking well above the ground-standing killer
    for (let i = 0; i < 10 && hm.killerActive(); i++) {
      now += 30;
      hm.tick(now, 0.03);
    }
    expect(hm.spotted).toBe(0); // not caught while looking away vertically
    expect(hm.killerActive()).toBe(true); // still within approachMs
    hm.pitch = 0; // level out
    for (let i = 0; i < 20 && hm.killerActive(); i++) {
      now += 30;
      hm.tick(now, 0.03);
    }
    expect(hm.spotted).toBe(1); // now it catches
  });

  it('pitch tolerance is inclusive at the boundary and excludes just past it', () => {
    const atBoundary = (pitch: number): boolean => {
      const hm = new HardMode(cfg({ catchPitchTolDeg: 12, catchDwellMs: 60 }), rngOf([0, 0, 0]));
      hm.start(0);
      let now = HARD_DEFAULTS.encounterMinMs;
      hm.tick(now, 0.016); // spawn at 70°
      hm.yaw = 70;
      hm.pitch = pitch;
      for (let i = 0; i < 10 && hm.killerActive(); i++) {
        now += 30;
        hm.tick(now, 0.03);
      }
      return hm.spotted === 1;
    };
    expect(atBoundary(12)).toBe(true); // exactly the tolerance still catches (<=)
    expect(atBoundary(12.5)).toBe(false); // just past it does not
  });

  it('a full two-axis catch can be driven entirely through applyLook()', () => {
    // yaw=0, gap=min, offset 0 → killer at 70°, pitch 0.
    const hm = new HardMode(cfg({ catchPitchTolDeg: 12 }), rngOf([0, 0, 0]));
    hm.start(0); // starts looking at yaw 0, pitch 0
    let now = HARD_DEFAULTS.encounterMinMs;
    hm.tick(now, 0.016); // spawn at 70°
    expect(hm.killerYaw()).toBeCloseTo(70, 6);
    hm.applyLook(70, 5); // turn onto it (yaw 0→70) and tilt up 5° (within the 12° tol)
    expect(hm.yaw).toBeCloseTo(70, 6);
    for (let i = 0; i < 20 && hm.killerActive(); i++) {
      now += 30;
      hm.tick(now, 0.03);
    }
    expect(hm.spotted).toBe(1);
  });

  it('a stopped controller ignores ticks; empty metrics read safely', () => {
    const hm = new HardMode();
    expect(hm.spottedRate()).toBe(0);
    expect(hm.avgReactionMs()).toBeNull();
    hm.tick(1000, 0.016); // not started → no-op
    expect(hm.killerActive()).toBe(false);
  });

  it('stop() preserves metrics, resetMetrics() clears them (prevents cross-run leak)', () => {
    const hm = new HardMode(cfg(), rngOf([0, 0, 0]));
    hm.start(0);
    let now = HARD_DEFAULTS.encounterMinMs;
    hm.tick(now, 0.016); // spawn at 70°
    hm.yaw = 70;
    for (let i = 0; i < 20 && hm.killerActive(); i++) {
      now += 30;
      hm.tick(now, 0.03);
    }
    expect(hm.spotted).toBe(1);
    hm.stop();
    expect(hm.spotted).toBe(1); // stop preserves (the run isn't logged yet)
    expect(hm.encounters()).toBe(1);
    hm.resetMetrics();
    expect(hm.spotted).toBe(0);
    expect(hm.missed).toBe(0);
    expect(hm.encounters()).toBe(0);
    expect(hm.avgReactionMs()).toBeNull();
  });
});
