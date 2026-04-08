/**
 * EffectsChain — per-track configurable audio effects chain.
 * Ported from mpump AudioPort.ts.
 *
 * 9 effects in series: lowpass, compressor, highpass, distortion,
 * bitcrusher, chorus, phaser, delay, reverb.
 *
 * Each effect can be toggled on/off independently. Active effects are
 * wired in series; inactive ones are bypassed. The chain rebuilds its
 * Web Audio graph when effects are toggled, but uses smooth parameter
 * ramping (setTargetAtTime) for knob tweaks to avoid clicks.
 */

import type { EffectParams, EffectName, ReverbType } from "../types";
import { DEFAULT_EFFECTS } from "../types";

// ── Curve generators (ported from mpump drumSynth.ts) ────────────────

/**
 * Generate a distortion curve for WaveShaperNode.
 * Soft-clip base + subtle asymmetric term for even-harmonic (tube) warmth.
 * 1024 samples for smooth clipping (ported from mpump).
 */
function makeDistortionCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = drive;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    const base = ((1 + k) * x) / (1 + k * Math.abs(x));
    const asym = 0.05 * x * Math.exp(-x * x * 4);
    curve[i] = base + asym;
  }
  return curve;
}

/**
 * Generate a staircase curve for bit-depth reduction.
 * 65536 samples to minimize resampling artifacts (ported from mpump).
 */
function makeBitcrushCurve(bits: number): Float32Array<ArrayBuffer> {
  const n = 65536;
  const curve = new Float32Array(n);
  const steps = Math.pow(2, bits);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.round(x * steps) / steps;
  }
  return curve;
}

// Tiny seeded PRNG for reproducible IRs (ported from mpump).
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// Per-type impulse response parameters for algorithmic reverb (from mpump).
const REVERB_PRESETS: Record<ReverbType, {
  erTimes: number[]; erGains: number[]; erStereo: number;
  predelay: number; tailBright: number; diffStages: number;
  apDelays: number[]; apGain: number; density: number;
}> = {
  room: {
    erTimes: [0.007, 0.013, 0.019, 0.027, 0.037, 0.048, 0.061, 0.079],
    erGains: [0.85, 0.72, 0.60, 0.50, 0.40, 0.32, 0.25, 0.18],
    erStereo: 0.002, predelay: 0.06, tailBright: 0.6,
    diffStages: 2, apDelays: [0.0037, 0.0113], apGain: 0.6, density: 2.0,
  },
  hall: {
    erTimes: [0.012, 0.024, 0.038, 0.055, 0.074, 0.096, 0.121, 0.150, 0.183, 0.220],
    erGains: [0.90, 0.78, 0.67, 0.57, 0.48, 0.40, 0.33, 0.27, 0.22, 0.17],
    erStereo: 0.004, predelay: 0.10, tailBright: 0.4,
    diffStages: 3, apDelays: [0.0047, 0.0137, 0.0211], apGain: 0.65, density: 2.5,
  },
  plate: {
    erTimes: [0.002, 0.005, 0.008, 0.012, 0.017, 0.023],
    erGains: [0.95, 0.85, 0.75, 0.65, 0.55, 0.45],
    erStereo: 0.001, predelay: 0.01, tailBright: 0.85,
    diffStages: 4, apDelays: [0.0013, 0.0037, 0.0067, 0.0097], apGain: 0.7, density: 3.0,
  },
  spring: {
    erTimes: [0.003, 0.030, 0.033, 0.060, 0.063, 0.090],
    erGains: [0.90, 0.70, 0.65, 0.50, 0.45, 0.35],
    erStereo: 0.0005, predelay: 0.03, tailBright: 0.5,
    diffStages: 2, apDelays: [0.0029, 0.0089], apGain: 0.55, density: 1.8,
  },
};

/**
 * Generate a synthetic impulse response for reverb (ported from mpump).
 * Models early reflections, diffuse tail, allpass diffusion, and a
 * DC-blocking filter. Replaces mloop's previous noise-decay IR.
 */
