// Spawning a skill check: zone position, pointer speed, and the Doctor's
// Madness roll (off-centre / reversed / both, equal odds). Ported verbatim
// from the prototype; RNG is injected for testability.

import { MAX_POS_DEG, ZONE_SPAWN_MARGIN_DEG } from './constants';
import { degPerMs, dialRadius, rotMs, zoneDegs } from './geometry';
import type { CheckType, SkillCheck, UnnervingTier } from './types';

export interface SpawnOpts {
  zoneMul: number;
  unnervingTier: UnnervingTier; // effective tier (0 when perks don't apply)
  speedMul: number;
  hfTokens: number; // effective tokens (0 when Hyperfocus off / not applicable)
  madness: boolean; // mode === 'doctor'
  w: number; // stage size, for the off-centre clamp
  h: number;
  rng: () => number; // [0, 1)
}

export function spawnCheck(now: number, type: CheckType, o: SpawnOpts): SkillCheck {
  const z = zoneDegs(type, o.zoneMul, o.unnervingTier);
  const total = z.greatDeg + z.goodDeg;
  // Zone start: random in [minPosDeg, maxStart]; never let the zone run past 12 o'clock.
  const maxStart = Math.min(MAX_POS_DEG, 360 - total - ZONE_SPAWN_MARGIN_DEG);
  const minStart = Math.min(type.minPosDeg, maxStart);
  const zoneStartDeg = minStart + o.rng() * (maxStart - minStart);

  let dir: 1 | -1 = 1;
  let cx = o.w / 2;
  let cy = o.h / 2;
  if (o.madness) {
    // Madness: equal-chance roll → 0 = off-centre, 1 = reversed, 2 = both.
    const r = Math.floor(o.rng() * 3);
    if (r === 0 || r === 2) {
      // Off-centre must keep the dial on-canvas: margin = dial radius + 34px,
      // with Math.max(0, …) guarding small viewports against negative ranges.
      const m = dialRadius(o.w, o.h) + 34;
      cx = m + o.rng() * Math.max(0, o.w - 2 * m);
      cy = m + o.rng() * Math.max(0, o.h - 2 * m);
    }
    if (r === 1 || r === 2) dir = -1;
  }

  return {
    t0: now,
    type,
    dir,
    cx,
    cy,
    zoneStartDeg,
    greatDeg: z.greatDeg,
    goodDeg: z.goodDeg,
    degPerMs: degPerMs(rotMs(type, o.speedMul, o.hfTokens)),
    resolved: false,
  };
}
