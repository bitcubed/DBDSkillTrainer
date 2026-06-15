// Progression dashboard (spec §8.2): trends ACROSS sessions — great-rate,
// ±SD (variable error), avg bias (constant error), per-segment Program trends,
// personal bests, and a strictly-computed trend readout.

import { drawLineChart } from '../analytics/charts';
import { personalBests, trendReadout } from '../analytics/insights';
import { PROGRAM } from '../engine/program';
import type { SessionRecord } from '../engine/types';

export type DashFilter = 'all' | 'program' | 'freeplay';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export class Dashboard {
  private filter: DashFilter = 'all';
  private segIdx = 0;
  private records: SessionRecord[] = [];

  private readonly empty: HTMLElement;
  private readonly sections: HTMLElement;
  private readonly charts: Record<string, HTMLCanvasElement> = {};
  private readonly latest: Record<string, HTMLElement> = {};
  private readonly pbs: HTMLElement;
  private readonly read: HTMLElement;
  private readonly killerSection: HTMLElement;

  constructor(private readonly container: HTMLElement) {
    container.classList.add('dash');
    container.innerHTML = `
      <div class="dash-h">
        <span class="t">Progression — across sessions</span>
        <select class="dash-filter" aria-label="Session filter">
          <option value="all">All sessions</option>
          <option value="program">Programs only</option>
          <option value="freeplay">Free play only</option>
        </select>
      </div>
      <div class="dash-body">
        <div class="dash-empty">No sessions logged yet — finish a run of 10+ checks or a 5-Min Program and your progress will start tracking here.</div>
        <div class="dash-sections">
          <div class="dash-grid">
            <div class="dcard"><div class="dc-t"><span>Great rate</span><span class="dc-v" data-v="rate"></span></div><canvas data-chart="rate" aria-hidden="true"></canvas></div>
            <div class="dcard"><div class="dc-t"><span>±SD — variable error</span><span class="dc-v" data-v="sd"></span></div><canvas data-chart="sd" aria-hidden="true"></canvas></div>
            <div class="dcard"><div class="dc-t"><span>Avg bias — constant error</span><span class="dc-v" data-v="bias"></span></div><canvas data-chart="bias" aria-hidden="true"></canvas></div>
          </div>
          <div class="dash-killer" data-killer style="display:none">
            <div class="dash-grid">
              <div class="dcard"><div class="dc-t"><span>Killer spotted rate — Hard Mode</span><span class="dc-v" data-v="spot"></span></div><canvas data-chart="spot" aria-hidden="true"></canvas></div>
            </div>
          </div>
          <div class="dash-h2">
            <span class="cap">Program segment trends</span>
            <select class="dash-seg" aria-label="Program segment">${PROGRAM.map((s, i) => `<option value="${i}">${esc(s.name)}</option>`).join('')}</select>
          </div>
          <div class="dash-grid two">
            <div class="dcard"><div class="dc-t"><span>Segment great rate</span><span class="dc-v" data-v="segrate"></span></div><canvas data-chart="segrate" aria-hidden="true"></canvas></div>
            <div class="dcard"><div class="dc-t"><span>Segment ±SD</span><span class="dc-v" data-v="segsd"></span></div><canvas data-chart="segsd" aria-hidden="true"></canvas></div>
          </div>
          <div class="dash-pbs"></div>
          <div class="dash-read"></div>
        </div>
      </div>`;

    this.empty = container.querySelector('.dash-empty')!;
    this.sections = container.querySelector('.dash-sections')!;
    this.pbs = container.querySelector('.dash-pbs')!;
    this.read = container.querySelector('.dash-read')!;
    this.killerSection = container.querySelector('[data-killer]')!;
    for (const cv of container.querySelectorAll<HTMLCanvasElement>('canvas[data-chart]')) {
      this.charts[cv.dataset.chart!] = cv;
    }
    for (const el of container.querySelectorAll<HTMLElement>('.dc-v[data-v]')) {
      this.latest[el.dataset.v!] = el;
    }
    const filterSel = container.querySelector<HTMLSelectElement>('.dash-filter')!;
    filterSel.addEventListener('change', () => {
      this.filter = filterSel.value as DashFilter;
      this.render();
    });
    const segSel = container.querySelector<HTMLSelectElement>('.dash-seg')!;
    segSel.addEventListener('change', () => {
      this.segIdx = Number(segSel.value);
      this.render();
    });
  }

  get visible(): boolean {
    return this.container.classList.contains('show');
  }

  toggle(): boolean {
    this.container.classList.toggle('show');
    if (this.visible) this.render();
    return this.visible;
  }

  setRecords(records: SessionRecord[]): void {
    this.records = records;
    if (this.visible) this.render();
  }

  private render(): void {
    const has = this.records.length > 0;
    this.empty.style.display = has ? 'none' : 'block';
    this.sections.style.display = has ? 'block' : 'none';
    if (!has) return;

    const filtered =
      this.filter === 'all' ? this.records : this.records.filter((r) => r.kind === this.filter);

    // Across-session trends (chronological — records are stored oldest-first).
    const rates = filtered.map((r) => r.overall.greatRate * 100);
    const sds = filtered.map((r) => r.overall.sdMs);
    const biases = filtered.map((r) => r.overall.meanMs);
    drawLineChart(this.charts.rate!, {
      series: [{ values: rates, color: '#e8c34a' }],
      yFmt: (v) => `${v.toFixed(0)}%`,
      yMinHint: 0,
      yMaxHint: 100,
    });
    drawLineChart(this.charts.sd!, {
      series: [{ values: sds, color: '#8fb4c9' }],
      yFmt: (v) => `±${v.toFixed(0)}`,
      yMinHint: 0,
    });
    drawLineChart(this.charts.bias!, {
      series: [{ values: biases, color: '#cfd6d4' }],
      yFmt: (v) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(0)}`,
      zeroLine: true,
    });
    const lastRate = rates[rates.length - 1];
    const lastSd = [...sds].reverse().find((v) => v !== null);
    const lastBias = [...biases].reverse().find((v) => v !== null);
    this.latest.rate!.textContent = lastRate !== undefined ? `${Math.round(lastRate)}%` : '–';
    this.latest.sd!.textContent = lastSd != null ? `±${lastSd.toFixed(0)}ms` : '–';
    this.latest.bias!.textContent =
      lastBias != null ? `${lastBias < 0 ? '−' : '+'}${Math.abs(lastBias).toFixed(0)}ms` : '–';

    // Killer spotted-rate trend (only when Hard Mode runs exist). Violet, not
    // red/green, so it reads in the colorblind-safe palette too.
    const spotRates = filtered.map((r) =>
      r.overall.killerSpottedRate != null ? r.overall.killerSpottedRate * 100 : null,
    );
    const hasKiller = spotRates.some((v) => v !== null);
    this.killerSection.style.display = hasKiller ? 'block' : 'none';
    if (hasKiller) {
      drawLineChart(this.charts.spot!, {
        series: [{ values: spotRates, color: '#c89bf0' }],
        yFmt: (v) => `${v.toFixed(0)}%`,
        yMinHint: 0,
        yMaxHint: 100,
      });
      const lastSpot = [...spotRates].reverse().find((v) => v != null);
      this.latest.spot!.textContent = lastSpot != null ? `${Math.round(lastSpot)}%` : '–';
    }

    // Per-segment Program trends.
    const segName = PROGRAM[this.segIdx]?.name ?? '';
    const progs = this.records.filter((r) => r.kind === 'program' && r.segments);
    const segRates: (number | null)[] = [];
    const segSds: (number | null)[] = [];
    for (const p of progs) {
      const seg = p.segments!.find((s) => s.name === segName);
      segRates.push(seg && seg.hits > 0 ? (seg.greats / seg.hits) * 100 : null);
      segSds.push(seg?.sdMs ?? null);
    }
    drawLineChart(this.charts.segrate!, {
      series: [{ values: segRates, color: '#e8c34a' }],
      yFmt: (v) => `${v.toFixed(0)}%`,
      yMinHint: 0,
      yMaxHint: 100,
    });
    drawLineChart(this.charts.segsd!, {
      series: [{ values: segSds, color: '#8fb4c9' }],
      yFmt: (v) => `±${v.toFixed(0)}`,
      yMinHint: 0,
    });
    const lastSegRate = [...segRates].reverse().find((v) => v !== null);
    const lastSegSd = [...segSds].reverse().find((v) => v !== null);
    this.latest.segrate!.textContent = lastSegRate != null ? `${Math.round(lastSegRate)}%` : '–';
    this.latest.segsd!.textContent = lastSegSd != null ? `±${lastSegSd.toFixed(0)}ms` : '–';

    // Personal bests (computed over ALL records, regardless of filter).
    const pb = personalBests(this.records, Date.now());
    const card = (v: string, k: string): string =>
      `<div class="pb"><div class="v">${v}</div><div class="k">${k}</div></div>`;
    const killerRecs = this.records.filter((r) => r.overall.killerSpottedRate != null);
    const bestSpot = killerRecs.length
      ? Math.max(...killerRecs.map((r) => r.overall.killerSpottedRate!))
      : null;
    this.pbs.innerHTML =
      card(pb.bestGreatRate ? `${Math.round(pb.bestGreatRate.value * 100)}%` : '–', 'Best great rate') +
      card(pb.lowestSd ? `±${pb.lowestSd.value.toFixed(0)}ms` : '–', 'Lowest ±SD') +
      card(pb.longestStreak ? String(pb.longestStreak.value) : '–', 'Longest streak') +
      card(String(pb.programsCompleted), 'Programs done') +
      card(String(pb.sessionCount), 'Sessions logged') +
      card(pb.dayStreakDays > 0 ? `${pb.dayStreakDays}d` : '–', 'Day streak') +
      (bestSpot != null ? card(`${Math.round(bestSpot * 100)}%`, 'Best spotted rate') : '');

    // The readout describes the same records the charts above are showing.
    this.read.textContent = trendReadout(filtered);
  }
}
