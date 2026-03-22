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
import { AboutModal } from "./AboutModal";
import { PrivacyModal } from "./PrivacyModal";
import { MegaKaos } from "./MegaKaos";
import { Tutorial } from "./Tutorial";
import { SettingsPanel } from "./SettingsPanel";
import { AppFooter } from "./AppFooter";
import { VuMeter } from "./VuMeter";
import { NeedleMeter } from "./NeedleMeter";
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
  const [showAbout, setShowAbout] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showMegaKaos, setShowMegaKaos] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTutorial, setShowTutorial] = useState(() => localStorage.getItem("mloop-tutorial-seen") !== "true");
  const [showHamburger, setShowHamburger] = useState(false);
  const [palette, setPalette] = useState<PaletteId>(loadPaletteId);
  const [isPinned, setIsPinned] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [lowSignalAlert, setLowSignalAlert] = useState(false);
  const lowSignalCounter = useRef(0);
  const [masterRec, setMasterRec] = useState(false);
  const [masterRecTime, setMasterRecTime] = useState(0);
  const masterRecStart = useRef(0);

  // Master record timer — counts up while recording
  useEffect(() => {
    if (!masterRec) { setMasterRecTime(0); return; }
    masterRecStart.current = Date.now();
    const id = setInterval(() => setMasterRecTime(Date.now() - masterRecStart.current), 200);
    return () => clearInterval(id);
  }, [masterRec]);

  const handleMasterRec = async () => {
    if (!engine) return;
    if (!masterRec) {
      engine.startMasterRecord();
      setMasterRec(true);
    } else {
      const blob = await engine.stopMasterRecord();
      setMasterRec(false);
      if (blob) {
        // Trigger download
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `mloop-master-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.wav`;
        a.click();
        URL.revokeObjectURL(url);
      }
    }
  };

  // Ref to padEngine for use in rAF poll (padEngine declared later via useMemo)
  const padEngineRef = useRef<{ slots: { status: string }[] } | null>(null);

  // Poll mic input level + global low signal detection
  useEffect(() => {
    if (!engine) return;
    let raf = 0;
    let frame = 0;
    const poll = () => {
      const level = engine.getInputLevel();
      setMicLevel(level);

      // Global low signal detection — checks all recording sources
      frame++;
      if (frame % 60 === 0 && engine.hasMic) {
        const isAnythingRecording =
          state.tracks.some(t => t.status === "recording" || t.status === "overdubbing") ||
          padEngineRef.current?.slots.some(s => s.status === "recording") ||
          false;

        if (isAnythingRecording && level < 0.02) {
          lowSignalCounter.current++;
          if (lowSignalCounter.current >= 2) setLowSignalAlert(true);
        } else {
          lowSignalCounter.current = 0;
          if (!isAnythingRecording || level >= 0.02) setLowSignalAlert(false);
        }
      }

      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [engine, state.tracks]);

  // Check for app updates every 5 minutes (like mpump)
  useEffect(() => {
    const APP_VERSION = "1.0.0-pre.43";
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
  // Keep ref in sync for rAF poll (declared before padEngine due to hook ordering)
  padEngineRef.current = padEngine;

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

  // Main play/stop — PAD mode toggles sequencer, LOOPER mode toggles looper
  const [seqPlaying, setSeqPlaying] = useState(false);
  const handleMainPlayStop = useCallback(() => {
    if (viewMode === "pads") {
      // PAD mode: toggle sequencer
      if (padEngine) {
        if (padEngine.isSeqPlaying) {
          padEngine.stopSequencer();
          setSeqPlaying(false);
          pushPlayingRef.current?.(false);
        } else {
          padEngine.startSequencer();
          setSeqPlaying(true);
          pushPlayingRef.current?.(true);
        }
      }
    } else {
      // LOOPER mode: stop recordings first, then toggle playback
      if (anyRecording) {
        for (const t of state.tracks) {
          if (t.status === "recording" || t.status === "overdubbing") {
            command({ type: "track_stop", trackId: t.id });
          }
        }
        pushPlayingRef.current?.(false);
      } else {
        const anyPlaying = state.tracks.some(t => t.status === "playing");
        command({ type: anyPlaying ? "stop_all" : "play_all" });
        pushPlayingRef.current?.(!anyPlaying);
      }
    }
  }, [viewMode, padEngine, anyRecording, state.tracks, command]);

  // Undo — PAD mode: restore pad/grid snapshot, LOOPER mode: undo last overdub
  const handleUndo = useCallback(() => {
    if (viewMode === "pads") {
      if (padEngine?.undo()) forceRender(n => n + 1);
    } else {
      // Find the last track with layers to undo
      const track = [...state.tracks].reverse().find(t => t.layers > 0);
      if (track) command({ type: "track_undo", trackId: track.id });
    }
  }, [viewMode, padEngine, state.tracks, command]);
  const [, forceRender] = useState(0);

  const canUndo = viewMode === "pads"
    ? (padEngine?.hasUndo ?? false)
    : state.tracks.some(t => t.layers > 0);

  const [flashPad, setFlashPad] = useState<number | null>(null);
  const handlePadTrigger = useCallback((padId: number) => {
    padEngine?.play(padId);
    setFlashPad(padId);
    setTimeout(() => setFlashPad(null), 120);
  }, [padEngine]);
  const { showOverlay, setShowOverlay } = useKeyboardShortcuts(
    command, true, handleMainPlayStop, viewMode, handlePadTrigger, handleUndo
  );
  const midiRef = useMidiMapping(command, true);
  const [linkEnabled, setLinkEnabled] = useState(false);
  const pushPlayingRef = useRef<((playing: boolean) => void) | null>(null);
  // Link play/stop sync — start/stop sequencer (PAD) or looper (LOOPER)
  const linkPlay = useCallback(() => {
    if (viewMode === "pads") {
      if (padEngine && !padEngine.isSeqPlaying) { padEngine.startSequencer(); setSeqPlaying(true); }
    } else {
      command({ type: "play_all" });
    }
  }, [viewMode, padEngine, command]);
  const linkStop = useCallback(() => {
    if (viewMode === "pads") {
      if (padEngine && padEngine.isSeqPlaying) { padEngine.stopSequencer(); setSeqPlaying(false); }
    } else {
      command({ type: "stop_all" });
    }
  }, [viewMode, padEngine, command]);
  const { linkState, pushPlaying, pushTempo } = useLinkBridge(command, linkEnabled, linkPlay, linkStop);
  const pushTempoRef = useRef<((bpm: number) => void) | null>(null);
  pushTempoRef.current = pushTempo;
  pushPlayingRef.current = pushPlaying;

  // Wrap command so BPM changes also push to Link when connected
  const linkedCommand = useCallback((cmd: LoopCommand) => {
    command(cmd);
    if (cmd.type === "set_bpm" && linkState.connected) {
      pushTempoRef.current?.(cmd.bpm);
    }
  }, [command, linkState.connected]);

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
      } else if (count >= 5) {
        // Easter egg — fullscreen KAOS
        setShowMegaKaos(true);
      } else if (count >= 3) {
        // Show credits
        setShowAbout(true);
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
          <pre className={`title-art logo-flash ${logoPulse && state.tracks.some(t => t.status === "playing" || t.status === "recording" || t.status === "overdubbing") ? "logo-pulse" : ""}`} key={logoFlash} style={{ color: "var(--preview)" }} onClick={handleLogoClick} title="1× theme · 2× pulse · 3× credits · 5× ???">{LOGO}</pre>
          <span style={{ fontSize: 8, fontWeight: 800, padding: "1px 4px", borderRadius: 3, background: "var(--preview)", color: "#000", letterSpacing: 0.5, lineHeight: 1 }}>BETA</span>
          <span className="title-version">1.0.0-pre.43</span>
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

        {/* Play/Stop — PAD mode: sequencer, LOOPER mode: looper */}
        {(() => {
          const looperPlaying = state.tracks.some(t => t.status === "playing");
          const isActive = viewMode === "pads" ? seqPlaying : (anyRecording || looperPlaying);
          const isRec = viewMode === "tracks" && anyRecording;
          return (
            <button
              onClick={handleMainPlayStop}
              style={{
                width: 36, height: 36, borderRadius: "50%", fontSize: 16, flexShrink: 0,
                background: isRec ? "var(--record)" : isActive ? "var(--playing)" : "var(--bg-cell)",
                color: isActive ? "#000" : "var(--text)",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "2px solid var(--border)", cursor: "pointer",
                boxShadow: isRec ? "0 0 12px var(--record)" : isActive ? "0 0 10px var(--playing)" : "none",
              }}
              title={viewMode === "pads" ? "Play/Stop Sequencer (Space)" : "Play/Stop All (Space)"}
            >
              {isActive ? "■" : "▶"}
            </button>
          );
        })()}

        {/* Undo — bright when available, dim when nothing to undo */}
        <button
          onClick={handleUndo}
          className="header-btn"
          style={{
            fontSize: 10, fontWeight: 700, padding: "4px 8px",
            opacity: canUndo ? 1 : 0.3,
            color: canUndo ? "var(--preview)" : "var(--text-dim)",
            cursor: canUndo ? "pointer" : "default",
          }}
          title="Undo last action"
          disabled={!canUndo}
        >
          ↩
        </button>

        {/* Master volume */}
        <HeaderSlider label="VOL" min={0} max={1} step={0.01} initial={1}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => { if (engine) engine.getMasterNode().gain.value = v; }}
        />

        {/* VU meter — wraps to new line on mobile via CSS */}
        {/* Spectrum VU meter */}
        <div className="header-vu">
          <VuMeter getAnalyser={() => engine?.getAnalyser() ?? null} />
        </div>

        {/* Desktop: all buttons inline */}
        <div className="header-buttons-desktop" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <HeaderOverflowButtons
            state={state} command={linkedCommand} isPinned={isPinned} setIsPinned={setIsPinned}
            isDark={isDark} toggleDarkLight={toggleDarkLight} toggleFullscreen={toggleFullscreen}
            linkEnabled={linkEnabled} setLinkEnabled={setLinkEnabled} linkState={linkState}
            setShowSessions={setShowSessions} setShowMidi={setShowMidi}
            setShowOverlay={setShowOverlay} setShowSettings={setShowSettings}
          />
        </div>

        {/* Mobile: hamburger button */}
        <div className="header-hamburger-wrap" style={{ position: "relative" }}>
          <button className="header-btn header-hamburger-btn" onClick={() => setShowHamburger(!showHamburger)}
            style={{ fontSize: 16, fontWeight: 700 }}>
            {showHamburger ? "✕" : "≡"}
          </button>
        </div>

        {/* Mobile overflow dropdown */}
        {showHamburger && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={() => setShowHamburger(false)} />
            <div className="header-overflow-menu" onClick={() => setShowHamburger(false)}>
              <HeaderOverflowButtons
                state={state} command={command} isPinned={isPinned} setIsPinned={setIsPinned}
                isDark={isDark} toggleDarkLight={toggleDarkLight} toggleFullscreen={toggleFullscreen}
                linkEnabled={linkEnabled} setLinkEnabled={setLinkEnabled} linkState={linkState}
                setShowSessions={setShowSessions} setShowMidi={setShowMidi}
                setShowOverlay={setShowOverlay} setShowSettings={setShowSettings}
              />
            </div>
          </>
        )}
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

      {/* Global low signal alert — visible in both PAD and LOOPER views */}
      {lowSignalAlert && (
        <div onClick={() => setLowSignalAlert(false)} style={{
          padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer",
          color: "#000", background: "#f0883e", textAlign: "center",
          animation: "pulse 1.5s ease-in-out infinite",
        }}>
          ⚠ No signal detected — increase MIC gain
        </div>
      )}

      {/* ── View content ─────────────────────────────────────────────── */}
      {viewMode === "tracks" ? (
        <div className="looper-layout">
          {/* Looper control bar */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 16px", background: "var(--bg-panel)",
            borderBottom: "1px solid var(--border)",
          }}>
            <button
              onClick={handleMainPlayStop}
              style={{
                width: 32, height: 32, borderRadius: "50%", fontSize: 14, flexShrink: 0,
                background: anyRecording ? "var(--record)"
                  : state.tracks.some(t => t.status === "playing") ? "var(--playing)"
                  : "var(--bg-cell)",
                color: anyRecording || state.tracks.some(t => t.status === "playing") ? "#000" : "var(--text)",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "none", cursor: "pointer",
                boxShadow: anyRecording ? "0 0 10px var(--record)"
                  : state.tracks.some(t => t.status === "playing") ? "0 0 8px var(--playing)" : "none",
              }}
            >
              {anyRecording || state.tracks.some(t => t.status === "playing") ? "■" : "▶"}
            </button>
            {/* Mic LED — same colors as pad view */}
            <div style={{
              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
              background: anyRecording ? "var(--record)"
                : !engine?.hasMic ? "var(--text-dim)"
                : micLevel > 0.02 ? "#66ff99" : "#f0883e",
            }} />
            <HeaderSlider label="MIC" min={0} max={10} step={0.1} initial={1}
              format={(v) => `${Math.round(v * 10)}%`}
              onChange={(v) => { if (engine) engine.setMicGain(v); }}
            />
            <button className="header-btn" onClick={() => command({ type: "toggle_metronome" })}
              style={state.metronome ? { background: "var(--preview)", color: "#000" } : undefined} title="Metronome">♩</button>
            <button className="header-btn" onClick={() => command({ type: "tap_tempo" })} title="Tap Tempo" style={{ fontSize: 9 }}>T</button>
            {/* Master record — captures full output as WAV */}
            <button
              className="header-btn"
              onClick={handleMasterRec}
              title={masterRec ? "Stop master recording" : "Record master output"}
              style={{
                fontSize: 10, fontWeight: 700, minWidth: masterRec ? 64 : 36,
                padding: "4px 8px",
                background: masterRec ? "var(--record)" : undefined,
                color: masterRec ? "#000" : undefined,
                animation: masterRec ? "pulse 1s ease-in-out infinite" : undefined,
              }}
            >
              {masterRec
                ? `■ ${Math.floor(masterRecTime / 60000)}:${String(Math.floor((masterRecTime / 1000) % 60)).padStart(2, "0")}`
                : "REC"}
            </button>
            {/* Analog needle VU meter — fixed width */}
            <div style={{ width: 70, height: 36, flexShrink: 0 }}>
              <NeedleMeter
                isPlaying={state.tracks.some(t => t.status === "playing")}
                isRecording={state.tracks.some(t => t.status === "recording" || t.status === "overdubbing")}
                getAnalyser={() => {
                  if (!engine) return null;
                  // Recording: show input signal. Playing: show output. Idle: show input.
                  const hasPlayback = state.tracks.some(t => t.status === "playing");
                  return hasPlayback ? engine.getAnalyser() : engine.getInputAnalyser();
                }} />
            </div>
          </div>
          <div className="tracks-row">
            {state.tracks.map((track) => (
              <TrackStrip key={track.id} track={track} command={command} engine={engine} padEngine={padEngine}
                masterLoopSec={track.layers === 0 && state.tracks[0]?.loopLengthSamples
                  ? state.tracks[0].loopLengthSamples / (engine?.ctx.sampleRate ?? 44100) : undefined} />
            ))}
          </div>
          <div className="kaos-row">
            <KaosPad engine={engine} />
          </div>
        </div>
      ) : (
        <PadView engine={engine} padEngine={padEngine} flashPad={flashPad} />
      )}

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <AppFooter onShowHelp={() => setShowHelp(true)} onShowCredits={() => setShowAbout(true)} onShowPrivacy={() => setShowPrivacy(true)} />

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
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} onShowTutorial={() => { setShowHelp(false); setShowTutorial(true); }} onShowCredits={() => { setShowHelp(false); setShowAbout(true); }} />}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} getAnalyser={() => engine?.getAnalyser() ?? null} />}
      {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
      {showMegaKaos && <MegaKaos onClose={() => setShowMegaKaos(false)} getAnalyser={() => engine?.getAnalyser() ?? null} />}
      {showTutorial && <Tutorial onClose={() => setShowTutorial(false)} />}
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

/** Compact header slider with live value display. Works on light and dark themes. */
function HeaderSlider({ label, min, max, step, initial, format, onChange }: {
  label: string; min: number; max: number; step: number; initial: number;
  format: (v: number) => string; onChange: (v: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, position: "relative" }}>
      <span style={{ fontSize: 7, color: "var(--text-dim)" }}>{label}</span>
      <input
        type="range" className="volume-slider"
        min={min} max={max} step={step} value={value}
        onChange={(e) => { const v = parseFloat(e.target.value); setValue(v); onChange(v); }}
        style={{ width: 40 }}
      />
      <span style={{
        fontSize: 8, fontWeight: 700, minWidth: 24,
        color: "var(--preview)", textAlign: "center",
      }}>
        {format(value)}
      </span>
    </div>
  );
}

