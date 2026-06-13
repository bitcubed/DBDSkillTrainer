// Bootstrap: build UI, wire engine ↔ DOM ↔ persistence, start the RAF loop.

import './styles/main.css';
import { loadHistory, type StorageLike } from './analytics/history';
import { RunLogger } from './analytics/runLog';
import { Synth } from './audio/synth';
import { GEN_CHARGES } from './engine/constants';
import { ProgramController } from './engine/program';
import { Session, type ResolveEvent } from './engine/session';
import type { InputMode, Mode, Result, Settings } from './engine/types';
import { BgNoise } from './render/bgNoise';
import { drawDial, PULSE_MS, type ResolvePulse } from './render/dial';
import { CB_PALETTE, DEFAULT_PALETTE, type ResultPalette } from './render/palette';
import { drawTape, tapeDomain, tapeReadout } from './render/tape';
import { loadSettings, saveSettings } from './settings';
import {
  HINTS,
  refreshChips,
  reflectSliders,
  setProgramLock,
  setTabSelection,
  specialIdFromSelect,
  updateStatsPanel,
  type ControlEls,
} from './ui/controls';
import { Dashboard } from './ui/dashboard';
import { FOOT_NOTE_HTML, GUIDE_HTML } from './ui/guide';
import { ProgramHud } from './ui/hud';
import { renderResults } from './ui/results';

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el;
}

// ---------------- storage + settings ----------------
function safeStorage(): StorageLike {
  try {
    const s = window.localStorage;
    s.setItem('__dbdtrainer_probe', '1');
    s.removeItem('__dbdtrainer_probe');
    return s;
  } catch {
    // localStorage unavailable (privacy mode / embedding) → session-only memory
    const m = new Map<string, string>();
    return {
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => void m.set(k, v),
      removeItem: (k) => void m.delete(k),
    };
  }
}
const storage = safeStorage();
const settings: Settings = loadSettings(storage);
function persistSettings(): void {
  saveSettings(settings, storage);
}

// ---------------- DOM ----------------
const stage = $('stage');
const cv = $('cv') as HTMLCanvasElement;
const ctx = cv.getContext('2d')!;
const tapeCv = $('tapeCv') as HTMLCanvasElement;
const tctx = tapeCv.getContext('2d')!;
const bgCv = $('bgnoise') as HTMLCanvasElement;
const bgx = bgCv.getContext('2d')!;

$('guide').innerHTML = GUIDE_HTML;
$('footNote').innerHTML = FOOT_NOTE_HTML;

const els: ControlEls = {
  tabs: Array.from(document.querySelectorAll<HTMLElement>('.tab')),
  specialRow: $('specialRow'),
  specialSel: $('specialSel') as HTMLSelectElement,
  pacingSel: $('pacingSel') as HTMLSelectElement,
  inputSel: $('inputSel') as HTMLSelectElement,
  startBtn: $('startBtn') as HTMLButtonElement,
  progBtn: $('progBtn') as HTMLButtonElement,
  resetBtn: $('resetBtn') as HTMLButtonElement,
  chips: { hf: $('cHF'), so: $('cSO'), up: $('cUP'), lb: $('cLB'), tb: $('cTB'), ms: $('cMS'), bg: $('cBG') },
  toks: { hf: $('hfTok'), so: $('soTok'), up: $('upTok'), lb: $('lbTok'), bg: $('bgTok') },
  sliders: {
    speed: $('rSpeed') as HTMLInputElement,
    zone: $('rZone') as HTMLInputElement,
    warn: $('rWarn') as HTMLInputElement,
    vol: $('rVol') as HTMLInputElement,
    dial: $('rDial') as HTMLInputElement,
  },
  sliderVals: { speed: $('vSpeed'), zone: $('vZone'), warn: $('vWarn'), vol: $('vVol'), dial: $('vDial') },
  perkTags: $('perkTags'),
  stormTag: $('stormTag'),
  hint: $('hint'),
  stats: {
    great: $('sGreat'),
    good: $('sGood'),
    miss: $('sMiss'),
    rate: $('sGreatPct'),
    streak: $('sStreak'),
    window: $('sWindow'),
  },
};

// ---------------- engine + helpers ----------------
let W = 0;
let H = 0;
let DPR = 1;

