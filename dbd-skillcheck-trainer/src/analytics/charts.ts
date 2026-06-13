// Hand-rolled canvas line charts for the dashboard — dependency-free and
// styled to match the timing tape (dark panels, 9px muted labels).

export interface LineSeries {
  values: readonly (number | null)[];
  color: string;
}

export interface LineChartOpts {
  series: LineSeries[];
  /** Format for the y min/max labels. */
  yFmt?: (v: number) => string;
  /** Draw a dashed reference line at y = 0 (for the bias chart). */
  zeroLine?: boolean;
  /** Pin the y domain to at least this range (e.g. 0..100 for rates). */
  yMinHint?: number;
  yMaxHint?: number;
}

export function drawLineChart(canvas: HTMLCanvasElement, o: LineChartOpts): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 220;
  const h = canvas.clientHeight || 90;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const finite: number[] = [];
  for (const s of o.series) {
    for (const v of s.values) if (v !== null && Number.isFinite(v)) finite.push(v);
  }
  ctx.font = '9px ui-sans-serif,system-ui';
  if (finite.length === 0) {
    ctx.fillStyle = '#5c656d';
    ctx.textAlign = 'center';
    ctx.fillText('no data yet', w / 2, h / 2 + 3);
    return;
  }

  const padL = 6;
  const padR = 6;
  const padT = 10;
  const padB = 14;
  let rawMin = Math.min(...finite);
  let rawMax = Math.max(...finite);
  if (o.yMinHint !== undefined) rawMin = Math.min(rawMin, o.yMinHint);
  if (o.yMaxHint !== undefined) rawMax = Math.max(rawMax, o.yMaxHint);
  if (o.zeroLine) {
    rawMin = Math.min(rawMin, 0);
    rawMax = Math.max(rawMax, 0);
  }
  if (rawMin === rawMax) {
    rawMin -= 1;
    rawMax += 1;
  }
  const pad = (rawMax - rawMin) * 0.08;
  const yMin = rawMin - pad;
  const yMax = rawMax + pad;
  const X = (i: number, n: number): number =>
    n <= 1 ? w / 2 : padL + (i / (n - 1)) * (w - padL - padR);
  const Y = (v: number): number => padT + (1 - (v - yMin) / (yMax - yMin)) * (h - padT - padB);

  // Faint horizontal gridlines.
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let g = 0; g < 3; g++) {
    const y = padT + (g / 2) * (h - padT - padB);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
  }

  if (o.zeroLine) {
    ctx.save();
    ctx.strokeStyle = 'rgba(232,195,74,0.55)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(padL, Y(0));
    ctx.lineTo(w - padR, Y(0));
    ctx.stroke();
    ctx.restore();
  }

  for (const s of o.series) {
    const n = s.values.length;
    // Line (gaps where values are null).
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let pen = false;
    s.values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) {
        pen = false;
        return;
      }
      const x = X(i, n);
      const y = Y(v);
      if (pen) ctx.lineTo(x, y);
      else {
        ctx.moveTo(x, y);
        pen = true;
      }
    });
    ctx.stroke();
    // Dots; the latest point slightly larger.
    let lastIdx = -1;
    s.values.forEach((v, i) => {
      if (v !== null && Number.isFinite(v)) lastIdx = i;
    });
    ctx.fillStyle = s.color;
    s.values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) return;
      ctx.beginPath();
      ctx.arc(X(i, n), Y(v), i === lastIdx ? 2.8 : 1.8, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Labels: y bounds at left, time direction at bottom.
  const fmt = o.yFmt ?? ((v: number) => v.toFixed(0));
  ctx.fillStyle = '#5c656d';
  ctx.textAlign = 'left';
  ctx.fillText(fmt(rawMax), padL, padT - 2);
  ctx.fillText('oldest', padL, h - 3);
  ctx.textAlign = 'right';
  ctx.fillText(fmt(rawMin), w - padR, h - padB - 2);
  ctx.fillText('latest', w - padR, h - 3);
}
