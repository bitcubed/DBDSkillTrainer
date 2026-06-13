// Tabs, pacing/input selects, perk chips, sliders, buttons, and the
// chip/stat refresh logic — the DOM wiring around the engine.

import { degPerMs } from '../engine/geometry';
import type { Session } from '../engine/session';
import type { InputMode, Mode, SpecialId } from '../engine/types';

export interface ControlEls {
  tabs: HTMLElement[];
  specialRow: HTMLElement;
  specialSel: HTMLSelectElement;
  pacingSel: HTMLSelectElement;
  inputSel: HTMLSelectElement;
  startBtn: HTMLButtonElement;
  progBtn: HTMLButtonElement;
  resetBtn: HTMLButtonElement;
  chips: { hf: HTMLElement; so: HTMLElement; up: HTMLElement; lb: HTMLElement; tb: HTMLElement; ms: HTMLElement; bg: HTMLElement };
  toks: { hf: HTMLElement; so: HTMLElement; up: HTMLElement; lb: HTMLElement; bg: HTMLElement };
  sliders: { speed: HTMLInputElement; zone: HTMLInputElement; warn: HTMLInputElement; vol: HTMLInputElement; dial: HTMLInputElement };
  sliderVals: { speed: HTMLElement; zone: HTMLElement; warn: HTMLElement; vol: HTMLElement; dial: HTMLElement };
  perkTags: HTMLElement;
  stormTag: HTMLElement;
  hint: HTMLElement;
  stats: { great: HTMLElement; good: HTMLElement; miss: HTMLElement; rate: HTMLElement; streak: HTMLElement; window: HTMLElement };
}

export const HINTS: Record<InputMode, string> = {
  both: 'SPACE or LEFT CLICK anywhere to hit',
  mouse: 'LEFT CLICK anywhere to hit',
  space: 'SPACE to hit',
};

const UP_LABELS = ['off', 'I −40%', 'II −50%', 'III −60%'] as const;
const UP_TAGS = ['', 'I', 'II', 'III'] as const;

// Module-level lock state so refreshChips can report aria-disabled correctly
// while the Program drives the controls.
let programLocked = false;

export function isProgramLocked(): boolean {
  return programLocked;
}

export function setTabSelection(tabs: HTMLElement[], mode: Mode): void {
  for (const t of tabs) {
    const on = t.dataset.mode === mode;
    t.classList.toggle('on', on);
    t.setAttribute('aria-checked', String(on)); // mode picker = radio semantics
  }
}

/** Sync chip token text, on/disabled states, stage perk tags, and the great window. */
export function refreshChips(els: ControlEls, s: Session): void {
  const dpm = degPerMs(s.currentRotMs());
  const z = s.currentZoneDegs();
  els.stats.window.textContent = `${(z.greatDeg / dpm).toFixed(0)} ms`;
  els.toks.hf.textContent = s.hyperfocus ? '●'.repeat(s.hfTokens) + '○'.repeat(6 - s.hfTokens) : 'off';
  els.toks.so.textContent = s.stakeOut ? '●'.repeat(s.soTokens) + '○'.repeat(4 - s.soTokens) : 'off';
  els.toks.up.textContent = UP_LABELS[s.unnerving];
  els.toks.lb.textContent = `${s.lullaby}${s.lullaby >= 5 ? ' (silent)' : ''}`;

  const apply = s.perksApply();
  els.chips.hf.classList.toggle('disabled', !apply);
  els.chips.so.classList.toggle('disabled', !apply);
  els.chips.up.classList.toggle('disabled', !apply);
  els.chips.tb.classList.toggle('disabled', !(s.isRepair() && s.pacing === 'realistic'));
  els.chips.lb.classList.toggle('disabled', !apply);
  els.chips.ms.classList.toggle('disabled', !s.isRepair()); // Storm only on repair dials

  // The 'on' state mirrors the SESSION, not click history — so the Program
  // forcing perks off (or anything else mutating the session) can't leave a
  // chip lit, and aria-pressed below always tells the truth.
  els.chips.hf.classList.toggle('on', s.hyperfocus);
  els.chips.so.classList.toggle('on', s.stakeOut);
  els.chips.up.classList.toggle('on', s.unnerving > 0);
  els.chips.lb.classList.toggle('on', s.lullaby > 0);
  els.chips.tb.classList.toggle('on', s.toolbox);
  els.chips.ms.classList.toggle('on', s.stormOn());

  // Stage perk tags.
  const tags: string[] = [];
  if (apply && s.hyperfocus) tags.push(`Hyperfocus ${s.hfTokens}`);
  if (apply && s.stakeOut) tags.push(`Stake Out ${s.soTokens}`);
  if (apply && s.unnerving) tags.push(`Unnerving ${UP_TAGS[s.unnerving]}`);
  if (apply && s.lullaby > 0) tags.push(`Lullaby ${s.lullaby}`);
  els.perkTags.innerHTML = tags.map((x) => `<span class="ptag">${x}</span>`).join('');
  els.stormTag.style.display = s.stormOn() ? 'block' : 'none';

  // Keep toggle semantics visible to assistive tech (the Program lock counts
  // as disabled too — pointer-events alone is invisible to AT).
  for (const chip of Object.values(els.chips)) {
    chip.setAttribute('aria-pressed', String(chip.classList.contains('on')));
    chip.setAttribute('aria-disabled', String(chip.classList.contains('disabled') || programLocked));
  }
}

export function updateStatsPanel(els: ControlEls, s: Session): void {
  const st = s.stats;
  const tot = st.great + st.good + st.miss;
  els.stats.great.textContent = String(st.great);
  els.stats.good.textContent = String(st.good);
  els.stats.miss.textContent = String(st.miss);
  els.stats.rate.textContent = tot ? `${Math.round((st.great / tot) * 100)}%` : '–';
  els.stats.streak.textContent = `${st.streak} / ${st.best}`;
}

/** Reflect Program-driven slider values back into the controls. */
export function reflectSliders(els: ControlEls, speed: number, zone: number, warn: number): void {
  els.sliders.speed.value = String(Math.round(speed * 100));
  els.sliderVals.speed.textContent = `${speed.toFixed(2)}×`;
  els.sliders.zone.value = String(Math.round(zone * 100));
  els.sliderVals.zone.textContent = `${zone.toFixed(2)}×`;
  els.sliders.warn.value = String(warn);
  els.sliderVals.warn.textContent = `${warn} ms`;
}

/** Dim + disable the controls the Program drives, so the user can't desync it. */
export function setProgramLock(els: ControlEls, on: boolean): void {
  programLocked = on;
  els.pacingSel.disabled = on;
  els.specialSel.disabled = on;
  for (const t of els.tabs) {
    t.style.pointerEvents = on ? 'none' : '';
    t.style.opacity = on ? '0.5' : '';
    t.setAttribute('aria-disabled', String(on));
  }
  for (const c of Object.values(els.chips)) {
    c.style.pointerEvents = on ? 'none' : '';
    c.style.opacity = on ? '0.4' : '';
  }
  els.sliders.speed.disabled = on;
  els.sliders.zone.disabled = on;
  els.sliders.warn.disabled = on;
  // Native disabled: blocks pointer AND keyboard activation (the prototype's
  // pointer-events lock left focused buttons Enter-activatable).
  els.startBtn.disabled = on;
  els.startBtn.style.opacity = on ? '0.5' : '';
  els.resetBtn.disabled = on;
  els.resetBtn.style.opacity = on ? '0.5' : '';
}

export function specialIdFromSelect(v: string): SpecialId {
  return v as SpecialId;
}
