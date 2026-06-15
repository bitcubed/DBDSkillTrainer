// Bootstrap: build UI, wire engine ↔ DOM ↔ persistence, start the RAF loop.

import './styles/main.css';
import { loadHistory, type KillerSummary, type StorageLike } from './analytics/history';
import { RunLogger } from './analytics/runLog';
import { Synth } from './audio/synth';
import { GEN_CHARGES, HARD_LOOK_DEG_PER_PX } from './engine/constants';
import { defaultHardConfig, HardMode, type HardConfig } from './engine/hardMode';
import { ProgramController } from './engine/program';
import { Session, type ResolveEvent } from './engine/session';
import type { InputMode, Mode, Result, Settings } from './engine/types';
import { BgNoise } from './render/bgNoise';
import { drawDial, PULSE_MS, type ResolvePulse } from './render/dial';
import { CB_PALETTE, DEFAULT_PALETTE, type ResultPalette } from './render/palette';
import { Scene } from './render/scene';
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

// ---------------- Hard Mode (divided-attention / killer-lookout) ----------------
const scene = new Scene();
scene.init();

function buildHardConfig(): HardConfig {
  return {
    ...defaultHardConfig(),
    approachMs: settings.hardApproachMs,
    catchConeDeg: settings.hardCatchConeDeg,
    encounterMinMs: settings.hardEncounterMinS * 1000,
    encounterMaxMs: settings.hardEncounterMaxS * 1000,
    missPenaltyPct: settings.hardMissPenaltyPct,
    panSensitivity: settings.hardPanSensitivity,
    dangerCue: settings.hardDangerCue,
    dangerCueIntensity: settings.hardDangerCueIntensity,
  };
}

const hardMode = new HardMode(buildHardConfig(), Math.random, {
  onReached: (now) => onKillerReached(now),
  onSpotted: (reactionMs, now) => onKillerSpotted(reactionMs, now),
});

const hardModeActive = (): boolean => session.mode === 'hard';

function killerSummary(): KillerSummary | undefined {
  const encounters = hardMode.encounters();
  return encounters > 0
    ? { encounters, spotted: hardMode.spotted, avgReactionMs: hardMode.avgReactionMs() }
    : undefined;
}

/** The killer reached you: scare + a gen-progress penalty (the run continues). */
function onKillerReached(now: number): void {
  const pen = (hardMode.cfg.missPenaltyPct / 100) * GEN_CHARGES;
  session.charges = Math.max(0, session.charges - pen);
  flash('KILLER!', 'var(--fail)', null, `caught you — −${hardMode.cfg.missPenaltyPct.toFixed(0)}%`);
  ui.flashUntil = now + 1100;
  synth.fail();
  if (!reducedMotionOn()) {
    stage.classList.remove('shake');
    void (stage as HTMLElement).offsetWidth;
    stage.classList.add('shake');
  }
  drawProgress();
}

/** You caught the killer in time — confirm with the reaction time. */
function onKillerSpotted(reactionMs: number, now: number): void {
  flash('SPOTTED', 'var(--gold)', null, `${(reactionMs / 1000).toFixed(2)}s`);
  ui.flashUntil = now + 850;
}

