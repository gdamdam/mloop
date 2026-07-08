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
import type { InputSourceKind } from "../engine/AudioEngine";
import type { SourceInfo } from "../transport/mbus";
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

interface SettingsPanelProps {
  palette: PaletteId;
  onPaletteChange: (id: PaletteId) => void;
  onClose: () => void;
  command: (cmd: LoopCommand) => void;
  latencyMs: number;
  sessionSizeMB: number;
  engine?: {
    lockBars: number;
    switchDevice: (id: string) => Promise<void>;
    inputSourceKind: InputSourceKind;
    setInputSource: (kind: InputSourceKind) => void;
    getMbusSources: () => SourceInfo[];
    mbusSelectedSourceId: string | null;
    setMbusSource: (id: string) => void;
    subscribeMbusSources: (cb: (s: SourceInfo[]) => void) => () => void;
  } | null;
}

export function SettingsPanel({ palette, onPaletteChange, onClose, command, latencyMs, sessionSizeMB, engine }: SettingsPanelProps) {
  const [limits, setLimits] = useState<RecordingLimits>(loadLimits);
  const [, forceUpdate] = useState(0);
  const [velocity, setVelocity] = useState(loadVelocity);
  const [lockBars, setLockBars] = useState<LockBars>(loadLockBars);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState(() => localStorage.getItem("mloop-audio-device") || "");
  const [inputKind, setInputKind] = useState<InputSourceKind>(() => engine?.inputSourceKind ?? "mic");
  const [mbusSources, setMbusSources] = useState<SourceInfo[]>(() => engine?.getMbusSources() ?? []);
  const [mbusSourceId, setMbusSourceId] = useState<string | null>(() => engine?.mbusSelectedSourceId ?? null);

  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices()
      .then(all => setDevices(all.filter(d => d.kind === "audioinput")))
      .catch(() => {});
  }, []);

  // Track the mbus source directory for the picker. Subscribing never creates
  // the client — that only happens when the mbus input is actually selected.
  useEffect(() => {
    if (!engine) return;
    return engine.subscribeMbusSources((sources) => {
      setMbusSources(sources);
      setMbusSourceId(engine.mbusSelectedSourceId ?? sources[0]?.sourceId ?? null);
    });
  }, [engine]);

  const handleInputSource = (kind: InputSourceKind) => {
    setInputKind(kind);
    if (!engine) return;
    engine.setInputSource(kind);
    setMbusSources(engine.getMbusSources());
    setMbusSourceId(engine.mbusSelectedSourceId);
  };

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
    <div className="settings-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="settings-panel">
        <div className="settings-header">
          <span className="settings-title">Settings</span>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Theme ─────────────────────────────────────────── */}
        <div className="settings-section">
          <div className="settings-label">Theme</div>
          {/* 3 dark row on top, 3 light row below — category labels removed. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {[...PALETTES.filter(p => p.dark), ...PALETTES.filter(p => !p.dark)].map((p) => {
              const active = p.id === palette;
              return (
                <button
                  key={p.id}
                  onClick={() => { onPaletteChange(p.id); applyPalette(p); }}
                  aria-pressed={active}
                  title={`${p.name} (${p.dark ? "dark" : "light"})`}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                    gap: 4,
                    padding: 6,
                    borderRadius: 6,
                    border: active ? "2px solid var(--preview)" : "1px solid var(--border)",
                    background: p.panel,
                    color: p.text,
                    cursor: "pointer",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.3,
                    textTransform: "uppercase",
                  }}
                >
                  {/* Swatch strip: bg / cell / accent */}
                  <div style={{ display: "flex", height: 14, borderRadius: 3, overflow: "hidden", border: `1px solid ${p.border}` }}>
                    <div style={{ flex: 1, background: p.bg }} />
                    <div style={{ flex: 1, background: p.cell }} />
                    <div style={{ flex: 1, background: p.preview }} />
                  </div>
                  <span style={{ textAlign: "center" }}>{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Audio Input ───────────────────────────────────── */}
        {(devices.length > 0 || engine) && (
          <div className="settings-section">
            <div className="settings-label">Audio Input</div>
            {engine && (
              <div className="settings-toggles" style={{ marginBottom: 6 }}>
                {(["mic", "mbus"] as const).map(kind => (
                  <button key={kind} className={`settings-toggle${inputKind === kind ? " on" : ""}`}
                    onClick={() => handleInputSource(kind)}
                    style={{ justifyContent: "center" }}>
                    {kind === "mic" ? "Mic / Line" : "mbus"}
                  </button>
                ))}
              </div>
            )}
            {inputKind === "mic" && devices.length > 0 && (
              <select value={selectedDevice} onChange={(e) => handleDeviceChange(e.target.value)}
                style={{
                  width: "100%", padding: "6px 8px", borderRadius: 6, fontSize: 11,
                  background: "var(--bg-cell)", color: "var(--text)", border: "1px solid var(--border)", cursor: "pointer",
                }}>
                <option value="">Default</option>
                {devices.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Input ${d.deviceId.slice(0, 8)}…`}
                  </option>
                ))}
              </select>
            )}
            {inputKind === "mbus" && (
              mbusSources.length > 0 ? (
                <select value={mbusSourceId ?? ""} aria-label="mbus source"
                  onChange={(e) => { setMbusSourceId(e.target.value); engine?.setMbusSource(e.target.value); }}
                  style={{
                    width: "100%", padding: "6px 8px", borderRadius: 6, fontSize: 11,
                    background: "var(--bg-cell)", color: "var(--text)", border: "1px solid var(--border)", cursor: "pointer",
                  }}>
                  {mbusSources.map(s => (
                    <option key={s.sourceId} value={s.sourceId}>
                      {s.name} · {s.sourceId}
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ fontSize: 10, color: "var(--text-dim)", lineHeight: 1.5 }}>
                  No sources — start the link-bridge and publish an output from another instrument.
                </div>
              )
            )}
          </div>
        )}

        {/* ── Recording ─────────────────────────────────────── */}
        <div className="settings-section">
          <div className="settings-label">Recording</div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0" }}>
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Auto-gain</span>
            <button className={`settings-toggle${lsOn("mloop-auto-gain") ? " on" : ""}`} onClick={() => lsToggle("mloop-auto-gain")}>
              <span className="settings-toggle-dot" />
              {lsOn("mloop-auto-gain") ? "ON" : "OFF"}
            </button>
          </div>

          <div style={{ padding: "5px 0" }}>
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Count-in</span>
            <div className="settings-toggles" style={{ marginTop: 4 }}>
              {([0, 4, 8] as const).map(beats => (
                <button key={beats} className={`settings-toggle${parseInt(localStorage.getItem("mloop-count-in") || "4") === beats ? " on" : ""}`}
                  onClick={() => localStorage.setItem("mloop-count-in", String(beats))}
                  style={{ justifyContent: "center" }}>
                  {beats === 0 ? "Off" : beats === 4 ? "1 bar" : "2 bars"}
                </button>
              ))}
            </div>
          </div>

          <div style={{ padding: "5px 0" }}>
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Max time per track</span>
            <div className="settings-toggles" style={{ marginTop: 4 }}>
              {TIME_OPTIONS.map(opt => (
                <button key={opt.value} className={`settings-toggle${limits.maxRecordingTimeSec === opt.value ? " on" : ""}`}
                  onClick={() => updateLimit("maxRecordingTimeSec", opt.value)}
                  style={{ justifyContent: "center" }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ padding: "5px 0" }}>
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Max session size</span>
            <div className="settings-toggles" style={{ marginTop: 4 }}>
              {SIZE_OPTIONS.map(opt => (
                <button key={opt.value} className={`settings-toggle${limits.maxSessionSizeMB === opt.value ? " on" : ""}`}
                  onClick={() => updateLimit("maxSessionSizeMB", opt.value)}
                  style={{ justifyContent: "center" }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Pads ──────────────────────────────────────────── */}
        <div className="settings-section">
          <div className="settings-label">Pads</div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0" }}>
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Velocity sensitivity</span>
            <button className={`settings-toggle${velocity ? " on" : ""}`}
              onClick={() => { const n = !velocity; setVelocity(n); saveVelocity(n); }}>
              <span className="settings-toggle-dot" />
              {velocity ? "ON" : "OFF"}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0" }}>
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Roll on hold</span>
            <button className={`settings-toggle${lsOn("mloop-roll") ? " on" : ""}`} onClick={() => lsToggle("mloop-roll")}>
              <span className="settings-toggle-dot" />
              {lsOn("mloop-roll") ? "ON" : "OFF"}
            </button>
          </div>
          {lsOn("mloop-roll") && (
            <div className="settings-toggles" style={{ marginTop: 4 }}>
              {[{v: "8", l: "1/8"}, {v: "16", l: "1/16"}, {v: "32", l: "1/32"}, {v: "64", l: "1/64"}].map(r => (
                <button key={r.v} className={`settings-toggle${(localStorage.getItem("mloop-roll-rate") || "16") === r.v ? " on" : ""}`}
                  onClick={() => localStorage.setItem("mloop-roll-rate", r.v)}
                  style={{ justifyContent: "center" }}>
                  {r.l}
                </button>
              ))}
            </div>
          )}

          <div style={{ padding: "5px 0" }}>
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Lock bars (LOCK sync)</span>
            <div className="settings-toggles" style={{ marginTop: 4 }}>
              {([1, 2, 4, 8] as const).map(bars => (
                <button key={bars} className={`settings-toggle${lockBars === bars ? " on" : ""}`}
                  onClick={() => {
                    setLockBars(bars); saveLockBarsValue(bars);
                    if (engine) engine.lockBars = bars;
                  }}
                  style={{ justifyContent: "center" }}>
                  {bars} bar{bars > 1 ? "s" : ""}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Session ───────────────────────────────────────── */}
        <div className="settings-section">
          <div className="settings-label">Session</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="settings-toggle" onClick={() => command({ type: "export_session_file" })}
              style={{ flex: 1, justifyContent: "center" }}>
              Export
            </button>
            <button className="settings-toggle" onClick={() => command({ type: "import_session_file" })}
              style={{ flex: 1, justifyContent: "center" }}>
              Import
            </button>
          </div>
        </div>

        {/* ── Link Bridge ───────────────────────────────────── */}
        <div className="settings-section">
          <div className="settings-label">Link Bridge</div>
          <div style={{ fontSize: 10, color: "var(--text-dim)", lineHeight: 1.5 }}>
            Sync BPM and play/stop with <a href="https://mpump.live" target="_blank" rel="noopener" style={{ color: "var(--preview)" }}>mpump</a> via Link Bridge.
            Enable with the <b style={{ color: "var(--text)" }}>L</b> button in the header.
            Both apps must be on the same computer with Link Bridge running.
          </div>
        </div>

        {/* ── Companion App ───────────────────────────────────── */}
        <div className="settings-section">
          <div className="settings-label">Companion</div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.6 }}>
            <a href="https://mpump.live" target="_blank" rel="noopener" style={{ color: "var(--preview)", fontWeight: 700 }}>mpump</a> — Drums, synth, sequencer. Sync via Link Bridge.
          </div>
        </div>

        {/* ── Info ──────────────────────────────────────────── */}
        <div className="settings-section">
          <div className="settings-label">Info</div>
          <div style={{ fontSize: 10, color: "var(--text-dim)", lineHeight: 1.8 }}>
            <span title="Browser round-trip floor: baseLatency + outputLatency. Typically ~10–30 ms; not reducible by the app.">
              Latency: <b style={{ color: "var(--text)" }}>≈ {latencyMs.toFixed(1)} ms</b>
            </span> ·
            Session: <b style={{ color: "var(--text)" }}>{sessionSizeMB.toFixed(1)} MB</b> ·
            Rate: <b style={{ color: "var(--text)" }}>44100 Hz</b>
          </div>
        </div>

        {/* ── Reset ─────────────────────────────────────────── */}
        <div className="settings-section" style={{ marginTop: 8 }}>
          <div className="settings-label">Danger Zone</div>
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
          <div className="settings-privacy">
            Deletes all sessions, samples, kits, and settings
          </div>
        </div>

      </div>
    </div>
  );
}
