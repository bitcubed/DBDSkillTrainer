// Synthesized audio stand-ins — NOT game audio (copyright; see context doc §5).
// DBD's cue is a deep, resonant metallic bell-toll before the check and a sharp
// bright "ding" on a great, both ringing out in a cavernous space. These
// synthesize the *character*: inharmonic struck-metal partials with a fast
// attack and long ringing decay, fed into a generated convolution reverb for
// the echoey tail. The exact game audio is copyrighted and unpublished, so this
// is an original recreation of the sound's feel — never the file itself.

import { lullabySilent } from '../engine/perks';

interface WindowWithWebkitAC extends Window {
  webkitAudioContext?: typeof AudioContext;
}

export class Synth {
  /** 0..1 master volume. */
  volume = 0.6;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private reverbSend: GainNode | null = null;

  /** Create/resume the context — must be called from a user gesture at least once. */
  ensure(): AudioContext | null {
    if (typeof AudioContext === 'undefined' && !(window as WindowWithWebkitAC).webkitAudioContext) {
      return null;
    }
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as WindowWithWebkitAC).webkitAudioContext!;
      this.ctx = new AC();
      this.buildGraph(this.ctx);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  // Master bus + a parallel convolution-reverb send for the echoey tail.
  private buildGraph(a: AudioContext): void {
    this.master = a.createGain();
    this.master.gain.value = 1;
    this.master.connect(a.destination);

    this.reverb = a.createConvolver();
    this.reverb.buffer = this.makeImpulse(a, 2.6, 3.0); // long, dark cathedral tail
    this.reverbSend = a.createGain();
    this.reverbSend.gain.value = 1;
    this.reverb.connect(this.reverbSend).connect(this.master);
  }

  // Generated impulse response: exponentially-decaying noise, low-pass shaped so
  // the tail is dark rather than hissy (a large stone-room feel, not a plate).
  private makeImpulse(a: AudioContext, seconds: number, decay: number): AudioBuffer {
    const rate = a.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = a.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const env = Math.pow(1 - i / len, decay);
        const white = Math.random() * 2 - 1;
        // one-pole low-pass to roll off the high fizz → a deeper, rounder tail
        lp += 0.32 * (white - lp);
        d[i] = lp * env;
      }
    }
    return buf;
  }

  // One struck-metal partial: oscillator at f, fast attack ("strike"), long
  // exponential decay. `wet` (0..1) sets how much goes to the reverb send.
  private partial(
    f: number,
    t0: number,
    dur: number,
    amp: number,
    type: OscillatorType = 'sine',
    wet = 0.35,
  ): void {
    const a = this.ctx;
    if (!a || !this.master) return;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(amp * this.volume + 0.0001, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.master);
    if (this.reverb && wet > 0) {
      const send = a.createGain();
      send.gain.value = wet;
      g.connect(send).connect(this.reverb);
    }
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  /**
   * Warning toll: a deep, dark metallic bell with inharmonic overtones and a
   * long reverberant ring — the ominous "a check is coming" cue. Dropped about
   * an octave from a bright bell so it reads as deep rather than chimey. Silent
   * at Lullaby 5.
   */
  warn(lullaby: number): void {
    if (this.volume <= 0 || lullabySilent(lullaby)) return;
    const a = this.ensure();
    if (!a) return;
    const t = a.currentTime;
    // Low struck fundamental (~D4) with a heavy sub-body for weight.
    this.partial(293.7, t, 1.5, 0.17, 'sine', 0.5); // strike fundamental
    this.partial(146.8, t, 1.7, 0.1, 'triangle', 0.55); // sub-octave body / weight
    this.partial(293.7 * 2.76, t, 0.9, 0.06, 'sine', 0.45); // inharmonic overtone
    this.partial(293.7 * 5.4, t + 0.004, 0.5, 0.03, 'sine', 0.4); // faint bright shimmer
    this.partial(293.7 * 1.5, t, 0.7, 0.04, 'sine', 0.4); // hollow midrange ring
  }

  /** Great hit: short, bright, satisfying metallic "ding" with a touch of air. */
  great(): void {
    if (this.volume <= 0) return;
    const a = this.ensure();
    if (!a) return;
    const t = a.currentTime;
    this.partial(1567.98, t, 0.34, 0.2, 'sine', 0.3); // bright fundamental (G6)
    this.partial(1567.98 * 2.0, t + 0.005, 0.22, 0.1, 'sine', 0.3);
    this.partial(1567.98 * 2.93, t + 0.01, 0.14, 0.05, 'sine', 0.3); // inharmonic sparkle
    this.partial(783.99, t, 0.3, 0.07, 'sine', 0.35); // octave-down body so it isn't thin
  }

  /** Good hit: duller, lower confirmation — no sparkle, quick decay, mostly dry. */
  good(): void {
    if (this.volume <= 0) return;
    const a = this.ensure();
    if (!a) return;
    const t = a.currentTime;
    this.partial(659.3, t, 0.16, 0.1, 'sine', 0.2);
    this.partial(880.0, t + 0.004, 0.11, 0.05, 'sine', 0.2);
  }

  /** Failure: gen-explosion stinger — discordant low cluster + filtered noise burst, into the reverb. */
  fail(): void {
    if (this.volume <= 0) return;
    const a = this.ensure();
    if (!a || !this.master) return;
    const t = a.currentTime;
    this.partial(146.8, t, 0.7, 0.16, 'sawtooth', 0.5); // low discordant body
    this.partial(155.6, t, 0.62, 0.12, 'sawtooth', 0.5); // beats against it = harsh
    this.partial(98.0, t, 0.8, 0.13, 'triangle', 0.55); // deep sub
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
    src.connect(f).connect(g);
    g.connect(this.master);
    if (this.reverb) {
      const send = a.createGain();
      send.gain.value = 0.4;
      g.connect(send).connect(this.reverb);
    }
    src.start(t);
    src.stop(t + 0.42);
  }
}
