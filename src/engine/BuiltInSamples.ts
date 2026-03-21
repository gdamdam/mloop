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

// ── Additional synth helpers for genre presets ──────────────────────────

/** 808 sub bass kick — very low, long sustain. */
function synth808Sub(): Promise<Float32Array> {
  return renderOffline(0.8, (ctx) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(80, 0);
    osc.frequency.exponentialRampToValueAtTime(30, 0.3);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.95, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.7);
    osc.connect(gain).connect(ctx.destination);
    osc.start(0); osc.stop(0.8);
  });
}

/** Snap — short filtered click. */
function synthSnap(): Promise<Float32Array> {
  return renderOffline(0.06, (ctx) => {
    const len = Math.ceil(SAMPLE_RATE * 0.06);
    const buf = ctx.createBuffer(1, len, SAMPLE_RATE);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 4000; bp.Q.value = 3;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.04);
    src.connect(bp).connect(gain).connect(ctx.destination);
    src.start(0); src.stop(0.06);
  });
}

/** Zap — descending saw sweep. */
function synthZap(): Promise<Float32Array> {
  return renderOffline(0.15, (ctx) => {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(2000, 0);
    osc.frequency.exponentialRampToValueAtTime(100, 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(0); osc.stop(0.15);
  });
}

/** Perc — pitched resonant click. */
function synthPerc(): Promise<Float32Array> {
  return renderOffline(0.12, (ctx) => {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(500, 0);
    osc.frequency.exponentialRampToValueAtTime(200, 0.08);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(0); osc.stop(0.12);
  });
}

/** Deep kick — house-style. */
function synthDeepKick(): Promise<Float32Array> {
  return renderOffline(0.4, (ctx) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, 0);
    osc.frequency.exponentialRampToValueAtTime(45, 0.08);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.9, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(0); osc.stop(0.4);
  });
}

/** Shaker — rapid filtered noise. */
function synthShaker(): Promise<Float32Array> {
  return renderOffline(0.08, (ctx) => {
    const len = Math.ceil(SAMPLE_RATE * 0.08);
    const buf = ctx.createBuffer(1, len, SAMPLE_RATE);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 6000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.06);
    src.connect(hp).connect(gain).connect(ctx.destination);
    src.start(0); src.stop(0.08);
  });
}

/** Conga — pitched sine with body. */
function synthConga(): Promise<Float32Array> {
  return renderOffline(0.25, (ctx) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(280, 0);
    osc.frequency.exponentialRampToValueAtTime(150, 0.1);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(0); osc.stop(0.25);
  });
}

/** Ride — long metallic shimmer. */
function synthRide(): Promise<Float32Array> {
  return renderOffline(0.6, (ctx) => {
    const len = Math.ceil(SAMPLE_RATE * 0.6);
    const buf = ctx.createBuffer(1, len, SAMPLE_RATE);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 5500; bp.Q.value = 3;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.5);
    src.connect(bp).connect(gain).connect(ctx.destination);
    src.start(0); src.stop(0.6);
  });
}

/** Dusty kick — muffled, lo-fi. */
function synthDustyKick(): Promise<Float32Array> {
  return renderOffline(0.35, (ctx) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(100, 0);
    osc.frequency.exponentialRampToValueAtTime(35, 0.15);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 400;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.7, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.3);
    osc.connect(lp).connect(gain).connect(ctx.destination);
    osc.start(0); osc.stop(0.35);
  });
}

/** Brush — soft noise sweep. */
function synthBrush(): Promise<Float32Array> {
  return renderOffline(0.15, (ctx) => {
    const len = Math.ceil(SAMPLE_RATE * 0.15);
    const buf = ctx.createBuffer(1, len, SAMPLE_RATE);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.12);
    src.connect(lp).connect(gain).connect(ctx.destination);
    src.start(0); src.stop(0.15);
  });
}

/** Chime — high sine with harmonic. */
function synthChime(): Promise<Float32Array> {
  return renderOffline(0.5, (ctx) => {
    const osc1 = ctx.createOscillator(); osc1.type = "sine"; osc1.frequency.value = 1200;
    const osc2 = ctx.createOscillator(); osc2.type = "sine"; osc2.frequency.value = 1800;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.4);
    osc1.connect(gain); osc2.connect(gain); gain.connect(ctx.destination);
    osc1.start(0); osc2.start(0); osc1.stop(0.5); osc2.stop(0.5);
  });
}

/** Thud — very low muffled impact. */
function synthThud(): Promise<Float32Array> {
  return renderOffline(0.2, (ctx) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(60, 0);
    osc.frequency.exponentialRampToValueAtTime(25, 0.1);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.8, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.15);
    osc.connect(lp).connect(gain).connect(ctx.destination);
    osc.start(0); osc.stop(0.2);
  });
}

