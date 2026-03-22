/**
 * SettingsPanel — theme picker, session export/import, recording limits.
 * All settings saved to localStorage for persistence across sessions.
 */

import { useState } from "react";
import { PALETTES, applyPalette } from "../themes";
import type { PaletteId } from "../themes";
import type { LoopCommand } from "../types";
import type { LockBars } from "../types";
import {
  loadLimits, saveLimits, TIME_OPTIONS, SIZE_OPTIONS,
  type RecordingLimits,
} from "../utils/recordingLimits";
import { PAD_LAYOUTS, loadPadLayout, savePadLayout, type PadLayoutId } from "../utils/kitManager";

const VELOCITY_KEY = "mloop-velocity";
const LOCK_BARS_KEY = "mloop-lock-bars";

function loadVelocity(): boolean {
  return localStorage.getItem(VELOCITY_KEY) !== "off";
}
function saveVelocity(on: boolean): void {
  localStorage.setItem(VELOCITY_KEY, on ? "on" : "off");
}
function loadLockBars(): LockBars {
  const v = parseInt(localStorage.getItem(LOCK_BARS_KEY) || "4");
  if (v === 1 || v === 2 || v === 4 || v === 8) return v;
  return 4;
}
function saveLockBarsValue(bars: LockBars): void {
  localStorage.setItem(LOCK_BARS_KEY, String(bars));
}

interface SettingsPanelProps {
  palette: PaletteId;
  onPaletteChange: (id: PaletteId) => void;
  onClose: () => void;
  command: (cmd: LoopCommand) => void;
  latencyMs: number; // measured input latency for display
  sessionSizeMB: number; // current session size estimate
  engine?: { lockBars: number } | null; // AudioEngine reference for lockBars
}

