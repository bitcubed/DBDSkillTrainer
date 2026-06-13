// Synthesized audio stand-ins — NOT game audio (copyright; see context doc §5).
// These recreate the *character* of DBD's skill-check cues from a synthesis
// brief, never the copyrighted files themselves:
//   warn  a clean, sharp high glassy "ting" (~1.8 kHz triangle), dry.
//   good  a muted square "knock" gliding 300→100 Hz under a 500 Hz low-pass.
//   great a bright layered "shing" (sine 2 kHz + square 1.2 kHz) with chorus.
//   fail  a distorted saw blast (80→40 Hz) + stuttering high-passed noise zap.
// Everything is generated at runtime; no audio samples ship in the repo.

import { lullabySilent } from '../engine/perks';

interface WindowWithWebkitAC extends Window {
  webkitAudioContext?: typeof AudioContext;
}

export class Synth {
  /** 0..1 master volume. */
  volume = 0.6;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  /** Create/resume the context — must be called from a user gesture at least once. */
  ensure(): AudioContext | null {
    if (typeof AudioContext === 'undefined' && !(window as WindowWithWebkitAC).webkitAudioContext) {
      return null;
    }
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as WindowWithWebkitAC).webkitAudioContext!;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  // One oscillator with a fast-attack / exponential-decay envelope into `dest`.
  // Optional frequency glide (freq → glideTo across the note).
  private osc(
    a: AudioContext,
    type: OscillatorType,
    freq: number,
    t0: number,
    dur: number,
    amp: number,
    dest: AudioNode,
    attack = 0.01,
    glideTo?: number,
  ): void {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (glideTo !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(amp * this.volume + 0.0001, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  // Soft-clip distortion curve for the failure blast. (Return type is inferred
  // as Float32Array<ArrayBuffer> — annotating it widens to ArrayBufferLike,
  // which WaveShaperNode.curve rejects under TS 5.7+.)
  private distortionCurve(amount: number) {
    const n = 1024;
    const curve = new Float32Array(n);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  /**
   * Warning cue: a single sharp, high-pitched glassy "ting" that rings out
   * cleanly — fast attack, moderate decay, no sustain, no reverb. Silent at
   * Lullaby 5.
   */
  warn(lullaby: number): void {
    if (this.volume <= 0 || lullabySilent(lullaby)) return;
    const a = this.ensure();
    if (!a || !this.master) return;
    const t = a.currentTime;
    this.osc(a, 'triangle', 1800, t, 0.4, 0.2, this.master, 0.01); // the clean ting
    this.osc(a, 'sine', 3600, t, 0.18, 0.05, this.master, 0.01); // faint octave = glassy sheen
  }

  /**
   * Good result: a subtle, muted mechanical knock — a square wave dropping
   * 300→100 Hz under a heavy 500 Hz low-pass so there's no brightness. Dry,
   * short, unobtrusive.
   */
  good(): void {
    if (this.volume <= 0) return;
    const a = this.ensure();
    if (!a || !this.master) return;
    const t = a.currentTime;
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    lp.connect(this.master);
    this.osc(a, 'square', 300, t, 0.1, 0.16, lp, 0.01, 100); // knock, glide down
  }

  /**
   * Great result: a bright, shimmering metallic "shing" — layered sine (2 kHz)
   * and square (1.2 kHz) through a light chorus (a modulated delay) for the
   * shimmer. Fast attack, longer decay, cuts through the mix.
   */
  great(): void {
    if (this.volume <= 0) return;
    const a = this.ensure();
    if (!a || !this.master) return;
    const t = a.currentTime;

    // Sum the two oscillators into one bus, then split to a dry path + chorus.
    const bus = a.createGain();
    bus.gain.value = 1;
    bus.connect(this.master); // dry

    const delay = a.createDelay();
    delay.delayTime.value = 0.025;
    const lfo = a.createOscillator();
    lfo.frequency.value = 3.2;
    const lfoGain = a.createGain();
    lfoGain.gain.value = 0.006; // ±6 ms modulation = shimmer
    lfo.connect(lfoGain).connect(delay.delayTime);
    const wet = a.createGain();
    wet.gain.value = 0.5;
    bus.connect(delay).connect(wet).connect(this.master);
    lfo.start(t);
    lfo.stop(t + 0.6);

    this.osc(a, 'sine', 2000, t, 0.5, 0.16, bus, 0.02);
    this.osc(a, 'square', 1200, t, 0.45, 0.08, bus, 0.02);
  }

  /**
   * Failure: a loud, bass-heavy explosion with an electrical zap — a distorted
   * sawtooth blast gliding 80→40 Hz, plus high-passed white noise with a
   * stuttering envelope (sparks/steam). Instant attack, ~1.5 s chaotic decay.
   */
  fail(): void {
    if (this.volume <= 0) return;
    const a = this.ensure();
    if (!a || !this.master) return;
    const t = a.currentTime;

    // Layer 1 — the blast: distorted low sawtooth, 80→40 Hz.
    const shaper = a.createWaveShaper();
    shaper.curve = this.distortionCurve(45);
    shaper.oversample = '2x';
    const blastGain = a.createGain();
    blastGain.gain.value = 0.5;
    shaper.connect(blastGain).connect(this.master);
    this.osc(a, 'sawtooth', 80, t, 0.7, 0.6, shaper, 0.001, 40);

    // Layer 2 — the zap/sparks: high-passed white noise with a stuttering,
    // randomized volume envelope over a long decay.
    const rate = a.sampleRate;
    const len = Math.floor(rate * 1.5);
    const buf = a.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    const block = Math.max(1, Math.floor(rate * 0.025)); // ~25 ms stutter blocks
    let level = 1;
    for (let i = 0; i < len; i++) {
      if (i % block === 0) level = Math.pow(Math.random(), 1.5); // new random gate each block
      const decay = Math.pow(1 - i / len, 1.2);
      d[i] = (Math.random() * 2 - 1) * level * decay;
    }
    const src = a.createBufferSource();
    src.buffer = buf;
    const hp = a.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2200;
    const noiseGain = a.createGain();
    noiseGain.gain.value = 0.22 * this.volume;
    src.connect(hp).connect(noiseGain).connect(this.master);
    src.start(t);
    src.stop(t + 1.55);
  }
}
