// The skill-check dial — original canvas drawing styled to the game's geometry
// (no assets): a faint hollow track, a solid white "Great" block, a transparent
// white-bordered "Good" zone directly after it, a bright red needle with a
// rectangular tip notch, and a minimalist white "Space" prompt in the center.
//
// Cosmetic only — geometry/timing live in the engine. `dialScale` (the dial-size
// slider) multiplies every drawn dimension; it never affects timing or zones.

import { dialRadius, posXY } from '../engine/geometry';
import type { Result, SkillCheck } from '../engine/types';
import { DEFAULT_PALETTE, hexToRgba, type ResultPalette } from './palette';

export interface ResolvePulse {
  at: number; // time the check resolved
  result: Result;
  cx: number;
  cy: number;
}

export const PULSE_MS = 280;

function arcBand(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  thA: number,
  thB: number,
  rIn: number,
  rOut: number,
  dir: 1 | -1,
  fill: string | null,
  stroke: string | null,
  lw = 2,
): void {
  // travel degrees -> screen theta (CW positive); dir=-1 mirrors
  const a = ((dir * thA - 90) * Math.PI) / 180;
  const b = ((dir * thB - 90) * Math.PI) / 180;
  ctx.beginPath();
  ctx.arc(cx, cy, rOut, a, b, dir < 0);
  ctx.arc(cx, cy, rIn, b, a, dir > 0);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

/** Thin radial tick at a travel angle, bracketing a zone edge. */
function edgeTick(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  thetaDeg: number,
  dir: 1 | -1,
  rIn: number,
  rOut: number,
  lw: number,
): void {
  const [x1, y1] = posXY(cx, cy, dir * thetaDeg, rIn);
  const [x2, y2] = posXY(cx, cy, dir * thetaDeg, rOut);
  ctx.strokeStyle = 'rgba(240,244,242,0.95)';
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Minimalist white "Space" bar / console-button prompt in the dial center. */
function centerPrompt(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  const w = 28 * s;
  const h = 11 * s;
  roundRectPath(ctx, cx - w / 2, cy - h / 2, w, h, 3 * s);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5 * s;
  ctx.stroke();
}

export interface DialState {
  running: boolean;
  active: boolean;
  check: SkillCheck | null;
  pulse: ResolvePulse | null;
  /** Suppress the needle trail + result pulse (prefers-reduced-motion). */
  reducedMotion?: boolean;
  palette?: ResultPalette;
  /** Cosmetic dial-size multiplier (the dial-size slider). Default 1. */
  dialScale?: number;
}

export function drawDial(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  now: number,
  state: DialState,
): void {
  ctx.clearRect(0, 0, w, h);
  const c = state.check;
  const on = state.active && c !== null;
  const cx = on ? c.cx : w / 2;
  const cy = on ? c.cy : h / 2;
  const scale = state.dialScale ?? 1;
  const R = dialRadius(w, h, scale);
  const pal = state.palette ?? DEFAULT_PALETTE;

  // Result pulse where the last check resolved (fades over PULSE_MS).
  if (state.pulse && !state.reducedMotion) {
    const t = (now - state.pulse.at) / PULSE_MS;
    if (t >= 0 && t < 1) {
      const a = (1 - t) * 0.45;
      const col =
        state.pulse.result === 'great'
          ? hexToRgba(pal.great, a)
          : state.pulse.result === 'good'
            ? `rgba(240,244,242,${a * 0.7})`
            : hexToRgba(pal.miss, a);
      ctx.strokeStyle = col;
      ctx.lineWidth = 3 * scale;
      ctx.beginPath();
      ctx.arc(state.pulse.cx, state.pulse.cy, R * (1 + 0.22 * t), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.save();
  ctx.globalAlpha = state.running ? 1 : 0.32;

  // Track: a thin, faint hollow ring (the path the needle rides).
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();

  // Center prompt (the "Space" key graphic).
  centerPrompt(ctx, cx, cy, scale);

  if (on) {
    const gs = c.zoneStartDeg;
    const ge = gs + c.greatDeg;
    const de = ge + c.goodDeg;
    const half = 7.5 * scale; // ~15px band thickness
    const rIn = R - half;
    const rOut = R + half;
    const tickLw = 1.5 * scale;

    // Good zone: transparent fill with solid white borders, directly after Great.
    if (c.goodDeg > 0) {
      arcBand(ctx, cx, cy, ge, de, rIn, rOut, c.dir, 'rgba(255,255,255,0.05)', null);
      arcBand(ctx, cx, cy, ge, de, rIn, rOut, c.dir, null, 'rgba(255,255,255,0.92)', 2 * scale);
      edgeTick(ctx, cx, cy, de, c.dir, rIn - 2 * scale, rOut + 2 * scale, tickLw);
    }
    // Great zone: a small, solid, opaque white block with a soft glow.
    ctx.shadowColor = 'rgba(255,255,255,.55)';
    ctx.shadowBlur = 8;
    arcBand(ctx, cx, cy, gs, ge, rIn, rOut, c.dir, '#ffffff', null);
    ctx.shadowBlur = 0;
    edgeTick(ctx, cx, cy, gs, c.dir, rIn - 2 * scale, rOut + 2 * scale, tickLw);

    // Needle: a bright red line from just outside the center prompt to past the
    // ring, with a short fading trail and a chunky rectangular tip notch.
    const travel = (now - c.t0) * c.degPerMs;
    const th = c.dir * travel;
    const baseR = 15 * scale;
    const tipR = R + 8 * scale;

    ctx.lineCap = 'round';
    for (let i = state.reducedMotion ? 0 : 3; i >= 1; i--) {
      const ghost = th - c.dir * 3.4 * i;
      const [gx1, gy1] = posXY(cx, cy, ghost, baseR);
      const [gx2, gy2] = posXY(cx, cy, ghost, tipR);
      ctx.strokeStyle = `rgba(232,38,28,${0.14 / i})`;
      ctx.lineWidth = 3 * scale;
      ctx.beginPath();
      ctx.moveTo(gx1, gy1);
      ctx.lineTo(gx2, gy2);
      ctx.stroke();
    }
    const [x1, y1] = posXY(cx, cy, th, baseR);
    const [x2, y2] = posXY(cx, cy, th, tipR);
    ctx.shadowColor = 'rgba(224,36,27,.65)';
    ctx.shadowBlur = 7;
    ctx.strokeStyle = '#e8261c';
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    // Tip notch: a short, thick red segment straddling the ring (the "arrow").
    const [n1x, n1y] = posXY(cx, cy, th, R - 3 * scale);
    const [n2x, n2y] = posXY(cx, cy, th, R + 6 * scale);
    ctx.lineCap = 'butt';
    ctx.lineWidth = 7 * scale;
    ctx.beginPath();
    ctx.moveTo(n1x, n1y);
    ctx.lineTo(n2x, n2y);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Red pivot hub.
    ctx.fillStyle = '#e8261c';
    ctx.beginPath();
    ctx.arc(cx, cy, 3.2 * scale, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(232,80,72,.6)';
    ctx.beginPath();
    ctx.arc(cx, cy, 3 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
