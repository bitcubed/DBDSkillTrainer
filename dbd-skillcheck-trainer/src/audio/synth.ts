// Synthesized audio stand-ins — NOT game audio (copyright; see context doc §5).
// These recreate the *character* of DBD's skill-check cues from a sound-design
// brief, layer by layer — never the copyrighted files themselves:
//   warn  ("Shh-ting")    damped dissonant metallic chime + airy noise whoosh,
//                         through a short metallic room reverb.
//   good  ("Thud/Clack")  dull muted 300–800 Hz mechanical click, bone dry.
//   great ("Tchick")      the same click + a bright 1–3 kHz metallic ping.
//   fail  ("KA-BANG-psh") 60–100 Hz distorted impact + mid-range metal clatter
//                         + a long broadband hiss tail.
// All oscillators/noise are generated at runtime; no samples ship in the repo.

import { lullabySilent } from '../engine/perks';

interface WindowWithWebkitAC extends Window {
  webkitAudioContext?: typeof AudioContext;
}

interface NoiseOpts {
  t0: number;
  dur: number;
  amp: number;
  /** Bake-in amplitude envelope: linear rise over `attack` of the duration, then exp decay. */
  attack?: number; // 0..1 fraction of dur (default ~0.02 = near-instant)
  decay?: number; // decay-curve power (higher = snappier)
  filter?: BiquadFilterType;
  f0: number;
  f1?: number; // if set, sweep cutoff f0→f1 across the burst
  q?: number;
  wet?: number; // 0..1 reverb send
}

export class Synth {
  /** 0..1 master volume. */
  volume = 0.6;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;

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

  // Master bus + a parallel short, bright convolution reverb (a small metallic
  // room — enclosed and claustrophobic, not a cathedral).
  private buildGraph(a: AudioContext): void {
    this.master = a.createGain();
    this.master.gain.value = 1;
    this.master.connect(a.destination);

    this.reverb = a.createConvolver();
    this.reverb.buffer = this.makeImpulse(a, 0.45, 2.2);
    const send = a.createGain();
    send.gain.value = 0.5;
    this.reverb.connect(send).connect(this.master);
  }

