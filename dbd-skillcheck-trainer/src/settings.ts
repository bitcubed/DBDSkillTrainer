// Settings persistence (spec §8.3): input mode, pacing, volume, sliders,
// BG noise, last mode/special, accessibility toggles. Values are validated
// and clamped on load so corrupt storage can never produce a broken UI.

import type { StorageLike } from './analytics/history';
import type { InputMode, Mode, Pacing, Settings, SpecialId } from './engine/types';

export const SETTINGS_KEY = 'dbdtrainer.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  inputMode: 'both',
  pacing: 'drill',
  volume: 0.6,
  speedMul: 1,
  zoneMul: 1,
  warnLeadMs: 500,
  dialScale: 1,
  bgNoise: false,
  lastMode: 'gen',
  lastSpecial: 'ds',
  reducedMotion: false,
  colorblindSafe: false,
};

function num(v: unknown, min: number, max: number, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt;
}

function bool(v: unknown, dflt: boolean): boolean {
  return typeof v === 'boolean' ? v : dflt;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], dflt: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : dflt;
}

const INPUT_MODES: readonly InputMode[] = ['both', 'mouse', 'space'];
const PACINGS: readonly Pacing[] = ['drill', 'realistic'];
const MODES: readonly Mode[] = ['gen', 'doctor', 'special'];
const SPECIALS: readonly SpecialId[] = ['ds', 'oc1', 'oc2', 'oc3', 'opp', 'bnp', 'snap'];

/** Load + validate settings; anything missing/corrupt falls back per-field to defaults. */
export function loadSettings(storage: StorageLike): Settings {
  let raw: unknown = null;
  try {
    const s = storage.getItem(SETTINGS_KEY);
    if (s) raw = JSON.parse(s);
  } catch {
    // corrupt/unavailable → defaults
  }
  const o = (raw !== null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    inputMode: oneOf(o.inputMode, INPUT_MODES, d.inputMode),
    pacing: oneOf(o.pacing, PACINGS, d.pacing),
    volume: num(o.volume, 0, 1, d.volume),
    // Slider ranges from index.html: speed 0.5–1.5×, zone 0.4–2×, warn 0–1000ms.
    speedMul: num(o.speedMul, 0.5, 1.5, d.speedMul),
    zoneMul: num(o.zoneMul, 0.4, 2, d.zoneMul),
    warnLeadMs: num(o.warnLeadMs, 0, 1000, d.warnLeadMs),
    // Dial-size slider range from index.html: 0.5–1.3×.
    dialScale: num(o.dialScale, 0.5, 1.3, d.dialScale),
    bgNoise: bool(o.bgNoise, d.bgNoise),
    lastMode: oneOf(o.lastMode, MODES, d.lastMode),
    lastSpecial: oneOf(o.lastSpecial, SPECIALS, d.lastSpecial),
    reducedMotion: bool(o.reducedMotion, d.reducedMotion),
    colorblindSafe: bool(o.colorblindSafe, d.colorblindSafe),
  };
}

export function saveSettings(settings: Settings, storage: StorageLike): void {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // quota/private mode — settings are best-effort
  }
}