const synth = new Synth();
const bgNoise = new BgNoise(bgCv);
const reducedMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
let pal: ResultPalette = DEFAULT_PALETTE;

interface UiState {
  input: InputMode;
  flashUntil: number;
  chipAt: number;
  pulse: ResolvePulse | null;
  progStart: { epoch: number; perf: number; settingsSnapshot: Partial<Settings> } | null;
}
const ui: UiState = {
  input: 'both',
  flashUntil: 0,
  chipAt: 0,
  pulse: null,
  progStart: null,
};

const runLog = new RunLogger(storage);

const session = new Session(
  () => ({ w: W, h: H }),
  Math.random,
  {
    onWarn: () => synth.warn(session.lullaby),
    onResolve: (ev, now) => onResolve(ev, now),
    onStormComplete: (checks, now) => {
      flash('GEN COMPLETED', 'var(--gold)', null, `storm cleared — ${checks} checks hit`);
      ui.flashUntil = now + 2200;
      endFreeplayRun(now);
      setStartBtn();
    },
  },
);

const hud = new ProgramHud({ hud: $('progHud'), seg: $('phSeg'), trains: $('phTrains'), clock: $('phClock'), fill: $('phFill') });
const dashboard = new Dashboard($('dashboard'));

const program = new ProgramController(session, {
  setBgNoise: (on) => {
    bgNoise.enabled = on;
    els.chips.bg.classList.toggle('on', on);
    els.toks.bg.textContent = on ? 'on' : 'off';
  },
  onSegment: (seg) => {
    // Sync the mode tabs + sliders visually with what the Program just applied.
    setTabSelection(els.tabs, session.mode);
    els.specialRow.classList.toggle('show', session.mode === 'special');
    reflectSliders(els, seg.speed, seg.zone, seg.warnMs);
    refreshChips(els, session);
    drawProgress();
  },
  onVariedRot: () => {
    setTabSelection(els.tabs, session.mode);
    els.specialRow.classList.toggle('show', session.mode === 'special');
    if (session.mode === 'special') els.specialSel.value = session.special;
    reflectSliders(els, session.speedMul, session.zoneMul, session.warnLeadMs);
  },
  onComplete: (segs, now) => {
    hud.hide();
    flash('PROGRAM COMPLETE', 'var(--ok)', null, 'see your breakdown below');
    ui.flashUntil = now + 2600;
    setProgramLock(els, false);
    setStartBtn();
    setProgBtn();
    renderResults($('progResults'), segs, session.stats);
    refreshChips(els, session);
    drawProgress();
    // Log the Program to history (spec §8.1: every run, with segments).
    if (ui.progStart) {
      const records = runLog.logProgram(
        session.stats,
        segs,
        ui.progStart.epoch,
        (now - ui.progStart.perf) / 1000,
        ui.progStart.settingsSnapshot,
      );
      dashboard.setRecords(records);
      ui.progStart = null;
    }
    restoreUserSettings();
    refreshChips(els, session);
    drawProgress();
    $('progResults').scrollIntoView({ behavior: reducedMotionOn() ? 'auto' : 'smooth', block: 'nearest' });
  },
  onCancel: (now) => {
    hud.hide();
    flash('PROGRAM STOPPED', 'var(--mut)', null, '');
    ui.flashUntil = now + 1400;
    ui.progStart = null; // cancelled programs are not logged
    setProgramLock(els, false);
    setStartBtn();
    setProgBtn();
    restoreUserSettings();
    refreshChips(els, session);
    drawProgress();
  },
});

/**
 * Re-apply the user's persisted settings to the live session/UI after a
 * Program ends or cancels. The Program drives speed/zone/warn/mode/BG noise
 * directly (never persisting them); without this restore the user would be
 * left on the final segment's values until the next reload.
 */
function restoreUserSettings(): void {
  session.speedMul = settings.speedMul;
  session.zoneMul = settings.zoneMul;
  session.warnLeadMs = settings.warnLeadMs;
  reflectSliders(els, settings.speedMul, settings.zoneMul, settings.warnLeadMs);
  session.mode = settings.lastMode;
  session.special = settings.lastSpecial;
  setTabSelection(els.tabs, session.mode);
  els.specialRow.classList.toggle('show', session.mode === 'special');
  els.specialSel.value = settings.lastSpecial;
  els.pacingSel.disabled = !session.isRepair();
  bgNoise.enabled = settings.bgNoise;
  els.chips.bg.classList.toggle('on', settings.bgNoise);
  els.toks.bg.textContent = settings.bgNoise ? 'on' : 'off';
  drawTapeNow();
}

