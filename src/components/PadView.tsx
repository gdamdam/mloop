/**
 * PadView — recorder + 4x4 sample pad grid + step sequencer.
 * Tap empty pad → record. Tap loaded → play. Delete/edit icons on loaded pads.
 * Recording auto-stops when clicking another pad.
 */

import { useRef, useCallback, useEffect, useState } from "react";
import type { AudioEngine } from "../engine/AudioEngine";
import type { PadEngine, PadSlot } from "../engine/PadEngine";
import { PadSequencer } from "./PadSequencer";
import { SampleEditor } from "./SampleEditor";
import { SAMPLE_PRESETS } from "../engine/BuiltInSamples";
import {
  loadSavedKits, saveKit, exportKit, importKit, padsToKit, kitToPads,
  // PAD_LAYOUTS removed — drag to rearrange instead
} from "../utils/kitManager";
import { SoundBrowser } from "./SoundBrowser";
import { PadDetail } from "./PadDetail";
import type { PlayMode } from "./PadDetail";
import { SampleSlicer } from "./SampleSlicer";
import { ScratchpadRecorder } from "./ScratchpadRecorder";

interface PadViewProps {
  engine: AudioEngine | null;
  padEngine: PadEngine | null;
  flashPad?: number | null;
}

/**
 * Mini waveform — matches looper WaveformDisplay style:
 * filled shape (top + mirror), status-colored, white playhead.
 */
function MiniWaveform({ buffer, isPlaying }: { buffer: Float32Array | null; isPlaying?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const startRef = useRef(0);

  // Reset playhead on play state change (same as looper)
  useEffect(() => {
    if (isPlaying) startRef.current = performance.now();
  }, [isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
      }
      ctx.clearRect(0, 0, w, h);
      if (!buffer || buffer.length === 0) return;

      const preview = getComputedStyle(document.documentElement).getPropertyValue("--preview").trim() || "#b388ff";
      const color = isPlaying ? "#66ff99" : preview;
      const halfH = h / 2;
      const step = Math.max(1, Math.floor(buffer.length / w));

      // Filled waveform shape: top outline → bottom mirror → fill + stroke
      ctx.fillStyle = color + "40";
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, halfH);
      for (let x = 0; x < w; x++) {
        const idx = Math.floor((x / w) * buffer.length);
        let max = 0;
        for (let j = 0; j < step && idx + j < buffer.length; j++) {
          const v = Math.abs(buffer[idx + j]);
          if (v > max) max = v;
        }
        ctx.lineTo(x, halfH - max * halfH * 0.9);
      }
      for (let x = w - 1; x >= 0; x--) {
        const idx = Math.floor((x / w) * buffer.length);
        let max = 0;
        for (let j = 0; j < step && idx + j < buffer.length; j++) {
          const v = Math.abs(buffer[idx + j]);
          if (v > max) max = v;
        }
        ctx.lineTo(x, halfH + max * halfH * 0.9);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // White playhead sweeping across
      if (isPlaying && buffer.length > 0) {
        const dur = buffer.length / 44100;
        const elapsed = (performance.now() - startRef.current) / 1000;
        const pos = (elapsed % dur) / dur;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pos * w, 0);
        ctx.lineTo(pos * w, h);
        ctx.stroke();
      }

      if (isPlaying) {
        rafRef.current = requestAnimationFrame(draw);
      }
    };

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [buffer, isPlaying]);

  return (
    <canvas ref={canvasRef} style={{
      position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none",
    }} />
  );
}

/** Live waveform from input analyser with decay trail for visibility. */
function InputWaveform({ analyser, isRecording }: { analyser: AnalyserNode | null; isRecording: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
      }

      // Fade previous frame — use theme bg for proper light/dark support
      const bgColor = getComputedStyle(document.documentElement).getPropertyValue("--bg-cell").trim() || "#21262d";
      ctx.fillStyle = bgColor;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      // Draw a subtle center line so empty canvas isn't blank
      const accentColor = getComputedStyle(document.documentElement).getPropertyValue("--preview").trim() || "#b388ff";
      ctx.strokeStyle = accentColor + "20";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();

      const dataLen = analyser.fftSize;
      const data = new Uint8Array(dataLen);
      analyser.getByteTimeDomainData(data);

      // Boost sensitivity: amplify the signal for display
      const gain = 3;
      const preview = getComputedStyle(document.documentElement).getPropertyValue("--preview").trim() || "#b388ff";
      ctx.strokeStyle = isRecording ? "#ff4444" : preview;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const sliceW = w / dataLen;
      for (let i = 0; i < dataLen; i++) {
        const raw = (data[i] - 128) / 128;
        const boosted = Math.max(-1, Math.min(1, raw * gain));
        const y = (1 - boosted) * h / 2;
        if (i === 0) ctx.moveTo(0, y);
        else ctx.lineTo(i * sliceW, y);
      }
      ctx.stroke();

      // Glow effect
      ctx.strokeStyle = (isRecording ? "#ff4444" : preview) + "40";
      ctx.lineWidth = 4;
      ctx.stroke();

      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyser, isRecording]);

  return (
    <canvas ref={canvasRef} style={{
      position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none",
    }} />
  );
}

