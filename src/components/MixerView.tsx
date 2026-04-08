/**
 * MixerView — Option B master bus chain:
 *
 *   HPF → 3-band EQ → glue comp → drive → limiter (with ceiling) → OUTPUT TRIM
 *
 * All controls act directly on the AudioEngine's master chain; the engine is
 * the source of truth for master DSP.
 */

import { useState, useRef, useEffect } from "react";
import type { AudioEngine } from "../engine/AudioEngine";
import { VuMeter } from "./VuMeter";

interface MixerViewProps {
  engine: AudioEngine | null;
}

interface StripProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
  /** Optional visual centre (e.g. 0 for EQ) — renders a tick at that value. */
  centre?: number;
}

function Strip({ label, value, min, max, step, unit, onChange, centre }: StripProps) {
  const pct = ((value - min) / (max - min)) * 100;
  const centrePct = centre !== undefined ? ((centre - min) / (max - min)) * 100 : null;
  return (
    <div className="mixer-strip">
      <div className="mixer-strip-label">{label}</div>
      <div className="mixer-strip-slider-wrap">
        {centrePct !== null && (
          <div className="mixer-strip-centre" style={{ "--centre": `${centrePct}%` } as React.CSSProperties} />
        )}
        <div className="mixer-strip-fill" style={{ "--fill": `${pct}%` } as React.CSSProperties} />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="mixer-strip-slider"
        />
      </div>
      <div className="mixer-strip-value">
        {value.toFixed(step < 1 ? 1 : 0)}{unit}
      </div>
    </div>
  );
}

// HPF cycles through bypass and three rumble-cut frequencies.
const HPF_STEPS = [10, 20, 30, 40] as const;
const hpfLabel = (hz: number) => (hz <= 10 ? "OFF" : `${hz}`);

