// Timing tape: every press plotted as a signed-ms tick against a to-scale
// great/good band, with a live avg ± SD readout. This is the core feedback
// instrument — constant error (avg) vs variable error (±SD).

import { meanSd } from '../analytics/stats';
import { degPerMs, rotMs, zoneDegs } from '../engine/geometry';
import type { CheckType, TimingErr, UnnervingTier } from '../engine/types';
import { DEFAULT_PALETTE, hexToRgba, type ResultPalette } from './palette';

export interface TapeDomain {
  halfGreatMs: number;
  goodMs: number;
  min: number;
  max: number;
}

export function tapeDomain(
  type: CheckType,
  zoneMul: number,
  unnervingTier: UnnervingTier,
  speedMul: number,
  hfTokens: number,
): TapeDomain {
  const z = zoneDegs(type, zoneMul, unnervingTier);
  const dpm = degPerMs(rotMs(type, speedMul, hfTokens));
  const halfGreatMs = z.greatDeg / 2 / dpm;
  const goodMs = z.goodDeg / dpm;
  return { halfGreatMs, goodMs, min: -130, max: Math.max(220, halfGreatMs + goodMs + 60) };
}

export const TAPE_SHOW_LAST = 24;
export const TAPE_READOUT_LAST = 20;

export function drawTape(
  tctx: CanvasRenderingContext2D,
  w: number,
  errs: readonly TimingErr[],
  d: TapeDomain,
  pal: ResultPalette = DEFAULT_PALETTE,
): void {
  const h = 46;
  tctx.clearRect(0, 0, w, h);
  const X = (ms: number): number => ((ms - d.min) / (d.max - d.min)) * w;
  // Fail field.
  tctx.fillStyle = hexToRgba(pal.miss, 0.1);
  tctx.fillRect(0, 8, w, 24);
  // Good band (after great).
  tctx.fillStyle = 'rgba(207,214,212,.16)';
  tctx.fillRect(X(d.halfGreatMs), 8, X(d.halfGreatMs + d.goodMs) - X(d.halfGreatMs), 24);
  // Great band.
  tctx.fillStyle = hexToRgba(pal.great, 0.3);
  tctx.fillRect(X(-d.halfGreatMs), 8, X(d.halfGreatMs) - X(-d.halfGreatMs), 24);
  // Zero line.
  tctx.strokeStyle = hexToRgba(pal.great, 0.9);
  tctx.lineWidth = 1;
  tctx.beginPath();
  tctx.moveTo(X(0), 4);
  tctx.lineTo(X(0), 36);
  tctx.stroke();
  // Axis labels.
  tctx.fillStyle = '#5c656d';
  tctx.font = '9px ui-sans-serif,system-ui';
  tctx.textAlign = 'left';
  tctx.fillText('early', 2, 44);
  tctx.textAlign = 'right';
  tctx.fillText('late', w - 2, 44);
  tctx.textAlign = 'center';
  tctx.fillText('0', X(0), 44);
  // Ticks — results are encoded by SHAPE as well as color (a11y: never rely on
  // hue alone): greats are full-height, goods shorter, misses short + a square foot.
  for (const e of errs.slice(-TAPE_SHOW_LAST)) {
    const x = Math.max(2, Math.min(w - 2, X(e.ms)));
    tctx.lineWidth = 2;
    if (e.res === 'great') {
      tctx.strokeStyle = pal.great;
      tctx.beginPath();
      tctx.moveTo(x, 8);
      tctx.lineTo(x, 32);
      tctx.stroke();
    } else if (e.res === 'good') {
      tctx.strokeStyle = pal.good;
      tctx.beginPath();
      tctx.moveTo(x, 12);
      tctx.lineTo(x, 28);
      tctx.stroke();
    } else {
      tctx.strokeStyle = pal.miss;
      tctx.beginPath();
      tctx.moveTo(x, 12);
      tctx.lineTo(x, 28);
      tctx.stroke();
      tctx.fillStyle = pal.miss;
      tctx.fillRect(x - 2, 29.5, 4, 3.5);
    }
  }
}

/** "last 12ms early · avg −8ms ±21" readout for the tape header. */
export function tapeReadout(errs: readonly TimingErr[]): string {
  if (errs.length === 0) return 'no presses yet';
  const last20 = errs.slice(-TAPE_READOUT_LAST).map((e) => e.ms);
  const { mean, sd } = meanSd(last20);
  const lastE = errs[errs.length - 1]!.ms;
  const lastTxt = lastE < 0 ? `${Math.abs(lastE).toFixed(0)}ms early` : `+${lastE.toFixed(0)}ms`;
  const m = mean ?? 0;
  return `last ${lastTxt}  ·  avg ${m < 0 ? '−' : '+'}${Math.abs(m).toFixed(0)}ms ±${(sd ?? 0).toFixed(0)}`;
}
