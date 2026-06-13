import { describe, expect, it } from 'vitest';
import { MAX_POS_DEG, TYPES } from '../src/engine/constants';
import { dialRadius } from '../src/engine/geometry';
import { spawnCheck, type SpawnOpts } from '../src/engine/skillCheck';

/** Small deterministic LCG so spawn tests are reproducible. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function opts(over: Partial<SpawnOpts> = {}): SpawnOpts {
  return {
    zoneMul: 1,
    unnervingTier: 0,
    speedMul: 1,
    hfTokens: 0,
    madness: false,
    w: 800,
    h: 420,
    rng: Math.random,
    ...over,
  };
}

describe('spawnCheck zone position', () => {
  it('gen zone start always within [120, maxStart] and never overflows the dial', () => {
    const rng = lcg(1);
    for (let i = 0; i < 500; i++) {
      const c = spawnCheck(0, TYPES.gen, opts({ rng }));
      const total = c.greatDeg + c.goodDeg;
      expect(c.zoneStartDeg).toBeGreaterThanOrEqual(120);
      expect(c.zoneStartDeg).toBeLessThanOrEqual(MAX_POS_DEG);
      expect(c.zoneStartDeg + total).toBeLessThanOrEqual(360 - 4);
    }
  });

  it('DS earliest start is 240°', () => {
    const rng = lcg(2);
    for (let i = 0; i < 500; i++) {
      const c = spawnCheck(0, TYPES.ds, opts({ rng }));
      expect(c.zoneStartDeg).toBeGreaterThanOrEqual(240);
      expect(c.zoneStartDeg).toBeLessThanOrEqual(330);
    }
  });

  it('latest start never exceeds 330°', () => {
    const rng = lcg(3);
    for (let i = 0; i < 500; i++) {
      // Tiny zones (0.4×) leave maxStart capped by MAX_POS_DEG, not the overflow guard.
      const c = spawnCheck(0, TYPES.snap, opts({ rng, zoneMul: 0.4 }));
      expect(c.zoneStartDeg).toBeLessThanOrEqual(330);
    }
  });

  it('oversized zones clamp minStart to maxStart instead of inverting the range', () => {
    const rng = lcg(4);
    for (let i = 0; i < 200; i++) {
      // DS at 5×: total = 126°, so maxStart = 360−126−4 = 230° < minPosDeg 240°.
      // The range collapses and the start must pin to maxStart, not invert.
      const c = spawnCheck(0, TYPES.ds, opts({ rng, zoneMul: 5 }));
      expect(c.greatDeg).toBeCloseTo(126, 10);
      expect(c.zoneStartDeg).toBeCloseTo(230, 10);
    }
  });

  it('non-madness spawns are centered, clockwise', () => {
    const c = spawnCheck(0, TYPES.gen, opts({ rng: lcg(5) }));
    expect(c.dir).toBe(1);
    expect(c.cx).toBe(400);
    expect(c.cy).toBe(210);
  });
});

describe('madness (Doctor) rolls', () => {
  it('produces all three variants (off-centre / reversed / both) over many rolls', () => {
    const rng = lcg(42);
    let offOnly = 0;
    let revOnly = 0;
    let both = 0;
    for (let i = 0; i < 600; i++) {
      const c = spawnCheck(0, TYPES.gen, opts({ rng, madness: true }));
      const off = c.cx !== 400 || c.cy !== 210;
      if (off && c.dir === 1) offOnly++;
      else if (!off && c.dir === -1) revOnly++;
      else if (off && c.dir === -1) both++;
    }
    expect(offOnly).toBeGreaterThan(0);
    expect(revOnly).toBeGreaterThan(0);
    expect(both).toBeGreaterThan(0);
    // Roughly equal odds — each variant should land well above a fluke count.
    expect(Math.min(offOnly, revOnly, both)).toBeGreaterThan(100);
  });

  it('off-centre stays clamped on small viewports (no negative ranges, no NaN)', () => {
    const rng = lcg(7);
    const w = 100;
    const h = 100;
    const m = dialRadius(w, h) + 34; // 70 + 34 = 104 > w/2 → range collapses to 0
    let offCount = 0;
    for (let i = 0; i < 300; i++) {
      const c = spawnCheck(0, TYPES.gen, opts({ rng, madness: true, w, h }));
      expect(Number.isFinite(c.cx)).toBe(true);
      expect(Number.isFinite(c.cy)).toBe(true);
      const off = c.cx !== w / 2 || c.cy !== h / 2;
      if (off) {
        offCount++;
        // Math.max(0, …) guard: the random span is 0, so the center pins to the margin.
        expect(c.cx).toBe(m);
        expect(c.cy).toBe(m);
      }
    }
    // Make sure the clamp branch was genuinely exercised, not skipped.
    expect(offCount).toBeGreaterThan(50);
  });

  it('off-centre center stays within the margin box on normal viewports', () => {
    const rng = lcg(8);
    const w = 800;
    const h = 420;
    const m = dialRadius(w, h) + 34;
    for (let i = 0; i < 300; i++) {
      const c = spawnCheck(0, TYPES.gen, opts({ rng, madness: true, w, h }));
      expect(c.cx).toBeGreaterThanOrEqual(m - 1e-9);
      expect(c.cx).toBeLessThanOrEqual(w - m + 1e-9);
      expect(c.cy).toBeGreaterThanOrEqual(m - 1e-9);
      expect(c.cy).toBeLessThanOrEqual(h - m + 1e-9);
    }
  });
});