// ---------------- run logging (free play) ----------------
function liveSettingsSnapshot(): Partial<Settings> {
  return {
    inputMode: ui.input,
    pacing: session.pacing,
    volume: synth.volume,
    speedMul: session.speedMul,
    zoneMul: session.zoneMul,
    warnLeadMs: session.warnLeadMs,
    bgNoise: bgNoise.enabled,
    lastMode: session.mode,
    lastSpecial: session.special,
  };
}

function beginFreeplayRun(now: number): void {
  runLog.begin(session.stats, session.errCountTotal, Date.now(), now, liveSettingsSnapshot());
}

/** Close out a free-play run; logs it when it had ≥10 checks (spec §8.1). */
function endFreeplayRun(now: number): void {
  const records = runLog.endFreeplay(session.stats, session.errCountTotal, now);
  if (records) dashboard.setRecords(records);
}

// Best-effort flush: closing/navigating the tab mid-run still logs the run.
window.addEventListener('pagehide', () => endFreeplayRun(performance.now()));

// ---------------- canvas sizing ----------------
function sizeCanvas(): void {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = stage.clientWidth;
  H = Math.max(300, Math.min(Math.round(W * 0.56), 420));
  stage.style.height = `${H}px`;
  cv.width = W * DPR;
  cv.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  bgCv.width = W * DPR;
  bgCv.height = H * DPR;
  bgx.setTransform(DPR, 0, 0, DPR, 0, 0);
  tapeCv.width = tapeCv.clientWidth * DPR;
  tapeCv.height = 46 * DPR;
  tctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  bgNoise.init(W, H);
  drawTapeNow();
}
window.addEventListener('resize', sizeCanvas);

// ---------------- accessibility modes ----------------
function reducedMotionOn(): boolean {
  return settings.reducedMotion || reducedMotionMedia.matches;
}

function applyMotionPrefs(): void {
  const rm = reducedMotionOn();
  bgNoise.freeze = rm;
  document.body.classList.toggle('reduced', settings.reducedMotion);
  $('cRM').classList.toggle('on', settings.reducedMotion);
  $('cRM').setAttribute('aria-pressed', String(settings.reducedMotion));
  $('rmTok').textContent = settings.reducedMotion ? 'on' : reducedMotionMedia.matches ? 'auto' : 'off';
}
reducedMotionMedia.addEventListener?.('change', applyMotionPrefs);

function applyPalette(): void {
  pal = settings.colorblindSafe ? CB_PALETTE : DEFAULT_PALETTE;
  document.body.classList.toggle('cb', settings.colorblindSafe);
  $('cCB').classList.toggle('on', settings.colorblindSafe);
  $('cCB').setAttribute('aria-pressed', String(settings.colorblindSafe));
  $('cbTok').textContent = settings.colorblindSafe ? 'on' : 'off';
}

// ---------------- flash + resolve feedback ----------------
function flash(main: string, color: string, errVal: number | null, sub: string): void {
  const fm = $('flashMain');
  fm.textContent = main;
  fm.style.color = color;
  let s = sub;
  if (errVal != null) {
    s +=
      (s ? '  ·  ' : '') +
      (errVal < 0 ? `${Math.abs(errVal).toFixed(0)} ms early` : `+${errVal.toFixed(0)} ms late`);
  }
  $('flashSub').textContent = s;
  $('flash').classList.add('show');
}

function resultPulse(result: Result, now: number): void {
  const c = session.check;
  if (!c) return;
  ui.pulse = { at: now, result, cx: c.cx, cy: c.cy };
}

function onResolve(ev: ResolveEvent, now: number): void {
  if (ev.result === 'great') {
    flash('GREAT', 'var(--gold)', ev.errMs, ev.bonusPct ? `+${ev.bonusPct.toFixed(1)}%` : '');
    synth.great();
  } else if (ev.result === 'good') {
    flash('GOOD', 'var(--good)', ev.errMs, '');
    synth.good();
  } else {
    const tag = ev.failKind === 'early' ? 'early' : ev.failKind === 'late' ? 'late' : 'no press';
    flash('FAILED', 'var(--fail)', ev.errMs, (ev.failPct ? `−${ev.failPct}%  ·  ` : '') + tag);
    synth.fail();
    stage.classList.remove('shake');
    void (stage as HTMLElement).offsetWidth; // restart the animation
    stage.classList.add('shake');
  }
  resultPulse(ev.result, now);
  ui.flashUntil = now + 650;
  updateStatsPanel(els, session);
  drawTapeNow();
}