function generateImpulseResponse(ctx: AudioContext, decay: number, type: ReverbType = "room"): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.ceil(rate * decay);
  const buf = ctx.createBuffer(2, len, rate);
  const rand = seededRandom(7919);
  const p = REVERB_PRESETS[type];

  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);

    // Early reflections
    for (let r = 0; r < p.erTimes.length; r++) {
      const offset = ch === 0 ? 0 : p.erStereo * (r % 3 === 0 ? 1 : -1);
      const sampleIdx = Math.round((p.erTimes[r] + offset) * rate);
      if (sampleIdx < len) {
        data[sampleIdx] += p.erGains[r] * (ch === 0 ? 1 : -1 + 2 * (r % 2));
      }
    }

    // Late diffuse tail
    const predelay = Math.round(p.predelay * rate);
    const decayRate = 1 / (rate * decay * 0.45);
    for (let i = predelay; i < len; i++) {
      data[i] += (rand() * 2 - 1) * p.density * Math.exp(-(i - predelay) * decayRate);
    }

    // Brightness filter (one-pole LP on tail)
    if (p.tailBright < 1) {
      let lpPrev = 0;
      const alpha = p.tailBright;
      for (let i = predelay; i < len; i++) {
        data[i] = lpPrev = lpPrev + alpha * (data[i] - lpPrev);
      }
    }

    // Allpass diffusion (Schroeder-style)
    for (let stage = 0; stage < p.diffStages; stage++) {
      const apDelay = Math.round(p.apDelays[stage] * rate);
      const apBuf = new Float32Array(apDelay);
      let apIdx = 0;
      for (let i = 0; i < len; i++) {
        const delayed = apBuf[apIdx];
        const input = data[i];
        const out = -input * p.apGain + delayed;
        apBuf[apIdx] = input + delayed * p.apGain;
        data[i] = out;
        apIdx = (apIdx + 1) % apDelay;
      }
    }

    // DC-blocking filter
    let dcX1 = 0, dcY1 = 0;
    for (let i = 0; i < len; i++) {
      const x = data[i];
      dcY1 = x - dcX1 + 0.995 * dcY1;
      dcX1 = x;
      data[i] = dcY1;
    }
  }
  return buf;
}

/**
 * Convert a musical note division to delay time in seconds.
 * Enables tempo-synced delay (e.g., 1/8 note at 120 BPM = 250ms).
 */
function delayDivisionToSeconds(division: string, bpm: number): number {
  const beat = 60 / bpm;
  switch (division) {
    case "1/2": return beat * 2;
    case "1/4": return beat;
    case "1/8": return beat / 2;
    case "1/8d": return beat * 0.75;  // dotted eighth
    case "1/16": return beat / 4;
    case "1/32": return beat / 8;
    default: return beat / 4;
  }
}

// ── EffectsChain class ───────────────────────────────────────────────────

export class EffectsChain {
  private ctx: AudioContext;
  private inputNode: GainNode;
  private outputNode: AudioNode;
  private fx: EffectParams;
  /** Order effects are wired in series — user can reorder for creative routing. */
  private effectOrder: EffectName[];
  private fxNodes: AudioNode[] = [];
  private fxLFOs: OscillatorNode[] = [];
  private _bpm = 120;
  private lastReverbDecay = 2; // cache decay to detect when IR needs regeneration
  private lastReverbType: ReverbType = "room"; // cache type to detect IR regen
  /**
   * Live node references for smooth parameter updates.
   * When a knob is dragged, we ramp AudioParams directly instead of
   * rebuilding the entire graph (which would cause audio glitches).
   */
  private liveNodes: Map<EffectName, AudioNode[]> = new Map();

  constructor(ctx: AudioContext, inputNode: GainNode, outputNode: AudioNode) {
    this.ctx = ctx;
    this.inputNode = inputNode;
    this.outputNode = outputNode;
    this.fx = structuredClone(DEFAULT_EFFECTS);
    // Chain order mirrors mpump's kaos grid order. lowpass + highpass sit at
    // the front of the list (not rendered in the grid but used by the XY pad).
    this.effectOrder = [
      "lowpass",
      "highpass",
      "delay",
      "distortion",
      "reverb",
      "compressor",
      "flanger",
      "duck",
      "chorus",
      "phaser",
      "bitcrusher",
      "tremolo",
    ];

    // Initial chain: straight wire from input → output (no effects active)
    this.inputNode.connect(this.outputNode);
  }

  get bpm(): number {
    return this._bpm;
  }

  /** Update BPM — triggers chain rebuild if tempo-synced delay is active. */
  set bpm(v: number) {
    this._bpm = v;
    if (this.fx.delay.on && this.fx.delay.sync) {
      this.rebuildFxChain();
    }
  }

