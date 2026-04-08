/**
 * EffectEditor — modal for adjusting individual effect parameters.
 * Shown on long-press of effect buttons in KAOS view (or the per-track
 * effect rack). Ported from mpump so both apps share the same SVG
 * visualiser + slider layout. mpump's per-channel EXCL. buttons are
 * dropped — mloop is single-channel per track.
 */

import { useEffect } from "react";
import type { EffectName, EffectParams, ReverbType } from "../types";
import { DELAY_DIVISIONS } from "../types";

interface Props {
  name: EffectName;
  params: EffectParams[EffectName];
  onClose: () => void;
  /** Partial-update callback — merged into the effect's params. */
  onChange: (params: Record<string, unknown>) => void;
}

interface SliderDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

const EFFECT_SLIDERS: Record<EffectName, SliderDef[]> = {
  lowpass: [
    { key: "cutoff", label: "Cutoff", min: 100, max: 12000, step: 50, unit: "Hz" },
    { key: "q", label: "Q", min: 0.5, max: 15, step: 0.5 },
  ],
  delay: [
    { key: "time", label: "Time", min: 0.05, max: 1.5, step: 0.01, unit: "s" },
    { key: "feedback", label: "Feedback", min: 0, max: 0.9, step: 0.01 },
    { key: "mix", label: "Mix", min: 0, max: 1, step: 0.01 },
  ],
  distortion: [
    { key: "drive", label: "Drive", min: 1, max: 100, step: 1 },
  ],
  reverb: [
    { key: "decay", label: "Decay", min: 0.5, max: 5, step: 0.1, unit: "s" },
    { key: "mix", label: "Mix", min: 0, max: 1, step: 0.01 },
  ],
  compressor: [
    { key: "threshold", label: "Threshold", min: -60, max: 0, step: 1, unit: "dB" },
    { key: "ratio", label: "Ratio", min: 1, max: 20, step: 0.5 },
  ],
  highpass: [
    { key: "cutoff", label: "Cutoff", min: 20, max: 2000, step: 10, unit: "Hz" },
    { key: "q", label: "Q", min: 0.5, max: 15, step: 0.5 },
  ],
  chorus: [
    { key: "rate", label: "Rate", min: 0.1, max: 10, step: 0.1, unit: "Hz" },
    { key: "depth", label: "Depth", min: 0.001, max: 0.01, step: 0.001 },
    { key: "mix", label: "Mix", min: 0, max: 1, step: 0.01 },
  ],
  phaser: [
    { key: "rate", label: "Rate", min: 0.1, max: 5, step: 0.1, unit: "Hz" },
    { key: "depth", label: "Depth", min: 100, max: 3000, step: 50 },
  ],
  bitcrusher: [
    { key: "bits", label: "Bits", min: 2, max: 16, step: 1 },
  ],
  duck: [
    { key: "depth", label: "Depth", min: 0.1, max: 1, step: 0.05 },
    { key: "release", label: "Release", min: 0.01, max: 0.3, step: 0.01, unit: "s" },
  ],
  flanger: [
    { key: "rate", label: "Rate", min: 0.1, max: 5, step: 0.1, unit: "Hz" },
    { key: "depth", label: "Depth", min: 0, max: 1, step: 0.05 },
    { key: "feedback", label: "Feedback", min: 0, max: 0.95, step: 0.05 },
    { key: "mix", label: "Mix", min: 0, max: 1, step: 0.05 },
  ],
  tremolo: [
    { key: "rate", label: "Rate", min: 0.5, max: 15, step: 0.5, unit: "Hz" },
    { key: "depth", label: "Depth", min: 0, max: 1, step: 0.05 },
  ],
};

const EFFECT_NAMES: Record<EffectName, string> = {
  lowpass: "Low-Pass Filter",
  delay: "Delay",
  distortion: "Distortion",
  reverb: "Reverb",
  compressor: "Compressor",
  highpass: "High-Pass Filter",
  chorus: "Chorus",
  phaser: "Phaser",
  bitcrusher: "Bitcrusher",
  duck: "Sidechain Duck",
  flanger: "Flanger",
  tremolo: "Tremolo",
};

/**
 * Tiny SVG visualisers for each effect — mirror mpump's fx-vis curves.
 * Colours follow CSS custom property --preview so they retheme with
 * the palette.
 */
