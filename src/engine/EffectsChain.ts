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

import type { EffectParams, EffectName } from "../types";
import { DEFAULT_EFFECTS } from "../types";

// ── Curve generators ──────────────────────────────────────────────────

/**
 * Generate a soft-clip distortion curve using the formula:
 *   f(x) = (1+k)*x / (1 + k*|x|)
 * Higher drive values push signal harder into saturation.
 */
function makeDistortionCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 256;
  const curve = new Float32Array(n);
  const k = drive;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

/**
 * Generate a staircase curve that quantizes signal amplitude.
 * Fewer bits = more aggressive quantization = more lo-fi crunch.
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

/**
 * Generate a synthetic impulse response for convolution reverb.
 * Uses exponential decay of white noise — cheap but convincing.
 * The 0.3 factor in the exponent controls early-reflection density.
 */
function generateImpulseResponse(ctx: AudioContext, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.ceil(rate * decay);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (rate * decay * 0.3));
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
    this.effectOrder = ["lowpass", "compressor", "highpass", "distortion", "bitcrusher", "chorus", "phaser", "delay", "reverb"];

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
        // Node order: dry=0, wet=1, delay=2, feedback=3
        const dl = nodes[2] as DelayNode;
        const fb = nodes[3] as GainNode;
        const dry = nodes[0] as GainNode;
        const wet = nodes[1] as GainNode;
        const { time, feedback, mix, sync, division } = this.fx.delay;
        const delayTime = sync ? delayDivisionToSeconds(division, this._bpm) : time;
        dl.delayTime.setTargetAtTime(delayTime, t, RAMP);
        fb.gain.setTargetAtTime(feedback, t, RAMP);
        dry.gain.setTargetAtTime(1 - mix, t, RAMP);
        wet.gain.setTargetAtTime(mix, t, RAMP);
        return true;
      }
      case "reverb": {
        // Decay change requires new impulse response (full rebuild)
        if (this.fx.reverb.decay !== this.lastReverbDecay) return false;
        // Mix-only change: smooth crossfade between dry and wet
        const dry = nodes[0] as GainNode;
        const wet = nodes[1] as GainNode;
        dry.gain.setTargetAtTime(1 - this.fx.reverb.mix, t, RAMP);
        wet.gain.setTargetAtTime(this.fx.reverb.mix, t, RAMP);
        return true;
      }
      case "compressor": {
        const comp = nodes[0] as DynamicsCompressorNode;
        comp.threshold.setTargetAtTime(this.fx.compressor.threshold, t, RAMP);
        comp.ratio.setTargetAtTime(this.fx.compressor.ratio, t, RAMP);
        return true;
      }
      case "chorus": {
        // LFO rate/depth can't be smoothly updated here — just handle mix
        const dry = nodes[0] as GainNode;
        const wet = nodes[1] as GainNode;
        dry.gain.setTargetAtTime(1 - this.fx.chorus.mix, t, RAMP);
        wet.gain.setTargetAtTime(this.fx.chorus.mix, t, RAMP);
        return true;
      }
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
        // WaveShaper with staircase curve simulates bit depth reduction
        const ws = this.ctx.createWaveShaper();
        ws.curve = makeBitcrushCurve(this.fx.bitcrusher.bits);
        prev.connect(ws);
        this.fxNodes.push(ws);
        this.liveNodes.set("bitcrusher", [ws]);
        return ws;
      }
      case "chorus": {
        // Chorus: mix original (dry) with a modulated short delay (wet).
        // LFO modulates delay time to create pitch wobble.
        const { rate, depth, mix } = this.fx.chorus;
        const dry = this.ctx.createGain(); dry.gain.value = 1 - mix;
        const wet = this.ctx.createGain(); wet.gain.value = mix;
        const delay = this.ctx.createDelay(0.05); delay.delayTime.value = 0.01;
        const lfo = this.ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = rate;
        const lfoGain = this.ctx.createGain(); lfoGain.gain.value = depth;
        lfo.connect(lfoGain); lfoGain.connect(delay.delayTime); lfo.start();
        this.fxLFOs.push(lfo);
        const merge = this.ctx.createGain();
        prev.connect(dry); prev.connect(delay); delay.connect(wet);
        dry.connect(merge); wet.connect(merge);
        this.fxNodes.push(dry, wet, delay, lfoGain, merge);
        this.liveNodes.set("chorus", [dry, wet, delay, lfoGain, merge]);
        return merge;
      }
      case "phaser": {
        // Phaser: 4 cascaded allpass filters with LFO-modulated frequencies.
        // Mixing dry + phase-shifted wet creates moving notches in the spectrum.
        const { rate, depth } = this.fx.phaser;
        const lfo = this.ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = rate; lfo.start();
        this.fxLFOs.push(lfo);
        const dry = this.ctx.createGain(); dry.gain.value = 0.5;
        const wet = this.ctx.createGain(); wet.gain.value = 0.5;
        prev.connect(dry);
        let apPrev: AudioNode = prev;
        // Each allpass stage shifts phase at a different frequency
        for (let i = 0; i < 4; i++) {
          const ap = this.ctx.createBiquadFilter(); ap.type = "allpass"; ap.frequency.value = 1000 + i * 500;
          const lg = this.ctx.createGain(); lg.gain.value = depth; lfo.connect(lg); lg.connect(ap.frequency);
          apPrev.connect(ap); apPrev = ap; this.fxNodes.push(ap, lg);
        }
        apPrev.connect(wet);
        const merge = this.ctx.createGain(); dry.connect(merge); wet.connect(merge);
        this.fxNodes.push(dry, wet, merge);
        this.liveNodes.set("phaser", [dry, wet, merge]);
        return merge;
      }
      case "delay": {
        // Feedback delay with dry/wet mix. Supports tempo-sync via BPM.
        const { time, feedback, mix, sync, division } = this.fx.delay;
        const delayTime = sync ? delayDivisionToSeconds(division, this._bpm) : time;
        const dry = this.ctx.createGain(); dry.gain.value = 1 - mix;
        const wet = this.ctx.createGain(); wet.gain.value = mix;
        const dl = this.ctx.createDelay(2); dl.delayTime.value = delayTime;
        const fb = this.ctx.createGain(); fb.gain.value = feedback;
        // Feedback loop: delay → feedback gain → delay (creates repeating echoes)
        prev.connect(dry); prev.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet);
        const merge = this.ctx.createGain(); dry.connect(merge); wet.connect(merge);
        this.fxNodes.push(dry, wet, dl, fb, merge);
        this.liveNodes.set("delay", [dry, wet, dl, fb, merge]);
        return merge;
      }
      case "reverb": {
        // Convolution reverb using a synthetic impulse response.
        // IR is regenerated only when decay time changes.
        const { decay, mix } = this.fx.reverb;
        this.lastReverbDecay = decay;
        const dry = this.ctx.createGain(); dry.gain.value = 1 - mix;
        const wet = this.ctx.createGain(); wet.gain.value = mix;
        const conv = this.ctx.createConvolver(); conv.buffer = generateImpulseResponse(this.ctx, decay);
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
