// Program HUD: "N/5 · NAME", the segment's trains line (with the current
// rotated task during Varied), a segment progress bar, and the total
// countdown clock.

import { fmtClock, PROGRAM, type ProgramController } from '../engine/program';

export interface HudEls {
  hud: HTMLElement;
  seg: HTMLElement;
  trains: HTMLElement;
  clock: HTMLElement;
  fill: HTMLElement;
}

export class ProgramHud {
  constructor(private readonly els: HudEls) {}

  show(): void {
    this.els.hud.classList.add('show');
  }

  hide(): void {
    this.els.hud.classList.remove('show');
  }

  update(program: ProgramController, now: number): void {
    const seg = program.currentSegment();
    if (!program.active || !seg) return;
    const segEl = program.segElapsedS(now);
    let trains = seg.trains;
    if (seg.kind === 'rotate') {
      trains = `Contextual interference · ${program.currentRot().label}`;
    }
    this.els.seg.textContent = `${program.segIdx + 1}/${PROGRAM.length} · ${seg.name.toUpperCase()}`;
    this.els.trains.textContent = trains;
    this.els.clock.textContent = fmtClock(program.totalRemainS(now));
    this.els.fill.style.width = `${Math.max(0, Math.min(100, (segEl / seg.durS) * 100))}%`;
  }
}