  /** Get a snapshot of current effect parameters (for UI display). */
  getEffects(): EffectParams {
    return this.fx;
  }

  /**
   * Update parameters for a single effect.
   * Tries smooth AudioParam ramping first; falls back to full rebuild
   * for changes that require new nodes (e.g., toggling on/off).
   */
  setEffect<K extends EffectName>(name: K, params: Partial<EffectParams[K]>): void {
    const wasOn = this.fx[name].on;
    this.fx[name] = { ...this.fx[name], ...params } as EffectParams[K];
    const isOn = this.fx[name].on;

    // On/off toggle requires rewiring the graph
    if (wasOn !== isOn) {
      this.rebuildFxChain();
      return;
    }

    // Try smooth update on live nodes (avoids clicks during knob drags)
    if (isOn && this.updateLiveParams(name)) {
      return;
    }

    // Fallback: full rebuild for effects without smooth update support
    if (isOn) {
      this.rebuildFxChain();
    }
  }

  /**
   * Smoothly update AudioParams on live nodes using setTargetAtTime.
   * Returns true if the update was handled without needing a rebuild.
   */
  private updateLiveParams(name: EffectName): boolean {
    const nodes = this.liveNodes.get(name);
    if (!nodes || nodes.length === 0) return false;
    const t = this.ctx.currentTime;
    const RAMP = 0.02; // 20ms smooth ramp to avoid zipper noise

    switch (name) {
      case "lowpass": {
        const lp = nodes[0] as BiquadFilterNode;
        lp.frequency.setTargetAtTime(Math.min(this.fx.lowpass.cutoff, 12000), t, RAMP);
        lp.Q.setTargetAtTime(Math.min(this.fx.lowpass.q, 15), t, RAMP);
        return true;
      }
      case "highpass": {
        const hp = nodes[0] as BiquadFilterNode;
        hp.frequency.setTargetAtTime(this.fx.highpass.cutoff, t, RAMP);
        hp.Q.setTargetAtTime(this.fx.highpass.q, t, RAMP);
        return true;
      }
      case "distortion": {
        // Drive changes the waveshaper curve shape — regenerate curve data
        const ws = nodes[0] as WaveShaperNode;
        ws.curve = makeDistortionCurve(this.fx.distortion.drive);
        // Compensate output gain inversely to drive to maintain perceived volume
        if (nodes[1]) (nodes[1] as GainNode).gain.setTargetAtTime(0.3 / (1 + this.fx.distortion.drive * 0.03), t, RAMP);
        return true;
      }
      case "delay": {
        // Node order: dry=0, wetGain=1, dlL=2, fbLR=3
        const dlL = nodes[2] as DelayNode;
        const fbLR = nodes[3] as GainNode;
        const dry = nodes[0] as GainNode;
        const wetGain = nodes[1] as GainNode;
        const { time, feedback, mix, sync, division } = this.fx.delay;
        const delayTime = sync ? delayDivisionToSeconds(division, this._bpm) : time;
        dlL.delayTime.setTargetAtTime(delayTime, t, RAMP);
        fbLR.gain.setTargetAtTime(feedback, t, RAMP);
        dry.gain.setTargetAtTime(1 - mix, t, RAMP);
        wetGain.gain.setTargetAtTime(mix, t, RAMP);
        return true;
      }
      case "reverb": {
        // Decay or type change requires new impulse response (full rebuild)
        const curType: ReverbType = this.fx.reverb.type ?? "room";
        if (this.fx.reverb.decay !== this.lastReverbDecay || curType !== this.lastReverbType) return false;
        // Mix-only change: smooth crossfade (mpump gain staging: dry=1-mix*0.5, wet=mix*1.5)
        const dry = nodes[0] as GainNode;
        const wet = nodes[1] as GainNode;
        dry.gain.setTargetAtTime(1 - this.fx.reverb.mix * 0.5, t, RAMP);
        wet.gain.setTargetAtTime(this.fx.reverb.mix * 1.5, t, RAMP);
        return true;
      }
      case "compressor": {
        const comp = nodes[0] as DynamicsCompressorNode;
        comp.threshold.setTargetAtTime(this.fx.compressor.threshold, t, RAMP);
        comp.ratio.setTargetAtTime(this.fx.compressor.ratio, t, RAMP);
        return true;
      }
      case "chorus": {
        // 3-voice: dry=0, wetL=1, wetC=2, wetR=3
        const dry = nodes[0] as GainNode;
        const wetL = nodes[1] as GainNode;
        const wetC = nodes[2] as GainNode;
        const wetR = nodes[3] as GainNode;
        const mix = this.fx.chorus.mix;
        dry.gain.setTargetAtTime(1 - mix, t, RAMP);
        wetL.gain.setTargetAtTime(mix * 0.7, t, RAMP);
        wetC.gain.setTargetAtTime(mix * 0.5, t, RAMP);
        wetR.gain.setTargetAtTime(mix * 0.7, t, RAMP);
        return true;
      }
      case "bitcrusher": {
        const ws = nodes[0] as WaveShaperNode;
        const preGain = nodes[1] as GainNode | undefined;
        const postGain = nodes[2] as GainNode | undefined;
        ws.curve = makeBitcrushCurve(this.fx.bitcrusher.bits);
        if (preGain && postGain) {
          const pre = 1 + (16 - this.fx.bitcrusher.bits) * 0.15;
          preGain.gain.setTargetAtTime(pre, t, RAMP);
          postGain.gain.setTargetAtTime(1 / pre, t, RAMP);
        }
        return true;
      }
      case "phaser": {
        // Can't smoothly update allpass chain — only handle via rebuild
        return false;
      }
      case "flanger": {
        // Node order: dry=0, wet=1, fb=2, lfoGain=3
        const dry = nodes[0] as GainNode;
        const wet = nodes[1] as GainNode;
        const fb = nodes[2] as GainNode;
        const lfoGain = nodes[3] as GainNode;
        const p = this.fx.flanger;
        dry.gain.setTargetAtTime(1 - p.mix, t, RAMP);
        wet.gain.setTargetAtTime(p.mix, t, RAMP);
        fb.gain.setTargetAtTime(Math.min(p.feedback, 0.95), t, RAMP);
        lfoGain.gain.setTargetAtTime(p.depth * 0.003, t, RAMP);
        // Rate changes need a new oscillator — fall through to rebuild
        return false;
      }
      case "tremolo": {
        // Depth can ramp; rate/shape need rebuild
        const tremGain = nodes[0] as GainNode;
        const lfoGain = nodes[1] as GainNode;
        const p = this.fx.tremolo;
        tremGain.gain.setTargetAtTime(1 - p.depth * 0.5, t, RAMP);
        lfoGain.gain.setTargetAtTime(p.depth * 0.5, t, RAMP);
        return false;
      }
      case "duck":
        // Passthrough — nothing to update
        return true;
      default:
        return false;
    }
  }