/** Metal hit — industrial anvil. */
function synthAnvil(): Promise<Float32Array> {
  return renderOffline(0.3, (ctx) => {
    const osc = ctx.createOscillator(); osc.type = "square"; osc.frequency.value = 300;
    const osc2 = ctx.createOscillator(); osc2.type = "sawtooth"; osc2.frequency.value = 743;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.25);
    const ws = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = (i*2)/256-1; curve[i] = Math.tanh(x*3); }
    ws.curve = curve;
    osc.connect(ws); osc2.connect(ws); ws.connect(gain).connect(ctx.destination);
    osc.start(0); osc2.start(0); osc.stop(0.3); osc2.stop(0.3);
  });
}

/** Buzz — distorted noise burst. */
function synthBuzz(): Promise<Float32Array> {
  return renderOffline(0.1, (ctx) => {
    const osc = ctx.createOscillator(); osc.type = "sawtooth"; osc.frequency.value = 80;
    const ws = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = (i*2)/256-1; curve[i] = Math.sign(x) * Math.pow(Math.abs(x), 0.3); }
    ws.curve = curve;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.08);
    osc.connect(ws).connect(gain).connect(ctx.destination);
    osc.start(0); osc.stop(0.1);
  });
}

/** Glitch — random pitch burst. */
function synthGlitch(): Promise<Float32Array> {
  return renderOffline(0.08, (ctx) => {
    const osc = ctx.createOscillator(); osc.type = "square";
    osc.frequency.setValueAtTime(1500, 0);
    osc.frequency.setValueAtTime(300, 0.02);
    osc.frequency.setValueAtTime(3000, 0.04);
    osc.frequency.setValueAtTime(200, 0.06);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.07);
    osc.connect(gain).connect(ctx.destination);
    osc.start(0); osc.stop(0.08);
  });
}

/** Static — white noise burst. */
function synthStatic(): Promise<Float32Array> {
  return renderOffline(0.2, (ctx) => {
    const len = Math.ceil(SAMPLE_RATE * 0.2);
    const buf = ctx.createBuffer(1, len, SAMPLE_RATE);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.15);
    src.connect(gain).connect(ctx.destination);
    src.start(0); src.stop(0.2);
  });
}

/** Boom — deep distorted impact. */
function synthBoom(): Promise<Float32Array> {
  return renderOffline(0.5, (ctx) => {
    const osc = ctx.createOscillator(); osc.type = "sine";
    osc.frequency.setValueAtTime(60, 0);
    osc.frequency.exponentialRampToValueAtTime(20, 0.2);
    const ws = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = (i*2)/256-1; curve[i] = Math.tanh(x*2); }
    ws.curve = curve;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.8, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.4);
    osc.connect(ws).connect(gain).connect(ctx.destination);
    osc.start(0); osc.stop(0.5);
  });
}

/** Clave — high pitched wood click. */
function synthClave(): Promise<Float32Array> {
  return renderOffline(0.05, (ctx) => {
    const osc = ctx.createOscillator(); osc.type = "triangle"; osc.frequency.value = 2500;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.03);
    osc.connect(gain).connect(ctx.destination);
    osc.start(0); osc.stop(0.05);
  });
}

/** Bongo — mid pitched skin drum. */
function synthBongo(): Promise<Float32Array> {
  return renderOffline(0.15, (ctx) => {
    const osc = ctx.createOscillator(); osc.type = "sine";
    osc.frequency.setValueAtTime(350, 0);
    osc.frequency.exponentialRampToValueAtTime(180, 0.06);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.65, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(0); osc.stop(0.15);
  });
}

/** Cowbell — dual square tones. */
function synthCowbell(): Promise<Float32Array> {
  return renderOffline(0.2, (ctx) => {
    const osc1 = ctx.createOscillator(); osc1.type = "square"; osc1.frequency.value = 560;
    const osc2 = ctx.createOscillator(); osc2.type = "square"; osc2.frequency.value = 845;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.15);
    osc1.connect(gain); osc2.connect(gain); gain.connect(ctx.destination);
    osc1.start(0); osc2.start(0); osc1.stop(0.2); osc2.stop(0.2);
  });
}

