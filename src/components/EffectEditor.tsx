import type { EffectName } from "../types";

// Slider definitions per effect
const EFFECT_SLIDERS: Record<string, { key: string; label: string; min: number; max: number; step: number }[]> = {
  delay: [
    { key: "time", label: "Time", min: 0.05, max: 1, step: 0.01 },
    { key: "feedback", label: "Feedback", min: 0, max: 0.9, step: 0.01 },
    { key: "mix", label: "Mix", min: 0, max: 1, step: 0.01 },
  ],
  distortion: [
    { key: "drive", label: "Drive", min: 1, max: 100, step: 1 },
  ],
  reverb: [
    { key: "decay", label: "Decay", min: 0.3, max: 5, step: 0.1 },
    { key: "mix", label: "Mix", min: 0, max: 1, step: 0.01 },
  ],
  compressor: [
    { key: "threshold", label: "Threshold", min: -40, max: 0, step: 1 },
    { key: "ratio", label: "Ratio", min: 1, max: 20, step: 0.5 },
  ],
  highpass: [
    { key: "cutoff", label: "Cutoff", min: 20, max: 2000, step: 10 },
    { key: "q", label: "Q", min: 0.5, max: 10, step: 0.1 },
  ],
  chorus: [
    { key: "rate", label: "Rate", min: 0.1, max: 5, step: 0.1 },
    { key: "depth", label: "Depth", min: 0.001, max: 0.01, step: 0.001 },
    { key: "mix", label: "Mix", min: 0, max: 1, step: 0.01 },
  ],
  phaser: [
    { key: "rate", label: "Rate", min: 0.1, max: 5, step: 0.1 },
    { key: "depth", label: "Depth", min: 100, max: 3000, step: 50 },
  ],
  bitcrusher: [
    { key: "bits", label: "Bits", min: 2, max: 16, step: 1 },
  ],
};

const EFFECT_NAMES: Record<string, string> = {
  delay: "Delay",
  distortion: "Distortion",
  reverb: "Reverb",
  compressor: "Compressor",
  highpass: "High-Pass Filter",
  chorus: "Chorus",
  phaser: "Phaser",
  bitcrusher: "Bitcrusher",
};

interface EffectEditorProps {
  name: EffectName;
  params: Record<string, unknown>;
  onClose: () => void;
  onChange: (params: Record<string, unknown>) => void;
}

export function EffectEditor({ name, params, onClose, onChange }: EffectEditorProps) {
  const sliders = EFFECT_SLIDERS[name] || [];

  return (
    <div className="sheet-backdrop" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div className="sheet">
        <div className="sheet-header">
          <span className="sheet-title">{EFFECT_NAMES[name] || name}</span>
          <button className="sheet-close" onClick={onClose}>×</button>
        </div>
        <div className="sheet-body">
          {sliders.map((slider) => {
            const value = (params[slider.key] as number) ?? slider.min;
            return (
              <div key={slider.key} style={{ marginBottom: 16 }}>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}>
                  <span style={{ fontSize: 12, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {slider.label}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>
                    {typeof value === "number" ? (value < 1 && value > 0 ? value.toFixed(3) : Number(value.toFixed(1))) : value}
                  </span>
                </div>
                <input
                  type="range"
                  className="volume-slider"
                  min={slider.min}
                  max={slider.max}
                  step={slider.step}
                  value={value}
                  onChange={(e) => onChange({ [slider.key]: parseFloat(e.target.value) })}
                  style={{ width: "100%" }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
