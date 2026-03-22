/**
 * SettingsPanel — compact settings layout inspired by mpump.
 * Toggle rows (label + ON/OFF), dropdowns, small option buttons.
 */

import { useState, useEffect } from "react";
import { PALETTES, applyPalette } from "../themes";
import type { PaletteId } from "../themes";
import type { LoopCommand } from "../types";
import type { LockBars } from "../types";
import {
  loadLimits, saveLimits, TIME_OPTIONS, SIZE_OPTIONS,
  type RecordingLimits,
} from "../utils/recordingLimits";
// Pad layout removed from settings — drag to rearrange instead

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

// Reusable compact styles
const S = {
  section: { fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase" as const, letterSpacing: 1, margin: "16px 0 6px" },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0" } as const,
  label: { fontSize: 11, color: "var(--text-dim)" },
  toggle: (on: boolean) => ({
    padding: "3px 10px", borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: "pointer", border: "none",
    background: on ? "var(--preview)" : "var(--bg-cell)", color: on ? "#000" : "var(--text-dim)",
  }),
  optRow: { display: "flex", gap: 3, marginTop: 4 } as const,
  opt: (on: boolean) => ({
    flex: 1, padding: "4px 2px", borderRadius: 4, fontSize: 9, fontWeight: 700, cursor: "pointer", border: "none", textAlign: "center" as const,
    background: on ? "var(--preview)" : "var(--bg-cell)", color: on ? "#000" : "var(--text-dim)",
  }),
  select: {
    width: "100%", padding: "6px 8px", borderRadius: 6, fontSize: 11,
    background: "var(--bg-cell)", color: "var(--text)", border: "1px solid var(--border)", cursor: "pointer",
  },
};

interface SettingsPanelProps {
  palette: PaletteId;
  onPaletteChange: (id: PaletteId) => void;
  onClose: () => void;
  command: (cmd: LoopCommand) => void;
  latencyMs: number;
  sessionSizeMB: number;
  engine?: { lockBars: number; switchDevice: (id: string) => Promise<void> } | null;
}

