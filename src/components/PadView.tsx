/**
 * PadView — recorder + 4x4 sample pad grid + step sequencer.
 * Tap empty pad → record. Tap loaded → play. Delete/edit icons on loaded pads.
 * Recording auto-stops when clicking another pad.
 */

import { useRef, useCallback, useEffect, useState } from "react";
import type { AudioEngine } from "../engine/AudioEngine";
import { PadEngine } from "../engine/PadEngine";
import type { PadSlot } from "../engine/PadEngine";
import { PadSequencer } from "./PadSequencer";
import { SampleEditor } from "./SampleEditor";

interface PadViewProps {
  engine: AudioEngine | null;
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

export function PadView({ engine }: PadViewProps) {
  const padEngineRef = useRef<PadEngine | null>(null);
  const [slots, setSlots] = useState<PadSlot[]>([]);
  const [recordingSlot, setRecordingSlot] = useState<number | null>(null);
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [inputLevel, setInputLevel] = useState(0);

  // Initialize PadEngine
  useEffect(() => {
    if (!engine) return;
    if (!padEngineRef.current) {
      const pe = new PadEngine(engine.ctx, engine.getInputNode(), engine.getMasterNode());
      pe.onStateChange = () => {
        setSlots([...pe.slots]);
        setRecordingSlot(pe.currentRecordingSlot);
      };
      padEngineRef.current = pe;
      setSlots([...pe.slots]);
    }
  }, [engine]);

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
    const pe = padEngineRef.current;
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
    padEngineRef.current?.clear(slotId);
  }, []);

  const handleEdit = useCallback((e: React.MouseEvent, slotId: number) => {
    e.stopPropagation();
    setEditingSlot(slotId);
  }, []);

  const handleTrimSave = useCallback((trimmed: Float32Array) => {
    if (editingSlot === null) return;
    padEngineRef.current?.importBuffer(editingSlot, trimmed);
    setEditingSlot(null);
  }, [editingSlot]);

  const handleSequencerTrigger = useCallback((slotIds: number[]) => {
    const pe = padEngineRef.current;
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
            <span style={{ fontSize: 9, color: "var(--text-dim)" }}>
              tap empty = rec · tap loaded = play
            </span>
          </div>
          <div className="waveform-area" style={{ height: 28 }}>
            <div style={{
              height: "100%", borderRadius: 4,
              width: `${Math.min(100, inputLevel * 100)}%`,
              background: recordingSlot !== null ? "var(--record)" : "var(--preview)",
              transition: "width 0.05s", opacity: 0.5,
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

              {/* Delete + Edit buttons for loaded pads */}
              {slot.status === "loaded" && (
                <div style={{
                  position: "absolute", top: 2, right: 2, zIndex: 2,
                  display: "flex", gap: 2,
                }}>
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
    </div>
  );
}
