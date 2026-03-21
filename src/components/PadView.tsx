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
  PAD_LAYOUTS, loadPadLayout, savePadLayout, type PadLayoutId,
} from "../utils/kitManager";
import { SoundBrowser } from "./SoundBrowser";

interface PadViewProps {
  engine: AudioEngine | null;
  padEngine: PadEngine | null;
}

function MiniWaveform({ buffer }: { buffer: Float32Array | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer || buffer.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    ctx.scale(dpr, dpr);
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    const halfH = h / 2;
    const step = Math.max(1, Math.floor(buffer.length / w));
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "var(--preview)";
    for (let x = 0; x < w; x++) {
      const idx = Math.floor((x / w) * buffer.length);
      let max = 0;
      for (let j = 0; j < step && idx + j < buffer.length; j++) {
        const v = Math.abs(buffer[idx + j]);
        if (v > max) max = v;
      }
      const barH = max * halfH * 0.9;
      ctx.globalAlpha = 0.4;
      ctx.fillRect(x, halfH - barH, 1, barH * 2);
    }
    ctx.globalAlpha = 1;
  }, [buffer]);

  return (
    <canvas ref={canvasRef} style={{
      position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none",
    }} />
  );
}

/** Live waveform from input analyser — draws real-time audio shape. */
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
      ctx.clearRect(0, 0, w, h);

      const dataLen = analyser.fftSize;
      const data = new Uint8Array(dataLen);
      analyser.getByteTimeDomainData(data);

      ctx.strokeStyle = isRecording ? "var(--record)" : "var(--preview)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const sliceW = w / dataLen;
      for (let i = 0; i < dataLen; i++) {
        const v = data[i] / 128.0;
        const y = (v * h) / 2;
        if (i === 0) ctx.moveTo(0, y);
        else ctx.lineTo(i * sliceW, y);
      }
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