export function MixerView({ engine }: MixerViewProps) {
  // Read initial values from the engine; these are the source of truth.
  const [hpfHz, setHpfHz] = useState(() => engine?.getHpfFreq() ?? 10);
  const [low, setLow] = useState(() => engine?.getEqLow().gain.value ?? 0);
  const [mid, setMid] = useState(() => engine?.getEqMid().gain.value ?? 0);
  const [high, setHigh] = useState(() => engine?.getEqHigh().gain.value ?? 0);
  const [glue, setGlue] = useState(() => engine?.getGlueAmount() ?? 0);
  const [drive, setDrive] = useState(() => engine?.getDrive() ?? 1);
  const [limiterOn, setLimiterOn] = useState(() => engine?.isLimiterEnabled() ?? true);
  const [ceiling, setCeiling] = useState(() => engine?.getLimiterCeiling() ?? -1);
  const [volume, setVolume] = useState(() => engine?.getOutputTrim().gain.value ?? 1);

  // Clip LED — runs a rAF loop reading the master analyser's time-domain data.
  // Uses a ref on the LED div so we don't re-render React on every frame.
  const clipLedRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef(engine);
  useEffect(() => { engineRef.current = engine; });
  useEffect(() => {
    let raf = 0;
    let holdUntil = 0;
    const buf = new Uint8Array(2048);
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = clipLedRef.current;
      const eng = engineRef.current;
      if (!el || !eng) return;
      const analyser = eng.getAnalyser();
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = Math.abs(buf[i] - 128) / 127;
        if (v > peak) peak = v;
      }
      const now = performance.now();
      if (peak > 0.98) holdUntil = now + 120;
      el.classList.toggle("clip-on", now < holdUntil);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  const cycleHpf = () => {
    const idx = HPF_STEPS.indexOf(hpfHz as typeof HPF_STEPS[number]);
    const next = HPF_STEPS[(idx + 1) % HPF_STEPS.length];
    setHpfHz(next);
    if (engine) engine.setHpfFreq(next);
  };

  const onLow = (v: number) => {
    setLow(v);
    if (engine) engine.getEqLow().gain.value = v;
  };
  const onMid = (v: number) => {
    setMid(v);
    if (engine) engine.getEqMid().gain.value = v;
  };
  const onHigh = (v: number) => {
    setHigh(v);
    if (engine) engine.getEqHigh().gain.value = v;
  };
  const onGlue = (v: number) => {
    setGlue(v);
    if (engine) engine.setGlueAmount(v);
  };
  const onDrive = (v: number) => {
    setDrive(v);
    if (engine) engine.setDrive(v);
  };
  const toggleLimiter = () => {
    const next = !limiterOn;
    setLimiterOn(next);
    if (engine) engine.setLimiterEnabled(next);
  };
  const onCeiling = (v: number) => {
    setCeiling(v);
    if (engine) engine.setLimiterCeiling(v);
  };
  const onVolume = (v: number) => {
    setVolume(v);
    if (engine) engine.getOutputTrim().gain.value = v;
  };

  const hpfOn = hpfHz > 10;

  return (
    <div className="mixer-layout">
      {/* Master VU at the top, full width */}
      <div style={{ marginBottom: 8 }}>
        <VuMeter getAnalyser={() => engine?.getAnalyser() ?? null} height={96} />
      </div>

      {/* Strips row — order matches signal flow, left to right */}
      <div className="mixer-strips">
        {/* HPF column */}
        <div className="mixer-strip">
          <div className="mixer-strip-label">HPF</div>
          <button
            onClick={cycleHpf}
            className="mixer-limiter-btn"
            style={{
              background: hpfOn ? "var(--preview)" : "var(--bg)",
              color: hpfOn ? "#000" : "var(--text-dim)",
              borderColor: hpfOn ? "var(--preview)" : "var(--border)",
            }}
            title="Highpass filter — click to cycle OFF / 20 / 30 / 40 Hz"
          >
            {hpfLabel(hpfHz)}
          </button>
          <div className="mixer-strip-value">{hpfOn ? "Hz" : "—"}</div>
        </div>

        <div className="mixer-divider" />

        {/* EQ bands */}
        <Strip label="LOW" value={low} min={-18} max={18} step={0.5} unit="dB" onChange={onLow} centre={0} />
        <Strip label="MID" value={mid} min={-18} max={18} step={0.5} unit="dB" onChange={onMid} centre={0} />
        <Strip label="HIGH" value={high} min={-18} max={18} step={0.5} unit="dB" onChange={onHigh} centre={0} />

        <div className="mixer-divider" />

        {/* Glue + drive */}
        <Strip label="GLUE" value={glue} min={0} max={1} step={0.01} unit="" onChange={onGlue} />
        <Strip label="DRIVE" value={drive} min={1} max={10} step={0.1} unit="×" onChange={onDrive} />

        <div className="mixer-divider" />

        {/* Limiter column — on/off + ceiling slider + clip LED */}
        <div className="mixer-strip">
          <div className="mixer-strip-label">LIMITER</div>
          <button
            onClick={toggleLimiter}
            className="mixer-limiter-btn"
            style={{
              background: limiterOn ? "var(--preview)" : "var(--bg)",
              color: limiterOn ? "#000" : "var(--text-dim)",
              borderColor: limiterOn ? "var(--preview)" : "var(--border)",
            }}
            title={limiterOn ? "Limiter ON — click to bypass" : "Limiter OFF — click to enable"}
          >
            {limiterOn ? "ON" : "OFF"}
          </button>
          <div className="mixer-clip-row">
            <div ref={clipLedRef} className="mixer-clip-led" />
            <span className="mixer-clip-label">CLIP</span>
          </div>
        </div>

        <Strip label="CEIL" value={ceiling} min={-6} max={0} step={0.1} unit="dB" onChange={onCeiling} />

        <div className="mixer-divider" />

        {/* Output trim — final fader (post-limiter) */}
        <Strip label="VOL" value={volume} min={0} max={1.5} step={0.01} unit="" onChange={onVolume} />
      </div>

      <div className="mixer-hint">
        Master bus: HPF → 3-band EQ → glue → drive → limiter → trim → out
      </div>
    </div>
  );
}
