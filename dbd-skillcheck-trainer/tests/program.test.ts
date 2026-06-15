import { describe, expect, it } from 'vitest';
import {
  fmtClock,
  PROGRAM,
  PROGRAM_TOTAL_S,
  ProgramController,
  VARIED_SWITCH_MS,
  type ProgramHooks,
} from '../src/engine/program';
import type { SegmentResult } from '../src/engine/types';
import { makeHarness, type Harness } from './helpers';

interface ProgHarness extends Harness {
  program: ProgramController;
  completed: SegmentResult[][];
  cancelled: number[];
  bgStates: boolean[];
  segmentsSeen: string[];
}

function makeProgram(): ProgHarness {
  const h = makeHarness() as ProgHarness;
  h.completed = [];
  h.cancelled = [];
  h.bgStates = [];
  h.segmentsSeen = [];
  const hooks: ProgramHooks = {
    onComplete: (segs) => h.completed.push(segs),
    onCancel: (now) => h.cancelled.push(now),
    setBgNoise: (on) => h.bgStates.push(on),
    onSegment: (seg) => h.segmentsSeen.push(seg.name),
  };
  h.program = new ProgramController(h.session, hooks);
  return h;
}

/** Drive program + session with a fake clock, mirroring the main RAF loop's order. */
function run(h: ProgHarness, from: number, to: number, stepMs = 50): number {
  for (let now = from; now <= to; now += stepMs) {
    h.program.tick(now);
    h.session.tick(now);
  }
  return to;
}

describe('program structure', () => {
  it('has 6 segments totalling 300s (incl. the Lookout hard-mode segment)', () => {
    expect(PROGRAM).toHaveLength(6);
    expect(PROGRAM_TOTAL_S).toBe(300);
    expect(PROGRAM.map((s) => s.name)).toEqual([
      'Warm-up',
      'Overload',
      'Varied',
      'Bias-fix',
      'Lookout',
      'Pressure',
    ]);
    expect(PROGRAM.map((s) => s.durS)).toEqual([45, 60, 60, 30, 45, 60]);
    expect(PROGRAM.find((s) => s.name === 'Lookout')?.kind).toBe('hard');
    expect(VARIED_SWITCH_MS).toBe(7000); // ~7s rotation cadence is part of the design
  });
});

describe('segment application', () => {
  it('each segment applies the right speed/zone/mode/warn settings', () => {
    const h = makeProgram();
    const t0 = 1000;
    h.program.start(t0);

    // Warm-up: gen, 1.0×, 1.0×, 500ms.
    expect(h.session.mode).toBe('gen');
    expect(h.session.speedMul).toBe(1.0);
    expect(h.session.zoneMul).toBe(1.0);
    expect(h.session.warnLeadMs).toBe(500);
    expect(h.session.storm).toBe(false);

    // Overload: 1.4× speed, 0.7× zone, 350ms warn.
    run(h, t0, t0 + 45_050);
    expect(h.program.currentSegment()?.name).toBe('Overload');
    expect(h.session.speedMul).toBe(1.4);
    expect(h.session.zoneMul).toBe(0.7);
    expect(h.session.warnLeadMs).toBe(350);

    // Varied: starts on the Generator rotation, BG noise on, 1.0× zone, 500ms warn.
    run(h, t0 + 45_050, t0 + 120_050);
    expect(h.program.currentSegment()?.name).toBe('Varied');
    expect(h.bgStates[h.bgStates.length - 1]).toBe(true);
    expect(h.session.zoneMul).toBe(1.0);
    expect(h.session.warnLeadMs).toBe(500);

    // Bias-fix (165–195s): back to gen 1.0× / 1.0× / 500ms.
    run(h, t0 + 120_050, t0 + 180_000);
    expect(h.program.currentSegment()?.name).toBe('Bias-fix');
    expect(h.session.speedMul).toBe(1.0);
    expect(h.session.zoneMul).toBe(1.0);
    expect(h.session.warnLeadMs).toBe(500);
    expect(h.session.mode).toBe('gen');

    // Lookout (195–240s): Hard Mode — gen dial, mode 'hard', no storm.
    run(h, t0 + 180_000, t0 + 215_000);
    expect(h.program.currentSegment()?.name).toBe('Lookout');
    expect(h.session.mode).toBe('hard');
    expect(h.session.storm).toBe(false);
    expect(h.session.warnLeadMs).toBe(500);

    // Pressure (240–300s): storm on a gen dial starting at 90%, 1.0× zone, 120ms warn.
    run(h, t0 + 215_000, t0 + 270_000);
    expect(h.program.currentSegment()?.name).toBe('Pressure');
    expect(h.session.stormOn()).toBe(true);
    expect(h.session.warnLeadMs).toBe(120);
    expect(h.session.zoneMul).toBe(1.0);
    expect(h.session.mode).toBe('gen');
  });

  it('perks are forced off for the duration', () => {
    const h = makeProgram();
    h.session.hyperfocus = true;
    h.session.stakeOut = true;
    h.session.unnerving = 3;
    h.session.lullaby = 4;
    h.session.toolbox = true;
    h.program.start(1000);
    expect(h.session.hyperfocus).toBe(false);
    expect(h.session.stakeOut).toBe(false);
    expect(h.session.unnerving).toBe(0);
    expect(h.session.lullaby).toBe(0);
    expect(h.session.toolbox).toBe(false);
    expect(h.session.hfTokens).toBe(0);
  });
});