/** Shared overflow buttons used in both desktop inline and mobile dropdown. */
function HeaderOverflowButtons({ state, command, isPinned, setIsPinned, isDark, toggleDarkLight, toggleFullscreen, linkEnabled, setLinkEnabled, linkState, setShowSessions, setShowMidi, setShowOverlay, setShowSettings }: {
  state: EngineState; command: (cmd: LoopCommand) => void;
  isPinned: boolean; setIsPinned: (v: boolean) => void;
  isDark: boolean; toggleDarkLight: () => void; toggleFullscreen: () => void;
  linkEnabled: boolean; setLinkEnabled: (v: boolean) => void; linkState: { connected: boolean; peers: number; tempo: number };
  setShowSessions: (v: boolean) => void; setShowMidi: (v: boolean) => void;
  setShowOverlay: (v: boolean) => void; setShowSettings: (v: boolean) => void;
}) {
  return (
    <>
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
        {state.syncMode === "free" ? "\u2298" : state.syncMode === "sync" ? "\u27F3" : "\uD83D\uDD12"}
      </button>
      <button className="header-btn" onClick={() => command({ type: "set_bpm", bpm: state.bpm - 1 })}>−</button>
      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--preview)", minWidth: 28, textAlign: "center" }}>{state.bpm}</span>
      <button className="header-btn" onClick={() => command({ type: "set_bpm", bpm: state.bpm + 1 })}>+</button>
      <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 2px" }} />
      <button className="header-btn" onClick={() => command({ type: "toggle_metronome" })}
        style={state.metronome ? { background: "var(--preview)", color: "#000" } : undefined} title="Metronome">{"\u2669"}</button>
      <button className="header-btn" onClick={() => command({ type: "tap_tempo" })} title="Tap Tempo" style={{ fontSize: 9 }}>T</button>
      <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 2px" }} />
      <button className="header-btn" onClick={toggleDarkLight} title={isDark ? "Light mode" : "Dark mode"}>{"\u25D1"}</button>
      <button className="header-btn" onClick={toggleFullscreen} title="Fullscreen">{"\u26F6"}</button>
      <button className="header-btn" onClick={() => {
        const name = prompt(isPinned ? "Update pinned session name:" : "Name for pinned session:", "My Session");
        if (name) { command({ type: "pin_session" }); setIsPinned(true); localStorage.setItem("mloop-pin-name", name); }
      }}
        style={isPinned ? { background: "var(--preview)", color: "#000" } : undefined}
        title={isPinned ? `Pinned: ${localStorage.getItem("mloop-pin-name") || "session"} — click to update` : "Pin session (auto-loads on next visit)"}>{"\u2605"}</button>
      <button className="header-btn" onClick={() => setShowSessions(true)} title="Sessions">{"\u2193"}</button>
      {MidiController.isSupported() && (
        <button className="header-btn" onClick={() => setShowMidi(true)} title="MIDI" style={{ fontSize: 9 }}>M</button>
      )}
      <button className="header-btn" onClick={() => {
        const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
        if (isSafari && location.protocol === "https:") {
          alert("Link Bridge requires Chrome or Firefox.\nSafari blocks local connections from HTTPS pages.");
          return;
        }
        setLinkEnabled(!linkEnabled);
      }}
        style={linkState.connected ? { background: "var(--playing)", color: "#000" }
          : linkEnabled ? { background: "var(--preview)", color: "#000" } : undefined}
        title={linkState.connected ? `Link: ${linkState.peers} peers \u00B7 ${Math.round(linkState.tempo)} BPM`
          : linkEnabled ? "Link: connecting..." : "Link Bridge (sync with mpump)"}
      >
        {linkState.connected ? `L${linkState.peers}` : "L"}
      </button>
      <button className="header-btn" onClick={() => setShowOverlay(true)} title="Shortcuts">?</button>
      <button className="header-btn" onClick={() => setShowSettings(true)} title="Settings">{"\u2699"}</button>
    </>
  );
}
