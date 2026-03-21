/**
 * SoundBrowser — modal to pick individual sounds from any built-in kit
 * and place them on a specific pad. Enables mixing kicks from Hip-Hop
 * with snares from House, etc.
 */

import { useState } from "react";
import { SAMPLE_PRESETS } from "../engine/BuiltInSamples";

interface SoundBrowserProps {
  padId: number;
  onSelect: (buffer: Float32Array, name: string) => void;
  onClose: () => void;
}

export function SoundBrowser({ padId, onSelect, onClose }: SoundBrowserProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Map<string, { name: string; buffer: Float32Array }[]>>(new Map());

  /** Generate a kit's samples lazily (only when expanded). */
  const ensureKit = async (kitName: string, kitIdx: number) => {
    if (generated.has(kitName)) return generated.get(kitName)!;
    setLoading(kitName);
    const samples = await SAMPLE_PRESETS[kitIdx].generate();
    const next = new Map(generated);
    next.set(kitName, samples);
    setGenerated(next);
    setLoading(null);
    return samples;
  };

  return (
    <div className="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" style={{ maxWidth: 400, maxHeight: "80dvh" }}>
        <div className="sheet-header">
          <span className="sheet-title">Pick sound for Pad {padId + 1}</span>
          <button className="sheet-close" onClick={onClose}>✕</button>
        </div>
        <div className="sheet-body">
          <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 8 }}>
            Tap any sound to load it into pad {padId + 1}
          </div>
          {SAMPLE_PRESETS.map((preset, kitIdx) => (
            <KitSection
              key={preset.name}
              preset={preset}
              loading={loading === preset.name}
              samples={generated.get(preset.name) ?? null}
              onExpand={() => ensureKit(preset.name, kitIdx)}
              onSelect={(buffer, name) => { onSelect(buffer, name); onClose(); }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function KitSection({ preset, loading, samples, onExpand, onSelect }: {
  preset: { name: string };
  loading: boolean;
  samples: { name: string; buffer: Float32Array }[] | null;
  onExpand: () => void;
  onSelect: (buffer: Float32Array, name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const handleToggle = () => {
    if (!expanded && !samples) onExpand();
    setExpanded(!expanded);
  };

  return (
    <div style={{ borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
      <button
        onClick={handleToggle}
        style={{
          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "8px 0", fontSize: 12, fontWeight: 700, textAlign: "left",
        }}
      >
        <span>{preset.name}</span>
        <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
          {loading ? "loading..." : expanded ? "▼" : "▶"}
        </span>
      </button>
      {expanded && samples && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, paddingBottom: 8 }}>
          {samples.map((s, i) => (
            <button
              key={i}
              onClick={() => onSelect(new Float32Array(s.buffer), s.name)}
              style={{
                padding: "6px 4px", borderRadius: 6, fontSize: 9, fontWeight: 700,
                background: "var(--bg-cell)", color: "var(--text)",
                border: "1px solid var(--border)", cursor: "pointer",
                textAlign: "center",
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