export function PadView({ engine, padEngine }: PadViewProps) {
  const [slots, setSlots] = useState<PadSlot[]>([]);
  const [recordingSlot, setRecordingSlot] = useState<number | null>(null);
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [inputLevel, setInputLevel] = useState(0);
  const [savedKits, setSavedKits] = useState(loadSavedKits);
  const [padLayout, setPadLayout] = useState<PadLayoutId>(loadPadLayout);
  const [browsingPad, setBrowsingPad] = useState<number | null>(null);

  // Sync with PadEngine passed from Layout (persists across view switches)
  useEffect(() => {
    if (!padEngine) return;
    const sync = () => {
      setSlots([...padEngine.slots]);
      setRecordingSlot(padEngine.currentRecordingSlot);
    };
    padEngine.onStateChange = sync;
    sync(); // initial sync
  }, [padEngine]);

  // Input level meter
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

  const handlePadClick = useCallback((slotId: number) => {
    const pe = padEngine;
    if (!pe) return;
    const slot = pe.slots[slotId];

    if (slot.status === "recording") {
      // Stop recording this pad
      pe.stopRecording();
    } else if (slot.status === "loaded") {
      // Play the sample
      pe.play(slotId);
    } else {
      // Empty — stop any current recording first, then record into this pad
      if (pe.isRecording) {
        pe.stopRecording().then(() => {
          pe.startRecording(slotId);
        });
      } else {
        pe.startRecording(slotId);
      }
    }
  }, []);

  const handleDelete = useCallback((e: React.MouseEvent, slotId: number) => {
    e.stopPropagation();
    padEngine?.clear(slotId);
  }, []);

  const handleEdit = useCallback((e: React.MouseEvent, slotId: number) => {
    e.stopPropagation();
    setEditingSlot(slotId);
  }, []);

  const handleTrimSave = useCallback((trimmed: Float32Array) => {
    if (editingSlot === null) return;
    padEngine?.importBuffer(editingSlot, trimmed);
    setEditingSlot(null);
  }, [editingSlot]);

  const handleSequencerTrigger = useCallback((slotIds: number[]) => {
    const pe = padEngine;
    if (!pe) return;
    for (const id of slotIds) {
      pe.play(id);
    }
  }, []);

  const bpm = engine?.timing.bpm ?? 120;

  return (
    <div className="pad-layout">
      {/* Left: Recorder + Pad Grid */}
      <div className="pad-left">
        {/* Recorder track */}
        <div className="track-strip" style={{ borderRadius: 8, border: "1px solid var(--border)", marginBottom: 8 }}>
          <div className="track-header">
            <div className="track-label">
              <div className={`track-status ${recordingSlot !== null ? "recording" : ""}`} />
              <span>{recordingSlot !== null ? `REC → PAD ${recordingSlot + 1}` : "INPUT"}</span>
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {/* Built-in kit presets */}
              <select
                onChange={async (e) => {
                  if (!padEngine) return;
                  const val = e.target.value;
                  const layout = PAD_LAYOUTS.find(l => l.id === padLayout)!;
                  // Clear all pads
                  for (let i = 0; i < 16; i++) padEngine.clear(i);
                  if (val.startsWith("s")) {
                    // Saved kit
                    const kit = savedKits[parseInt(val.slice(1))];
                    if (kit) kitToPads(kit, (id, buf) => padEngine.importBuffer(id, buf), (id) => padEngine.clear(id));
                  } else {
                    // Built-in preset — apply layout mapping
                    const idx = parseInt(val);
                    if (isNaN(idx)) return;
                    const samples = await SAMPLE_PRESETS[idx].generate();
                    for (let i = 0; i < samples.length && i < layout.mapping.length; i++) {
                      padEngine.importBuffer(layout.mapping[i], samples[i].buffer);
                    }
                  }
                }}
                defaultValue=""
                style={{ font: "inherit", fontSize: 9, background: "var(--bg-cell)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 4px" }}
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
              }} style={{ fontSize: 9, padding: "2px 5px", borderRadius: 4, background: "var(--bg-cell)", color: "var(--text-dim)" }} title="Save current pads as kit">
                Save
              </button>
              {/* Export kit */}
              <button onClick={() => {
                if (!padEngine) return;
                const name = prompt("Kit name for export:", "My Kit");
                if (!name) return;
                exportKit(padsToKit(name, padEngine.slots));
              }} style={{ fontSize: 9, padding: "2px 5px", borderRadius: 4, background: "var(--bg-cell)", color: "var(--text-dim)" }} title="Export kit as file">
                ⬇
              </button>
              {/* Import kit */}
              <button onClick={async () => {
                if (!padEngine) return;
                const kit = await importKit();
                if (!kit) return;
                kitToPads(kit, (id, buf) => padEngine.importBuffer(id, buf), (id) => padEngine.clear(id));
              }} style={{ fontSize: 9, padding: "2px 5px", borderRadius: 4, background: "var(--bg-cell)", color: "var(--text-dim)" }} title="Import kit from file">
                ⬆
              </button>
              {/* Layout selector */}
              <select
                value={padLayout}
                onChange={(e) => {
                  const newId = e.target.value as PadLayoutId;
                  if (!padEngine || newId === padLayout) { setPadLayout(newId); savePadLayout(newId); return; }
                  const oldMap = PAD_LAYOUTS.find(l => l.id === padLayout)!.mapping;
                  const newMap = PAD_LAYOUTS.find(l => l.id === newId)!.mapping;
                  // Collect samples at old positions, then place at new positions
                  const saved: (Float32Array | null)[] = oldMap.map(pos => {
                    const slot = padEngine.slots[pos];
                    return slot?.buffer ? new Float32Array(slot.buffer) : null;
                  });
                  // Clear mapped positions
                  for (const pos of [...new Set([...oldMap, ...newMap])]) padEngine.clear(pos);
                  // Place at new positions
                  for (let i = 0; i < saved.length; i++) {
                    if (saved[i]) padEngine.importBuffer(newMap[i], saved[i]!);
                  }
                  setPadLayout(newId);
                  savePadLayout(newId);
                }}
                style={{ font: "inherit", fontSize: 9, background: "var(--bg-cell)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 4px" }}
                title="Pad layout"
              >
                {PAD_LAYOUTS.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
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
        </div>

        {/* 4x4 Pad Grid */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
          gap: 6, aspectRatio: "1",
        }}>
          {slots.map((slot) => (
            <button
              key={slot.id}
              onClick={() => handlePadClick(slot.id)}
              draggable={slot.status === "loaded"}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/pad-id", String(slot.id));
                e.dataTransfer.effectAllowed = "copy";
              }}
              style={{
                position: "relative", borderRadius: 8,
                border: `2px solid ${slot.status === "recording" ? "var(--record)" : slot.status === "loaded" ? "var(--preview)" : "var(--border)"}`,
                background: slot.status === "recording" ? "rgba(255,68,68,0.15)"
                  : slot.status === "loaded" ? "var(--bg-cell)" : "var(--bg-panel)",
                cursor: "pointer", overflow: "hidden",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                transition: "border-color 0.15s, background 0.15s",
                boxShadow: slot.status === "recording" ? "0 0 12px rgba(255,68,68,0.3)"
                  : slot.status === "loaded" ? "0 0 8px color-mix(in srgb, var(--preview) 20%, transparent)" : "none",
              }}
            >
              {slot.buffer && <MiniWaveform buffer={slot.buffer} />}

              {/* Pad number */}
              <span style={{
                position: "relative", zIndex: 1,
                fontSize: slot.status === "empty" ? 16 : 10, fontWeight: 700,
                color: slot.status === "recording" ? "var(--record)"
                  : slot.status === "loaded" ? "var(--preview)" : "var(--text-dim)",
                opacity: slot.status === "loaded" ? 0.7 : 1,
              }}>
                {slot.status === "recording" ? "REC" : slot.id + 1}
              </span>

              {slot.buffer && (
                <span style={{ position: "relative", zIndex: 1, fontSize: 8, color: "var(--text-dim)", marginTop: 2 }}>
                  {(slot.buffer.length / 44100).toFixed(1)}s
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

      {/* Right: Step Sequencer */}
      <div className="pad-right">
        <PadSequencer slots={slots} bpm={bpm} onTrigger={handleSequencerTrigger} />
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
          onSelect={(buffer) => {
            padEngine?.importBuffer(browsingPad, buffer);
          }}
          onClose={() => setBrowsingPad(null)}
        />
      )}
    </div>
  );
}