export function PadView({ engine, padEngine, flashPad }: PadViewProps) {
  const [slots, setSlots] = useState<PadSlot[]>([]);
  const [recordingSlot, setRecordingSlot] = useState<number | null>(null);
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [inputLevel, setInputLevel] = useState(0);
  const [savedKits, setSavedKits] = useState(loadSavedKits);
  // Pad layout removed — drag pads to rearrange
  const [browsingPad, setBrowsingPad] = useState<number | null>(null);
  const [selectedPad, setSelectedPad] = useState<number | null>(null);
  const [showSlicer, setShowSlicer] = useState(false);
  const [dragOverPad, setDragOverPad] = useState<number | null>(null);
  const [countIn, setCountIn] = useState(0);
  const [playingPads, setPlayingPads] = useState<Set<number>>(new Set());
  // Low signal detection moved to Layout.tsx (global alert for all recorders)
  const [, forceUpdate] = useState(0);

  // Sync with PadEngine passed from Layout (persists across view switches)
  useEffect(() => {
    if (!padEngine) return;
    const sync = () => {
      setSlots([...padEngine.slots]);
      setRecordingSlot(padEngine.currentRecordingSlot);
    };
    padEngine.onStateChange = sync;
    padEngine.onCountIn = (beatsLeft) => setCountIn(beatsLeft);
    sync();
  }, [padEngine]);

  // Input level meter for waveform display
  useEffect(() => {
    if (!engine) return;
    let raf = 0;
    const update = () => {
      setInputLevel(engine.getInputLevel());

      raf = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  // Roll state — hold >300ms triggers roll at 1/16 rate
  const rollSlotRef = useRef<number | null>(null);
  const rollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rollingPad, setRollingPad] = useState<number | null>(null);

  const handlePadPointerDown = useCallback((slotId: number, pressure: number) => {
    setSelectedPad(slotId);
    const pe = padEngine;
    if (!pe) return;
    const slot = pe.slots[slotId];
    // Velocity from pointer pressure (0.5 default on most devices)
    const velocity = pressure > 0 && pressure < 1 ? 0.3 + pressure * 0.7 : 1;

    if (slot.status === "recording") {
      pe.stopRecording();
    } else if (slot.status === "loaded") {
      pe.playAt(slotId, 0, velocity);
      rollSlotRef.current = slotId;
      // Track playing state for playhead animation
      setPlayingPads(prev => new Set(prev).add(slotId));
      if (slot.playMode === "one") {
        const dur = (slot.buffer?.length ?? 44100) / 44100 * 1000;
        setTimeout(() => setPlayingPads(prev => { const n = new Set(prev); n.delete(slotId); return n; }), dur);
      }
      // Roll only if enabled in settings (off by default)
      const rollEnabled = localStorage.getItem("mloop-roll") === "on";
      if (rollEnabled) {
        if (rollTimerRef.current) clearTimeout(rollTimerRef.current);
        rollTimerRef.current = setTimeout(() => {
          const bpmNow = engine?.timing.bpm ?? 120;
          const rateStr = localStorage.getItem("mloop-roll-rate") || "16";
          const div = parseInt(rateStr) || 16;
          const rateHz = (bpmNow * div) / 60 / 4;
          pe.startRoll(slotId, rateHz, velocity);
          setRollingPad(slotId);
        }, 300);
      }
    } else {
      // Empty — stop any current recording first, then record into this pad
      if (pe.isRecording) {
        pe.stopRecording().then(() => {
          pe.startRecording(slotId, engine?.timing.bpm ?? 120);
        });
      } else {
        pe.startRecording(slotId, engine?.timing.bpm ?? 120);
      }
    }
  }, [engine, padEngine]);

  const handleDelete = useCallback((e: React.MouseEvent, slotId: number) => {
    e.stopPropagation();
    padEngine?.clear(slotId);
  }, [padEngine]);

  const handleEdit = useCallback((e: React.MouseEvent, slotId: number) => {
    e.stopPropagation();
    setEditingSlot(slotId);
  }, []);

  const handleTrimSave = useCallback((trimmed: Float32Array) => {
    if (editingSlot === null) return;
    padEngine?.importBuffer(editingSlot, trimmed);
    setEditingSlot(null);
  }, [editingSlot, padEngine]);

  const handleSequencerTrigger = useCallback((slotIds: number[]) => {
    const pe = padEngine;
    if (!pe) return;
    for (const id of slotIds) {
      pe.play(id);
    }
  }, [padEngine]);

  const bpm = engine?.timing.bpm ?? 120;

  return (
    <div className="pad-layout">
      {/* Left: Recorder + Pad Grid */}
      <div className="pad-left">
        {/* Recorder track */}
        <div className="track-strip" style={{ borderRadius: 8, border: "1px solid var(--border)", marginBottom: 8 }}>
          <div className="track-header">
            <div className="track-label">
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: recordingSlot !== null ? "var(--record)"
                  : !engine?.hasMic ? "var(--text-dim)"
                  : inputLevel > 0.02 ? "#66ff99"
                  : "#f0883e",
                boxShadow: recordingSlot !== null ? "0 0 8px var(--record)"
                  : inputLevel > 0.02 ? "0 0 6px #66ff99"
                  : "none",
                transition: "background 0.15s, box-shadow 0.15s",
              }} />
              <span>{recordingSlot !== null ? `REC → PAD ${recordingSlot + 1}` : "INPUT"}</span>
              {/* Mic gain control */}
              <span style={{ fontSize: 7, color: "var(--text-dim)", marginLeft: 6 }}>MIC</span>
              <input
                type="range" className="volume-slider"
                min={0} max={50} step={0.5}
                defaultValue={1}
                onChange={(e) => {
                  if (engine) engine.setMicGain(parseFloat(e.target.value));
                }}
                style={{ width: 40 }}
                title="Mic gain (0–5x)"
              />
              <span style={{ fontSize: 7, color: "var(--preview)", fontWeight: 700, minWidth: 20 }}>
                {engine ? `${Math.round(engine.getInputNode().gain.value * 2)}%` : "2%"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {/* Built-in kit presets */}
              <select
                onChange={async (e) => {
                  if (!padEngine) return;
                  const val = e.target.value;
                  for (let i = 0; i < 16; i++) padEngine.clear(i);
                  if (val.startsWith("s")) {
                    const kit = savedKits[parseInt(val.slice(1))];
                    if (kit) kitToPads(kit, (id, buf) => padEngine.importBuffer(id, buf), (id) => padEngine.clear(id));
                  } else {
                    const idx = parseInt(val);
                    if (isNaN(idx)) return;
                    const samples = await SAMPLE_PRESETS[idx].generate();
                    for (let i = 0; i < samples.length && i < 16; i++) {
                      padEngine.importBuffer(i, samples[i].buffer, samples[i].name);
                    }
                  }
                }}
                defaultValue=""
                style={{ font: "inherit", fontSize: 11, background: "var(--bg-cell)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 8px" }}
              >
                <option value="" disabled>Kit</option>
                {SAMPLE_PRESETS.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
                {savedKits.length > 0 && <option disabled>──────</option>}
                {savedKits.map((k, i) => <option key={`saved-${k.name}`} value={`s${i}`}>{k.name}</option>)}
              </select>
              {/* Save current kit */}
              <button onClick={() => {
                if (!padEngine) return;
                const name = prompt("Kit name:");
                if (!name) return;
                const kit = padsToKit(name, padEngine.slots);
                saveKit(kit);
                setSavedKits(loadSavedKits());
              }} style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, background: "var(--bg-cell)", color: "var(--text-dim)" }} title="Save current pads as kit">
                Save
              </button>
              {/* Export kit */}
              <button onClick={() => {
                if (!padEngine) return;
                const name = prompt("Kit name for export:", "My Kit");
                if (!name) return;
                exportKit(padsToKit(name, padEngine.slots));
              }} style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, background: "var(--bg-cell)", color: "var(--text-dim)" }} title="Export kit as file">
                ⬇
              </button>
              {/* Import kit */}
              <button onClick={async () => {
                if (!padEngine) return;
                const kit = await importKit();
                if (!kit) return;
                kitToPads(kit, (id, buf) => padEngine.importBuffer(id, buf), (id) => padEngine.clear(id));
              }} style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, background: "var(--bg-cell)", color: "var(--text-dim)" }} title="Import kit from file">
                ⬆
              </button>
              {/* Slice */}
              <button onClick={() => setShowSlicer(true)}
                style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, background: "var(--bg-cell)", color: "var(--text-dim)" }} title="Slice audio file across pads">
                ✂
              </button>
              {/* Chromatic mode — load selected pad sample across all pads at different pitches */}
              <button onClick={() => {
                if (!padEngine || selectedPad === null) return;
                const slot = padEngine.slots[selectedPad];
                if (!slot?.buffer) { alert("Select a loaded pad first"); return; }
                padEngine.loadChromatic(slot.buffer, slot.name || "Sample");
              }} style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, background: "var(--bg-cell)", color: "var(--text-dim)" }} title="Chromatic: spread selected pad across all pads at different pitches">
                ♪
              </button>
              {/* Resample — record master output to a pad */}
              <button onClick={() => {
                if (!padEngine) return;
                if (padEngine.isResampling) {
                  padEngine.stopResample();
                } else {
                  const emptySlot = padEngine.slots.find(s => s.status === "empty");
                  if (!emptySlot) { alert("No empty pad for resample"); return; }
                  padEngine.startResample(emptySlot.id);
                }
                forceUpdate(n => n + 1);
              }} style={{
                fontSize: 11, padding: "5px 10px", borderRadius: 6,
                background: padEngine?.isResampling ? "var(--record)" : "var(--bg-cell)",
                color: padEngine?.isResampling ? "#fff" : "var(--text-dim)",
              }} title={padEngine?.isResampling ? "Stop resampling" : "Resample: record output to pad"}>
                {padEngine?.isResampling ? "■R" : "⏺R"}
              </button>
              {/* Layout selector removed — drag pads to rearrange */}
            </div>
          </div>
          {/* Live input waveform + level meter */}
          <div className="waveform-area" style={{ height: 48, position: "relative" }}>
            <InputWaveform analyser={engine?.getInputAnalyser() ?? null} isRecording={recordingSlot !== null} />
            {/* Level bar overlay at bottom */}
            <div style={{
              position: "absolute", bottom: 0, left: 0, height: 3, borderRadius: 2,
              width: `${Math.min(100, inputLevel * 100)}%`,
              background: recordingSlot !== null ? "var(--record)" : "var(--preview)",
              transition: "width 0.05s",
            }} />
          </div>
          {/* Low signal alert moved to Layout.tsx — global for all recorders */}
        </div>

        {/* 4x4 Pad Grid */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
          gap: 6, aspectRatio: "1",
        }}>
          {slots.map((slot) => (
            <button
              key={slot.id}
              onPointerDown={(e) => handlePadPointerDown(slot.id, e.pressure)}
              onPointerUp={() => {
                // Stop roll/gate on release
                if (rollTimerRef.current) { clearTimeout(rollTimerRef.current); rollTimerRef.current = null; }
                if (rollSlotRef.current !== null) {
                  padEngine?.stopRoll();
                  setRollingPad(null);
                  const slot = padEngine?.slots[rollSlotRef.current];
                  if (slot?.playMode === "gate") {
                    padEngine?.stopSlot(rollSlotRef.current);
                    setPlayingPads(prev => { const n = new Set(prev); n.delete(rollSlotRef.current!); return n; });
                  }
                  rollSlotRef.current = null;
                }
              }}
              draggable={slot.status === "loaded"}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/pad-id", String(slot.id));
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => { e.preventDefault(); setDragOverPad(slot.id); }}
              onDragLeave={() => setDragOverPad(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverPad(null);
                // Drop from scratchpad recorder
                if (e.dataTransfer.getData("text/scratch") && padEngine) {
                  const buf = (window as unknown as Record<string, unknown>).__mloop_scratch_buffer as Float32Array | undefined;
                  if (buf) {
                    padEngine.importBuffer(slot.id, buf, `Scratch ${slot.id + 1}`);
                    delete (window as unknown as Record<string, unknown>).__mloop_scratch_buffer;
                  }
                  return;
                }
                // Drop from another pad (swap)
                const fromId = parseInt(e.dataTransfer.getData("text/pad-id"));
                if (!isNaN(fromId) && fromId !== slot.id && padEngine) {
                  padEngine.swapPads(fromId, slot.id);
                }
              }}
              style={{
                position: "relative", borderRadius: 8,
                border: `2px solid ${flashPad === slot.id ? "#fff" : dragOverPad === slot.id ? "#fff" : slot.status === "recording" ? "var(--record)" : slot.status === "loaded" ? "var(--preview)" : "var(--border)"}`,
                background: flashPad === slot.id ? "var(--preview)"
                  : slot.status === "recording" ? "rgba(255,68,68,0.15)"
                  : slot.status === "loaded" ? "var(--bg-cell)" : "var(--bg-panel)",
                transform: flashPad === slot.id ? "scale(0.93)" : "scale(1)",
                cursor: "pointer", overflow: "hidden",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                transition: "border-color 0.15s, background 0.15s",
                boxShadow: slot.status === "recording" ? "0 0 12px rgba(255,68,68,0.3)"
                  : slot.status === "loaded" ? "0 0 8px color-mix(in srgb, var(--preview) 20%, transparent)" : "none",
              }}
            >
              {slot.buffer && <MiniWaveform buffer={slot.buffer} isPlaying={playingPads.has(slot.id) || flashPad === slot.id} />}

              {/* Pad number */}
              <span style={{
                position: "relative", zIndex: 1,
                fontSize: slot.status === "empty" ? 16 : 10, fontWeight: 700,
                color: slot.status === "recording" ? "var(--record)"
                  : slot.status === "loaded" ? "var(--preview)" : "var(--text-dim)",
                opacity: slot.status === "loaded" ? 0.7 : 1,
              }}>
                {slot.status === "recording"
                  ? (countIn > 0 ? countIn : "REC")
                  : slot.name || (slot.id + 1)}
              </span>

              {slot.buffer && (
                <span style={{ position: "relative", zIndex: 1, fontSize: 8, color: "var(--text-dim)", marginTop: 2 }}>
                  {(slot.buffer.length / 44100).toFixed(1)}s
                </span>
              )}

              {/* Play mode indicator + rolling indicator */}
              {slot.status === "loaded" && (slot.playMode === "gate" || slot.playMode === "loop") && (
                <span style={{
                  position: "absolute", bottom: 2, left: 3, zIndex: 2,
                  fontSize: 7, fontWeight: 700, color: "var(--text-dim)",
                  background: "rgba(0,0,0,0.5)", borderRadius: 2, padding: "0 2px",
                }}>
                  {slot.playMode === "gate" ? "G" : "L"}
                </span>
              )}
              {rollingPad === slot.id && (
                <span style={{
                  position: "absolute", bottom: 2, right: 3, zIndex: 2,
                  fontSize: 7, fontWeight: 700, color: "var(--record)",
                  background: "rgba(0,0,0,0.5)", borderRadius: 2, padding: "0 2px",
                }}>
                  ROLL
                </span>
              )}

              {/* Browse button on empty pads */}
              {slot.status === "empty" && (
                <button
                  onClick={(e) => { e.stopPropagation(); setBrowsingPad(slot.id); }}
                  title="Browse sounds"
                  style={{
                    position: "absolute", top: 2, right: 2, zIndex: 2,
                    width: 18, height: 18, borderRadius: 3, fontSize: 9,
                    background: "rgba(0,0,0,0.4)", color: "var(--text-dim)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: "none", cursor: "pointer", padding: 0,
                  }}
                >
                  ♫
                </button>
              )}

              {/* Browse + Edit + Delete buttons for loaded pads */}
              {slot.status === "loaded" && (
                <div style={{
                  position: "absolute", top: 2, right: 2, zIndex: 2,
                  display: "flex", gap: 2,
                }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setBrowsingPad(slot.id); }}
                    title="Browse sounds"
                    style={{
                      width: 18, height: 18, borderRadius: 3, fontSize: 9,
                      background: "rgba(0,0,0,0.6)", color: "var(--preview)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: "none", cursor: "pointer", padding: 0,
                    }}
                  >
                    ♫
                  </button>
                  <button
                    onClick={(e) => handleEdit(e, slot.id)}
                    title="Edit / Trim"
                    style={{
                      width: 18, height: 18, borderRadius: 3, fontSize: 9,
                      background: "rgba(0,0,0,0.6)", color: "var(--preview)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: "none", cursor: "pointer", padding: 0,
                    }}
                  >
                    ✎
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, slot.id)}
                    title="Delete"
                    style={{
                      width: 18, height: 18, borderRadius: 3, fontSize: 9,
                      background: "rgba(0,0,0,0.6)", color: "#f85149",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: "none", cursor: "pointer", padding: 0,
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Right: Scratchpad + Pad Detail + Step Sequencer */}
      <div className="pad-right">
        <ScratchpadRecorder engine={engine} />
        <PadDetail
          slot={selectedPad !== null ? slots[selectedPad] ?? null : null}
          volume={selectedPad !== null ? (padEngine?.slots[selectedPad]?.volume ?? 1) : 1}
          pan={selectedPad !== null ? (padEngine?.slots[selectedPad]?.pan ?? 0) : 0}
          pitch={selectedPad !== null ? (padEngine?.slots[selectedPad]?.pitch ?? 0) : 0}
          playMode={(selectedPad !== null ? padEngine?.slots[selectedPad]?.playMode : "one") as PlayMode ?? "one"}
          trimStart={selectedPad !== null ? (padEngine?.slots[selectedPad]?.trimStart ?? 0) : 0}
          trimEnd={selectedPad !== null ? (padEngine?.slots[selectedPad]?.trimEnd ?? 1) : 1}
          loopBeats={selectedPad !== null ? (padEngine?.slots[selectedPad]?.loopBeats ?? 0) : 0}
          bpm={bpm}
          onVolumeChange={(v) => { if (padEngine && selectedPad !== null) { padEngine.slots[selectedPad].volume = v; forceUpdate(n => n + 1); } }}
          onPanChange={(v) => { if (padEngine && selectedPad !== null) { padEngine.slots[selectedPad].pan = v; forceUpdate(n => n + 1); } }}
          onPitchChange={(v) => { if (padEngine && selectedPad !== null) { padEngine.slots[selectedPad].pitch = v; forceUpdate(n => n + 1); } }}
          onPlayModeChange={(m) => { if (padEngine && selectedPad !== null) { padEngine.slots[selectedPad].playMode = m; forceUpdate(n => n + 1); } }}
          onTrimChange={(s, e) => { if (padEngine && selectedPad !== null) { padEngine.slots[selectedPad].trimStart = s; padEngine.slots[selectedPad].trimEnd = e; forceUpdate(n => n + 1); } }}
          onLoopBeatsChange={(b) => { if (padEngine && selectedPad !== null) { padEngine.slots[selectedPad].loopBeats = b; forceUpdate(n => n + 1); } }}
          muteGroup={selectedPad !== null ? (padEngine?.slots[selectedPad]?.muteGroup ?? 0) : 0}
          onMuteGroupChange={(g) => { if (padEngine && selectedPad !== null) { padEngine.slots[selectedPad].muteGroup = g; forceUpdate(n => n + 1); } }}
          onNameChange={(name) => { if (padEngine && selectedPad !== null) { padEngine.slots[selectedPad].name = name; forceUpdate(n => n + 1); } }}
        />
        <PadSequencer slots={slots} bpm={bpm} onTrigger={handleSequencerTrigger} padEngine={padEngine} />
      </div>

      {/* Sample Editor Modal */}
      {editingSlot !== null && slots[editingSlot]?.buffer && (
        <SampleEditor
          buffer={slots[editingSlot].buffer!}
          sampleRate={44100}
          onSave={handleTrimSave}
          onClose={() => setEditingSlot(null)}
        />
      )}

      {/* Sound Browser Modal — pick individual sounds from any kit */}
      {browsingPad !== null && (
        <SoundBrowser
          padId={browsingPad}
          onSelect={(buffer, name) => {
            padEngine?.importBuffer(browsingPad, buffer, name);
          }}
          onClose={() => setBrowsingPad(null)}
        />
      )}

      {/* Sample Slicer Modal */}
      {showSlicer && (
        <SampleSlicer padEngine={padEngine} onClose={() => setShowSlicer(false)} />
      )}
    </div>
  );
}
