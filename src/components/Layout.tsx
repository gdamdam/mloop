import { useState } from "react";
import type { EngineState, LoopCommand } from "../types";
import type { AudioEngine } from "../engine/AudioEngine";
import { TrackStrip } from "./TrackStrip";
import { SessionManager } from "./SessionManager";
import { ShortcutOverlay } from "./ShortcutOverlay";
import { MidiMapper } from "./MidiMapper";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useMidiMapping } from "../hooks/useMidiMapping";
import { MidiController } from "../engine/MidiController";

interface LayoutProps {
  state: EngineState;
  command: (cmd: LoopCommand) => void;
  engine: AudioEngine | null;
}

export function Layout({ state, command, engine }: LayoutProps) {
  const [showSessions, setShowSessions] = useState(false);
  const [showMidi, setShowMidi] = useState(false);

  const { showOverlay, setShowOverlay } = useKeyboardShortcuts(command, true);
  const midiRef = useMidiMapping(command, true);

  return (
    <div className="layout">
      <header className="header">
        <div className="title">
          <pre className="title-art">mloop</pre>
          <span className="title-version">0.1.0</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            style={{
              fontSize: 10, fontWeight: 700, padding: "4px 8px", borderRadius: 4,
              background: state.timingMode === "quantized" ? "var(--accent)" : "var(--bg-cell)",
              color: state.timingMode === "quantized" ? "var(--bg)" : "var(--text-dim)",
              letterSpacing: 0.5,
            }}
            onClick={() => command({
              type: "set_timing_mode",
              mode: state.timingMode === "free" ? "quantized" : "free",
            })}
            title="Toggle free/quantized"
          >
            {state.timingMode === "free" ? "FREE" : "QUANT"}
          </button>
          <div className="bpm-display">
            <button
              style={{ fontSize: 14, fontWeight: 700, width: 28, height: 28, borderRadius: 6, background: "var(--bg-cell)", display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={() => command({ type: "set_bpm", bpm: state.bpm - 1 })}
            >
              −
            </button>
            <span className="bpm-value" style={{ minWidth: 40, textAlign: "center" }}>{state.bpm}</span>
            <button
              style={{ fontSize: 14, fontWeight: 700, width: 28, height: 28, borderRadius: 6, background: "var(--bg-cell)", display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={() => command({ type: "set_bpm", bpm: state.bpm + 1 })}
            >
              +
            </button>
            <span className="bpm-label">bpm</span>
          </div>
        </div>
      </header>

      <div className="tracks">
        {state.tracks.map((track) => (
          <TrackStrip key={track.id} track={track} command={command} engine={engine} />
        ))}
      </div>

      <div className="global-transport">
        <button className="transport-btn" onClick={() => command({ type: "play_all" })} title="Play All">▶</button>
        <button className="transport-btn" onClick={() => command({ type: "stop_all" })} title="Stop All">■</button>
        <button
          className="transport-btn"
          onClick={() => command({ type: "toggle_metronome" })}
          style={state.metronome ? { background: "var(--accent)", color: "var(--bg)" } : undefined}
          title="Metronome"
        >
          ♩
        </button>
        <button className="transport-btn" onClick={() => command({ type: "tap_tempo" })} title="Tap Tempo" style={{ fontSize: 10, fontWeight: 700 }}>TAP</button>
        <button className="transport-btn" onClick={() => setShowSessions(true)} title="Sessions" style={{ fontSize: 12 }}>💾</button>
        {MidiController.isSupported() && (
          <button className="transport-btn" onClick={() => setShowMidi(true)} title="MIDI" style={{ fontSize: 10, fontWeight: 700 }}>MIDI</button>
        )}
        <button className="transport-btn" onClick={() => setShowOverlay(true)} title="Shortcuts" style={{ fontSize: 12 }}>⌨</button>
      </div>

      {showSessions && (
        <SessionManager
          onClose={() => setShowSessions(false)}
          onSave={(name) => { command({ type: "save_session", name }); setShowSessions(false); }}
          onLoad={(name) => { command({ type: "load_session", name }); setShowSessions(false); }}
          onExportWav={() => command({ type: "export_wav" })}
        />
      )}

      {showOverlay && <ShortcutOverlay onClose={() => setShowOverlay(false)} />}

      {showMidi && midiRef.current && (
        <MidiMapper controller={midiRef.current} onClose={() => setShowMidi(false)} />
      )}
    </div>
  );
}
