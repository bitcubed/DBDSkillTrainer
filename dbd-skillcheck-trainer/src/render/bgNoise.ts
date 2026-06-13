// Animated background noise (APPROXIMATED/original — invented for training):
// optional visual clutter to practice reading checks against a moving field —
// drifting dust motes, a few brighter "embers", and slow large blobs sweeping
// across. Drawn on a separate canvas BEHIND the dial so it never alters check
// geometry.

interface Mote {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  a: number;
  ember: boolean;
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

  constructor(private readonly canvas: HTMLCanvasElement) {}

  init(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.parts = [];
    this.blobs = [];
    const n = Math.round((w * h) / 9000); // density scales with area
    for (let i = 0; i < n; i++) {
      this.parts.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.6 + Math.random() * 1.8,
        vx: (Math.random() - 0.5) * 14,
        vy: (Math.random() - 0.5) * 14,
        a: 0.06 + Math.random() * 0.22,
        ember: Math.random() < 0.12, // a few warm bright ones
      });
    }
    for (let i = 0; i < 3; i++) {
      this.blobs.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 70 + Math.random() * 120,
        vx: (Math.random() - 0.5) * 22,
        vy: (Math.random() - 0.5) * 16,
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
    const step = this.freeze ? 0 : dt;
    // Slow sweeping blobs (soft radial gradients).
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
    // Drifting motes.
    for (const p of this.parts) {
      p.x += p.vx * step;
      p.y += p.vy * step;
      if (p.x < 0) p.x += w;
      if (p.x > w) p.x -= w;
      if (p.y < 0) p.y += h;
      if (p.y > h) p.y -= h;
      if (p.ember) {
        ctx.fillStyle = `rgba(216,120,70,${p.a})`;
        ctx.shadowColor = 'rgba(216,120,70,0.5)';
        ctx.shadowBlur = 4;
      } else {
        ctx.fillStyle = `rgba(200,210,210,${p.a})`;
        ctx.shadowBlur = 0;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }
}