/** Voice "uh" — formant-filtered noise. */
function synthVoiceUh(): Promise<Float32Array> {
  return renderOffline(0.3, (ctx) => {
    const len = Math.ceil(SAMPLE_RATE * 0.3);
    const buf = ctx.createBuffer(1, len, SAMPLE_RATE);
    const data = buf.getChannelData(0);
    // Pulse wave as vocal cord simulation
    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE;
      data[i] = Math.sin(2 * Math.PI * 120 * t) > 0 ? 0.5 : -0.5;
    }
    const src = ctx.createBufferSource(); src.buffer = buf;
    // Formants for "uh" vowel: F1≈600, F2≈1000
    const f1 = ctx.createBiquadFilter(); f1.type = "bandpass"; f1.frequency.value = 600; f1.Q.value = 5;
    const f2 = ctx.createBiquadFilter(); f2.type = "bandpass"; f2.frequency.value = 1000; f2.Q.value = 5;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.25);
    src.connect(f1).connect(f2).connect(gain).connect(ctx.destination);
    src.start(0); src.stop(0.3);
  });
}

/** Voice "ah" — open vowel formant. */
function synthVoiceAh(): Promise<Float32Array> {
  return renderOffline(0.35, (ctx) => {
    const len = Math.ceil(SAMPLE_RATE * 0.35);
    const buf = ctx.createBuffer(1, len, SAMPLE_RATE);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / SAMPLE_RATE;
      data[i] = Math.sin(2 * Math.PI * 150 * t) > 0 ? 0.5 : -0.5;
    }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f1 = ctx.createBiquadFilter(); f1.type = "bandpass"; f1.frequency.value = 800; f1.Q.value = 4;
    const f2 = ctx.createBiquadFilter(); f2.type = "bandpass"; f2.frequency.value = 1200; f2.Q.value = 4;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.3);
    src.connect(f1).connect(f2).connect(gain).connect(ctx.destination);
    src.start(0); src.stop(0.35);
  });
}

/** Breath — filtered noise exhale. */
function synthBreath(): Promise<Float32Array> {
  return renderOffline(0.4, (ctx) => {
    const len = Math.ceil(SAMPLE_RATE * 0.4);
    const buf = ctx.createBuffer(1, len, SAMPLE_RATE);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2000; bp.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0, 0);
    gain.gain.linearRampToValueAtTime(0.3, 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.35);
    src.connect(bp).connect(gain).connect(ctx.destination);
    src.start(0); src.stop(0.4);
  });
}

/** Whistle — sine with vibrato. */
function synthWhistle(): Promise<Float32Array> {
  return renderOffline(0.4, (ctx) => {
    const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = 1800;
    const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 6;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 30;
    lfo.connect(lfoGain).connect(osc.frequency);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0, 0);
    gain.gain.linearRampToValueAtTime(0.3, 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(0); lfo.start(0); osc.stop(0.4); lfo.stop(0.4);
  });
}

/** Water drop — descending sine plop. */
function synthWaterDrop(): Promise<Float32Array> {
  return renderOffline(0.15, (ctx) => {
    const osc = ctx.createOscillator(); osc.type = "sine";
    osc.frequency.setValueAtTime(1500, 0);
    osc.frequency.exponentialRampToValueAtTime(400, 0.1);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(0); osc.stop(0.15);
  });
}

/** Wood knock — short resonant knock. */
function synthWoodKnock(): Promise<Float32Array> {
  return renderOffline(0.08, (ctx) => {
    const osc = ctx.createOscillator(); osc.type = "triangle";
    osc.frequency.setValueAtTime(600, 0);
    osc.frequency.exponentialRampToValueAtTime(300, 0.03);
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 500; bp.Q.value = 8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.7, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.06);
    osc.connect(bp).connect(gain).connect(ctx.destination);
    osc.start(0); osc.stop(0.08);
  });
}

/** Wind — long filtered noise swell. */
function synthWind(): Promise<Float32Array> {
  return renderOffline(0.6, (ctx) => {
    const len = Math.ceil(SAMPLE_RATE * 0.6);
    const buf = ctx.createBuffer(1, len, SAMPLE_RATE);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 800;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0, 0);
    gain.gain.linearRampToValueAtTime(0.2, 0.15);
    gain.gain.linearRampToValueAtTime(0.25, 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.55);
    src.connect(lp).connect(gain).connect(ctx.destination);
    src.start(0); src.stop(0.6);
  });
}

/** Cricket — rapid sine chirp. */
function synthCricket(): Promise<Float32Array> {
  return renderOffline(0.12, (ctx) => {
    const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = 4500;
    const lfo = ctx.createOscillator(); lfo.type = "square"; lfo.frequency.value = 40;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, 0);
    gain.gain.exponentialRampToValueAtTime(0.001, 0.1);
    // AM modulation for chirp effect
    osc.connect(gain).connect(ctx.destination);
    lfo.start(0); osc.start(0); lfo.stop(0.12); osc.stop(0.12);
  });
}