const program = new ProgramController(
  session,
  {
  setBgNoise: (on) => {
    bgNoise.enabled = on;
    els.chips.bg.classList.toggle('on', on);
    els.toks.bg.textContent = on ? 'on' : 'off';
  },
  onSegment: (seg, _idx, now) => {
    // Sync the mode tabs + sliders visually with what the Program just applied.
    setTabSelection(els.tabs, session.mode);
    els.specialRow.classList.toggle('show', session.mode === 'special');
    reflectSliders(els, seg.speed, seg.zone, seg.warnMs);
    // The Lookout segment runs Hard Mode; every other segment stops it.
    if (session.mode === 'hard') hardMode.start(now);
    else hardMode.stop();
    updateHint();
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
    hardMode.stop();
    flash('PROGRAM COMPLETE', 'var(--ok)', null, 'see your breakdown below');
    ui.flashUntil = now + 2600;
    setProgramLock(els, false);
    setStartBtn();
    setProgBtn();
    renderResults($('progResults'), segs, session.stats);
    refreshChips(els, session);
    drawProgress();
    // Log the Program to history (spec §8.1: every run, with segments + killer metrics).
    if (ui.progStart) {
      const records = runLog.logProgram(
        session.stats,
        segs,
        ui.progStart.epoch,
        (now - ui.progStart.perf) / 1000,
        ui.progStart.settingsSnapshot,
        killerSummary(),
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
    hardMode.stop();
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
  },
  () => ({ spotted: hardMode.spotted, encounters: hardMode.encounters() }),
);

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
  els.specialSel.value = settings.lastSpecial;
  syncModeUI();
  hardMode.cfg = buildHardConfig();
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
  const records = runLog.endFreeplay(session.stats, session.errCountTotal, now, killerSummary());
  if (records) dashboard.setRecords(records);
}

// Best-effort flush: closing/navigating the tab mid-run still logs the run.
window.addEventListener('pagehide', () => endFreeplayRun(performance.now()));

// ---------------- canvas sizing ----------------
function sizeCanvas(): void {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  if (stage.classList.contains('expanded')) {
    // In-window fullscreen: the stage is position:fixed inset:0, so let CSS drive
    // the box and fill the canvas to the viewport.
    stage.style.height = '';
    W = stage.clientWidth;
    H = stage.clientHeight;
  } else {
    W = stage.clientWidth;
    H = Math.max(300, Math.min(Math.round(W * 0.56), 420));
    stage.style.height = `${H}px`;
  }
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
let lastFrame = 0;
function frame(now: number): void {
  const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0;
  lastFrame = now;

  if (program.active) {
    program.tick(now);
    hud.update(program, now);
  }
  session.tick(now);
  const inHard = hardModeActive() && session.running;
  if (inHard) hardMode.tick(now, dt);
  syncSimChrome(); // keep overlays / cursor / pointer-lock state in sync with the run

  // Background: Hard Mode's scene IS the backdrop, so hide the noise field there.
  if (inHard) {
    bgx.clearRect(0, 0, W, H);
    bgCv.style.display = 'none';
  } else {
    bgNoise.draw(bgx, dt);
  }

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

  const dialState = {
    running: session.running,
    active: session.phase === 'active',
    check: session.check,
    pulse: ui.pulse,
    reducedMotion: reducedMotionOn(),
    palette: pal,
    dialScale: session.dialScale,
    inputMode: ui.input,
  };
  if (inHard) {
    // Scene first (clears the canvas), then the centered dial HUD overlays it.
    scene.draw(ctx, W, H, {
      yaw: hardMode.yaw,
      pitch: hardMode.pitch,
      fovDeg: hardMode.cfg.fovDeg,
      killerActive: hardMode.killerActive(),
      killerYaw: hardMode.killerYaw(),
      killerProgress: hardMode.killerProgress(now),
      killerDwellFrac: hardMode.killerDwellFrac(),
      dangerCue: hardMode.cfg.dangerCue,
      dangerIntensity: hardMode.cfg.dangerCueIntensity,
      palette: pal,
      reducedMotion: reducedMotionOn(),
    });
    drawDial(ctx, W, H, now, { ...dialState, skipClear: true });
  } else {
    drawDial(ctx, W, H, now, dialState);
  }
}
// Render on the RAF presentation timestamp (not a fresh performance.now()): one
// consistent clock per frame, aligned to when the frame is actually shown.
function loop(ts: number): void {
  frame(ts);
  requestAnimationFrame(loop);
}

// ---------------- input ----------------
function press(now: number): void {
  if (!session.running) return;
  synth.ensure();
  session.press(now);
}

// Hard Mode keyboard look fallback (project rule: fully keyboard-operable).
// Horizontal (yaw): ◄ ► / A-D / Q-E. Vertical (pitch): ▲ ▼ / W-S.
const TURN_LEFT = new Set(['ArrowLeft', 'KeyA', 'KeyQ']);
const TURN_RIGHT = new Set(['ArrowRight', 'KeyD', 'KeyE']);
const LOOK_UP = new Set(['ArrowUp', 'KeyW']);
const LOOK_DOWN = new Set(['ArrowDown', 'KeyS']);
let turnL = false;
let turnR = false;
let lookU = false;
let lookD = false;
function syncKeyTurn(): void {
  hardMode.setKeyTurn((turnR ? 1 : 0) - (turnL ? 1 : 0));
}
function syncKeyPitch(): void {
  hardMode.setKeyPitch((lookU ? 1 : 0) - (lookD ? 1 : 0));
}

window.addEventListener('keydown', (e) => {
  // Esc exits the immersive sim: the browser releases pointer lock, and we collapse
  // the in-window fullscreen too. The run keeps going (Stop is its own control).
  if (e.code === 'Escape') {
    setExpanded(false);
    return; // don't preventDefault — let the browser do its native pointer-lock release
  }
  // Space resolves checks unless the Input setting is left-click-only — same rule in
  // every mode, Hard Mode included (idle Space stays native).
  if (e.code === 'Space' && ui.input !== 'mouse' && session.running) {
    e.preventDefault();
    // Judge at the event's own timestamp (when the key actually went down), not
    // after handler dispatch — tighter for the ~33 ms great window.
    if (!e.repeat) press(e.timeStamp || performance.now());
    return;
  }
  // Hard Mode look (yaw: arrow/A-D/Q-E; pitch: arrow/W-S).
  if (hardModeActive() && session.running) {
    if (TURN_LEFT.has(e.code)) {
      turnL = true;
      syncKeyTurn();
      keyboardLooking = true;
      e.preventDefault();
    } else if (TURN_RIGHT.has(e.code)) {
      turnR = true;
      syncKeyTurn();
      keyboardLooking = true;
      e.preventDefault();
    } else if (LOOK_UP.has(e.code)) {
      lookU = true;
      syncKeyPitch();
      keyboardLooking = true;
      e.preventDefault();
    } else if (LOOK_DOWN.has(e.code)) {
      lookD = true;
      syncKeyPitch();
      keyboardLooking = true;
      e.preventDefault();
    }
  }
});
window.addEventListener('keyup', (e) => {
  if (TURN_LEFT.has(e.code)) {
    turnL = false;
    syncKeyTurn();
  } else if (TURN_RIGHT.has(e.code)) {
    turnR = false;
    syncKeyTurn();
  } else if (LOOK_UP.has(e.code)) {
    lookU = false;
    syncKeyPitch();
  } else if (LOOK_DOWN.has(e.code)) {
    lookD = false;
    syncKeyPitch();
  }
});
// Losing focus mid-look can swallow the keyup — clear held keys so the view
// doesn't keep spinning/tilting when the tab regains focus.
window.addEventListener('blur', () => {
  if (turnL || turnR) {
    turnL = false;
    turnR = false;
    syncKeyTurn();
  }
  if (lookU || lookD) {
    lookU = false;
    lookD = false;
    syncKeyPitch();
  }
});
// ---- Hard Mode FPS mouse-look (pointer lock) ----
// While the pointer is locked to the stage, raw mouse movement drives the view
// like an FPS camera (movementX → yaw, movementY → pitch); the cursor is hidden
// and contained. When NOT locked (touch, or before/after capture) we fall back to
// the original edge-pan: horizontal position over the stage pans the view.
const pointerLockSupported = (): boolean =>
  typeof stage.requestPointerLock === 'function' && 'pointerLockElement' in document;
const lookLocked = (): boolean => document.pointerLockElement === stage;
// The capture prompt is mouse/ESC-specific — don't show it to touch-primary devices.
const PRIMARY_COARSE =
  typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
// Once the player drives with the keyboard, stop nagging them to "click to look"
// (project rule: Hard Mode is fully keyboard-operable, no pointer lock required).
let keyboardLooking = false;

function requestLook(): void {
  if (!(hardModeActive() && session.running && pointerLockSupported() && !lookLocked())) return;
  try {
    // Modern engines return a Promise that REJECTS when refused — most often the
    // ~1.25s re-lock throttle right after an Esc exit, or an unfocused document.
    // Swallow it (the capture prompt stays up; a later click retries); a sync
    // try/catch alone can't catch the async rejection.
    const p = stage.requestPointerLock() as unknown;
    if (p && typeof (p as Promise<void>).catch === 'function') {
      (p as Promise<void>).catch(() => undefined);
    }
  } catch {
    // legacy engines may throw synchronously instead
  }
}
// Belt-and-suspenders for engines that fire the event rather than rejecting.
document.addEventListener('pointerlockerror', () => undefined);

function syncSimChrome(): void {
  const liveHard = hardModeActive() && session.running;
  // Release the mouse automatically when the hard run ends or the mode changes.
  if (lookLocked() && !liveHard) {
    try {
      document.exitPointerLock();
    } catch {
      // best-effort
    }
  }
  const expanded = stage.classList.contains('expanded');
  // Start overlay: only when nothing is running (a fresh sim, ready to begin).
  stage.classList.toggle('idle', !session.running && !program.active);
  // "Esc to exit" indicator: only when the sim is immersive (captured or fullscreen).
  stage.classList.toggle('immersive', lookLocked() || expanded);
  // Show "click to capture" only while a hard run is live, the mouse is free, the
  // player isn't already driving by keyboard, and this is a mouse-primary device.
  stage.classList.toggle(
    'needslook',
    liveHard && pointerLockSupported() && !lookLocked() && !keyboardLooking && !PRIMARY_COARSE,
  );
  stage.classList.toggle('looklocked', lookLocked());
}

document.addEventListener('pointerlockchange', () => {
  if (!lookLocked()) hardMode.setMousePan(0.5); // drop any residual edge-pan velocity
  syncSimChrome();
});

// FPS deltas (fire on the locked element). movementY up is negative → +pitch (look
// up) unless inverted.
document.addEventListener('mousemove', (e) => {
  if (!lookLocked() || !hardModeActive() || !session.running) return;
  const sens = HARD_LOOK_DEG_PER_PX * settings.hardPanSensitivity;
  const invert = settings.hardInvertY ? 1 : -1;
  hardMode.applyLook((e.movementX || 0) * sens, (e.movementY || 0) * sens * invert);
});

// Edge-pan fallback (only when not pointer-locked — when locked, clientX is frozen
// and would otherwise inject a constant phantom pan).
stage.addEventListener('pointermove', (e) => {
  if (!hardModeActive() || !session.running || lookLocked()) return;
  const r = stage.getBoundingClientRect();
  hardMode.setMousePan(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
});
stage.addEventListener('pointerleave', () => {
  if (hardModeActive() && !lookLocked()) hardMode.setMousePan(0.5); // recenter → stop panning
});

// Left click (or tap) anywhere counts as a press — matches an M1 skill-check bind.
// Honors the Input dropdown (Space / Left click / Both) in every mode, Hard Mode
// included. In Hard Mode the click ALSO (re)captures the pointer for FPS look, so
// one click both looks and hits.
document.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !session.running) return;
  if ((e.target as Element).closest('button,select,input,a,.chip,.tab')) return;
  if (hardModeActive()) {
    requestLook(); // capture the pointer for FPS look (no-op if already locked / touch)
    if (ui.input !== 'space') {
      e.preventDefault();
      press(e.timeStamp || performance.now()); // no-op when no check is active
    }
    return;
  }
  if (ui.input === 'space') return;
  e.preventDefault();
  press(e.timeStamp || performance.now());
});

// ---------------- session control ----------------
function setStartBtn(): void {
  els.startBtn.textContent = session.running ? 'Stop' : 'Start';
  // Start now lives on the in-sim overlay; the external button is the Stop control,
  // shown only while a run is live (or a Program drives it).
  els.startBtn.style.display = session.running || program.active ? '' : 'none';
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
    hardMode.stop();
    setStartBtn();
    return;
  }
  session.start(now);
  if (hardModeActive()) {
    hardMode.start(now); // resets killer metrics for the run
    keyboardLooking = false; // fresh run: show the capture prompt until the player looks
    requestLook(); // capture the mouse FPS-style (Start click is the user gesture)
  } else hardMode.resetMetrics(); // clear any stale hard metrics so a non-hard run logs none
  beginFreeplayRun(now);
  setStartBtn();
}
els.startBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  startStop();
});
// In-sim Start: clicking it starts the run AND (in Hard Mode) captures the mouse,
// because startStop()'s requestLook() fires from this in-stage user gesture — so
// there's no separate "click into the sim" step.
$('simStartBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  startStop();
});

