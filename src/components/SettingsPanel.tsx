import { PALETTES, applyPalette } from "../themes";
import type { PaletteId } from "../themes";

interface SettingsPanelProps {
  palette: PaletteId;
  onPaletteChange: (id: PaletteId) => void;
  onClose: () => void;
}

export function SettingsPanel({ palette, onPaletteChange, onClose }: SettingsPanelProps) {
  return (
    <div className="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <div className="sheet-header">
          <span className="sheet-title">Settings</span>
          <button className="sheet-close" onClick={onClose}>✕</button>
        </div>
        <div className="sheet-body">
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            Theme
          </div>

          {/* Dark themes */}
          <div style={{ fontSize: 9, color: "var(--text-dim)", marginBottom: 4 }}>DARK</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 12 }}>
            {PALETTES.filter(p => p.dark).map(p => (
              <button
                key={p.id}
                onClick={() => {
                  onPaletteChange(p.id);
                  applyPalette(p);
                }}
                style={{
                  padding: "10px 8px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                  background: p.bg, color: p.text,
                  border: palette === p.id ? `2px solid ${p.preview}` : "2px solid transparent",
                  boxShadow: palette === p.id ? `0 0 8px ${p.preview}40` : "none",
                  cursor: "pointer",
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.preview, display: "inline-block", marginRight: 4 }} />
                {p.name}
              </button>
            ))}
          </div>

          {/* Light themes */}
          <div style={{ fontSize: 9, color: "var(--text-dim)", marginBottom: 4 }}>LIGHT</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {PALETTES.filter(p => !p.dark).map(p => (
              <button
                key={p.id}
                onClick={() => {
                  onPaletteChange(p.id);
                  applyPalette(p);
                }}
                style={{
                  padding: "10px 8px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                  background: p.bg, color: p.text,
                  border: palette === p.id ? `2px solid ${p.preview}` : `2px solid ${p.border}`,
                  boxShadow: palette === p.id ? `0 0 8px ${p.preview}40` : "none",
                  cursor: "pointer",
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.preview, display: "inline-block", marginRight: 4 }} />
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