// ── Preset definitions ──────────────────────────────────────────────────

export interface SamplePreset {
  name: string;
  generate: () => Promise<{ name: string; buffer: Float32Array }[]>;
}

export const SAMPLE_PRESETS: SamplePreset[] = [
  {
    name: "Default",
    generate: async () => {
      const [a,b,c,d,e,f,g,h] = await Promise.all([synthKick(), synthSnare(), synthHiHat(), synthClap(), synthOpenHat(), synthRim(), synthTom(), synthCymbal()]);
      return [{name:"Kick",buffer:a},{name:"Snare",buffer:b},{name:"Hi-Hat",buffer:c},{name:"Clap",buffer:d},{name:"Open HH",buffer:e},{name:"Rim",buffer:f},{name:"Tom",buffer:g},{name:"Cymbal",buffer:h}];
    },
  },
  {
    name: "Hip-Hop",
    generate: async () => {
      const [a,b,c,d,e,f,g,h] = await Promise.all([synth808Sub(), synthSnare(), synthHiHat(), synthOpenHat(), synthSnap(), synthPerc(), synthZap(), synthCymbal()]);
      return [{name:"808 Sub",buffer:a},{name:"Snare",buffer:b},{name:"HH",buffer:c},{name:"Open HH",buffer:d},{name:"Snap",buffer:e},{name:"Perc",buffer:f},{name:"Zap",buffer:g},{name:"Crash",buffer:h}];
    },
  },
  {
    name: "House",
    generate: async () => {
      const [a,b,c,d,e,f,g,h] = await Promise.all([synthDeepKick(), synthRim(), synthHiHat(), synthOpenHat(), synthClap(), synthShaker(), synthConga(), synthRide()]);
      return [{name:"Deep Kick",buffer:a},{name:"Rim",buffer:b},{name:"HH",buffer:c},{name:"Open HH",buffer:d},{name:"Clap",buffer:e},{name:"Shaker",buffer:f},{name:"Conga",buffer:g},{name:"Ride",buffer:h}];
    },
  },
  {
    name: "Lo-Fi",
    generate: async () => {
      const [a,b,c,d,e,f,g,h] = await Promise.all([synthDustyKick(), synthSnare(), synthHiHat(), synthSnap(), synthBrush(), synthThud(), synthShaker(), synthChime()]);
      return [{name:"Dusty Kick",buffer:a},{name:"Snare",buffer:b},{name:"Soft HH",buffer:c},{name:"Snap",buffer:d},{name:"Brush",buffer:e},{name:"Thud",buffer:f},{name:"Shaker",buffer:g},{name:"Chime",buffer:h}];
    },
  },
  {
    name: "Industrial",
    generate: async () => {
      const [a,b,c,d,e,f,g,h] = await Promise.all([synthKick(), synthSnare(), synthAnvil(), synthBuzz(), synthGlitch(), synthStatic(), synthBoom(), synthZap()]);
      return [{name:"Kick",buffer:a},{name:"Metal Snare",buffer:b},{name:"Anvil",buffer:c},{name:"Buzz",buffer:d},{name:"Glitch",buffer:e},{name:"Static",buffer:f},{name:"Boom",buffer:g},{name:"Zap",buffer:h}];
    },
  },
  {
    name: "Reggaeton",
    generate: async () => {
      const [a,b,c,d,e,f,g,h] = await Promise.all([synthKick(), synthRim(), synthHiHat(), synthOpenHat(), synthClap(), synthClave(), synthBongo(), synthCowbell()]);
      return [{name:"Kick",buffer:a},{name:"Side Stick",buffer:b},{name:"Tick HH",buffer:c},{name:"Open HH",buffer:d},{name:"Clap",buffer:e},{name:"Clave",buffer:f},{name:"Bongo",buffer:g},{name:"Cowbell",buffer:h}];
    },
  },
  {
    name: "FX",
    generate: async () => {
      const [a,b,c,d,e,f,g,h] = await Promise.all([synthVoiceUh(), synthVoiceAh(), synthBreath(), synthWhistle(), synthWaterDrop(), synthWoodKnock(), synthWind(), synthCricket()]);
      return [{name:"Uh",buffer:a},{name:"Ah",buffer:b},{name:"Breath",buffer:c},{name:"Whistle",buffer:d},{name:"Drop",buffer:e},{name:"Wood",buffer:f},{name:"Wind",buffer:g},{name:"Cricket",buffer:h}];
    },
  },
];

/** Generate default samples (first preset). */
export async function generateDefaultSamples(): Promise<{ name: string; buffer: Float32Array }[]> {
  return SAMPLE_PRESETS[0].generate();
}
