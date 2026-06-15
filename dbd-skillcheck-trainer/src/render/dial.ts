// The skill-check dial — original canvas drawing styled to the game's geometry
// (no assets): a faint hollow track, a solid white "Great" block, a transparent
// white-bordered "Good" zone directly after it, a bright red needle with a
// red "blood streak" needle (tapered and faded at both ends), and an input cue
// (a "Space" key chip or a mouse glyph with the left button lit) in the center.
//
// Cosmetic only — geometry/timing live in the engine. `dialScale` (the dial-size
// slider) multiplies every drawn dimension; it never affects timing or zones.

import { dialRadius, posXY } from '../engine/geometry';
import type { InputMode, Result, SkillCheck } from '../engine/types';
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

/**
 * The dial-center input prompt, matching the game's keybind cue: a "Space"
 * key chip for keyboard input, or a mouse glyph with the left button lit for
 * click input. ('both' shows the Space chip - space is the primary bind.)
 */
function centerPrompt(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  mode: InputMode,
): void {
  if (mode === 'mouse') {
    mouseGlyph(ctx, cx, cy, s);
    return;
  }
  const w = 40 * s;
  const h = 16 * s;
  roundRectPath(ctx, cx - w / 2, cy - h / 2, w, h, 3.5 * s);
  ctx.fillStyle = 'rgba(8,10,14,0.55)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(236,240,238,0.55)';
  ctx.lineWidth = 1.5 * s;
  ctx.stroke();
  ctx.fillStyle = 'rgba(228,232,230,0.92)';
  ctx.font = `${8.5 * s}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Space', cx, cy + 0.5 * s);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

/** A small mouse outline with the left button highlighted (click-input cue). */
function mouseGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  const w = 14 * s;
  const h = 20 * s;
  const r = 7 * s;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const split = y + h * 0.42; // button/body divider height
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = 'rgba(8,10,14,0.6)';
  ctx.fill();
  // Highlight the left button: clip to the body, fill the top-left quadrant.
  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.fillStyle = 'rgba(236,240,238,0.85)';
  ctx.fillRect(x, y, w / 2, split - y);
  ctx.restore();
  // Outline + divider lines.
  ctx.strokeStyle = 'rgba(236,240,238,0.75)';
  ctx.lineWidth = 1.4 * s;
  roundRectPath(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.lineWidth = 1 * s;
  ctx.beginPath();
  ctx.moveTo(x, split);
  ctx.lineTo(x + w, split); // horizontal divider (buttons vs body)
  ctx.moveTo(cx, y);
  ctx.lineTo(cx, split); // vertical split between L/R buttons
  ctx.stroke();
}

/**
 * The needle as a tapered, double-pointed "blood streak": both ends taper to a
 * point and fade to transparent, fullest and most opaque in the middle, with a
 * soft red smear (shadow). `alpha` scales overall opacity (for motion ghosts).
 */
function bloodStreak(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  thetaDeg: number,
  rIn: number,
  rOut: number,
  hw: number,
  alpha: number,
  blur: number,
): void {
  const a = (thetaDeg * Math.PI) / 180;
  const rx = Math.sin(a);
  const ry = -Math.cos(a);
  const tx = Math.cos(a);
  const ty = Math.sin(a);
  const N = 22;
  const pt = (s: number, side: number): [number, number] => {
    const r = rIn + (rOut - rIn) * s;
    const w = Math.pow(Math.sin(Math.PI * s), 0.6) * hw * side; // 0 at ends, full mid
    return [cx + rx * r + tx * w, cy + ry * r + ty * w];
  };
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const [x, y] = pt(i / N, 1);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  for (let i = N; i >= 0; i--) {
    const [x, y] = pt(i / N, -1);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  const grad = ctx.createLinearGradient(cx + rx * rIn, cy + ry * rIn, cx + rx * rOut, cy + ry * rOut);
  grad.addColorStop(0, 'rgba(176,20,16,0)');
  grad.addColorStop(0.2, `rgba(216,30,24,${0.85 * alpha})`);
  grad.addColorStop(0.5, `rgba(236,42,34,${alpha})`);
  grad.addColorStop(0.8, `rgba(216,30,24,${0.85 * alpha})`);
  grad.addColorStop(1, 'rgba(176,20,16,0)');
  ctx.fillStyle = grad;
  ctx.shadowColor = 'rgba(224,36,27,0.55)';
  ctx.shadowBlur = blur;
  ctx.fill();
  ctx.shadowBlur = 0;
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
  /** Which input cue to show in the dial center. Default 'space'. */
  inputMode?: InputMode;
  /** Skip the canvas clear so the dial overlays an already-drawn scene (Hard Mode). */
  skipClear?: boolean;
}

export function drawDial(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  now: number,
  state: DialState,
): void {
  if (!state.skipClear) ctx.clearRect(0, 0, w, h);
  const c = state.check;
  const on = state.active && c !== null;
  // The dial only exists while a check is happening, then lingers ~100 ms after
  // it resolves (so the result flash reads) before vanishing - mirroring DBD,
  // where the ring is off-screen except during a check.
  const LINGER_MS = 100;
  const lingering = state.pulse !== null && now - state.pulse.at < LINGER_MS;
  // Idle (not running): show a dimmed preview ring + center cue so the dial-size
  // slider's effect is visible before you start. During a run, stay blank between
  // checks (mirrors DBD, where the ring is off-screen except during a check).
  const idlePreview = !state.running && !on && !lingering;
  if (!on && !lingering && !idlePreview) return;

  const scale = state.dialScale ?? 1;
  const R = dialRadius(w, h, scale);
  const pal = state.palette ?? DEFAULT_PALETTE;
  // Center on the live check, or on the just-resolved one during the linger.
  const cx = on ? c.cx : (state.pulse?.cx ?? w / 2);
  const cy = on ? c.cy : (state.pulse?.cy ?? h / 2);

  // Result flash where the check resolved (brief, inside the linger window).
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
      ctx.lineWidth = 2 * scale;
      ctx.beginPath();
      ctx.arc(state.pulse.cx, state.pulse.cy, R * (1 + 0.22 * t), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.save();
  if (idlePreview) ctx.globalAlpha = 0.5; // ghost the idle preview

  // Track: a thin, crisp hollow ring (the path the needle rides).
  ctx.strokeStyle = 'rgba(236,240,238,0.55)';
  ctx.lineWidth = 1.5 * scale;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();

  // Center prompt (the input cue - "Space" key chip or mouse glyph).
  centerPrompt(ctx, cx, cy, scale, state.inputMode ?? 'space');

  if (on) {
    const gs = c.zoneStartDeg;
    const ge = gs + c.greatDeg;
    const de = ge + c.goodDeg;
    const half = 4 * scale; // thin band (~8 px), matched to the in-game dial
    const rIn = R - half;
    const rOut = R + half;
    const tickLw = 1.25 * scale;

    // Good zone: transparent fill with solid white borders, directly after Great.
    if (c.goodDeg > 0) {
      arcBand(ctx, cx, cy, ge, de, rIn, rOut, c.dir, 'rgba(255,255,255,0.05)', null);
      arcBand(ctx, cx, cy, ge, de, rIn, rOut, c.dir, null, 'rgba(255,255,255,0.92)', 1.5 * scale);
      edgeTick(ctx, cx, cy, de, c.dir, rIn - 1.5 * scale, rOut + 1.5 * scale, tickLw);
    }
    // Great zone: a small, solid, opaque white block with a soft glow.
    ctx.shadowColor = 'rgba(255,255,255,.5)';
    ctx.shadowBlur = 6;
    arcBand(ctx, cx, cy, gs, ge, rIn, rOut, c.dir, '#ffffff', null);
    ctx.shadowBlur = 0;
    edgeTick(ctx, cx, cy, gs, c.dir, rIn - 1.5 * scale, rOut + 1.5 * scale, tickLw);

    // Needle: a thin tapered red "blood streak" - pointed and faded at both
    // ends, with a soft red smear and a faint motion trail (unless reduced).
    const travel = (now - c.t0) * c.degPerMs;
    const th = c.dir * travel;
    const nIn = 8 * scale;
    const nOut = R + 16 * scale; // extend the needle clearly past the ring
    const hw = 1.3 * scale;
    // Trail ghosts draw without a shadow — shadowBlur is the costly part of the
    // per-frame needle render, and only the live needle below needs the glow.
    if (!state.reducedMotion) {
      for (let i = 3; i >= 1; i--) {
        bloodStreak(ctx, cx, cy, th - c.dir * 3.2 * i, nIn, nOut, hw * (1 - 0.14 * i), 0.09 / i, 0);
      }
    }
    bloodStreak(ctx, cx, cy, th, nIn, nOut, hw, 0.95, 5 * scale);
  }
  ctx.restore();
}