// ---------------- progress bar ----------------
function drawProgress(): void {
  const w = $('progwrap');
  const show = session.isRepair();
  w.classList.toggle('show', show);
  if (!show) return;
  const pct = (session.charges / GEN_CHARGES) * 100;
  $('progLabel').textContent = session.stormOn() ? 'Generator — Merciless Storm' : 'Generator';
  $('progVal').textContent = `${pct.toFixed(1)}%`;
  ($('pfill') as HTMLElement).style.width = `${pct}%`;
}

// ---------------- tape ----------------
function drawTapeNow(): void {
  const d = tapeDomain(
    session.activeType(),
    session.zoneMul,
    session.effectiveUnnerving(),
    session.speedMul,
    session.effectiveHfTokens(),
  );
  drawTape(tctx, tapeCv.clientWidth, session.stats.errs, d, pal);
  $('tapeRead').textContent = tapeReadout(session.stats.errs);
}

// ---------------- main loop ----------------
let lastBg = 0;
function frame(now: number): void {
  const bgdt = lastBg ? Math.min(0.05, (now - lastBg) / 1000) : 0;
  lastBg = now;
  bgNoise.draw(bgx, bgdt);

  if (program.active) {
    program.tick(now);
    hud.update(program, now);
  }
  session.tick(now);

  if (ui.flashUntil && now > ui.flashUntil) {
    $('flash').classList.remove('show');
    ui.flashUntil = 0;
  }
  if (ui.pulse && now - ui.pulse.at > PULSE_MS) ui.pulse = null;
  drawProgress();
  if (!ui.chipAt || now >= ui.chipAt) {
    refreshChips(els, session); // throttled: innerHTML writes
    ui.chipAt = now + 250;
  }

  drawDial(ctx, W, H, now, {
    running: session.running,
    active: session.phase === 'active',
    check: session.check,
    pulse: ui.pulse,
    reducedMotion: reducedMotionOn(),
    palette: pal,
    dialScale: session.dialScale,
  });
}
function loop(): void {
  frame(performance.now());
  requestAnimationFrame(loop);
}

// ---------------- input ----------------
function press(now: number): void {
  if (!session.running) return;
  synth.ensure();
  session.press(now);
}
window.addEventListener('keydown', (e) => {
  // Only claim Space while a session is live — while idle, native Space
  // behavior (activating focused buttons, opening selects) stays intact.
  if (e.code === 'Space' && ui.input !== 'mouse' && session.running) {
    e.preventDefault();
    if (!e.repeat) press(performance.now());
  }
});
// Left click (or tap) anywhere counts as a press — matches an M1 skill-check
// bind, so your cursor doesn't have to sit on the stage. Controls are excluded
// so the UI still works mid-session; while not running, the page behaves normally.
document.addEventListener('pointerdown', (e) => {
  if (ui.input === 'space' || e.button !== 0 || !session.running) return;
  if ((e.target as Element).closest('button,select,input,a,.chip,.tab')) return;
  e.preventDefault();
  press(performance.now());
});

// ---------------- session control ----------------
function setStartBtn(): void {
  els.startBtn.textContent = session.running ? 'Stop' : 'Start';
}
function setProgBtn(): void {
  els.progBtn.textContent = program.active ? '■ Stop Program' : '▶ 5-Min Program';
  els.progBtn.classList.toggle('running', program.active);
}
function startStop(): void {
  synth.ensure();
  const now = performance.now();
  if (program.active) {
    program.cancel(now);
    return;
  }
  if (session.running) {
    endFreeplayRun(now);
    session.stop();
    setStartBtn();
    return;
  }
  session.start(now);
  beginFreeplayRun(now);
  setStartBtn();
}
els.startBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  startStop();
});
els.resetBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (program.active) return; // don't wipe stats mid-program
  session.resetStats();
  // Reset mid-run discards the pre-reset stretch (reset = "wipe it") and
  // restarts the run log so diffs can't go negative.
  runLog.discard();
  if (session.running) beginFreeplayRun(performance.now());
  updateStatsPanel(els, session);
  drawTapeNow();
});

