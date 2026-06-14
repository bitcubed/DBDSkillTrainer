// Skill-check cue audio. warn / good / great play the owner's recorded cue
// files, bundled by Vite from src/assets. (Context section 5's "all sounds are
// synthesized, no embedded audio" rule was relaxed on 2026-06-14 at the owner's
// request, trading the copyright caveat for an exact match to the game; see the
// context doc.) fail stays synthesized - no recording was supplied.

import { lullabySilent } from '../engine/perks';
import warnUrl from '../assets/dbd_check_start.mp3';
import goodUrl from '../assets/dbd_good_skill_check.mp3';
import greatUrl from '../assets/dbd_great_skillcheck.mp3';

interface WindowWithWebkitAC extends Window {
  webkitAudioContext?: typeof AudioContext;
}

type CueName = 'warn' | 'good' | 'great';

export class Synth {
  /** 0..1 master volume. */
  volume = 0.6;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private samples: Partial<Record<CueName, AudioBuffer>> = {};
  private samplesRequested = false;

  /** Create/resume the context - must be called from a user gesture at least once. */
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
    void this.loadSamples(this.ctx);
    return this.ctx;
  }

  // Fetch + decode the three cue files once, after the context exists.
  private async loadSamples(a: AudioContext): Promise<void> {
    if (this.samplesRequested) return;
    this.samplesRequested = true;
    const items: [CueName, string][] = [
      ['warn', warnUrl],
      ['good', goodUrl],
      ['great', greatUrl],
    ];
    await Promise.all(
      items.map(async ([key, url]) => {
        try {
          const data = await (await fetch(url)).arrayBuffer();
          this.samples[key] = await a.decodeAudioData(data);
        } catch {
          // Leave undefined; the cue no-ops until (if) decoding succeeds.
        }
      }),
    );
  }

  // Play a decoded cue through the master bus at the current volume. A fresh
  // BufferSource per call lets cues overlap (rapid drill checks).
  private playSample(buf: AudioBuffer | undefined, gainMul = 1): void {
    if (!buf || !this.ctx || !this.master || this.volume <= 0) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = this.volume * gainMul;
    src.connect(g).connect(this.master);
    src.start();
  }

  /** Warning cue (check appears): the recorded check-start sound. Silent at Lullaby 5. */
  warn(lullaby: number): void {
    if (this.volume <= 0 || lullabySilent(lullaby)) return;
    this.ensure();
    this.playSample(this.samples.warn);
  }

  /** Good result: the recorded good-skill-check sound. */
  good(): void {
    if (this.volume <= 0) return;
    this.ensure();
    this.playSample(this.samples.good);
  }

  /** Great result: the recorded great-skill-check sound. */
  great(): void {
    if (this.volume <= 0) return;
    this.ensure();
    this.playSample(this.samples.great);
  }

  // One oscillator with a fast-attack / exponential-decay envelope into `dest`
  // (used only by the synthesized fail cue). Optional frequency glide.
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
  // as Float32Array<ArrayBuffer> - annotating it widens to ArrayBufferLike,
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
   * Failure: a loud, bass-heavy explosion with an electrical zap - a distorted
   * sawtooth blast gliding 80->40 Hz, plus high-passed white noise with a
   * stuttering envelope (sparks/steam). Instant attack, ~1.5 s chaotic decay.
   * Still synthesized (no fail recording supplied).
   */
  fail(): void {
    if (this.volume <= 0) return;
    const a = this.ensure();
    if (!a || !this.master) return;
    const t = a.currentTime;

    // Layer 1 - the blast: distorted low sawtooth, 80->40 Hz.
    const shaper = a.createWaveShaper();
    shaper.curve = this.distortionCurve(45);
    shaper.oversample = '2x';
    const blastGain = a.createGain();
    blastGain.gain.value = 0.5;
    shaper.connect(blastGain).connect(this.master);
    this.osc(a, 'sawtooth', 80, t, 0.7, 0.6, shaper, 0.001, 40);

    // Layer 2 - the zap/sparks: high-passed white noise with a stuttering,
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
