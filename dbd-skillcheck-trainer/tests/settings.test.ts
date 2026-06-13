import { describe, expect, it } from 'vitest';
import type { StorageLike } from '../src/analytics/history';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, SETTINGS_KEY } from '../src/settings';

function memStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('settings persistence', () => {
  it('round-trips a full settings object', () => {
    const s = memStorage();
    const custom = {
      ...DEFAULT_SETTINGS,
      inputMode: 'space' as const,
      pacing: 'realistic' as const,
      volume: 0.25,
      speedMul: 1.35,
      zoneMul: 0.7,
      warnLeadMs: 250,
      bgNoise: true,
      lastMode: 'special' as const,
      lastSpecial: 'oc3' as const,
      reducedMotion: true,
      colorblindSafe: true,
    };
    saveSettings(custom, s);
    expect(loadSettings(s)).toEqual(custom);
  });

  it('missing storage → defaults', () => {
    expect(loadSettings(memStorage())).toEqual(DEFAULT_SETTINGS);
  });

  it('corrupt JSON → defaults, no crash', () => {
    expect(loadSettings(memStorage({ [SETTINGS_KEY]: '{{{' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memStorage({ [SETTINGS_KEY]: 'null' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memStorage({ [SETTINGS_KEY]: '"hi"' }))).toEqual(DEFAULT_SETTINGS);
  });

  it('invalid fields fall back individually; valid ones survive', () => {
    const s = memStorage({
      [SETTINGS_KEY]: JSON.stringify({
        inputMode: 'telepathy',
        pacing: 'realistic',
        volume: 99,
        speedMul: -3,
        warnLeadMs: '250', // wrong type (string ≠ default 500, so coercion would be caught)
        lastSpecial: 'wiggle', // removed feature — must not come back via storage
        bgNoise: 1,
      }),
    });
    const loaded = loadSettings(s);
    expect(loaded.inputMode).toBe('both'); // invalid enum → default
    expect(loaded.pacing).toBe('realistic'); // valid → kept
    expect(loaded.volume).toBe(1); // clamped into 0..1
    expect(loaded.speedMul).toBe(0.5); // clamped into slider range
    expect(loaded.warnLeadMs).toBe(500); // wrong type → default, NOT coerced to 250
    expect(loaded.lastSpecial).toBe('ds');
    expect(loaded.bgNoise).toBe(false); // wrong type → default
  });

  it('every numeric clamp engages on both sides', () => {
    const s = memStorage({
      [SETTINGS_KEY]: JSON.stringify({ volume: -1, speedMul: 9, zoneMul: 0.01, warnLeadMs: 5000 }),
    });
    const loaded = loadSettings(s);
    expect(loaded.volume).toBe(0);
    expect(loaded.speedMul).toBe(1.5);
    expect(loaded.zoneMul).toBe(0.4);
    expect(loaded.warnLeadMs).toBe(1000);
  });

  it('exact boundary values survive load unchanged', () => {
    const s = memStorage();
    saveSettings(
      { ...DEFAULT_SETTINGS, volume: 1, speedMul: 0.5, zoneMul: 2, warnLeadMs: 0 },
      s,
    );
    const loaded = loadSettings(s);
    expect(loaded.volume).toBe(1);
    expect(loaded.speedMul).toBe(0.5);
    expect(loaded.zoneMul).toBe(2);
    expect(loaded.warnLeadMs).toBe(0);
  });

  it('a throwing storage backend yields defaults and saves silently', () => {
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
    expect(loadSettings(bad)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS, bad)).not.toThrow();
  });
});