// ---------------- program control ----------------
els.progBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const now = performance.now();
  if (program.active) {
    program.cancel(now);
  } else {
    synth.ensure();
    endFreeplayRun(now); // a running free-play session ends (and logs) here
    const results = $('progResults');
    results.classList.remove('show');
    results.innerHTML = '';
    $('flash').classList.remove('show');
    hud.show();
    setProgramLock(els, true);
    ui.progStart = { epoch: Date.now(), perf: now, settingsSnapshot: liveSettingsSnapshot() };
    program.start(now);
    updateStatsPanel(els, session);
    drawTapeNow();
    setStartBtn();
    setProgBtn();
    hud.update(program, now);
  }
});

// ---------------- dashboard ----------------
$('dashBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  const open = dashboard.toggle();
  if (open) {
    $('dashboard').scrollIntoView({ behavior: reducedMotionOn() ? 'auto' : 'smooth', block: 'nearest' });
  }
});

// ---------------- UI wiring ----------------
for (const el of els.tabs) {
  const activate = (): void => {
    if (program.active) return;
    if (session.running) endFreeplayRun(performance.now());
    setTabSelection(els.tabs, (el.dataset.mode ?? 'gen') as Mode);
    session.mode = (el.dataset.mode ?? 'gen') as Mode;
    session.stop();
    session.check = null;
    session.charges = 0;
    setStartBtn();
    els.specialRow.classList.toggle('show', session.mode === 'special');
    els.pacingSel.disabled = !session.isRepair();
    settings.lastMode = session.mode;
    persistSettings();
    drawTapeNow();
    refreshChips(els, session);
    drawProgress();
  };
  el.addEventListener('click', activate);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') activate(); // e.key also matches NumpadEnter
  });
}
els.specialSel.addEventListener('change', (e) => {
  session.special = specialIdFromSelect((e.target as HTMLSelectElement).value);
  settings.lastSpecial = session.special;
  persistSettings();
  drawTapeNow();
  refreshChips(els, session);
});
els.pacingSel.addEventListener('change', (e) => {
  session.pacing = (e.target as HTMLSelectElement).value as 'drill' | 'realistic';
  settings.pacing = session.pacing;
  persistSettings();
  refreshChips(els, session);
});
els.inputSel.addEventListener('change', (e) => {
  ui.input = (e.target as HTMLSelectElement).value as InputMode;
  els.hint.textContent = HINTS[ui.input];
  settings.inputMode = ui.input;
  persistSettings();
});

function chipToggle(el: HTMLElement, fn: () => void): void {
  const run = (): void => {
    // The Program lock and the disabled style only block pointer events; guard
    // the keyboard path too so a focused chip can't desync a running Program.
    if (program.active || el.classList.contains('disabled')) return;
    fn();
    refreshChips(els, session);
  };
  el.addEventListener('click', run);
  // Enter only — Space stays reserved for the skill-check press, so clicking a
  // chip and then playing with Space never re-toggles the chip.
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      run();
    }
  });
}
// Chip 'on' classes are derived from session state inside refreshChips (which
// chipToggle calls after every toggle) — handlers only mutate the session.
chipToggle(els.chips.hf, () => {
  session.hyperfocus = !session.hyperfocus;
  session.hfTokens = 0;
});
chipToggle(els.chips.so, () => {
  session.stakeOut = !session.stakeOut;
  session.soTokens = 4;
});
chipToggle(els.chips.up, () => {
  session.unnerving = (((session.unnerving as number) + 1) % 4) as 0 | 1 | 2 | 3;
  drawTapeNow();
});
chipToggle(els.chips.lb, () => {
  session.lullaby = (session.lullaby + 1) % 6;
});
chipToggle(els.chips.tb, () => {
  session.toolbox = !session.toolbox;
});
chipToggle(els.chips.ms, () => {
  if (!session.isRepair()) return; // disabled on Special; ignore
  if (session.running) endFreeplayRun(performance.now());
  session.storm = !session.storm;
  // Restarting cleanly avoids a half-charged gen carrying weird state into a storm.
  session.stop();
  session.check = null;
  session.charges = 0;
  setStartBtn();
  drawProgress();
});
chipToggle(els.chips.bg, () => {
  bgNoise.enabled = !bgNoise.enabled;
  els.chips.bg.classList.toggle('on', bgNoise.enabled);
  els.toks.bg.textContent = bgNoise.enabled ? 'on' : 'off';
  settings.bgNoise = bgNoise.enabled;
  persistSettings();
});

