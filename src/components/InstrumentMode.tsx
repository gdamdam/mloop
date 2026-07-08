/**
 * InstrumentMode — controls for the chromatic instrument (played via QWERTY +
 * MIDI). Sits under PadDetail when instrument mode is on. Presentational: all
 * state lives in Layout (where the keyboard/MIDI hooks are), threaded via props.
 */

import type { InstrumentSettings } from "../engine/instrument/instrumentMapping";
import { PITCH_SCALES, type PitchScale } from "../vendor/mgrains-dsp/scale";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const SCALE_LABELS: Record<PitchScale, string> = {
  off: "Chromatic",
  octaves: "Oct",
  fifths: "5ths",
  major: "Major",
  minor: "Minor",
  majorPent: "Maj Pent",
  minorPent: "Min Pent",
};

interface Props {
  settings: InstrumentSettings;
  onChange: (patch: Partial<InstrumentSettings>) => void;
  padName: string;
}

export function InstrumentMode({ settings, onChange, padName }: Props) {
  const rootPc = ((settings.root % 12) + 12) % 12;
  const rootOctave = Math.floor(settings.root / 12) - 1;

  return (
    <div style={{
      border: "1px solid var(--preview)", borderRadius: 8, background: "var(--bg-panel)",
      padding: 10, marginBottom: 8,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--preview)", marginBottom: 6 }}>
        Instrument · {padName || `Pad ${settings.padId + 1}`}
      </div>

      {/* Keep-tempo vs classic */}
      <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
        {([[true, "Keep Tempo"], [false, "Classic"]] as const).map(([kt, label]) => (
          <button
            key={label}
            onClick={() => onChange({ keepTempo: kt })}
            title={kt ? "Warp — pitch independent of tempo" : "Repitch — higher notes play faster"}
            style={btn(settings.keepTempo === kt, { flex: 1, padding: "4px 0" })}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Root note */}
      <div style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 4 }}>
        <span style={lbl}>Root</span>
        {NOTE_NAMES.map((n, pc) => (
          <button
            key={n}
            onClick={() => onChange({ root: (rootOctave + 1) * 12 + pc })}
            style={btn(rootPc === pc, { flex: 1, padding: "2px 0", fontSize: 7 })}
          >
            {n}
          </button>
        ))}
      </div>

      {/* Scale */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 2, marginBottom: 4 }}>
        <span style={lbl}>Scale</span>
        {PITCH_SCALES.map((sc) => (
          <button key={sc} onClick={() => onChange({ scale: sc })} style={btn(settings.scale === sc, { padding: "2px 5px" })}>
            {SCALE_LABELS[sc]}
          </button>
        ))}
      </div>

      {/* Out-of-scale handling (only meaningful with a scale) */}
      {settings.scale !== "off" && (
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <span style={lbl}>Off-key</span>
          {([["snap", "Snap"], ["mute", "Mute"]] as const).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => onChange({ snapMode: mode })}
              style={btn(settings.snapMode === mode, { flex: 1, padding: "3px 0" })}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const lbl: React.CSSProperties = {
  fontSize: 8, color: "var(--text-dim)", width: 34, textAlign: "right", flexShrink: 0,
};

function btn(active: boolean, extra: React.CSSProperties): React.CSSProperties {
  return {
    borderRadius: 3, fontSize: 8, fontWeight: 700,
    background: active ? "var(--preview)" : "var(--bg-cell)",
    color: active ? "#000" : "var(--text-dim)",
    border: "none", cursor: "pointer", ...extra,
  };
}