  /** Reorder the effect chain (e.g., put delay before distortion). */
  setEffectOrder(order: EffectName[]): void {
    this.effectOrder = order;
    this.rebuildFxChain();
  }

  /** Get the current effect processing order. */
  getEffectOrder(): EffectName[] {
    return [...this.effectOrder];
  }

  /** Check if any effect is currently active (for UI indicators). */
  hasActiveEffects(): boolean {
    return this.effectOrder.some((name) => this.fx[name].on);
  }

  // ── Chain rebuild ─────────────────────────────────────────────────────

  /**
   * Tear down the current audio graph and rebuild from scratch.
   * Called when effects are toggled on/off or when smooth update isn't possible.
   * Briefly disconnects audio — but Web Audio handles this gracefully.
   */
  private rebuildFxChain(): void {
    // Disconnect old chain
    this.inputNode.disconnect();
    for (const n of this.fxNodes) {
      try { n.disconnect(); } catch { /* already disconnected */ }
    }
    for (const lfo of this.fxLFOs) {
      try { lfo.stop(); lfo.disconnect(); } catch { /* already stopped */ }
    }
    this.fxNodes = [];
    this.fxLFOs = [];
    this.liveNodes.clear();

    // Wire active effects in series: input → [fx1 → fx2 → ...] → output
    let prev: AudioNode = this.inputNode;

    for (const name of this.effectOrder) {
      if (!this.fx[name].on) continue;
      prev = this.buildEffect(name, prev);
    }

    prev.connect(this.outputNode);
  }

  // ── Effect builders ───────────────────────────────────────────────────