export function SettingsPanel({ palette, onPaletteChange, onClose, command, latencyMs, sessionSizeMB, engine }: SettingsPanelProps) {
  const [limits, setLimits] = useState<RecordingLimits>(loadLimits);
  const [, forceUpdate] = useState(0);
  const [velocity, setVelocity] = useState(loadVelocity);
  const [lockBars, setLockBars] = useState<LockBars>(loadLockBars);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState(() => localStorage.getItem("mloop-audio-device") || "");

  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices()
      .then(all => setDevices(all.filter(d => d.kind === "audioinput")))
      .catch(() => {});
  }, []);

  const handleDeviceChange = async (deviceId: string) => {
    setSelectedDevice(deviceId);
    localStorage.setItem("mloop-audio-device", deviceId);
    if (engine) {
      try { await engine.switchDevice(deviceId); } catch { /* device may be unavailable */ }
    }
  };

  const updateLimit = (key: keyof RecordingLimits, value: number) => {
    const updated = { ...limits, [key]: value };
    setLimits(updated);
    saveLimits(updated);
  };

  const lsToggle = (key: string) => {
    const on = localStorage.getItem(key) !== "on";
    localStorage.setItem(key, on ? "on" : "off");
    forceUpdate(n => n + 1);
  };
  const lsOn = (key: string) => localStorage.getItem(key) === "on";

  return (
    <div className="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" style={{ maxHeight: "85dvh" }}>
        <div className="sheet-header">
          <span className="sheet-title">Settings</span>
          <button className="sheet-close" onClick={onClose}>✕</button>
        </div>
        <div className="sheet-body">

          {/* ── Theme ─────────────────────────────────────────── */}
          <div style={S.section}>Theme</div>
          <div style={{ fontSize: 9, color: "var(--text-dim)", marginBottom: 3 }}>DARK</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {PALETTES.filter(p => p.dark).map(p => (
              <button key={p.id} onClick={() => { onPaletteChange(p.id); applyPalette(p); }}
                style={{
                  padding: "6px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                  background: p.bg, color: p.text,
                  border: palette === p.id ? `2px solid ${p.preview}` : "2px solid transparent",
                  cursor: "pointer",
                }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.preview, display: "inline-block", marginRight: 3 }} />
                {p.name}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 9, color: "var(--text-dim)", marginBottom: 3 }}>LIGHT</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {PALETTES.filter(p => !p.dark).map(p => (
              <button key={p.id} onClick={() => { onPaletteChange(p.id); applyPalette(p); }}
                style={{
                  padding: "6px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                  background: p.bg, color: p.text,
                  border: palette === p.id ? `2px solid ${p.preview}` : `2px solid ${p.border}`,
                  cursor: "pointer",
                }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.preview, display: "inline-block", marginRight: 3 }} />
                {p.name}
              </button>
            ))}
          </div>

          {/* ── Audio Input ───────────────────────────────────── */}
          {devices.length > 0 && (<>
            <div style={S.section}>Audio Input</div>
            <select value={selectedDevice} onChange={(e) => handleDeviceChange(e.target.value)} style={S.select}>
              <option value="">Default</option>
              {devices.map(d => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Input ${d.deviceId.slice(0, 8)}…`}
                </option>
              ))}
            </select>
          </>)}

          {/* ── Recording ─────────────────────────────────────── */}
          <div style={S.section}>Recording</div>

          <div style={S.row}>
            <span style={S.label}>Auto-gain</span>
            <button onClick={() => lsToggle("mloop-auto-gain")} style={S.toggle(lsOn("mloop-auto-gain"))}>
              {lsOn("mloop-auto-gain") ? "ON" : "OFF"}
            </button>
          </div>

          <div style={{ padding: "5px 0" }}>
            <span style={S.label}>Count-in</span>
            <div style={S.optRow}>
              {([0, 4, 8] as const).map(beats => (
                <button key={beats} onClick={() => localStorage.setItem("mloop-count-in", String(beats))}
                  style={S.opt(parseInt(localStorage.getItem("mloop-count-in") || "4") === beats)}>
                  {beats === 0 ? "Off" : beats === 4 ? "1 bar" : "2 bars"}
                </button>
              ))}
            </div>
          </div>

          <div style={{ padding: "5px 0" }}>
            <span style={S.label}>Max time per track</span>
            <div style={S.optRow}>
              {TIME_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => updateLimit("maxRecordingTimeSec", opt.value)}
                  style={S.opt(limits.maxRecordingTimeSec === opt.value)}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ padding: "5px 0" }}>
            <span style={S.label}>Max session size</span>
            <div style={S.optRow}>
              {SIZE_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => updateLimit("maxSessionSizeMB", opt.value)}
                  style={S.opt(limits.maxSessionSizeMB === opt.value)}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Pads ──────────────────────────────────────────── */}
          <div style={S.section}>Pads</div>

          <div style={S.row}>
            <span style={S.label}>Velocity sensitivity</span>
            <button onClick={() => { const n = !velocity; setVelocity(n); saveVelocity(n); }}
              style={S.toggle(velocity)}>
              {velocity ? "ON" : "OFF"}
            </button>
          </div>

          <div style={S.row}>
            <span style={S.label}>Roll on hold</span>
            <button onClick={() => lsToggle("mloop-roll")} style={S.toggle(lsOn("mloop-roll"))}>
              {lsOn("mloop-roll") ? "ON" : "OFF"}
            </button>
          </div>
          {lsOn("mloop-roll") && (
            <div style={S.optRow}>
              {[{v: "8", l: "1/8"}, {v: "16", l: "1/16"}, {v: "32", l: "1/32"}, {v: "64", l: "1/64"}].map(r => (
                <button key={r.v} onClick={() => localStorage.setItem("mloop-roll-rate", r.v)}
                  style={S.opt((localStorage.getItem("mloop-roll-rate") || "16") === r.v)}>
                  {r.l}
                </button>
              ))}
            </div>
          )}

          <div style={{ padding: "5px 0" }}>
            <span style={S.label}>Lock bars (LOCK sync)</span>
            <div style={S.optRow}>
              {([1, 2, 4, 8] as const).map(bars => (
                <button key={bars} onClick={() => {
                  setLockBars(bars); saveLockBarsValue(bars);
                  if (engine) engine.lockBars = bars;
                }} style={S.opt(lockBars === bars)}>
                  {bars} bar{bars > 1 ? "s" : ""}
                </button>
              ))}
            </div>
          </div>

          {/* ── Session ───────────────────────────────────────── */}
          <div style={S.section}>Session</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => command({ type: "export_session_file" })}
              style={{ ...S.toggle(false), flex: 1, padding: "6px 4px", fontSize: 10 }}>
              Export
            </button>
            <button onClick={() => command({ type: "import_session_file" })}
              style={{ ...S.toggle(false), flex: 1, padding: "6px 4px", fontSize: 10 }}>
              Import
            </button>
          </div>

          {/* ── Link Bridge ───────────────────────────────────── */}
          <div style={S.section}>Link Bridge</div>
          <div style={{ fontSize: 10, color: "var(--text-dim)", lineHeight: 1.5 }}>
            Sync with mpump via localhost:19876. Enable with the LINK button in the header.
          </div>

          {/* ── Info ──────────────────────────────────────────── */}
          <div style={S.section}>Info</div>
          <div style={{ fontSize: 10, color: "var(--text-dim)", lineHeight: 1.8 }}>
            Latency: <b style={{ color: "var(--text)" }}>{latencyMs.toFixed(1)} ms</b> ·
            Session: <b style={{ color: "var(--text)" }}>{sessionSizeMB.toFixed(1)} MB</b> ·
            Rate: <b style={{ color: "var(--text)" }}>44100 Hz</b>
          </div>

          {/* ── Reset ─────────────────────────────────────────── */}
          <div style={{ ...S.section, marginTop: 24 }}>Danger Zone</div>
          <button
            onClick={() => {
              if (window.confirm("Reset everything? This will delete all sessions, samples, settings, and reload the app. This cannot be undone.")) {
                localStorage.clear();
                indexedDB.databases?.().then(dbs => {
                  for (const db of dbs) { if (db.name) indexedDB.deleteDatabase(db.name); }
                }).catch(() => {});
                window.location.reload();
              }
            }}
            style={{
              width: "100%", padding: 8, borderRadius: 6, fontSize: 11, fontWeight: 700,
              background: "#ff4444", color: "#fff", cursor: "pointer", border: "none",
            }}
          >
            Reset Everything
          </button>
          <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 3, textAlign: "center" }}>
            Deletes all sessions, samples, kits, and settings
          </div>

        </div>
      </div>
    </div>
  );
}