describe('regression: exactly 6 segment results, finalized once each', () => {
  it('a full 300s run records exactly 6 segment results in order', () => {
    const h = makeProgram();
    const t0 = 1000;
    h.program.start(t0);
    run(h, t0, t0 + 301_000);
    expect(h.completed).toHaveLength(1);
    const segs = h.completed[0]!;
    expect(segs).toHaveLength(6); // NOT 7 — the last segment must not double-finalize
    expect(segs.map((s) => s.name)).toEqual([
      'Warm-up',
      'Overload',
      'Varied',
      'Bias-fix',
      'Lookout',
      'Pressure',
    ]);
    expect(h.program.segStats).toHaveLength(6);
    // Program cleaned up after itself.
    expect(h.program.active).toBe(false);
    expect(h.session.running).toBe(false);
    expect(h.session.programActive).toBe(false);
    expect(h.session.storm).toBe(false);
    expect(h.bgStates[h.bgStates.length - 1]).toBe(false);
  });

  it('segment results add up to the session totals (no-press misses count)', () => {
    const h = makeProgram();
    const t0 = 1000;
    h.program.start(t0);
    run(h, t0, t0 + 301_000);
    const segs = h.completed[0]!;
    const misses = segs.reduce((a, s) => a + s.misses, 0);
    expect(misses).toBe(h.session.stats.miss);
    expect(misses).toBeGreaterThan(0); // un-pressed checks timed out throughout
    const hits = segs.reduce((a, s) => a + s.hits, 0);
    expect(hits).toBe(h.session.stats.great + h.session.stats.good + h.session.stats.miss);
  });
});

describe('countdown clock', () => {
  it('reads 5:00 at t=0 and ~4:10 after 50s with Overload active', () => {
    const h = makeProgram();
    const t0 = 1000;
    h.program.start(t0);
    expect(fmtClock(h.program.totalRemainS(t0))).toBe('5:00');
    run(h, t0, t0 + 50_000);
    expect(h.program.currentSegment()?.name).toBe('Overload');
    expect(h.session.speedMul).toBe(1.4);
    expect(h.session.zoneMul).toBe(0.7);
    expect(fmtClock(h.program.totalRemainS(t0 + 50_000))).toBe('4:10');
  });

  it('fmtClock formats and clamps', () => {
    expect(fmtClock(300)).toBe('5:00');
    expect(fmtClock(249.2)).toBe('4:10');
    expect(fmtClock(0)).toBe('0:00');
    expect(fmtClock(-3)).toBe('0:00');
    expect(fmtClock(61)).toBe('1:01');
  });
});

