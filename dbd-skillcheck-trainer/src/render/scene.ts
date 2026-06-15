// render/scene.ts — Hard Mode's stylized 2.5D panorama. A virtual 360° scene
// (color-graded sky/ground + moon + ground fog + parallax silhouette layers)
// seen through a ~90° FOV slice driven by the view yaw, vertically offset by the
// view pitch (look up/down), with a generic original killer silhouette that
// approaches, a center reticle, and an optional peripheral danger cue. All
// ORIGINAL shapes/colors — no sprites/screenshots/fonts. The cold moonlit-fog
// color grade is decorative atmosphere only: result meaning (killer danger color,
// catch arc) still rides the palette, and the killer reads by SHAPE + outline, so
// the colorblind-safe contract is unaffected. Procedural feature placement is
// generated once on init; per-frame drawing is allocation-light.

import { angleDelta, yawToScreenX } from '../engine/hardMode';
import { hexToRgba, type ResultPalette } from './palette';

interface Feature {
  yaw: number;
  w: number;
  h: number;
  kind: number; // shape variant
}

export interface SceneView {
  yaw: number;
  pitch: number; // view pitch in degrees (0 = level, + = up); shifts the scene vertically
  fovDeg: number;
  killerActive: boolean;
  killerYaw: number;
  killerProgress: number; // 0..1
  killerDwellFrac: number; // 0..1 "catching…"
  dangerCue: boolean;
  dangerIntensity: number; // 0..1
  palette: ResultPalette;
  reducedMotion: boolean;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export class Scene {
  private far: Feature[] = [];
  private mid: Feature[] = [];
  private near: Feature[] = [];
  private moonYaw = 200; // world yaw the moon sits at (set on init)

  /** Generate procedural feature placement once (dimension-independent). */
  init(): void {
    this.far = [];
    this.mid = [];
    this.near = [];
    this.moonYaw = Math.random() * 360;
    // Far treeline/hills: dense, low, dark.
    for (let i = 0; i < 72; i++) {
      this.far.push({
        yaw: (i / 72) * 360 + (Math.random() - 0.5) * 4,
        w: 16 + Math.random() * 30,
        h: 12 + Math.random() * 36,
        kind: Math.random() < 0.5 ? 0 : 1,
      });
    }
    // Mid rocks/structures: fewer, taller.
    for (let i = 0; i < 22; i++) {
      this.mid.push({ yaw: Math.random() * 360, w: 26 + Math.random() * 64, h: 32 + Math.random() * 78, kind: i % 2 });
    }
    // Near foreground: a few big dark shapes for depth at the edges.
    for (let i = 0; i < 9; i++) {
      this.near.push({ yaw: Math.random() * 360, w: 90 + Math.random() * 150, h: 90 + Math.random() * 170, kind: 0 });
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, v: SceneView): void {
    // Looking up/down slides the whole world vertically (FPS pitch). + pitch =
    // looking up = more sky = content moves DOWN, so the horizon drops on screen.
    const vShift = v.pitch * (h * 0.011);
    const horizon = Math.round(h * 0.6 + vShift);

    // Sky — bright overcast slate-blue up top easing to a warm hazy band at the
    // horizon (DBD autumn-dusk daylight). Drawn full-canvas; ground paints over below.
    const skyEnd = Math.max(1, horizon);
    const sky = ctx.createLinearGradient(0, 0, 0, skyEnd);
    sky.addColorStop(0, '#56657a'); // muted slate blue overcast
    sky.addColorStop(0.55, '#74797f');
    sky.addColorStop(1, '#a39079'); // warm sunlit haze at the horizon
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Diffuse overcast light (sun behind cloud) high in the sky.
    this.drawMoon(ctx, w, h, horizon, v);

    // Ground — warm sunlit dirt/leaf-litter at the horizon, sinking to deep umber
    // underfoot (still warm, never black).
    if (horizon < h) {
      const gr = ctx.createLinearGradient(0, horizon, 0, h);
      gr.addColorStop(0, '#8a6f44'); // lit amber earth/grass catching the haze
      gr.addColorStop(0.45, '#5c4830');
      gr.addColorStop(1, '#322417'); // warm umber underfoot
      ctx.fillStyle = gr;
      ctx.fillRect(0, horizon, w, h - horizon);
    }

    // Horizon haze line + a low fog band hugging the ground (the DBD fog read).
    ctx.strokeStyle = 'rgba(220,210,188,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, horizon + 0.5);
    ctx.lineTo(w, horizon + 0.5);
    ctx.stroke();
    this.drawFog(ctx, w, h, horizon);

    // Parallax silhouette layers (far → near): nearer layers use a larger angle
    // multiplier, so they sweep across the FOV faster for a sense of depth. Distant
    // treeline/structures haze into the bright sky; mid reads as olive foliage; the
    // near layer is a warm-dark foreground frame.
    this.drawLayer(ctx, w, horizon, v, this.far, 1.0, 'rgba(108,118,130,0.78)', -3, 0.7);
    this.drawLayer(ctx, w, horizon, v, this.mid, 1.12, '#3c4636', -8, 1.0);
    this.drawLayer(ctx, w, horizon, v, this.near, 1.34, '#221a11', 12, 1.4);

    // Warm ground glow rising from the foreground (autumn leaf-litter / the killer's
    // bloodied path) — ambient atmosphere, distinct from the directional danger cue.
    this.drawGroundGlow(ctx, w, h);

    // Atmospheric vignette gently frames the edges before the figure/HUD.
    this.drawVignette(ctx, w, h);

    if (v.killerActive) this.drawKiller(ctx, w, h, horizon, v);
    this.drawReticle(ctx, w, h);
    if (v.killerActive && v.dangerCue) this.drawDangerCue(ctx, w, h, v);
  }

  /** Diffuse overcast light bloom (sun behind cloud) at a fixed world yaw; rides yaw + pitch. */
  private drawMoon(ctx: CanvasRenderingContext2D, w: number, h: number, horizon: number, v: SceneView): void {
    const x = yawToScreenX(this.moonYaw, v.yaw, v.fovDeg, w);
    if (x === null) return;
    const y = horizon - h * 0.42; // sits well above the horizon, moving with it
    const r = Math.max(10, h * 0.06);
    const halo = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 5);
    halo.addColorStop(0, 'rgba(245,238,214,0.3)'); // warm diffuse daylight
    halo.addColorStop(1, 'rgba(245,238,214,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, r * 5, 0, Math.PI * 2);
    ctx.fill();
    const disc = ctx.createRadialGradient(x, y, 0, x, y, r);
    disc.addColorStop(0, 'rgba(248,243,224,0.7)'); // soft, no hard edge (overcast)
    disc.addColorStop(1, 'rgba(248,243,224,0)');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Soft luminous fog band hugging the horizon line. */
  private drawFog(ctx: CanvasRenderingContext2D, w: number, h: number, horizon: number): void {
    const top = horizon - h * 0.1;
    const bot = horizon + h * 0.16;
    if (bot <= 0 || top >= h) return;
    const fog = ctx.createLinearGradient(0, top, 0, bot);
    fog.addColorStop(0, 'rgba(208,200,180,0)');
    fog.addColorStop(0.45, 'rgba(210,202,182,0.24)'); // warm bright haze
    fog.addColorStop(1, 'rgba(208,200,180,0)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, top, w, bot - top);
  }

  /** Warm ambient glow rising from the foreground (leaf-litter / bloodied ground). */
  private drawGroundGlow(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const glow = ctx.createRadialGradient(w / 2, h * 1.02, h * 0.06, w / 2, h * 1.02, h * 0.95);
    glow.addColorStop(0, 'rgba(168,74,40,0.34)'); // warm ember orange-red
    glow.addColorStop(0.6, 'rgba(150,72,42,0.12)');
    glow.addColorStop(1, 'rgba(150,72,42,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  }

  /** Soft edge vignette — light, warm, just frames the scene. */
  private drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const vg = ctx.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.3, w / 2, h * 0.55, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(20,12,4,0)');
    vg.addColorStop(1, 'rgba(20,12,4,0.34)'); // warm-dark, lighter than before
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  private drawLayer(
    ctx: CanvasRenderingContext2D,
    w: number,
    horizon: number,
    v: SceneView,
    feats: Feature[],
    parallax: number,
    color: string,
    baseOffset: number,
    sizeMul: number,
  ): void {
    const half = v.fovDeg / 2;
    ctx.fillStyle = color;
    for (const f of feats) {
      const rel = angleDelta(f.yaw, v.yaw) * parallax;
      if (Math.abs(rel) > half + 6) continue;
      const x = (rel / v.fovDeg + 0.5) * w;
      const fw = f.w * sizeMul;
      const fh = f.h * sizeMul;
      const baseY = horizon + baseOffset;
      ctx.beginPath();
      if (f.kind === 0) {
        // Pointed silhouette (tree / spire).
        ctx.moveTo(x - fw / 2, baseY);
        ctx.lineTo(x, baseY - fh);
        ctx.lineTo(x + fw / 2, baseY);
      } else {
        // Rounded lump (hill / rock): a flat-topped blob.
        ctx.moveTo(x - fw / 2, baseY);
        ctx.lineTo(x - fw / 2, baseY - fh * 0.6);
        ctx.quadraticCurveTo(x - fw / 4, baseY - fh, x, baseY - fh);
        ctx.quadraticCurveTo(x + fw / 4, baseY - fh, x + fw / 2, baseY - fh * 0.6);
        ctx.lineTo(x + fw / 2, baseY);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawKiller(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    horizon: number,
    v: SceneView,
  ): void {
    const x = yawToScreenX(v.killerYaw, v.yaw, v.fovDeg, w);
    if (x === null) return; // off-screen — only the edge cue shows
    // Reduced motion: render at a FIXED size (no approach animation at all). The
    // catch timing lives in the engine and is unaffected — it stays catchable.
    const p = v.reducedMotion ? 0.6 : v.killerProgress;
    const figH = lerp(h * 0.1, h * 0.46, p);
    const feetY = horizon + lerp(2, h * 0.05, p);
    const danger = v.palette.miss;

    // Warm hazy backlight halo — separates the figure from the color-graded scene
    // (atmosphere only; the shape + bright outline remain the real cues).
    const midY = feetY - figH * 0.55;
    const back = ctx.createRadialGradient(x, midY, figH * 0.1, x, midY, figH * 0.78);
    back.addColorStop(0, 'rgba(232,212,180,0.2)');
    back.addColorStop(1, 'rgba(232,212,180,0)');
    ctx.fillStyle = back;
    ctx.beginPath();
    ctx.arc(x, midY, figH * 0.75, 0, Math.PI * 2);
    ctx.fill();

    // Soft ground shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, feetY, figH * 0.22, figH * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();

    // Abstract humanoid silhouette — distinguishable by SHAPE + bright outline,
    // not hue alone (works in the colorblind-safe palette).
    const headR = figH * 0.13;
    const shoulderW = figH * 0.34;
    const hipW = figH * 0.2;
    const headY = feetY - figH;
    const shoulderY = headY + headR * 2.1;
    const hipY = feetY - figH * 0.42;

    ctx.save();
    ctx.shadowColor = hexToRgba(danger, 0.55);
    ctx.shadowBlur = 12;
    ctx.fillStyle = hexToRgba(danger, 0.92);
    // Torso (shoulders → hips), tapered.
    ctx.beginPath();
    ctx.moveTo(x - shoulderW / 2, shoulderY);
    ctx.lineTo(x + shoulderW / 2, shoulderY);
    ctx.lineTo(x + hipW / 2, hipY);
    ctx.lineTo(x - hipW / 2, hipY);
    ctx.closePath();
    ctx.fill();
    // Legs.
    ctx.beginPath();
    ctx.moveTo(x - hipW / 2, hipY);
    ctx.lineTo(x - hipW * 0.55, feetY);
    ctx.lineTo(x - hipW * 0.1, feetY);
    ctx.lineTo(x - figH * 0.02, hipY);
    ctx.closePath();
    ctx.moveTo(x + hipW / 2, hipY);
    ctx.lineTo(x + hipW * 0.55, feetY);
    ctx.lineTo(x + hipW * 0.1, feetY);
    ctx.lineTo(x + figH * 0.02, hipY);
    ctx.closePath();
    ctx.fill();
    // Head.
    ctx.beginPath();
    ctx.arc(x, headY + headR, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Bright outline so the figure reads against the dark scene without hue.
    ctx.strokeStyle = 'rgba(255,235,232,0.85)';
    ctx.lineWidth = Math.max(1, figH * 0.012);
    ctx.beginPath();
    ctx.arc(x, headY + headR, headR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // "Catching…" arc filling as the dwell completes.
    if (v.killerDwellFrac > 0) {
      ctx.strokeStyle = hexToRgba(v.palette.great, 0.95);
      ctx.lineWidth = Math.max(2, figH * 0.03);
      ctx.beginPath();
      ctx.arc(x, feetY - figH * 0.5, figH * 0.62, -Math.PI / 2, -Math.PI / 2 + v.killerDwellFrac * Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawReticle(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const cx = w / 2;
    const cy = h / 2;
    const g = 6;
    const len = 9;
    ctx.strokeStyle = 'rgba(232,236,234,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - g - len, cy);
    ctx.lineTo(cx - g, cy);
    ctx.moveTo(cx + g, cy);
    ctx.lineTo(cx + g + len, cy);
    ctx.moveTo(cx, cy - g - len);
    ctx.lineTo(cx, cy - g);
    ctx.moveTo(cx, cy + g);
    ctx.lineTo(cx, cy + g + len);
    ctx.stroke();
    ctx.fillStyle = 'rgba(232,236,234,0.6)';
    ctx.beginPath();
    ctx.arc(cx, cy, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawDangerCue(ctx: CanvasRenderingContext2D, w: number, h: number, v: SceneView): void {
    const side = Math.sign(angleDelta(v.killerYaw, v.yaw)); // -1 left, +1 right
    if (side === 0) return;
    // Reduced motion: hold the tint constant instead of ramping it with approach.
    const ramp = v.reducedMotion ? 0.6 : 0.3 + 0.7 * v.killerProgress;
    const strength = Math.max(0, Math.min(1, v.dangerIntensity)) * ramp;
    if (strength <= 0) return;
    const band = w * 0.28;
    const danger = v.palette.miss;
    const g =
      side > 0
        ? ctx.createLinearGradient(w, 0, w - band, 0)
        : ctx.createLinearGradient(0, 0, band, 0);
    g.addColorStop(0, hexToRgba(danger, 0.32 * strength));
    g.addColorStop(1, hexToRgba(danger, 0));
    ctx.fillStyle = g;
    if (side > 0) ctx.fillRect(w - band, 0, band, h);
    else ctx.fillRect(0, 0, band, h);
  }
}
