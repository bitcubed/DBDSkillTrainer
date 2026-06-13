// In-run stats math: constant error (mean) and variable error (population SD),
// matching the prototype's formulas exactly.

import type { TimingErr } from '../engine/types';

/**
 * The timing errors logged since a snapshot, using monotone counters so the
 * math survives the errs array's 200-entry cap: returns the last
 * (totalNow − totalAtSnapshot) entries, clamped to what's still buffered.
 */
export function errsSince(
  errs: readonly TimingErr[],
  totalNow: number,
  totalAtSnapshot: number,
): number[] {
  const delta = Math.max(0, totalNow - totalAtSnapshot);
  if (delta === 0) return [];
  return errs.slice(-Math.min(delta, errs.length)).map((e) => e.ms);
}

export function mean(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Population standard deviation (divide by n), as the prototype computes it. */
export function stdDev(xs: readonly number[]): number | null {
  const m = mean(xs);
  if (m === null) return null;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length);
}

export interface MeanSd {
  mean: number | null;
  sd: number | null;
}

export function meanSd(xs: readonly number[]): MeanSd {
  return { mean: mean(xs), sd: stdDev(xs) };
}

/** greatRate = great / (great + good + miss); 0 when there are no checks. */
export function greatRate(great: number, good: number, miss: number): number {
  const total = great + good + miss;
  return total === 0 ? 0 : great / total;
}