  /**
   * Build and wire a single effect into the chain.
   * Returns the output node to connect the next effect to.
   */
  private buildEffect(name: EffectName, prev: AudioNode): AudioNode {
    switch (name) {
      case "lowpass": {
        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass";
        // Cap at 12kHz to prevent unstable filter behavior near Nyquist
        lp.frequency.value = Math.min(this.fx.lowpass.cutoff, 12000);
        lp.Q.value = Math.min(this.fx.lowpass.q, 15);
        prev.connect(lp);
        this.fxNodes.push(lp);
        this.liveNodes.set("lowpass", [lp]);
        return lp;
      }
      case "compressor": {
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = this.fx.compressor.threshold;
        comp.ratio.value = this.fx.compressor.ratio;
        comp.attack.value = 0.003;   // fast attack for transient taming
        comp.release.value = 0.25;
        prev.connect(comp);
        this.fxNodes.push(comp);
        this.liveNodes.set("compressor", [comp]);
        return comp;
      }
      case "highpass": {
        const hp = this.ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = this.fx.highpass.cutoff;
        hp.Q.value = this.fx.highpass.q;
        prev.connect(hp);
        this.fxNodes.push(hp);
        this.liveNodes.set("highpass", [hp]);
        return hp;
      }
      case "distortion": {
        // WaveShaper for saturation + gain compensation to keep perceived volume stable
        const ws = this.ctx.createWaveShaper();
        ws.curve = makeDistortionCurve(this.fx.distortion.drive);
        ws.oversample = "4x"; // upsample to reduce aliasing artifacts
        const comp = this.ctx.createGain();
        comp.gain.value = 0.3 / (1 + this.fx.distortion.drive * 0.03);
        prev.connect(ws);
        ws.connect(comp);
        this.fxNodes.push(ws, comp);
        this.liveNodes.set("distortion", [ws, comp]);
        return comp;
      }
      case "bitcrusher": {
        // WaveShaper with staircase curve simulates bit depth reduction.
        // Pre/post gain compensates for perceived level loss at low bit counts (mpump).
        const preGain = this.ctx.createGain();
        preGain.gain.value = 1 + (16 - this.fx.bitcrusher.bits) * 0.15;
        const ws = this.ctx.createWaveShaper();
        ws.curve = makeBitcrushCurve(this.fx.bitcrusher.bits);
        const postGain = this.ctx.createGain();
        postGain.gain.value = 1 / preGain.gain.value;
        prev.connect(preGain);
        preGain.connect(ws);
        ws.connect(postGain);
        this.fxNodes.push(preGain, ws, postGain);
        this.liveNodes.set("bitcrusher", [ws, preGain, postGain]);
        return postGain;
      }
      case "chorus": {
        // 3-voice stereo chorus (ported from mpump): L/center/R delay lines
        // with offset LFOs plus ~20% feedback for a richer ensemble.
        const { rate, depth, mix } = this.fx.chorus;
        const dry = this.ctx.createGain(); dry.gain.value = 1 - mix;
        const wetL = this.ctx.createGain(); wetL.gain.value = mix * 0.7;
        const wetC = this.ctx.createGain(); wetC.gain.value = mix * 0.5;
        const wetR = this.ctx.createGain(); wetR.gain.value = mix * 0.7;
        const delayL = this.ctx.createDelay(0.05); delayL.delayTime.value = 0.012;
        const delayC = this.ctx.createDelay(0.05); delayC.delayTime.value = 0.010;
        const delayR = this.ctx.createDelay(0.05); delayR.delayTime.value = 0.008;
        // Feedback loops on L/R for denser ensemble
        const fbL = this.ctx.createGain(); fbL.gain.value = 0.2;
        const fbR = this.ctx.createGain(); fbR.gain.value = 0.2;
        delayL.connect(fbL); fbL.connect(delayL);
        delayR.connect(fbR); fbR.connect(delayR);
        // LFO L (sine)
        const lfoL = this.ctx.createOscillator(); lfoL.type = "sine"; lfoL.frequency.value = rate;
        const lfoGainL = this.ctx.createGain(); lfoGainL.gain.value = depth;
        lfoL.connect(lfoGainL); lfoGainL.connect(delayL.delayTime); lfoL.start();
        // LFO Center (triangle, slightly slower for movement)
        const lfoC = this.ctx.createOscillator(); lfoC.type = "triangle"; lfoC.frequency.value = rate * 0.7;
        const lfoGainC = this.ctx.createGain(); lfoGainC.gain.value = depth * 0.6;
        lfoC.connect(lfoGainC); lfoGainC.connect(delayC.delayTime); lfoC.start();
        // LFO R (sine, quarter-period offset for 90° phase)
        const lfoR = this.ctx.createOscillator(); lfoR.type = "sine"; lfoR.frequency.value = rate;
        const lfoGainR = this.ctx.createGain(); lfoGainR.gain.value = depth;
        const quarterPeriod = 1 / (4 * Math.max(rate, 0.01));
        lfoR.connect(lfoGainR); lfoGainR.connect(delayR.delayTime);
        lfoR.start(this.ctx.currentTime + quarterPeriod);
        this.fxLFOs.push(lfoL, lfoC, lfoR);
        // Pan: L=-0.8, center=0, R=0.8
        const panL = this.ctx.createStereoPanner(); panL.pan.value = -0.8;
        const panR = this.ctx.createStereoPanner(); panR.pan.value = 0.8;
        prev.connect(dry);
        prev.connect(delayL); delayL.connect(wetL); wetL.connect(panL);
        prev.connect(delayC); delayC.connect(wetC);
        prev.connect(delayR); delayR.connect(wetR); wetR.connect(panR);
        const merge = this.ctx.createGain();
        dry.connect(merge); panL.connect(merge); wetC.connect(merge); panR.connect(merge);
        this.fxNodes.push(dry, wetL, wetC, wetR, delayL, delayC, delayR, fbL, fbR, lfoGainL, lfoGainC, lfoGainR, panL, panR, merge);
        this.liveNodes.set("chorus", [dry, wetL, wetC, wetR]);
        return merge;
      }
      case "phaser": {
        // 6-stage allpass phaser (ported from mpump).
        // LFO depth scaled to 30% of each stage's center freq — prevents
        // negative frequencies and keeps the sweep musical across the spectrum.
        const { rate, depth } = this.fx.phaser;
        const lfo = this.ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = rate; lfo.start();
        this.fxLFOs.push(lfo);
        const dry = this.ctx.createGain(); dry.gain.value = 0.5;
        const wet = this.ctx.createGain(); wet.gain.value = 0.5;
        prev.connect(dry);
        let apPrev: AudioNode = prev;
        const apFreqs = [200, 450, 1000, 2200, 4800, 10000];
        for (let i = 0; i < 6; i++) {
          const ap = this.ctx.createBiquadFilter(); ap.type = "allpass"; ap.frequency.value = apFreqs[i];
          const lg = this.ctx.createGain(); lg.gain.value = apFreqs[i] * 0.3 * (depth / 1000);
          lfo.connect(lg); lg.connect(ap.frequency);
          apPrev.connect(ap); apPrev = ap; this.fxNodes.push(ap, lg);
        }
        apPrev.connect(wet);
        const merge = this.ctx.createGain(); dry.connect(merge); wet.connect(merge);
        this.fxNodes.push(dry, wet, merge);
        this.liveNodes.set("phaser", [dry, wet, merge]);
        return merge;
      }
      case "delay": {
        // Stereo ping-pong delay: alternates L/R with cross-feedback
        const { time, feedback, mix, sync, division } = this.fx.delay;
        const delayTime = sync ? delayDivisionToSeconds(division, this._bpm) : time;
        const dry = this.ctx.createGain(); dry.gain.value = 1 - mix;
        const wetGain = this.ctx.createGain(); wetGain.gain.value = mix;
        // Two delay taps at equal time
        const dlL = this.ctx.createDelay(2); dlL.delayTime.value = delayTime;
        const dlR = this.ctx.createDelay(2); dlR.delayTime.value = delayTime;
        // Cross-feedback: L → R → L (ping-pong)
        const fbLR = this.ctx.createGain(); fbLR.gain.value = feedback;
        const fbRL = this.ctx.createGain(); fbRL.gain.value = feedback;
        dlL.connect(fbLR); fbLR.connect(dlR);
        dlR.connect(fbRL); fbRL.connect(dlL);
        // Pan delay outputs L/R
        const panL = this.ctx.createStereoPanner(); panL.pan.value = -1;
        const panR = this.ctx.createStereoPanner(); panR.pan.value = 1;
        dlL.connect(panL); dlR.connect(panR);
        // Mix into output
        const wetMerge = this.ctx.createGain();
        panL.connect(wetMerge); panR.connect(wetMerge);
        wetMerge.connect(wetGain);
        // Input feeds into left delay first
        prev.connect(dry); prev.connect(dlL);
        const merge = this.ctx.createGain(); dry.connect(merge); wetGain.connect(merge);
        this.fxNodes.push(dry, wetGain, dlL, dlR, fbLR, fbRL, panL, panR, wetMerge, merge);
        this.liveNodes.set("delay", [dry, wetGain, dlL, fbLR, merge]);
        return merge;
      }
      case "flanger": {
        // Flanger: short delay (~3ms) + LFO + high feedback = metallic sweep.
        // Ported from mpump AudioPort.ts.
        const { rate, depth, feedback, mix } = this.fx.flanger;
        const dry = this.ctx.createGain(); dry.gain.value = 1 - mix;
        const wet = this.ctx.createGain(); wet.gain.value = mix;
        const delay = this.ctx.createDelay(0.02);
        delay.delayTime.value = 0.003; // 3ms center
        const fb = this.ctx.createGain(); fb.gain.value = Math.min(feedback, 0.95);
        delay.connect(fb); fb.connect(delay); // feedback loop
        const lfo = this.ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = rate;
        const lfoGain = this.ctx.createGain(); lfoGain.gain.value = depth * 0.003; // ±3ms sweep
        lfo.connect(lfoGain); lfoGain.connect(delay.delayTime); lfo.start();
        this.fxLFOs.push(lfo);
        prev.connect(dry); prev.connect(delay); delay.connect(wet);
        const merge = this.ctx.createGain(); dry.connect(merge); wet.connect(merge);
        this.fxNodes.push(dry, wet, delay, fb, lfoGain, merge);
        this.liveNodes.set("flanger", [dry, wet, fb, lfoGain]);
        return merge;
      }
      case "tremolo": {
        // Tremolo: LFO modulates amplitude. Shape sine = smooth wobble,
        // square = hard gate. Ported from mpump.
        const { rate, depth, shape } = this.fx.tremolo;
        const lfo = this.ctx.createOscillator();
        lfo.type = shape === "square" ? "square" : "sine";
        lfo.frequency.value = rate;
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = depth * 0.5;
        const tremGain = this.ctx.createGain();
        tremGain.gain.value = 1 - depth * 0.5; // centre around (1 - depth/2)
        lfo.connect(lfoGain); lfoGain.connect(tremGain.gain);
        lfo.start();
        this.fxLFOs.push(lfo);
        prev.connect(tremGain);
        this.fxNodes.push(lfoGain, tremGain);
        this.liveNodes.set("tremolo", [tremGain, lfoGain]);
        return tremGain;
      }
      case "duck": {
        // Sidechain duck is a UI placeholder — mpump handles real ducking
        // as gain automation outside the effect chain, and mloop has no
        // kick reference to sidechain from in the looper. Rendered as a
        // passthrough so chain reordering stays consistent.
        return prev;
      }
      case "reverb": {
        // Convolution reverb with algorithmic IR (room/hall/plate/spring).
        // Gain staging from mpump: dry=1-mix*0.5, wet=mix*1.5 for a louder wet tail.
        const { decay, mix } = this.fx.reverb;
        const type: ReverbType = this.fx.reverb.type ?? "room";
        this.lastReverbDecay = decay;
        this.lastReverbType = type;
        const dry = this.ctx.createGain(); dry.gain.value = 1 - mix * 0.5;
        const wet = this.ctx.createGain(); wet.gain.value = mix * 1.5;
        const conv = this.ctx.createConvolver();
        conv.buffer = generateImpulseResponse(this.ctx, decay, type);
        prev.connect(dry); prev.connect(conv); conv.connect(wet);
        const merge = this.ctx.createGain(); dry.connect(merge); wet.connect(merge);
        this.fxNodes.push(dry, wet, conv, merge);
        this.liveNodes.set("reverb", [dry, wet, conv, merge]);
        return merge;
      }
    }
  }

  /** Disconnect and clean up all nodes — call on track disposal. */
  destroy(): void {
    for (const n of this.fxNodes) {
      try { n.disconnect(); } catch { /* ok */ }
    }
    for (const lfo of this.fxLFOs) {
      try { lfo.stop(); lfo.disconnect(); } catch { /* ok */ }
    }
    this.fxNodes = [];
    this.fxLFOs = [];
  }
}