// ---------------- in-window fullscreen ("fullscreen but in the window") ----------------
const fsBtn = $('fsBtn');
function setExpanded(on: boolean): void {
  if (stage.classList.contains('expanded') === on) return;
  document.body.classList.toggle('sim-expanded', on); // drop the page scrollbar so it fills edge-to-edge
  stage.classList.toggle('expanded', on);
  fsBtn.textContent = on ? '🗗' : '⛶';
  fsBtn.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Fullscreen sim');
  sizeCanvas(); // recompute the canvas for the new box size
  syncSimChrome();
}
fsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  setExpanded(!stage.classList.contains('expanded'));
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
    // Clean killer-metric slate so the Lookout segment's per-segment diff is correct.
    hardMode.stop();
    hardMode.resetMetrics();
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

// ---------------- mode UI helpers ----------------
function updateHint(): void {
  if (session.mode === 'hard') {
    const hit = ui.input === 'space' ? 'SPACE' : ui.input === 'mouse' ? 'CLICK' : 'SPACE / CLICK';
    els.hint.textContent = `MOUSE-LOOK (click to capture · ESC frees) — ◄►▲▼/WASD — ${hit} to hit — spot the killer`;
  } else {
    els.hint.textContent = HINTS[ui.input];
  }
}
function syncModeUI(): void {
  els.specialRow.classList.toggle('show', session.mode === 'special');
  $('hardPanel').classList.toggle('show', session.mode === 'hard');
  els.pacingSel.disabled = !session.isRepair();
  $('simStartSub').textContent =
    session.mode === 'hard' ? 'Spot the killer while you repair' : 'Hit the skill checks';
  updateHint();
}

