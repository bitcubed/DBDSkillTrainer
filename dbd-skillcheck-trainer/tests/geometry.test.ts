import { describe, expect, it } from 'vitest';
import { TYPES } from '../src/engine/constants';
import { classify, degPerMs, errMs, rotMs, zoneDegs } from '../src/engine/geometry';

const gen = TYPES.gen;

describe('zoneDegs', () => {
  it('gen great = 10.8°, good = 46.8° at 1.0× / no Unnerving', () => {
    const z = zoneDegs(gen, 1, 0);
    expect(z.greatDeg).toBeCloseTo(10.8, 10);
    expect(z.goodDeg).toBeCloseTo(46.8, 10);
  });

  it('zoneMul scales both zones', () => {
    const z = zoneDegs(gen, 0.7, 0);
    expect(z.greatDeg).toBeCloseTo(10.8 * 0.7, 10);
    expect(z.goodDeg).toBeCloseTo(46.8 * 0.7, 10);
  });

  it('Unnerving III shrinks good by 60% and leaves great unchanged', () => {
    const z = zoneDegs(gen, 1, 3);
    expect(z.greatDeg).toBeCloseTo(10.8, 10);
    expect(z.goodDeg).toBeCloseTo(46.8 * 0.4, 10);
  });

  it('Unnerving I/II shrink good by 40%/50%', () => {
    expect(zoneDegs(gen, 1, 1).goodDeg).toBeCloseTo(46.8 * 0.6, 10);
    expect(zoneDegs(gen, 1, 2).goodDeg).toBeCloseTo(46.8 * 0.5, 10);
  });

  it('great-only checks have zero good zone', () => {
    const z = zoneDegs(TYPES.ds, 1, 0);
    expect(z.greatDeg).toBeCloseTo(25.2, 10);
    expect(z.goodDeg).toBe(0);
  });
});

describe('rotMs', () => {
  it('gen at 1.0× / 0 HF tokens = 1100ms', () => {
    expect(rotMs(gen, 1, 0)).toBeCloseTo(1100, 10);
  });

  it('6 HF tokens → 1100 / 1.24 ≈ 887ms', () => {
    expect(rotMs(gen, 1, 6)).toBeCloseTo(1100 / 1.24, 6);
  });

  it('speedMul 1.4 → ≈786ms', () => {
    expect(rotMs(gen, 1.4, 0)).toBeCloseTo(1100 / 1.4, 6);
  });

  it('HF speed and slider speed multiply together', () => {
    expect(rotMs(gen, 1.4, 6)).toBeCloseTo(1100 / (1.24 * 1.4), 6);
  });
});

describe('great window', () => {
  it('gen great window ≈ 33ms at 1.1s rotation / 1.0× / 0 tokens', () => {
    const z = zoneDegs(gen, 1, 0);
    const windowMs = z.greatDeg / degPerMs(rotMs(gen, 1, 0));
    expect(windowMs).toBeCloseTo(33, 0);
  });
});

describe('classify', () => {
  const check = { zoneStartDeg: 200, greatDeg: 10.8, goodDeg: 46.8 };

  it('before the zone is early', () => {
    expect(classify(199.99, check)).toBe('early');
    expect(classify(0, check)).toBe('early');
  });

  it('just inside the great band is great (start-inclusive)', () => {
    expect(classify(200, check)).toBe('great');
    expect(classify(210.79, check)).toBe('great');
  });

  it('great→good boundary: end of great is good', () => {
    expect(classify(210.8, check)).toBe('good');
    expect(classify(257.59, check)).toBe('good');
  });

  it('past the good band is late', () => {
    expect(classify(257.6, check)).toBe('late');
    expect(classify(359, check)).toBe('late');
  });

  it('great-only check: anything past great is late', () => {
    const only = { zoneStartDeg: 240, greatDeg: 25.2, goodDeg: 0 };
    expect(classify(265.21, only)).toBe('late');
    expect(classify(250, only)).toBe('great');
  });
});

describe('errMs', () => {
  const dpm = degPerMs(1100); // gen at 1×
  const check = { zoneStartDeg: 200, greatDeg: 10.8, goodDeg: 46.8, degPerMs: dpm };

  it('pressing before great-center is negative (early)', () => {
    expect(errMs(200, check)).toBeLessThan(0);
  });

  it('pressing at great-center is 0', () => {
    expect(errMs(205.4, check)).toBeCloseTo(0, 10);
  });

  it('converts degrees to ms via degPerMs', () => {
    // 5.4° past center at 0.327°/ms ≈ +16.5ms
    expect(errMs(210.8, check)).toBeCloseTo(5.4 / dpm, 6);
  });
});
