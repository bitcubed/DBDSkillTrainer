// Synthesized audio stand-ins — NOT game audio (copyright; see context doc §5).
// DBD's cue is a metallic "gong" before the check and a sharp bright "ding" on
// a great. These synthesize the *character*: inharmonic struck-metal partials
// with a fast attack and ringing decay for the gong/ding, a discordant low
// stinger + filtered noise burst for the failure.

import { lullabySilent } from '../engine/perks';

interface WindowWithWebkitAC extends Window {
  webkitAudioContext?: typeof AudioContext;
}

export class Synth {
  /** 0..1 master volume. */
  volume = 0.6;

  private ctx: AudioContext | null = null;

  /** Create/resume the context — must be called from a user gesture at least once. */
  ensure(): AudioContext | null {
    if (typeof AudioContext === 'undefined' && !(window as WindowWithWebkitAC).webkitAudioContext) {
      return null;
    }
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as WindowWithWebkitAC).webkitAudioContext!;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  // One struck-metal partial: oscillator at f, fast attack ("strike"), exponential decay.
  private partial(f: number, t0: number, dur: number, amp: number, type: OscillatorType = 'sine'): void {
    const a = this.ctx;
    if (!a) return;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(amp * this.volume + 0.0001, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  /** Warning gong: low-ish metallic bell with inharmonic overtones. Silent at Lullaby 5. */
  warn(lullaby: number): void {
    if (this.volume <= 0 || lullabySilent(lullaby)) return;
    const a = this.ensure();
    if (!a) return;
    const t = a.currentTime;
    this.partial(523.3, t, 0.62, 0.17); // strike fundamental
    this.partial(523.3 * 2.76, t, 0.42, 0.085); // inharmonic overtone
    this.partial(523.3 * 5.4, t, 0.26, 0.045); // bright shimmer
    this.partial(261.7, t, 0.7, 0.06, 'triangle'); // body / weight
  }

  /** Great hit: short, bright, satisfying metallic "ding" up high. */
  great(): void {
    if (this.volume <= 0) return;
    const a = this.ensure();
    if (!a) return;
    const t = a.currentTime;
    this.partial(1567.98, t, 0.22, 0.2); // bright fundamental (G6)
    this.partial(1567.98 * 2.0, t + 0.005, 0.15, 0.1);
    this.partial(1567.98 * 2.93, t + 0.01, 0.1, 0.05); // inharmonic sparkle
  }

  /** Good hit: duller, lower confirmation — no sparkle, quick decay. */
  good(): void {
    if (this.volume <= 0) return;
    const a = this.ensure();
    if (!a) return;
    const t = a.currentTime;
    this.partial(659.3, t, 0.13, 0.1);
    this.partial(880.0, t + 0.004, 0.09, 0.05);
  }

  /** Failure: gen-explosion stinger — discordant low cluster + filtered noise burst. */
  fail(): void {
    if (this.volume <= 0) return;
    const a = this.ensure();
    if (!a) return;
    const t = a.currentTime;
    this.partial(146.8, t, 0.55, 0.16, 'sawtooth'); // low discordant body
    this.partial(155.6, t, 0.5, 0.12, 'sawtooth'); // beats against it = harsh
    this.partial(98.0, t, 0.6, 0.13, 'triangle');
    const len = Math.floor(a.sampleRate * 0.4);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, 1.7);
      d[i] = (Math.random() * 2 - 1) * env;
    }
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1600, t);
    f.frequency.exponentialRampToValueAtTime(280, t + 0.35); // "whump"
    const g = a.createGain();
    g.gain.setValueAtTime(0.26 * this.volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    src.connect(f).connect(g).connect(a.destination);
    src.start(t);
    src.stop(t + 0.42);
  }
}
