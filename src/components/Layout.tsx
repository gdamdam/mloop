import { useState, useEffect, useCallback } from "react";
import type { EngineState, LoopCommand } from "../types";
import type { AudioEngine } from "../engine/AudioEngine";
import { PALETTES, applyPalette, loadPaletteId } from "../themes";
import type { PaletteId } from "../themes";
import { TrackStrip } from "./TrackStrip";
import { KaosPad } from "./KaosPad";
import { PadView } from "./PadView";
import { SessionManager } from "./SessionManager";
import { ShortcutOverlay } from "./ShortcutOverlay";
import { MidiMapper } from "./MidiMapper";
import { HelpModal } from "./HelpModal";
import { SettingsPanel } from "./SettingsPanel";
import { AppFooter } from "./AppFooter";
import { VuMeter } from "./VuMeter";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useMidiMapping } from "../hooks/useMidiMapping";
import { MidiController } from "../engine/MidiController";

const LOGO = "█▀▄▀█ █   █▀█ █▀█ █▀█\n█ ▀ █ █▄▄ █▄█ █▄█ █▀▀";

type ViewMode = "tracks" | "pads";

interface LayoutProps {
  state: EngineState;
  command: (cmd: LoopCommand) => void;
  engine: AudioEngine | null;
}

export function Layout({ state, command, engine }: LayoutProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("tracks");
  const [showSessions, setShowSessions] = useState(false);
  const [showMidi, setShowMidi] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [palette, setPalette] = useState<PaletteId>(loadPaletteId);

  const { showOverlay, setShowOverlay } = useKeyboardShortcuts(command, true);
  const midiRef = useMidiMapping(command, true);

  useEffect(() => {
    const p = PALETTES.find(x => x.id === palette)!;
    applyPalette(p);
  }, [palette]);

  const handlePaletteChange = useCallback((id: PaletteId) => {
    setPalette(id);
    localStorage.setItem("mloop-palette", id);
  }, []);

  const toggleDarkLight = useCallback(() => {
    const current = PALETTES.find(x => x.id === palette)!;
    const next = current.dark ? "minimal" : "midnight";
    handlePaletteChange(next);
  }, [palette, handlePaletteChange]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }, []);

  const isDark = PALETTES.find(x => x.id === palette)?.dark ?? true;

  return (
    <div className="layout">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="header">
        <div className="title">
          <pre className="title-art" style={{ color: "var(--preview)" }}>{LOGO}</pre>
          <span className="title-version">0.2.5</span>
        </div>
        {/* View mode toggle */}
        <div style={{ display: "flex", gap: 2, background: "var(--bg-cell)", borderRadius: 6, padding: 2 }}>
          <button
            onClick={() => setViewMode("tracks")}
            style={{
              fontSize: 9, fontWeight: 700, padding: "4px 8px", borderRadius: 4,
              background: viewMode === "tracks" ? "var(--preview)" : "transparent",
              color: viewMode === "tracks" ? "#000" : "var(--text-dim)",
              letterSpacing: 0.5,
            }}
          >
            3-TRACK
          </button>
          <button
            onClick={() => setViewMode("pads")}
            style={{
              fontSize: 9, fontWeight: 700, padding: "4px 8px", borderRadius: 4,
              background: viewMode === "pads" ? "var(--preview)" : "transparent",
              color: viewMode === "pads" ? "#000" : "var(--text-dim)",
              letterSpacing: 0.5,
            }}
          >
            PAD
          </button>
        </div>
        <VuMeter getAnalyser={() => engine?.getAnalyser() ?? null} />
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button className="header-btn"
            onClick={() => command({ type: "set_timing_mode", mode: state.timingMode === "free" ? "quantized" : "free" })}
            style={state.timingMode === "quantized" ? { background: "var(--preview)", color: "#000" } : undefined}
          >
            {state.timingMode === "free" ? "FREE" : "QUANT"}
          </button>
          <button className="header-btn" onClick={() => command({ type: "set_bpm", bpm: state.bpm - 1 })}>−</button>
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--preview)", minWidth: 32, textAlign: "center" }}>{state.bpm}</span>
          <button className="header-btn" onClick={() => command({ type: "set_bpm", bpm: state.bpm + 1 })}>+</button>
          <span style={{ fontSize: 9, color: "var(--text-dim)" }}>BPM</span>
          <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 2px" }} />
          <button className="header-btn" onClick={toggleDarkLight} title={isDark ? "Light mode" : "Dark mode"}>
            {isDark ? "☀" : "☾"}
          </button>
          <button className="header-btn" onClick={toggleFullscreen} title="Fullscreen">⛶</button>
          <button className="header-btn" onClick={() => setShowSettings(true)} title="Settings">⚙</button>
        </div>
      </header>

      {/* ── View content ─────────────────────────────────────────────── */}
      {viewMode === "tracks" ? (
        <>
          <div className="tracks">
            {state.tracks.map((track) => (
              <TrackStrip key={track.id} track={track} command={command} engine={engine} />
            ))}
          </div>
          <KaosPad engine={engine} />
        </>
      ) : (
        <PadView engine={engine} />
      )}

      {/* ── Global Transport ──────────────────────────────────────────── */}
      <div className="global-transport">
        <button className="transport-btn" onClick={() => command({ type: "play_all" })} title="Play All">▶</button>
        <button className="transport-btn" onClick={() => command({ type: "stop_all" })} title="Stop All">■</button>
        <button className="transport-btn" onClick={() => command({ type: "toggle_metronome" })}
          style={state.metronome ? { background: "var(--preview)", color: "#000" } : undefined} title="Metronome">♩</button>
        <button className="transport-btn" onClick={() => command({ type: "tap_tempo" })} title="Tap Tempo" style={{ fontSize: 10, fontWeight: 700 }}>TAP</button>
        <button className="transport-btn" onClick={() => setShowSessions(true)} title="Sessions" style={{ fontSize: 12 }}>💾</button>
        {MidiController.isSupported() && (
          <button className="transport-btn" onClick={() => setShowMidi(true)} title="MIDI" style={{ fontSize: 10, fontWeight: 700 }}>MIDI</button>
        )}
        <button className="transport-btn" onClick={() => setShowOverlay(true)} title="Shortcuts" style={{ fontSize: 12 }}>⌨</button>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <AppFooter onShowHelp={() => setShowHelp(true)} />

      {/* ── Modals ────────────────────────────────────────────────────── */}
      {showSessions && (
        <SessionManager
          onClose={() => setShowSessions(false)}
          onSave={(name) => { command({ type: "save_session", name }); setShowSessions(false); }}
          onLoad={(name) => { command({ type: "load_session", name }); setShowSessions(false); }}
          onExportWav={() => command({ type: "export_wav" })}
        />
      )}
      {showOverlay && <ShortcutOverlay onClose={() => setShowOverlay(false)} />}
      {showMidi && midiRef.current && <MidiMapper controller={midiRef.current} onClose={() => setShowMidi(false)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {showSettings && <SettingsPanel palette={palette} onPaletteChange={handlePaletteChange} onClose={() => setShowSettings(false)} />}
    </div>
  );
}
