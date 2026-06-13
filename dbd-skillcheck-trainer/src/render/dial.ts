// The skill-check dial: dark backdrop, white guide ring, success zones, red
// needle + hub. All visuals are ORIGINAL canvas drawing styled to evoke the
// game's look (white ring, solid white great band at the leading edge,
// white-bracketed good band, red needle) — no game assets.
//
// Visual additions beyond the prototype (cosmetic only — geometry untouched):
//  - a darkened backdrop disc behind the dial while a check is active
//  - crisp radial edge ticks bracketing the good zone
//  - a short fading trail behind the needle
//  - a brief result pulse where the check resolved

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
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/** Thin radial tick at a travel angle, bracketing a zone edge (DBD-style). */
function edgeTick(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  thetaDeg: number,
  dir: 1 | -1,
  rIn: number,
  rOut: number,
): void {
  const [x1, y1] = posXY(cx, cy, dir * thetaDeg, rIn);
  const [x2, y2] = posXY(cx, cy, dir * thetaDeg, rOut);
  ctx.strokeStyle = 'rgba(240,244,242,0.95)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
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
  const R = dialRadius(w, h);

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
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(state.pulse.cx, state.pulse.cy, R * (1 + 0.22 * t), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.save();
  ctx.globalAlpha = state.running ? 1 : 0.32;

  // Darkened backdrop disc while a check is up — the game dims behind the dial.
  if (on) {
    const dark = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, R * 1.45);
    dark.addColorStop(0, 'rgba(2,3,4,0.42)');
    dark.addColorStop(0.8, 'rgba(2,3,4,0.28)');
    dark.addColorStop(1, 'rgba(2,3,4,0)');
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.45, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dial face: faint inner disc + the white ring.
  const grad = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.06);
  grad.addColorStop(0, 'rgba(180,190,188,0.05)');
  grad.addColorStop(1, 'rgba(180,190,188,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.06, 0, Math.PI * 2);
  ctx.fill();

  // Outer thin guide ring (the track the pointer rides).
  ctx.strokeStyle = 'rgba(238,242,240,0.85)';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = 'rgba(240,244,242,.30)';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  if (on) {
    const gs = c.zoneStartDeg;
    const ge = gs + c.greatDeg;
    const de = ge + c.goodDeg;
    const rIn = R - 9;
    const rOut = R + 9;

    // Good zone: light translucent fill + white outline, bracketed by edge ticks.
    if (c.goodDeg > 0) {
      arcBand(ctx, cx, cy, ge, de, rIn, rOut, c.dir, 'rgba(240,244,242,0.16)', null);
      arcBand(ctx, cx, cy, ge, de, rIn, rOut, c.dir, null, 'rgba(240,244,242,0.95)');
      edgeTick(ctx, cx, cy, de, c.dir, rIn - 2, rOut + 2);
    }
    // Great zone: solid bright white band at the leading edge with a soft glow.
    ctx.shadowColor = 'rgba(255,255,255,.55)';
    ctx.shadowBlur = 8;
    arcBand(ctx, cx, cy, gs, ge, rIn, rOut, c.dir, '#fbfdfc', null);
    ctx.shadowBlur = 0;
    edgeTick(ctx, cx, cy, gs, c.dir, rIn - 2, rOut + 2);

    // Pointer: red needle from hub to just past the ring, with a short fading trail.
    const travel = (now - c.t0) * c.degPerMs;
    const th = c.dir * travel;
    for (let i = state.reducedMotion ? 0 : 3; i >= 1; i--) {
      const ghost = th - c.dir * 3.2 * i;
      const [gx1, gy1] = posXY(cx, cy, ghost, 8);
      const [gx2, gy2] = posXY(cx, cy, ghost, R + 14);
      ctx.strokeStyle = `rgba(232,38,28,${0.16 / i})`;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(gx1, gy1);
      ctx.lineTo(gx2, gy2);
      ctx.stroke();
    }
    const [x1, y1] = posXY(cx, cy, th, 8);
    const [x2, y2] = posXY(cx, cy, th, R + 14);
    ctx.shadowColor = 'rgba(224,36,27,.65)';
    ctx.shadowBlur = 7;
    ctx.strokeStyle = '#e8261c';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Red hub.
    ctx.fillStyle = '#e8261c';
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,180,176,0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy, 1.8, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(232,236,234,.45)';
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
