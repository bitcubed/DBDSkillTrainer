// Pure dial geometry — zone sizes, rotation timing, press classification,
// signed timing error, and deg↔screen mapping. Ported verbatim from the
// prototype; fully unit-tested without a DOM.

import { DEG_PER_PCT, HF_PER_TOKEN_SPEED, UNNERVING_GOOD_SHRINK } from './constants';
import type { CheckType, PressOutcome, UnnervingTier } from './types';

export interface ZoneDegs {
  greatDeg: number;
  goodDeg: number;
}

/** Zone arc lengths in degrees. Unnerving Presence shrinks the GOOD zone only. */
export function zoneDegs(type: CheckType, zoneMul: number, unnervingTier: UnnervingTier): ZoneDegs {
  const greatDeg = type.greatPct * DEG_PER_PCT * zoneMul;
  const goodDeg = type.goodPct * DEG_PER_PCT * zoneMul * (1 - UNNERVING_GOOD_SHRINK[unnervingTier]);
  return { greatDeg, goodDeg };
}

/** Milliseconds per full pointer rotation. Hyperfocus adds +4% speed per token. */
export function rotMs(type: CheckType, speedMul: number, hfTokens: number): number {
  return (type.rotS * 1000) / ((1 + HF_PER_TOKEN_SPEED * hfTokens) * speedMul);
}

export function degPerMs(rotMsValue: number): number {
  return 360 / rotMsValue;
}

/** The slice of a SkillCheck that geometry functions need. */
export interface ZoneGeom {
  zoneStartDeg: number;
  greatDeg: number;
  goodDeg: number;
}

export interface ErrGeom extends ZoneGeom {
  degPerMs: number;
}

/** Where was the pointer at press time? (nopress is decided by the session, not here.) */
export function classify(travelDeg: number, check: ZoneGeom): PressOutcome {
  const s = check.zoneStartDeg;
  if (travelDeg < s) return 'early';
  if (travelDeg < s + check.greatDeg) return 'great';
  if (travelDeg < s + check.greatDeg + check.goodDeg) return 'good';
  return 'late';
}

/** Signed ms from the great-zone center; negative = early. */
export function errMs(travelDeg: number, check: ErrGeom): number {
  const center = check.zoneStartDeg + check.greatDeg / 2;
  return (travelDeg - center) / check.degPerMs;
}

/**
 * Dial radius for a given stage size (render + madness off-centre spawn bounds).
 * `scale` is a cosmetic multiplier (the dial-size slider) — it changes only how
 * big the dial is drawn, never the timing or zone geometry, which are angular.
 */
export function dialRadius(w: number, h: number, scale = 1): number {
  return Math.max(70, Math.min(112, Math.min(w, h) * 0.24)) * scale;
}

/** Travel degrees (0 = 12 o'clock, clockwise) → screen XY at radius r. */
export function posXY(
  cx: number,
  cy: number,
  thetaDeg: number,
  r: number,
): [x: number, y: number] {
  const a = (thetaDeg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}
