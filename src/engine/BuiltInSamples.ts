/**
 * BuiltInSamples — synthesize default drum samples for the pad grid.
 * Same synthesis approach as mpump's AudioPort drum voices.
 * No sample files needed — all generated via offline rendering.
 */

const SAMPLE_RATE = 44100;

function renderOffline(seconds: number, fn: (ctx: OfflineAudioContext) => void): Promise<Float32Array> {
  const length = Math.ceil(SAMPLE_RATE * seconds);
  const ctx = new OfflineAudioContext(1, length, SAMPLE_RATE);
  fn(ctx);
  return ctx.startRendering().then(buf => buf.getChannelData(0));
}

/** 808-style kick — pitch-swept sine with sub and click. */
export function synthKick(): Promise<Float32Array> {
  return renderOffline(0.5, (ctx) => {
    // Body: pitch-swept sine
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, 0);
    osc.frequency.exponentialRampToValueAtTime(40, 0.12);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.9, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.45);

    // Click transient
    const click = ctx.createOscillator();
    click.type = "square";
    click.frequency.value = 800;
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.3, 0);
    clickGain.gain.exponentialRampToValueAtTime(0.001, 0.015);

    osc.connect(gain).connect(ctx.destination);
    click.connect(clickGain).connect(ctx.destination);
    osc.start(0);
    click.start(0);
    osc.stop(0.5);
    click.stop(0.02);
  });
}

/** Snare — pitched tone + filtered noise. */
export function synthSnare(): Promise<Float32Array> {
  return renderOffline(0.3, (ctx) => {
    // Tone body
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 185;
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.4, 0);
    oscGain.gain.exponentialRampToValueAtTime(0.001, 0.1);

    // Noise
    const noiseLen = Math.ceil(SAMPLE_RATE * 0.3);
    const noiseBuf = ctx.createBuffer(1, noiseLen, SAMPLE_RATE);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) noiseData[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "highpass";
    noiseFilter.frequency.value = 3000;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, 0);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, 0.2);

    osc.connect(oscGain).connect(ctx.destination);
    noise.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);
    osc.start(0); osc.stop(0.15);
    noise.start(0); noise.stop(0.3);
  });
}

/** Closed hi-hat — filtered noise with metallic ring. */
export function synthHiHat(): Promise<Float32Array> {
  return renderOffline(0.1, (ctx) => {
    const noiseLen = Math.ceil(SAMPLE_RATE * 0.1);
    const noiseBuf = ctx.createBuffer(1, noiseLen, SAMPLE_RATE);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) noiseData[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 8000;
    bp.Q.value = 2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.08);

    // Metallic ring partials
    const ring = ctx.createOscillator();
    ring.type = "square";
    ring.frequency.value = 6500;
    const ringGain = ctx.createGain();
    ringGain.gain.setValueAtTime(0.08, 0);
    ringGain.gain.exponentialRampToValueAtTime(0.001, 0.05);

    noise.connect(bp).connect(gain).connect(ctx.destination);
    ring.connect(ringGain).connect(ctx.destination);
    noise.start(0); noise.stop(0.1);
    ring.start(0); ring.stop(0.06);
  });
}

/** Clap — layered noise bursts with reverb-like tail. */
export function synthClap(): Promise<Float32Array> {
  return renderOffline(0.3, (ctx) => {
    const makeNoiseBurst = (start: number, dur: number, vol: number) => {
      const len = Math.ceil(SAMPLE_RATE * dur);
      const buf = ctx.createBuffer(1, len, SAMPLE_RATE);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;

      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2500;
      bp.Q.value = 1.5;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

      src.connect(bp).connect(gain).connect(ctx.destination);
      src.start(start);
      src.stop(start + dur);
    };

    // 3 quick bursts + tail (simulates multiple hands clapping)
    makeNoiseBurst(0.000, 0.02, 0.5);
    makeNoiseBurst(0.015, 0.02, 0.4);
    makeNoiseBurst(0.030, 0.25, 0.6);
  });
}

/** Open hi-hat — longer decay than closed. */
export function synthOpenHat(): Promise<Float32Array> {
  return renderOffline(0.35, (ctx) => {
    const noiseLen = Math.ceil(SAMPLE_RATE * 0.35);
    const noiseBuf = ctx.createBuffer(1, noiseLen, SAMPLE_RATE);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) noiseData[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 7000;
    bp.Q.value = 1.5;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.3);

    noise.connect(bp).connect(gain).connect(ctx.destination);
    noise.start(0); noise.stop(0.35);
  });
}

/** Rim shot — short pitched click. */
export function synthRim(): Promise<Float32Array> {
  return renderOffline(0.08, (ctx) => {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(800, 0);
    osc.frequency.exponentialRampToValueAtTime(400, 0.03);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.7, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.06);

    osc.connect(gain).connect(ctx.destination);
    osc.start(0); osc.stop(0.08);
  });
}

/** Tom — pitched sine sweep, deeper than kick. */
export function synthTom(): Promise<Float32Array> {
  return renderOffline(0.4, (ctx) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(200, 0);
    osc.frequency.exponentialRampToValueAtTime(80, 0.15);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.7, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.35);

    osc.connect(gain).connect(ctx.destination);
    osc.start(0); osc.stop(0.4);
  });
}

/** Cymbal — long noise with shimmer partials. */
export function synthCymbal(): Promise<Float32Array> {
  return renderOffline(0.8, (ctx) => {
    const noiseLen = Math.ceil(SAMPLE_RATE * 0.8);
    const noiseBuf = ctx.createBuffer(1, noiseLen, SAMPLE_RATE);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) noiseData[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 5000;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.7);

    // Shimmer partials
    const shimmer = ctx.createOscillator();
    shimmer.type = "sine";
    shimmer.frequency.value = 5500;
    const shimGain = ctx.createGain();
    shimGain.gain.setValueAtTime(0.05, 0);
    shimGain.gain.exponentialRampToValueAtTime(0.001, 0.4);

    noise.connect(hp).connect(gain).connect(ctx.destination);
    shimmer.connect(shimGain).connect(ctx.destination);
    noise.start(0); noise.stop(0.8);
    shimmer.start(0); shimmer.stop(0.5);
  });
}

/** Generate all 8 default samples. */
export async function generateDefaultSamples(): Promise<{ name: string; buffer: Float32Array }[]> {
  const [kick, snare, hihat, clap, openHat, rim, tom, cymbal] = await Promise.all([
    synthKick(), synthSnare(), synthHiHat(), synthClap(),
    synthOpenHat(), synthRim(), synthTom(), synthCymbal(),
  ]);
  return [
    { name: "Kick", buffer: kick },
    { name: "Snare", buffer: snare },
    { name: "Hi-Hat", buffer: hihat },
    { name: "Clap", buffer: clap },
    { name: "Open HH", buffer: openHat },
    { name: "Rim", buffer: rim },
    { name: "Tom", buffer: tom },
    { name: "Cymbal", buffer: cymbal },
  ];
}
