// Perk modifiers: Hyperfocus, Stake Out constants, Unnerving Presence,
// Huntress Lullaby, Toolbox, Merciless Storm. Pure functions; the Session
// owns the token state and calls these.

import {
  HF_MAX_TOKENS,
  HF_PER_TOKEN_BONUS,
  HF_PER_TOKEN_ODDS,
  STORM_WARN_LEAD_MS,
  TOOLBOX_TRIGGER_PCT,
  UNNERVING_ODDS,
} from './constants';
import type { CheckType, UnnervingTier } from './types';

/**
 * Hyperfocus great-bonus multiplier uses tokens held BEFORE the current great —
 * the first check of an action gets no bonus.
 */
export function hyperfocusBonusMul(tokensBefore: number): number {
  return 1 + HF_PER_TOKEN_BONUS * tokensBefore;
}

/** +1 token per great, capped at 6. (Reset to 0 on good/miss is the Session's job.) */
export function gainHyperfocusToken(tokens: number): number {
  return Math.min(HF_MAX_TOKENS, tokens + 1);
}

export interface TriggerOddsOpts {
  isRepair: boolean;
  toolbox: boolean;
  hyperfocus: boolean;
  hfTokens: number;
  unnervingTier: UnnervingTier;
}

/**
 * Realistic-pacing trigger odds (% per second): base odds, replaced by 40 with
 * a toolbox on a repair dial, +4 per Hyperfocus token, +10 with Unnerving.
 */
export function triggerOddsPct(type: CheckType, o: TriggerOddsOpts): number {
  let odds = type.triggerPctPerSec;
  if (o.isRepair && o.toolbox) odds = TOOLBOX_TRIGGER_PCT;
  if (o.hyperfocus) odds += 100 * HF_PER_TOKEN_ODDS * o.hfTokens;
  if (o.unnervingTier > 0) odds += 100 * UNNERVING_ODDS;
  return odds;
}

/**
 * Warning-gong lead time. Storm forces a short 120ms lead so the chain keeps
 * its cadence; Lullaby linearly shortens the lead (APPROXIMATED — real
 * per-token values unpublished), reaching 0 (and silence) at 5 tokens.
 */
export function effectiveWarnLeadMs(baseLeadMs: number, lullaby: number, storm: boolean): number {
  const base = storm ? STORM_WARN_LEAD_MS : baseLeadMs;
  return base * (1 - Math.min(lullaby, 5) / 5);
}

/** At 5 Lullaby tokens the warning is fully silent. */
export function lullabySilent(lullaby: number): boolean {
  return lullaby >= 5;
}