function EffectVis({ name, params }: { name: EffectName; params: Record<string, number | boolean | string | undefined> }) {
  const w = 200, h = 60;
  const bg = <rect x={0} y={0} width={w} height={h} fill="rgba(0,0,0,0.3)" rx={4} />;
  const col = "var(--preview)";
  const dim = "color-mix(in srgb, var(--preview) 15%, transparent)";
  const fill = "color-mix(in srgb, var(--preview) 10%, transparent)";
  const textDim = "color-mix(in srgb, var(--preview) 50%, transparent)";

  switch (name) {
    case "duck": {
      const depth = params.depth as number, release = params.release as number;
      const topY = h * 0.1, bottomY = h * (0.1 + depth * 0.8);
      const ax = w * 0.08, relW = 0.2 + (release - 0.01) / 0.29 * 0.7;
      const rx = ax + w * relW;
      const d = `M0,${topY} L${ax},${bottomY} Q${(ax + rx) / 2},${bottomY} ${rx},${topY} L${w},${topY}`;
      return <svg className="fx-vis" viewBox={`0 0 ${w} ${h}`}>{bg}
        <line x1={0} y1={topY} x2={w} y2={topY} stroke={dim} strokeWidth={1} strokeDasharray="3,3" />
        <path d={d} fill={fill} stroke={col} strokeWidth={2} />
        <circle cx={ax} cy={bottomY} r={3} fill={col} />
        <text x={ax} y={h - 2} fill={textDim} fontSize={8} textAnchor="middle">kick</text>
      </svg>;
    }
    case "delay": {
      const fb = params.feedback as number, mix = params.mix as number;
      const taps = 5;
      return <svg className="fx-vis" viewBox={`0 0 ${w} ${h}`}>{bg}
        {Array.from({ length: taps }, (_, i) => {
          const x = 20 + i * 38, amp = mix * Math.pow(fb, i);
          const barH = amp * h * 0.8;
          return <rect key={i} x={x} y={h - barH - 4} width={8} height={barH} rx={2} fill={col} opacity={0.3 + amp * 0.7} />;
        })}
        <text x={w / 2} y={h - 2} fill={textDim} fontSize={7} textAnchor="middle">echo taps</text>
      </svg>;
    }
    case "reverb": {
      const decay = params.decay as number, mix = params.mix as number;
      const decayW = 0.3 + (decay - 0.5) / 4.5 * 0.6;
      const pts = Array.from({ length: 30 }, (_, i) => {
        const t = i / 29;
        const env = Math.exp(-t / decayW) * mix;
        return `${10 + t * (w - 20)},${h * 0.1 + (1 - env) * h * 0.75}`;
      }).join(" ");
      return <svg className="fx-vis" viewBox={`0 0 ${w} ${h}`}>{bg}
        <polyline points={pts} fill="none" stroke={col} strokeWidth={2} />
        <line x1={10} y1={h * 0.1} x2={10} y2={h * 0.85} stroke={dim} strokeWidth={1} />
        <text x={w / 2} y={h - 2} fill={textDim} fontSize={7} textAnchor="middle">decay</text>
      </svg>;
    }
    case "compressor": {
      const thresh = params.threshold as number, ratio = params.ratio as number;
      const threshN = 1 + thresh / 60;
      const pts: string[] = [];
      for (let i = 0; i <= 20; i++) {
        const inp = i / 20;
        const out = inp <= threshN ? inp : threshN + (inp - threshN) / ratio;
        pts.push(`${10 + inp * (w - 20)},${h * 0.9 - out * h * 0.8}`);
      }
      return <svg className="fx-vis" viewBox={`0 0 ${w} ${h}`}>{bg}
        <line x1={10} y1={h * 0.9} x2={w - 10} y2={h * 0.1} stroke={dim} strokeWidth={1} strokeDasharray="3,3" />
        <polyline points={pts.join(" ")} fill="none" stroke={col} strokeWidth={2} />
        <line x1={10 + threshN * (w - 20)} y1={h * 0.05} x2={10 + threshN * (w - 20)} y2={h * 0.95} stroke="rgba(255,100,100,0.4)" strokeWidth={1} strokeDasharray="2,2" />
        <text x={w / 2} y={h - 2} fill={textDim} fontSize={7} textAnchor="middle">threshold</text>
      </svg>;
    }
    case "distortion": {
      const drive = params.drive as number;
      const k = drive / 100;
      const pts = Array.from({ length: 40 }, (_, i) => {
        const x = (i / 39) * 2 - 1;
        const y = k > 0 ? Math.tanh(x * (1 + k * 5)) : x;
        return `${10 + (i / 39) * (w - 20)},${h / 2 - y * h * 0.35}`;
      }).join(" ");
      return <svg className="fx-vis" viewBox={`0 0 ${w} ${h}`}>{bg}
        <line x1={10} y1={h / 2} x2={w - 10} y2={h / 2} stroke={dim} strokeWidth={1} />
        <polyline points={pts} fill="none" stroke={col} strokeWidth={2} />
      </svg>;
    }
    case "lowpass":
    case "highpass": {
      const cutoff = params.cutoff as number;
      const q = params.q as number;
      const isHp = name === "highpass";
      const maxCut = isHp ? 2000 : 12000;
      const minCut = isHp ? 20 : 100;
      const cutN = (cutoff - minCut) / (maxCut - minCut);
      const pts = Array.from({ length: 40 }, (_, i) => {
        const f = i / 39;
        let gain: number;
        if (isHp) {
          gain = f < cutN ? Math.pow(f / Math.max(cutN, 0.01), 2) : 1;
        } else {
          gain = f > cutN ? Math.pow(Math.max(cutN, 0.01) / f, 2) : 1;
        }
        if (q > 1 && Math.abs(f - cutN) < 0.15) {
          gain *= 1 + (q - 1) * 0.15 * (1 - Math.abs(f - cutN) / 0.15);
        }
        return `${10 + f * (w - 20)},${h * 0.9 - Math.min(gain, 1) * h * 0.75}`;
      }).join(" ");
      return <svg className="fx-vis" viewBox={`0 0 ${w} ${h}`}>{bg}
        <polyline points={pts} fill="none" stroke={col} strokeWidth={2} />
        <line x1={10 + cutN * (w - 20)} y1={h * 0.05} x2={10 + cutN * (w - 20)} y2={h * 0.95} stroke="rgba(255,100,100,0.4)" strokeWidth={1} strokeDasharray="2,2" />
      </svg>;
    }
    case "chorus":
    case "phaser": {
      const rate = params.rate as number, depth = params.depth as number;
      const maxRate = name === "chorus" ? 10 : 5;
      const cycles = 1 + (rate / maxRate) * 3;
      const amp = name === "chorus" ? Math.min(depth / 0.01, 1) : Math.min(depth / 3000, 1);
      const pts = Array.from({ length: 60 }, (_, i) => {
        const t = i / 59;
        const y = Math.sin(t * Math.PI * 2 * cycles) * amp;
        return `${10 + t * (w - 20)},${h / 2 - y * h * 0.35}`;
      }).join(" ");
      return <svg className="fx-vis" viewBox={`0 0 ${w} ${h}`}>{bg}
        <line x1={10} y1={h / 2} x2={w - 10} y2={h / 2} stroke={dim} strokeWidth={1} />
        <polyline points={pts} fill="none" stroke={col} strokeWidth={2} />
        <text x={w / 2} y={h - 2} fill={textDim} fontSize={7} textAnchor="middle">LFO</text>
      </svg>;
    }
    case "bitcrusher": {
      const bits = params.bits as number;
      const levels = Math.pow(2, bits);
      const pts = Array.from({ length: 60 }, (_, i) => {
        const t = i / 59;
        const sine = Math.sin(t * Math.PI * 4);
        const crushed = Math.round(sine * levels / 2) / (levels / 2);
        return `${10 + t * (w - 20)},${h / 2 - crushed * h * 0.35}`;
      }).join(" ");
      return <svg className="fx-vis" viewBox={`0 0 ${w} ${h}`}>{bg}
        <line x1={10} y1={h / 2} x2={w - 10} y2={h / 2} stroke={dim} strokeWidth={1} />
        <polyline points={pts} fill="none" stroke={col} strokeWidth={2} />
      </svg>;
    }
    case "flanger": {
      const rate = params.rate as number, depth = params.depth as number, fb = params.feedback as number;
      const pts = Array.from({ length: 60 }, (_, i) => {
        const t = i / 59;
        const lfo = Math.sin(t * Math.PI * 2 * (1 + rate)) * depth;
        const comb = 1 - fb * 0.5 * Math.sin(t * Math.PI * 20);
        const y = (lfo * 0.4 + comb * 0.6);
        return `${10 + t * (w - 20)},${h / 2 - y * h * 0.35}`;
      }).join(" ");
      return <svg className="fx-vis" viewBox={`0 0 ${w} ${h}`}>{bg}
        <line x1={10} y1={h / 2} x2={w - 10} y2={h / 2} stroke={dim} strokeWidth={1} />
        <polyline points={pts} fill="none" stroke={col} strokeWidth={2} />
        <text x={w / 2} y={h - 2} fill={textDim} fontSize={7} textAnchor="middle">sweep</text>
      </svg>;
    }
    case "tremolo": {
      const rate = params.rate as number, depth = params.depth as number;
      const shape = params.shape as string;
      const cycles = Math.max(1, rate / 2);
      const pts = Array.from({ length: 60 }, (_, i) => {
        const t = i / 59;
        const phase = (t * cycles) % 1;
        let mod: number;
        if (shape === "square") { mod = phase < 0.5 ? 1 : 1 - depth; }
        else { mod = 1 - depth * 0.5 + Math.sin(t * cycles * Math.PI * 2) * depth * 0.5; }
        return `${10 + t * (w - 20)},${h * 0.9 - mod * h * 0.75}`;
      }).join(" ");
      return <svg className="fx-vis" viewBox={`0 0 ${w} ${h}`}>{bg}
        <line x1={10} y1={h * 0.9} x2={w - 10} y2={h * 0.15} stroke={dim} strokeWidth={1} strokeDasharray="3,3" />
        <polyline points={pts} fill="none" stroke={col} strokeWidth={2} />
        <text x={w / 2} y={h - 2} fill={textDim} fontSize={7} textAnchor="middle">amplitude</text>
      </svg>;
    }
    default:
      return null;
  }
}