  // Impulse response: exponentially-decaying noise, only lightly low-passed so
  // the short tail stays bright/metallic.
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
        lp += 0.75 * (white - lp); // gentle LP: keep the highs crisp
        d[i] = lp * env;
      }
    }
    return buf;
  }

  // One struck/tonal partial: oscillator at f, fast attack, exponential decay.
  private tone(
    f: number,
    t0: number,
    dur: number,
    amp: number,
    type: OscillatorType = 'sine',
    wet = 0,
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
    if (wet > 0 && this.reverb) this.sendTo(g, wet);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  // A shaped noise burst (the "air", "clatter", and "hiss" layers).
  private noise(o: NoiseOpts): void {
    const a = this.ctx;
    if (!a || !this.master) return;
    const rate = a.sampleRate;
    const len = Math.max(1, Math.floor(rate * o.dur));
    const buf = a.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    const atk = Math.max(1, Math.floor(len * (o.attack ?? 0.02)));
    const decay = o.decay ?? 1.6;
    for (let i = 0; i < len; i++) {
      const env = i < atk ? i / atk : Math.pow(1 - (i - atk) / (len - atk), decay);
      d[i] = (Math.random() * 2 - 1) * env;
    }
    const src = a.createBufferSource();
    src.buffer = buf;
    const g = a.createGain();
    g.gain.value = o.amp * this.volume;
    let node: AudioNode = src;
    if (o.filter) {
      const f = a.createBiquadFilter();
      f.type = o.filter;
      f.frequency.setValueAtTime(o.f0, o.t0);
      if (o.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(o.f1, o.t0 + o.dur);
      if (o.q !== undefined) f.Q.value = o.q;
      src.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(this.master);
    if (o.wet && o.wet > 0 && this.reverb) this.sendTo(g, o.wet);
    src.start(o.t0);
    src.stop(o.t0 + o.dur + 0.05);
  }

  private sendTo(node: AudioNode, wet: number): void {
    const a = this.ctx;
    if (!a || !this.reverb) return;
    const s = a.createGain();
    s.gain.value = wet;
    node.connect(s).connect(this.reverb);
  }

  /**
   * Warning cue ("Shh-ting"): a damped, dissonant metallic/glass chime (2–4 kHz)
   * layered with a fast airy noise whoosh (5 kHz+), through the short metallic
   * room reverb. Sharp transient, medium decay, no sustain. Silent at Lullaby 5.
   */
  warn(lullaby: number): void {
    if (this.volume <= 0 || lullabySilent(lullaby)) return;
    const a = this.ensure();
    if (!a) return;
    const t = a.currentTime;
    // Layer 1 — the ring: dampened glass/metal strike, hollow & slightly dissonant.
    this.tone(2637, t, 0.22, 0.13, 'sine', 0.45); // bright fundamental (~E7)
    this.tone(2637 * 1.18, t, 0.18, 0.07, 'sine', 0.4); // dissonant overtone → "eerie"
    this.tone(3520, t + 0.002, 0.14, 0.05, 'sine', 0.35); // upper sparkle
    // Layer 2 — the air: quick aggressive high-noise whoosh.
    this.noise({
      t0: t,
      dur: 0.2,
      amp: 0.1,
      attack: 0.35, // ramp in = "whoosh"
      decay: 2.0,
      filter: 'highpass',
      f0: 4500,
      q: 0.7,
      wet: 0.3,
    });
  }

  /**
   * Good result ("Thud/Clack"): a dull, muted mechanical click, mid-low (300–800
   * Hz), fast attack and very short decay, completely dry so it blends back into
   * the action.
   */
  good(): void {
    if (this.volume <= 0) return;
    const a = this.ensure();
    if (!a) return;
    const t = a.currentTime;
    this.tone(190, t, 0.09, 0.13, 'sine', 0); // dull body
    this.noise({ t0: t, dur: 0.06, amp: 0.12, decay: 2.6, filter: 'lowpass', f0: 760, q: 0.6 }); // muted click
  }

  /**
   * Great result ("Tchick"): the same muted click as Good plus a bright, distinct
   * metallic ping (1–3 kHz) with a touch of bite — a gear locking into place.
   * Mostly dry with the faintest tail.
   */
  great(): void {
    if (this.volume <= 0) return;
    const a = this.ensure();
    if (!a) return;
    const t = a.currentTime;
    this.tone(210, t, 0.08, 0.1, 'sine', 0); // shared click body
    this.noise({ t0: t, dur: 0.05, amp: 0.1, decay: 2.8, filter: 'lowpass', f0: 900, q: 0.6 });
    this.tone(2100, t, 0.12, 0.14, 'sine', 0.12); // bright metallic ping
    this.tone(2100 * 2.0, t + 0.004, 0.07, 0.05, 'sine', 0.12); // upper-mid bite
  }

  /**
   * Failure ("KA-BANG-psshhh"): a violent three-layer rupture — a distorted
   * 60–100 Hz impact, a mid-range metal clatter, and a long broadband hiss tail
   * (sparks/steam). Extreme transient, long chaotic decay (~1.6 s).
   */
  fail(): void {
    if (this.volume <= 0) return;
    const a = this.ensure();
    if (!a) return;
    const t = a.currentTime;
    // Layer 1 — the impact: deep distorted blast (60–100 Hz), short and punchy.
    this.tone(72, t, 0.5, 0.22, 'sine', 0.3);
    this.tone(96, t, 0.42, 0.14, 'sawtooth', 0.3); // saw = grit/distortion
    this.noise({ t0: t, dur: 0.16, amp: 0.2, decay: 2.4, filter: 'lowpass', f0: 1800, f1: 200, wet: 0.3 }); // body "whump"
    // Layer 2 — the shrapnel: mid-range metal clatter.
    this.noise({
      t0: t + 0.01,
      dur: 0.45,
      amp: 0.12,
      decay: 1.4,
      filter: 'bandpass',
      f0: 1400,
      f1: 700,
      q: 1.1,
      wet: 0.35,
    });
    // Layer 3 — the aftermath: sustained broadband hiss (escaping steam/sparks).
    this.noise({
      t0: t + 0.02,
      dur: 1.6,
      amp: 0.08,
      attack: 0.04,
      decay: 1.1,
      filter: 'highpass',
      f0: 3000,
      q: 0.5,
      wet: 0.4,
    });
  }
}
