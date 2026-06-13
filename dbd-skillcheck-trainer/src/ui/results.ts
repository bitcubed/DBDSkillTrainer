// End-of-Program breakdown: per-segment table (checks, great-rate, split,
// bias ± SD), an overall line, and a coaching note.

import { meanSd } from '../analytics/stats';
import type { RunStats, SegmentResult } from '../engine/types';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderResults(container: HTMLElement, segStats: SegmentResult[], stats: RunStats): void {
  const tot = stats.great + stats.good + stats.miss;
  const overallRate = tot ? Math.round((stats.great / tot) * 100) : 0;
  const { mean: oMean, sd: oSd } = meanSd(stats.errs.map((x) => x.ms));

  const biasTxt =
    oMean == null
      ? '–'
      : oMean < 0
        ? `${Math.abs(oMean).toFixed(0)}ms early`
        : `+${oMean.toFixed(0)}ms late`;

  let rows = '';
  for (const s of segStats) {
    const rate = s.hits ? Math.round((s.greats / s.hits) * 100) : 0;
    const b = s.meanMs == null ? '–' : s.meanMs < 0 ? `−${Math.abs(s.meanMs).toFixed(0)}` : `+${s.meanMs.toFixed(0)}`;
    const sd = s.sdMs == null ? '–' : `±${s.sdMs.toFixed(0)}`;
    rows += `<tr><td>${esc(s.name)}</td><td>${s.hits}</td><td class="rate">${rate}%</td><td>${s.greats}/${s.goods}/${s.misses}</td><td>${b} ${sd}</td></tr>`;
  }

  // Pick the weakest segment by great-rate (ignoring zero-hit) to coach next time.
  let weak: { name: string; r: number } | null = null;
  for (const s of segStats) {
    if (!s.hits) continue;
    const r = s.greats / s.hits;
    if (weak == null || r < weak.r) weak = { name: s.name, r };
  }
  const coach = weak ? `Weakest block: <b>${esc(weak.name)}</b> (${Math.round(weak.r * 100)}% great). ` : '';
  const biasCoach =
    oMean != null && Math.abs(oMean) > 12
      ? `Your overall bias is <b>${biasTxt}</b> — consciously press ${oMean < 0 ? 'a hair later' : 'a touch earlier'} next run to center it.`
      : oMean != null
        ? `Your timing is well-centered (avg ${biasTxt}). Now work on tightening the spread (±${oSd != null ? oSd.toFixed(0) : '–'}ms).`
        : '';

  container.innerHTML =
    `<div class="pr-h"><span class="t">Program complete — 5-minute breakdown</span><span class="o">overall ${overallRate}% great · avg ${biasTxt} ±${oSd != null ? oSd.toFixed(0) : '–'}ms</span></div>` +
    `<table class="pr-table"><thead><tr><th>Segment</th><th>Checks</th><th>Great</th><th>G/Gd/M</th><th>Bias ±SD</th></tr></thead><tbody>${rows}</tbody></table>` +
    `<div class="pr-foot">${coach}${biasCoach} <b>Bias</b> = avg signed timing error (− early / + late); <b>±SD</b> = consistency. Run this 3–4×/week and watch great-rate climb and ±SD shrink across sessions, not within one.</div>`;
  container.classList.add('show');
}