export function EffectEditor({ name, params, onClose, onChange }: Props) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const sliders = EFFECT_SLIDERS[name] ?? [];
  const p = params as unknown as Record<string, number | boolean | string | undefined>;

  return (
    <div className="fx-editor-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fx-editor" onClick={(e) => e.stopPropagation()}>
        <div className="fx-editor-header">
          <span className="fx-editor-title">{EFFECT_NAMES[name]}</span>
          <button className="fx-editor-close" onClick={onClose}>✕</button>
        </div>

        {/* Delay: sync/free toggle + division selector */}
        {name === "delay" && (
          <div className="fx-editor-row" style={{ gap: 6 }}>
            <button
              className={`fx-editor-pill ${!p.sync ? "active" : ""}`}
              onClick={() => onChange({ sync: false })}
            >FREE</button>
            <button
              className={`fx-editor-pill ${p.sync ? "active" : ""}`}
              onClick={() => onChange({ sync: true })}
            >SYNC</button>
            {p.sync && (
              <select
                className="fx-editor-select"
                value={p.division as string}
                onChange={(e) => onChange({ division: e.target.value })}
                style={{ marginLeft: 4 }}
              >
                {DELAY_DIVISIONS.map(d => (
                  <option key={d} value={d}>{d === "1/8d" ? "1/8 dotted" : d}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Reverb: IR type selector */}
        {name === "reverb" && (
          <div className="fx-editor-row" style={{ gap: 6 }}>
            {(["room", "hall", "plate", "spring"] as const).map(t => (
              <button
                key={t}
                className={`fx-editor-pill ${((p.type as ReverbType) || "room") === t ? "active" : ""}`}
                onClick={() => onChange({ type: t })}
              >{t.toUpperCase()}</button>
            ))}
          </div>
        )}

        {/* Tremolo: shape selector */}
        {name === "tremolo" && (
          <div className="fx-editor-row" style={{ gap: 6 }}>
            {(["sine", "square"] as const).map(s => (
              <button
                key={s}
                className={`fx-editor-pill ${((p.shape as string) || "sine") === s ? "active" : ""}`}
                onClick={() => onChange({ shape: s })}
              >{s === "sine" ? "SMOOTH" : "HARD"}</button>
            ))}
          </div>
        )}

        {/* Visualiser */}
        <EffectVis name={name} params={p} />

        {/* Sliders */}
        {sliders.map((s) => {
          // Hide time slider when delay is synced
          if (name === "delay" && s.key === "time" && p.sync) return null;
          const val = (p[s.key] as number) ?? s.min;
          return (
            <div className="fx-editor-row" key={s.key}>
              <span className="fx-editor-label">{s.label}</span>
              <input
                type="range"
                className="fx-editor-slider"
                min={s.min}
                max={s.max}
                step={s.step}
                value={val}
                onChange={(e) => onChange({ [s.key]: parseFloat(e.target.value) })}
              />
              <span className="fx-editor-value">
                {val < 1 && val > 0 ? val.toFixed(s.step < 0.01 ? 3 : 2) : Math.round(val * 10) / 10}
                {s.unit ? ` ${s.unit}` : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
