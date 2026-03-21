import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { EngineState, LoopCommand } from "../types";
import type { AudioEngine } from "../engine/AudioEngine";
import { PadEngine } from "../engine/PadEngine";
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
import { loadSession } from "../utils/storage";
import { generateDefaultSamples } from "../engine/BuiltInSamples";
import { useLinkBridge } from "../hooks/useLinkBridge";

const LOGO = "█▀▄▀█ █   █▀█ █▀█ █▀█\n█ ▀ █ █▄▄ █▄█ █▄█ █▀▀";

type ViewMode = "tracks" | "pads";

interface LayoutProps {
  state: EngineState;
  command: (cmd: LoopCommand) => void;
  engine: AudioEngine | null;
}

export function Layout({ state, command, engine }: LayoutProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("pads");
  const [showSessions, setShowSessions] = useState(false);
  const [showMidi, setShowMidi] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [palette, setPalette] = useState<PaletteId>(loadPaletteId);
  const [isPinned, setIsPinned] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // Check for app updates every 5 minutes (like mpump)
  useEffect(() => {
    const APP_VERSION = "0.12.7";
    const check = () => {
      fetch("version.json", { cache: "no-store" })
        .then(r => r.json())
        .then(data => { if (data.v && data.v !== APP_VERSION) setUpdateAvailable(true); })
        .catch(() => {});
    };
    check();
    const id = setInterval(check, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Check if a pinned session exists on mount
  useEffect(() => {
    loadSession("__pinned__").then(s => setIsPinned(!!s && s.tracks.some(t => t.layers.length > 0))).catch(() => {});
  }, []);

  // PadEngine — create synchronously on first render when engine exists.
  // useMemo ensures it's created exactly once per engine instance, not async.
  const padEngine = useMemo(() => {
    if (!engine) return null;
    const pe = new PadEngine(engine.ctx, engine.getInputNode(), engine.getMasterNode());
    pe.countInBeats = parseInt(localStorage.getItem("mloop-count-in") || "4");
    return pe;
  }, [engine]);

  // Load 8 default drum samples into pads on first init
  useEffect(() => {
    if (!padEngine) return;
    // Only load defaults if all pads are empty (don't overwrite user samples)
    if (padEngine.slots.some(s => s.status === "loaded")) return;
    generateDefaultSamples().then(samples => {
      for (let i = 0; i < samples.length && i < 16; i++) {
        padEngine.importBuffer(i, samples[i].buffer, samples[i].name);
      }
      // Default pattern showcasing all 8 sounds
      // Pads: 0=Kick, 1=Snare, 2=HH, 3=Clap, 4=Open HH, 5=Rim, 6=Tom, 7=Cymbal
      const grid = Array.from({ length: 64 }, () => Array(16).fill(false));
      // Kick: 1, 5, 9, 11, 13
      [0, 4, 8, 10, 12].forEach(s => grid[s][0] = true);
      // Snare: 4, 12
      [4, 12].forEach(s => grid[s][1] = true);
      // Closed HH: every other step
      [0,2,4,6,8,10,12,14].forEach(s => grid[s][2] = true);
      // Clap: 4, 12 (layered with snare)
      [4, 12].forEach(s => grid[s][3] = true);
      // Open HH: off-beats
      [3, 7, 11, 15].forEach(s => grid[s][4] = true);
      // Rim: ghost notes
      [2, 6, 14].forEach(s => grid[s][5] = true);
      // Tom: fill at end
      [13, 14].forEach(s => grid[s][6] = true);
      // Cymbal: bar start
      grid[0][7] = true;
      padEngine.setSeqGrid(grid);
    });
  }, [padEngine]);

  // Check if any track is recording (for header play/stop logic)
  const anyRecording = state.tracks.some(t => t.status === "recording" || t.status === "overdubbing");

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

  // Main play/stop — stops recording first, then stops/plays all
  const handleMainPlayStop = useCallback(() => {
    if (anyRecording) {
      // Stop all recordings first
      for (const t of state.tracks) {
        if (t.status === "recording" || t.status === "overdubbing") {
          command({ type: "track_stop", trackId: t.id });
        }
      }
    } else {
      const anyPlaying = state.tracks.some(t => t.status === "playing");
      command({ type: anyPlaying ? "stop_all" : "play_all" });
    }
  }, [anyRecording, state.tracks, command]);

  const handlePadTrigger = useCallback((padId: number) => {
    padEngine?.play(padId);
  }, [padEngine]);
  const { showOverlay, setShowOverlay } = useKeyboardShortcuts(
    command, true, handleMainPlayStop, viewMode, handlePadTrigger
  );
  const midiRef = useMidiMapping(command, true);
  const [linkEnabled, setLinkEnabled] = useState(false);
  const { linkState } = useLinkBridge(command, linkEnabled);

  // Logo click — matches mpump: 1x=random theme, 2x=cycle pulse mode, 3+=about
  // Every click triggers a flash animation via key remount
  const [logoFlash, setLogoFlash] = useState(0);
  const [logoPulse, setLogoPulse] = useState(true);
  const logoClickCount = useRef(0);
  const logoClickTimer = useRef<number>(0);
  const handleLogoClick = useCallback(() => {
    logoClickCount.current++;
    setLogoFlash(f => f + 1); // triggers CSS flash animation via key change
    clearTimeout(logoClickTimer.current);
    logoClickTimer.current = window.setTimeout(() => {
      const count = logoClickCount.current;
      if (count === 1) {
        // Random theme
        const randomPalette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
        handlePaletteChange(randomPalette.id);
      } else if (count === 2) {
        // Toggle logo pulse (beat-reactive animation)
        setLogoPulse(p => !p);
      } else if (count >= 3) {
        // Show help/about
        setShowHelp(true);
      }
      logoClickCount.current = 0;
    }, 420);
  }, [handlePaletteChange]);

  const isDark = PALETTES.find(x => x.id === palette)?.dark ?? true;

  return (
    <div className="layout">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="header">
        <div className="title">
          <pre className={`title-art logo-flash ${logoPulse && state.tracks.some(t => t.status === "playing" || t.status === "recording" || t.status === "overdubbing") ? "logo-pulse" : ""}`} key={logoFlash} style={{ color: "var(--preview)" }} onClick={handleLogoClick} title="1× theme · 2× pulse · 3× help">{LOGO}</pre>
          <span style={{ fontSize: 8, fontWeight: 800, padding: "1px 4px", borderRadius: 3, background: "var(--preview)", color: "#000", letterSpacing: 0.5, lineHeight: 1 }}>BETA</span>
          <span className="title-version">0.12.7</span>
        </div>

        {/* View toggle */}
        <div style={{ display: "flex", gap: 2, background: "var(--bg-cell)", borderRadius: 6, padding: 2 }}>
          {(["pads", "tracks"] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)} style={{
              fontSize: 9, fontWeight: 700, padding: "4px 8px", borderRadius: 4,
              background: viewMode === m ? "var(--preview)" : "transparent",
              color: viewMode === m ? "#000" : "var(--text-dim)", letterSpacing: 0.5,
            }}>
              {m === "tracks" ? "LOOPER" : "PAD"}
            </button>
          ))}
        </div>

        {/* Play/Stop — prominent */}
        <button
          onClick={handleMainPlayStop}
          style={{
            width: 36, height: 36, borderRadius: "50%", fontSize: 16, flexShrink: 0,
            background: anyRecording ? "var(--record)"
              : state.tracks.some(t => t.status === "playing") ? "var(--playing)"
              : "var(--bg-cell)",
            color: anyRecording || state.tracks.some(t => t.status === "playing") ? "#000" : "var(--text)",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "2px solid var(--border)", cursor: "pointer",
            boxShadow: anyRecording ? "0 0 12px var(--record)"
              : state.tracks.some(t => t.status === "playing") ? "0 0 10px var(--playing)" : "none",
          }}
          title={anyRecording ? "Stop Recording (Space)" : "Play/Stop All (Space)"}
        >
          {anyRecording || state.tracks.some(t => t.status === "playing") ? "■" : "▶"}
        </button>

        {/* Mic gain + Master volume */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 7, color: "var(--text-dim)" }}>MIC</span>
            <input
              type="range" className="volume-slider"
              min={0} max={5} step={0.1}
              defaultValue={1}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (engine) engine.getInputNode().gain.value = v;
              }}
              style={{ width: 40 }}
              title="Mic gain (0–5x boost)"
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 7, color: "var(--text-dim)" }}>VOL</span>
            <input
              type="range" className="volume-slider"
              min={0} max={1} step={0.01}
              defaultValue={1}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (engine) engine.getMasterNode().gain.value = v;
              }}
              style={{ width: 40 }}
              title="Master volume"
            />
          </div>
        </div>

        {/* VU meter — wraps to new line on mobile via CSS */}
        <div className="header-vu">
          <VuMeter getAnalyser={() => engine?.getAnalyser() ?? null} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button className="header-btn"
            onClick={() => command({ type: "set_timing_mode", mode: state.timingMode === "free" ? "quantized" : "free" })}
            style={state.timingMode === "quantized" ? { background: "var(--preview)", color: "#000" } : undefined}
          >
            {state.timingMode === "free" ? "FREE" : "QNT"}
          </button>
          <button className="header-btn"
            onClick={() => {
              const modes: Array<"free" | "sync" | "lock"> = ["free", "sync", "lock"];
              const next = modes[(modes.indexOf(state.syncMode) + 1) % modes.length];
              command({ type: "set_sync_mode", mode: next });
            }}
            style={state.syncMode !== "free" ? { background: "var(--preview)", color: "#000" } : undefined}
            title={`Sync: ${state.syncMode.toUpperCase()}`}
          >
            {state.syncMode === "free" ? "⊘" : state.syncMode === "sync" ? "⟳" : "🔒"}
          </button>
          <button className="header-btn" onClick={() => command({ type: "set_bpm", bpm: state.bpm - 1 })}>−</button>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--preview)", minWidth: 28, textAlign: "center" }}>{state.bpm}</span>
          <button className="header-btn" onClick={() => command({ type: "set_bpm", bpm: state.bpm + 1 })}>+</button>
          <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 2px" }} />
          <button className="header-btn" onClick={() => command({ type: "toggle_metronome" })}
            style={state.metronome ? { background: "var(--preview)", color: "#000" } : undefined} title="Metronome">♩</button>
          <button className="header-btn" onClick={() => command({ type: "tap_tempo" })} title="Tap Tempo" style={{ fontSize: 9 }}>T</button>
          <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 2px" }} />
          <button className="header-btn" onClick={toggleDarkLight} title={isDark ? "Light mode" : "Dark mode"}>◑</button>
          <button className="header-btn" onClick={toggleFullscreen} title="Fullscreen">⛶</button>
          <button className="header-btn" onClick={() => command({ type: "share_link" })} title="Share settings link">⤴</button>
          <button className="header-btn" onClick={() => { command({ type: "pin_session" }); setIsPinned(true); }}
            style={isPinned ? { background: "var(--preview)", color: "#000" } : undefined}
            title={isPinned ? "Session pinned — click to update" : "Pin session (auto-loads on next visit)"}>★</button>
          <button className="header-btn" onClick={() => setShowSessions(true)} title="Sessions">↓</button>
          {MidiController.isSupported() && (
            <button className="header-btn" onClick={() => setShowMidi(true)} title="MIDI" style={{ fontSize: 9 }}>M</button>
          )}
          <button className="header-btn" onClick={() => setLinkEnabled(!linkEnabled)}
            style={linkState.connected ? { background: "var(--playing)", color: "#000" } : linkEnabled ? { background: "var(--preview)", color: "#000" } : undefined}
            title={linkState.connected ? `Link: ${linkState.peers} peers · ${Math.round(linkState.tempo)} BPM` : linkEnabled ? "Link: connecting..." : "Link Bridge (sync with mpump)"}
          >
            {linkState.connected ? `L${linkState.peers}` : "L"}
          </button>
          <button className="header-btn" onClick={() => setShowOverlay(true)} title="Shortcuts">?</button>
          <button className="header-btn" onClick={() => setShowSettings(true)} title="Settings">⚙</button>
        </div>
      </header>

      {/* Mic unavailable notice */}
      {engine && !engine.hasMic && (
        <div style={{
          textAlign: "center", padding: "6px 16px", fontSize: 11,
          background: "var(--bg-panel)", color: "var(--text-dim)",
          borderBottom: "1px solid var(--border)",
        }}>
          Mic unavailable — recording disabled. Check browser mic permissions or try Chrome/Safari.
        </div>
      )}

      {/* Update banner */}
      {updateAvailable && (
        <div onClick={() => location.reload()} style={{
          textAlign: "center", padding: "8px 16px", fontSize: 12, fontWeight: 700,
          background: "var(--preview)", color: "#000", cursor: "pointer",
        }}>
          New version available — tap to update
        </div>
      )}

      {/* ── View content ─────────────────────────────────────────────── */}
      {viewMode === "tracks" ? (
        <div className="looper-layout">
          <div className="tracks-row">
            {state.tracks.map((track) => (
              <TrackStrip key={track.id} track={track} command={command} engine={engine} padEngine={padEngine} />
            ))}
          </div>
          <div className="kaos-center">
            <KaosPad engine={engine} />
          </div>
        </div>
      ) : (
        <PadView engine={engine} padEngine={padEngine} />
      )}

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
      {showSettings && (
        <SettingsPanel
          palette={palette}
          onPaletteChange={handlePaletteChange}
          onClose={() => setShowSettings(false)}
          command={command}
          latencyMs={engine ? (engine.inputLatencySamples / 44100) * 1000 : 0}
          sessionSizeMB={engine ? engine.tracks.reduce((acc, t) => {
            const layers = t.getLayers();
            return acc + layers.reduce((s, l) => s + l.byteLength, 0);
          }, 0) / (1024 * 1024) : 0}
          engine={engine}
        />
      )}
    </div>
  );
}
