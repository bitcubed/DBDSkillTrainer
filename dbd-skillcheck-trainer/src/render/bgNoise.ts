// Animated background noise (APPROXIMATED/original — invented for training):
// optional fast-moving visual clutter to practice reading checks against a busy
// field, evoking the in-game environment behind a skill check — flickering
// drifting dust, streaking warm "sparks"/embers, and slow large blobs sweeping
// across for atmosphere. Drawn on a separate canvas BEHIND the dial so it never
// alters check geometry. The "BG Noise" chip toggles it; prefers-reduced-motion
// freezes it to a static field.

interface Mote {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  a: number;
  ember: boolean;
  phase: number; // flicker phase offset
}

interface Blob {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  a: number;
}

export class BgNoise {
  enabled = false;
  /** prefers-reduced-motion: keep a static field instead of animating. */
  freeze = false;

  private parts: Mote[] = [];
  private blobs: Blob[] = [];
  private w = 0;
  private h = 0;
  private t = 0; // animation clock (seconds), frozen under reduced motion

  constructor(private readonly canvas: HTMLCanvasElement) {}

  init(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.t = 0;
    this.parts = [];
    this.blobs = [];
    // Dense, fast field. Capped so a large canvas can't blow the per-frame cost.
    const n = Math.min(220, Math.round((w * h) / 5000));
    for (let i = 0; i < n; i++) {
      const ember = Math.random() < 0.16; // a few warm bright sparks
      const ang = Math.random() * Math.PI * 2;
      const speed = (ember ? 70 : 45) * (0.5 + Math.random()); // px/s — fast drift
      this.parts.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: ember ? 0.8 + Math.random() * 1.6 : 0.5 + Math.random() * 1.6,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        a: 0.05 + Math.random() * 0.24,
        ember,
        phase: Math.random() * Math.PI * 2,
      });
    }
    for (let i = 0; i < 3; i++) {
      this.blobs.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 70 + Math.random() * 120,
        vx: (Math.random() - 0.5) * 30,
        vy: (Math.random() - 0.5) * 22,
        a: 0.05 + Math.random() * 0.05,
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D, dt: number): void {
    const { w, h } = this;
    ctx.clearRect(0, 0, w, h);
    if (!this.enabled) {
      this.canvas.style.display = 'none';
      return;
    }
    this.canvas.style.display = 'block';
    const step = this.freeze ? 0 : Math.min(dt, 0.05);
    this.t += step;

    // Slow sweeping blobs (soft radial gradients) — atmospheric base layer.
    for (const b of this.blobs) {
      b.x += b.vx * step;
      b.y += b.vy * step;
      if (b.x < -b.r) b.x = w + b.r;
      if (b.x > w + b.r) b.x = -b.r;
      if (b.y < -b.r) b.y = h + b.r;
      if (b.y > h + b.r) b.y = -b.r;
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, `rgba(120,140,150,${b.a})`);
      g.addColorStop(1, 'rgba(120,140,150,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fast, flickering motes + streaking sparks.
    for (const p of this.parts) {
      p.x += p.vx * step;
      p.y += p.vy * step;
      if (p.x < 0) p.x += w;
      if (p.x > w) p.x -= w;
      if (p.y < 0) p.y += h;
      if (p.y > h) p.y -= h;
      // Per-particle shimmer so the field reads as busy "noise", not steady dots.
      const flicker = 0.45 + 0.55 * Math.abs(Math.sin(this.t * 6 + p.phase));
      const a = p.a * flicker;
      if (p.ember) {
        // A short motion streak along velocity — a flying spark.
        ctx.strokeStyle = `rgba(224,134,72,${a})`;
        ctx.lineWidth = p.r;
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(224,134,72,0.6)';
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = `rgba(200,210,210,${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.shadowBlur = 0;
  }
}