// ---------------- UI wiring ----------------
for (const el of els.tabs) {
  const activate = (): void => {
    if (program.active) return;
    if (session.running) endFreeplayRun(performance.now());
    setTabSelection(els.tabs, (el.dataset.mode ?? 'gen') as Mode);
    session.mode = (el.dataset.mode ?? 'gen') as Mode;
    session.stop();
    hardMode.stop();
    session.check = null;
    session.charges = 0;
    setStartBtn();
    syncModeUI();
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
  updateHint();
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

// ---------------- Hard Mode tunables (all APPROXIMATED training knobs) ----------------
function hardSlider(id: string, valId: string, fmt: (v: number) => string, set: (v: number) => void): void {
  const input = $(id) as HTMLInputElement;
  const valEl = $(valId);
  input.addEventListener('input', () => {
    const v = +input.value;
    set(v);
    valEl.textContent = fmt(v);
    hardMode.cfg = buildHardConfig();
    persistSettings();
  });
}
const approachFmt = (v: number): string => `${(v / 1000).toFixed(1)} s`;
const coneFmt = (v: number): string => `${v}°`;
const secFmt = (v: number): string => `${v} s`;
const pctFmt = (v: number): string => `${v}%`;
const panFmt = (v: number): string => `${(v / 100).toFixed(2)}×`;
hardSlider('rHardApproach', 'vHardApproach', approachFmt, (v) => (settings.hardApproachMs = v));
hardSlider('rHardCone', 'vHardCone', coneFmt, (v) => (settings.hardCatchConeDeg = v));
hardSlider('rHardMin', 'vHardMin', secFmt, (v) => (settings.hardEncounterMinS = v));
hardSlider('rHardMax', 'vHardMax', secFmt, (v) => (settings.hardEncounterMaxS = v));
hardSlider('rHardPenalty', 'vHardPenalty', pctFmt, (v) => (settings.hardMissPenaltyPct = v));
hardSlider('rHardPan', 'vHardPan', panFmt, (v) => (settings.hardPanSensitivity = v / 100));
hardSlider('rHardDanger', 'vHardDanger', pctFmt, (v) => (settings.hardDangerCueIntensity = v / 100));

function reflectHardDangerToggle(): void {
  const t = $('hardDangerToggle');
  t.classList.toggle('on', settings.hardDangerCue);
  t.setAttribute('aria-pressed', String(settings.hardDangerCue));
  t.textContent = settings.hardDangerCue ? 'Danger cue: on' : 'Danger cue: off';
}
$('hardDangerToggle').addEventListener('click', () => {
  settings.hardDangerCue = !settings.hardDangerCue;
  reflectHardDangerToggle();
  hardMode.cfg = buildHardConfig();
  persistSettings();
});

function reflectHardInvertToggle(): void {
  const t = $('hardInvertToggle');
  t.classList.toggle('on', settings.hardInvertY);
  t.setAttribute('aria-pressed', String(settings.hardInvertY));
  t.textContent = settings.hardInvertY ? 'Invert Y: on' : 'Invert Y: off';
}
$('hardInvertToggle').addEventListener('click', () => {
  settings.hardInvertY = !settings.hardInvertY;
  reflectHardInvertToggle();
  persistSettings();
});

function reflectHardSliders(): void {
  const setS = (id: string, valId: string, value: number, fmt: (v: number) => string): void => {
    ($(id) as HTMLInputElement).value = String(value);
    $(valId).textContent = fmt(value);
  };
  setS('rHardApproach', 'vHardApproach', settings.hardApproachMs, approachFmt);
  setS('rHardCone', 'vHardCone', settings.hardCatchConeDeg, coneFmt);
  setS('rHardMin', 'vHardMin', settings.hardEncounterMinS, secFmt);
  setS('rHardMax', 'vHardMax', settings.hardEncounterMaxS, secFmt);
  setS('rHardPenalty', 'vHardPenalty', settings.hardMissPenaltyPct, pctFmt);
  setS('rHardPan', 'vHardPan', Math.round(settings.hardPanSensitivity * 100), panFmt);
  setS('rHardDanger', 'vHardDanger', Math.round(settings.hardDangerCueIntensity * 100), pctFmt);
}

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
  els.specialSel.value = settings.lastSpecial;
  syncModeUI();
  reflectHardSliders();
  reflectHardDangerToggle();
  reflectHardInvertToggle();
  hardMode.cfg = buildHardConfig();
  applyMotionPrefs();
  applyPalette();
}

applySettingsToUi();
dashboard.setRecords(loadHistory(storage));
sizeCanvas();
setStartBtn(); // hide the external Start (it now lives on the in-sim overlay)
syncSimChrome(); // set initial idle/overlay state before the first frame
updateStatsPanel(els, session);
refreshChips(els, session);
drawProgress();
requestAnimationFrame(loop);

// Dev-only handle so headless tooling can drive frames when RAF is throttled
// (hidden windows). Stripped from production builds.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__trainer = { session, program, frame, dashboard, storage, hardMode, scene };
}