// Display preference chips — never program-locked (they're render-only).
function displayToggle(el: HTMLElement, fn: () => void): void {
  el.addEventListener('click', fn);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fn();
    }
  });
}
displayToggle($('cRM'), () => {
  settings.reducedMotion = !settings.reducedMotion;
  applyMotionPrefs();
  persistSettings();
});
displayToggle($('cCB'), () => {
  settings.colorblindSafe = !settings.colorblindSafe;
  applyPalette();
  persistSettings();
  drawTapeNow();
});

function slider(input: HTMLInputElement, valEl: HTMLElement, fmt: (v: number) => string, set: (v: number) => void): void {
  input.addEventListener('input', () => {
    const v = +input.value;
    set(v);
    valEl.textContent = fmt(v);
    drawTapeNow();
    refreshChips(els, session);
  });
}
slider(els.sliders.speed, els.sliderVals.speed, (v) => `${(v / 100).toFixed(2)}×`, (v) => {
  session.speedMul = v / 100;
  settings.speedMul = session.speedMul;
  persistSettings();
});
slider(els.sliders.zone, els.sliderVals.zone, (v) => `${(v / 100).toFixed(2)}×`, (v) => {
  session.zoneMul = v / 100;
  settings.zoneMul = session.zoneMul;
  persistSettings();
});
slider(els.sliders.warn, els.sliderVals.warn, (v) => `${v} ms`, (v) => {
  session.warnLeadMs = v;
  settings.warnLeadMs = v;
  persistSettings();
});
slider(els.sliders.vol, els.sliderVals.vol, (v) => `${v}%`, (v) => {
  synth.volume = v / 100;
  settings.volume = synth.volume;
  persistSettings();
});
// Dial size is purely cosmetic (render scale) — not Program-locked, safe to
// adjust any time, and never touches timing or zone geometry.
slider(els.sliders.dial, els.sliderVals.dial, (v) => `${(v / 100).toFixed(2)}×`, (v) => {
  session.dialScale = v / 100;
  settings.dialScale = session.dialScale;
  persistSettings();
});

// ---------------- boot ----------------
function applySettingsToUi(): void {
  ui.input = settings.inputMode;
  els.inputSel.value = settings.inputMode;
  els.hint.textContent = HINTS[settings.inputMode];
  session.pacing = settings.pacing;
  els.pacingSel.value = settings.pacing;
  synth.volume = settings.volume;
  els.sliders.vol.value = String(Math.round(settings.volume * 100));
  els.sliderVals.vol.textContent = `${Math.round(settings.volume * 100)}%`;
  session.speedMul = settings.speedMul;
  session.zoneMul = settings.zoneMul;
  session.warnLeadMs = settings.warnLeadMs;
  reflectSliders(els, settings.speedMul, settings.zoneMul, settings.warnLeadMs);
  session.dialScale = settings.dialScale;
  els.sliders.dial.value = String(Math.round(settings.dialScale * 100));
  els.sliderVals.dial.textContent = `${settings.dialScale.toFixed(2)}×`;
  bgNoise.enabled = settings.bgNoise;
  els.chips.bg.classList.toggle('on', settings.bgNoise);
  els.toks.bg.textContent = settings.bgNoise ? 'on' : 'off';
  session.mode = settings.lastMode;
  session.special = settings.lastSpecial;
  setTabSelection(els.tabs, session.mode);
  els.specialRow.classList.toggle('show', session.mode === 'special');
  els.specialSel.value = settings.lastSpecial;
  els.pacingSel.disabled = !session.isRepair();
  applyMotionPrefs();
  applyPalette();
}

applySettingsToUi();
dashboard.setRecords(loadHistory(storage));
sizeCanvas();
updateStatsPanel(els, session);
refreshChips(els, session);
drawProgress();
requestAnimationFrame(loop);

// Dev-only handle so headless tooling can drive frames when RAF is throttled
// (hidden windows). Stripped from production builds.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__trainer = { session, program, frame, dashboard, storage };
}