export function SettingsPanel({ palette, onPaletteChange, onClose, command, latencyMs, sessionSizeMB, engine }: SettingsPanelProps) {
  const [limits, setLimits] = useState<RecordingLimits>(loadLimits);
  const [, forceUpdate] = useState(0);
  const [layout, setLayout] = useState<PadLayoutId>(loadPadLayout);
  const [velocity, setVelocity] = useState(loadVelocity);
  const [lockBars, setLockBars] = useState<LockBars>(loadLockBars);

  /** Update a single limit field and persist. */
  const updateLimit = (key: keyof RecordingLimits, value: number) => {
    const updated = { ...limits, [key]: value };
    setLimits(updated);
    saveLimits(updated);
  };

  return (
    <div className="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" style={{ maxHeight: "85dvh" }}>
        <div className="sheet-header">
          <span className="sheet-title">Settings</span>
          <button className="sheet-close" onClick={onClose}>✕</button>
        </div>
        <div className="sheet-body">

          {/* ── Themes ──────────────────────────────────────────────── */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            Theme
          </div>

          {/* Dark themes */}
          <div style={{ fontSize: 9, color: "var(--text-dim)", marginBottom: 4 }}>DARK</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 12 }}>
            {PALETTES.filter(p => p.dark).map(p => (
              <button key={p.id} onClick={() => { onPaletteChange(p.id); applyPalette(p); }}
                style={{
                  padding: "10px 8px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                  background: p.bg, color: p.text,
                  border: palette === p.id ? `2px solid ${p.preview}` : "2px solid transparent",
                  boxShadow: palette === p.id ? `0 0 8px ${p.preview}40` : "none", cursor: "pointer",
                }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.preview, display: "inline-block", marginRight: 4 }} />
                {p.name}
              </button>
            ))}
          </div>

          {/* Light themes */}
          <div style={{ fontSize: 9, color: "var(--text-dim)", marginBottom: 4 }}>LIGHT</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 16 }}>
            {PALETTES.filter(p => !p.dark).map(p => (
              <button key={p.id} onClick={() => { onPaletteChange(p.id); applyPalette(p); }}
                style={{
                  padding: "10px 8px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                  background: p.bg, color: p.text,
                  border: palette === p.id ? `2px solid ${p.preview}` : `2px solid ${p.border}`,
                  boxShadow: palette === p.id ? `0 0 8px ${p.preview}40` : "none", cursor: "pointer",
                }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.preview, display: "inline-block", marginRight: 4 }} />
                {p.name}
              </button>
            ))}
          </div>

          {/* ── Session export/import ───────────────────────────────── */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            Session
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button onClick={() => command({ type: "export_session_file" })}
              style={{ flex: 1, padding: 10, borderRadius: 8, fontSize: 12, fontWeight: 700, background: "var(--bg-cell)", color: "var(--text)" }}>
              ⬇ Export Session
            </button>
            <button onClick={() => command({ type: "import_session_file" })}
              style={{ flex: 1, padding: 10, borderRadius: 8, fontSize: 12, fontWeight: 700, background: "var(--bg-cell)", color: "var(--text)" }}>
              ⬆ Import Session
            </button>
          </div>

          {/* ── Recording limits ────────────────────────────────────── */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            Recording Limits
          </div>

          {/* Max recording time */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>Max recording time per track/pad</div>
            <div style={{ display: "flex", gap: 4 }}>
              {TIME_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => updateLimit("maxRecordingTimeSec", opt.value)}
                  style={{
                    flex: 1, padding: "6px 4px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                    background: limits.maxRecordingTimeSec === opt.value ? "var(--preview)" : "var(--bg-cell)",
                    color: limits.maxRecordingTimeSec === opt.value ? "#000" : "var(--text-dim)",
                    cursor: "pointer",
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Max session size */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>Max session size (all tracks + pads)</div>
            <div style={{ display: "flex", gap: 4 }}>
              {SIZE_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => updateLimit("maxSessionSizeMB", opt.value)}
                  style={{
                    flex: 1, padding: "6px 4px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                    background: limits.maxSessionSizeMB === opt.value ? "var(--preview)" : "var(--bg-cell)",
                    color: limits.maxSessionSizeMB === opt.value ? "#000" : "var(--text-dim)",
                    cursor: "pointer",
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Link Bridge ────────────────────────────────────────── */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            Link Bridge (mpump sync)
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
            <button
              onClick={() => command({ type: "toggle_metronome" })}
              style={{
                flex: 1, padding: 10, borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: "var(--bg-cell)", color: "var(--text)",
              }}
            >
              Link Bridge connects mloop to mpump for tempo sync via localhost:19876.
              Enable in the header with the LINK button.
            </button>
          </div>

          {/* ── Pad layout ─────────────────────────────────────────── */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            Pad Layout
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {PAD_LAYOUTS.map(l => (
              <button
                key={l.id}
                onClick={() => { setLayout(l.id); savePadLayout(l.id); }}
                style={{
                  flex: 1, padding: "8px 6px", borderRadius: 8, fontSize: 10, fontWeight: 700,
                  background: layout === l.id ? "var(--preview)" : "var(--bg-cell)",
                  color: layout === l.id ? "#000" : "var(--text-dim)",
                  cursor: "pointer", textAlign: "center",
                }}
                title={l.description}
              >
                {l.name}
              </button>
            ))}
          </div>

          {/* ── Pad Settings ────────────────────────────────────────── */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            Pad Settings
          </div>

          {/* Velocity sensitivity */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Velocity sensitivity</span>
            <button
              onClick={() => {
                const next = !velocity;
                setVelocity(next);
                saveVelocity(next);
              }}
              style={{
                padding: "5px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                background: velocity ? "var(--preview)" : "var(--bg-cell)",
                color: velocity ? "#000" : "var(--text-dim)",
                cursor: "pointer",
              }}
            >
              {velocity ? "ON" : "OFF"}
            </button>
          </div>

          {/* Lock bars */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>Lock bars (LOCK sync mode window)</div>
            <div style={{ display: "flex", gap: 4 }}>
              {([1, 2, 4, 8] as const).map(bars => (
                <button key={bars} onClick={() => {
                  setLockBars(bars);
                  saveLockBarsValue(bars);
                  if (engine) engine.lockBars = bars;
                }}
                  style={{
                    flex: 1, padding: "6px 4px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                    background: lockBars === bars ? "var(--preview)" : "var(--bg-cell)",
                    color: lockBars === bars ? "#000" : "var(--text-dim)",
                    cursor: "pointer",
                  }}>
                  {bars} bar{bars > 1 ? "s" : ""}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-gain */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Auto-gain (auto-adjust mic level)</span>
              <button onClick={() => {
                const on = localStorage.getItem("mloop-auto-gain") !== "on";
                localStorage.setItem("mloop-auto-gain", on ? "on" : "off");
                forceUpdate(n => n + 1);
              }} style={{
                padding: "4px 12px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                background: localStorage.getItem("mloop-auto-gain") === "on" ? "var(--preview)" : "var(--bg-cell)",
                color: localStorage.getItem("mloop-auto-gain") === "on" ? "#000" : "var(--text-dim)",
                cursor: "pointer",
              }}>
                {localStorage.getItem("mloop-auto-gain") === "on" ? "ON" : "OFF"}
              </button>
            </div>
          </div>

          {/* Roll/repeat on hold */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Roll on hold (hold pad to repeat)</span>
              <button onClick={() => {
                const on = localStorage.getItem("mloop-roll") !== "on";
                localStorage.setItem("mloop-roll", on ? "on" : "off");
                forceUpdate(n => n + 1);
              }} style={{
                padding: "4px 12px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                background: localStorage.getItem("mloop-roll") === "on" ? "var(--preview)" : "var(--bg-cell)",
                color: localStorage.getItem("mloop-roll") === "on" ? "#000" : "var(--text-dim)",
                cursor: "pointer",
              }}>
                {localStorage.getItem("mloop-roll") === "on" ? "ON" : "OFF"}
              </button>
            </div>
            {localStorage.getItem("mloop-roll") === "on" && (
              <div style={{ display: "flex", gap: 4 }}>
                {[{v: "8", l: "1/8"}, {v: "16", l: "1/16"}, {v: "32", l: "1/32"}, {v: "64", l: "1/64"}].map(r => (
                  <button key={r.v} onClick={() => localStorage.setItem("mloop-roll-rate", r.v)}
                    style={{
                      flex: 1, padding: "4px", borderRadius: 4, fontSize: 9, fontWeight: 700,
                      background: (localStorage.getItem("mloop-roll-rate") || "16") === r.v ? "var(--preview)" : "var(--bg-cell)",
                      color: (localStorage.getItem("mloop-roll-rate") || "16") === r.v ? "#000" : "var(--text-dim)",
                      cursor: "pointer",
                    }}>
                    {r.l}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Count-in before recording */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>Count-in before recording</div>
            <div style={{ display: "flex", gap: 4 }}>
              {([0, 4, 8] as const).map(beats => (
                <button key={beats} onClick={() => {
                  localStorage.setItem("mloop-count-in", String(beats));
                }}
                  style={{
                    flex: 1, padding: "6px 4px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                    background: parseInt(localStorage.getItem("mloop-count-in") || "4") === beats ? "var(--preview)" : "var(--bg-cell)",
                    color: parseInt(localStorage.getItem("mloop-count-in") || "4") === beats ? "#000" : "var(--text-dim)",
                    cursor: "pointer",
                  }}>
                  {beats === 0 ? "Off" : beats === 4 ? "1 bar" : "2 bars"}
                </button>
              ))}
            </div>
          </div>

          {/* ── Info ────────────────────────────────────────────────── */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            Info
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.8 }}>
            <div>Input latency: <b style={{ color: "var(--text)" }}>{latencyMs.toFixed(1)} ms</b></div>
            <div>Session size: <b style={{ color: "var(--text)" }}>{sessionSizeMB.toFixed(1)} MB</b></div>
            <div>Sample rate: <b style={{ color: "var(--text)" }}>44100 Hz</b></div>
          </div>

        </div>
      </div>
    </div>
  );
}