describe('Varied rotation', () => {
  it('rotates the session task every ~7s through gen → Overcharge II → Madness', () => {
    const h = makeProgram();
    const t0 = 1000;
    h.program.start(t0);
    run(h, t0, t0 + 105_200); // just into Varied (105–165s), before the first rotation
    expect(h.program.currentSegment()?.name).toBe('Varied');
    expect(h.session.mode).toBe('gen');
    expect(h.program.currentRot().label).toBe('Generator');
    const entryRotAt = h.program.rotAt; // when the Generator (entry) rotation started

    // Walk the segment, recording the SESSION state each rotation lands on and
    // the times at which rotations fire.
    const seen = new Map<string, { mode: string; special: string; speed: number }>();
    const rotTimes: number[] = [];
    let lastRot = h.program.rotIdx;
    let now = t0 + 105_200;
    for (let i = 0; i < 1000 && rotTimes.length < 3; i++) {
      now += 50;
      h.program.tick(now);
      h.session.tick(now);
      if (h.program.rotIdx !== lastRot) {
        lastRot = h.program.rotIdx;
        rotTimes.push(now);
      }
      seen.set(h.program.currentRot().label, {
        mode: h.session.mode,
        special: h.session.special,
        speed: h.session.speedMul,
      });
    }
    expect([...seen.keys()].sort()).toEqual(['Generator', 'Madness', 'Overcharge II']);
    // The rotation drives the actual session task, not just the controller label.
    expect(seen.get('Overcharge II')).toEqual({ mode: 'special', special: 'oc2', speed: 1.05 });
    expect(seen.get('Madness')!.mode).toBe('doctor');
    expect(seen.get('Generator')!.mode).toBe('gen');
    // Cadence: each rotation fires ≥7s after the last, plus at most an
    // in-flight check (the rotation must wait for the active phase to clear).
    expect(rotTimes.length).toBe(3);
    let prev = entryRotAt; // the entry rotation's clock; each rotation is ~7s after the last
    for (const t of rotTimes) {
      const gap = t - prev;
      expect(gap).toBeGreaterThanOrEqual(VARIED_SWITCH_MS - 100);
      expect(gap).toBeLessThan(VARIED_SWITCH_MS + 4000);
      prev = t;
    }
  });

  it('never rotates while a check is active', () => {
    const h = makeProgram();
    const t0 = 1000;
    h.program.start(t0);
    run(h, t0, t0 + 105_200); // just into Varied
    // Walk until a check is active, then force the rotation window to elapse.
    let now = t0 + 105_200;
    while (h.session.phase !== 'active') {
      now += 25;
      h.program.tick(now);
      h.session.tick(now);
    }
    const rotBefore = h.program.rotIdx;
    const stale = h.program.rotAt + VARIED_SWITCH_MS + 500;
    // The first check goes active well inside the 7s window — if this ever
    // stops holding, fail loudly instead of silently skipping the assertion.
    expect(stale).toBeGreaterThan(now);
    // Tick the program alone at a time past the switch window while active.
    h.program.tick(stale);
    expect(h.session.phase).toBe('active');
    expect(h.program.rotIdx).toBe(rotBefore); // did NOT rotate mid-check
    // Once the check resolves (timeout), the rotation may proceed.
    let after = Math.max(now, stale);
    for (let i = 0; i < 400 && h.program.rotIdx === rotBefore; i++) {
      after += 25;
      h.program.tick(after);
      h.session.tick(after);
    }
    expect(h.program.rotIdx).toBe(rotBefore + 1);
  });
});

describe('Lookout (hard) segment killer metrics', () => {
  it('records per-segment killer encounters/spotted via the readKiller hook', () => {
    const h = makeHarness() as ProgHarness;
    h.completed = [];
    // A readKiller that only accrues encounters/spots DURING the Lookout window
    // (195–240s), so the diff must land on the Lookout segment alone.
    let spotted = 0;
    let encounters = 0;
    const program = new ProgramController(
      h.session,
      { onComplete: (segs) => h.completed.push(segs) },
      () => ({ spotted, encounters }),
    );
    const t0 = 1000;
    program.start(t0);
    for (let now = t0; now <= t0 + 301_000; now += 50) {
      // Simulate killer activity only inside the Lookout segment.
      if (now - t0 > 195_000 && now - t0 < 240_000 && (now - t0) % 5000 === 0) {
        encounters += 1;
        if (encounters % 2 === 0) spotted += 1;
      }
      program.tick(now);
      h.session.tick(now);
    }
    const segs = h.completed[0]!;
    const lookout = segs.find((s) => s.name === 'Lookout')!;
    expect(lookout.killerEncounters).toBeGreaterThan(0);
    expect(lookout.killerSpotted).toBeGreaterThanOrEqual(0);
    expect(lookout.killerEncounters).toBe(encounters);
    expect(lookout.killerSpotted).toBe(spotted);
    // Non-hard segments carry no killer fields.
    expect(segs.find((s) => s.name === 'Warm-up')!.killerEncounters).toBeUndefined();
  });
});

describe('storm segment', () => {
  it('loops the gen back to 90% during the Program so checks keep coming', () => {
    const h = makeProgram();
    const t0 = 1000;
    h.program.start(t0);
    run(h, t0, t0 + 240_050); // into Pressure
    expect(h.session.stormOn()).toBe(true);
    h.session.charges = 89.99;
    const now = t0 + 240_100;
    h.program.tick(now);
    h.session.tick(now);
    expect(h.session.running).toBe(true); // never stopped
    expect(h.session.charges).toBeLessThan(89); // looped back to ~81
  });
});

describe('cancel', () => {
  it('mid-program cancel cleanly clears active/running/storm', () => {
    const h = makeProgram();
    const t0 = 1000;
    h.program.start(t0);
    run(h, t0, t0 + 250_000); // inside Pressure (storm on)
    expect(h.session.storm).toBe(true);
    h.program.cancel(t0 + 250_001);
    expect(h.program.active).toBe(false);
    expect(h.session.running).toBe(false);
    expect(h.session.programActive).toBe(false);
    expect(h.session.phase).toBe('idle');
    expect(h.session.check).toBeNull();
    expect(h.session.storm).toBe(false);
    expect(h.cancelled).toHaveLength(1);
    expect(h.completed).toHaveLength(0); // no results for a cancelled run
  });
});
