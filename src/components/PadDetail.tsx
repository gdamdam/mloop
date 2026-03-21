/**
 * PadDetail — shows details and controls for the selected pad.
 * Waveform with trim handles, volume, pan, pitch, play mode (ONE/GATE/LOOP).
 * Sits above the sequencer in the right panel.
 */

import { useRef, useEffect, useCallback } from "react";
import type { PadSlot } from "../engine/PadEngine";

export type PlayMode = "one" | "gate" | "loop";

/** Loop window presets — common musical lengths at 44100Hz. */
const LOOP_WINDOWS = [
  { label: "Free", beats: 0 },
  { label: "1/4", beats: 0.25 },
  { label: "1/2", beats: 0.5 },
  { label: "1 beat", beats: 1 },
  { label: "2 beats", beats: 2 },
  { label: "1 bar", beats: 4 },
  { label: "2 bars", beats: 8 },
  { label: "4 bars", beats: 16 },
];

interface PadDetailProps {
  slot: PadSlot | null;
  /** Per-pad settings stored externally. */
  volume: number;
  pan: number;
  pitch: number;
  playMode: PlayMode;
  trimStart: number; // 0–1 fraction
  trimEnd: number;   // 0–1 fraction
  loopBeats: number; // 0 = free (use trim), >0 = snap to beats
  bpm: number;
  onVolumeChange: (v: number) => void;
  onPanChange: (v: number) => void;
  onPitchChange: (v: number) => void;
  onPlayModeChange: (mode: PlayMode) => void;
  onTrimChange: (start: number, end: number) => void;
  onLoopBeatsChange: (beats: number) => void;
  muteGroup: number;
  onMuteGroupChange: (group: number) => void;
}

export function PadDetail({
  slot, volume, pan, pitch, playMode,
  trimStart, trimEnd, loopBeats, bpm,
  onVolumeChange, onPanChange, onPitchChange,
  onPlayModeChange, onTrimChange, onLoopBeatsChange,
  muteGroup, onMuteGroupChange, onNameChange,
}: PadDetailProps & { onNameChange?: (name: string) => void }) {
  if (!slot || slot.status !== "loaded" || !slot.buffer) {
    return (
      <div style={{
        padding: 12, textAlign: "center", color: "var(--text-dim)", fontSize: 11,
        border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-panel)",
      }}>
        Tap a pad to see details
      </div>
    );
  }

  const duration = slot.buffer.length / 44100;
  const trimmedDuration = duration * (trimEnd - trimStart);

  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-panel)",
      padding: 10, marginBottom: 8,
    }}>
      {/* Header: editable name + duration */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 8 }}>
        <input
          type="text"
          value={slot.name || ""}
          placeholder={`Pad ${slot.id + 1}`}
          onChange={(e) => onNameChange?.(e.target.value)}
          style={{
            flex: 1, font: "inherit", fontSize: 12, fontWeight: 700,
            color: "var(--preview)", background: "transparent", border: "none",
            borderBottom: "1px solid var(--border)", outline: "none",
            padding: "2px 0", minWidth: 0,
          }}
        />
        <span style={{ fontSize: 9, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
          {trimmedDuration.toFixed(2)}s{loopBeats > 0 ? ` · ${loopBeats}♩ @${bpm}` : ""}
        </span>
      </div>

      {/* Waveform with trim handles */}
      <TrimWaveform
        buffer={slot.buffer}
        trimStart={trimStart}
        trimEnd={trimEnd}
        onTrimChange={onTrimChange}
      />

      {/* Play mode selector */}
      <div style={{ display: "flex", gap: 3, margin: "8px 0 6px" }}>
        {(["one", "gate", "loop"] as const).map(mode => (
          <button
            key={mode}
            onClick={() => onPlayModeChange(mode)}
            style={{
              flex: 1, padding: "4px 0", borderRadius: 4, fontSize: 9, fontWeight: 700,
              background: playMode === mode ? "var(--preview)" : "var(--bg-cell)",
              color: playMode === mode ? "#000" : "var(--text-dim)",
              textTransform: "uppercase", letterSpacing: 0.5, cursor: "pointer",
              border: "none",
            }}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* Loop window presets (only when LOOP mode) */}
      {playMode === "loop" && (
        <div style={{ display: "flex", gap: 2, marginBottom: 6, flexWrap: "wrap" }}>
          {LOOP_WINDOWS.map(lw => (
            <button
              key={lw.label}
              onClick={() => onLoopBeatsChange(lw.beats)}
              style={{
                padding: "2px 5px", borderRadius: 3, fontSize: 8, fontWeight: 700,
                background: loopBeats === lw.beats ? "var(--preview)" : "var(--bg-cell)",
                color: loopBeats === lw.beats ? "#000" : "var(--text-dim)",
                cursor: "pointer", border: "none",
              }}
            >
              {lw.label}
            </button>
          ))}
        </div>
      )}

      {/* Volume / Pan / Pitch sliders */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <SliderRow label="Vol" value={volume} min={0} max={1} step={0.01}
          display={`${Math.round(volume * 100)}%`} onChange={onVolumeChange} />
        <SliderRow label="Pan" value={pan} min={-1} max={1} step={0.01}
          display={pan === 0 ? "C" : pan < 0 ? `L${Math.round(-pan * 100)}` : `R${Math.round(pan * 100)}`}
          onChange={onPanChange} />
        <SliderRow label="Pitch" value={pitch} min={-12} max={12} step={1}
          display={pitch === 0 ? "0" : pitch > 0 ? `+${pitch}` : `${pitch}`}
          onChange={onPitchChange} />
      </div>

      {/* Mute group (hat choke) */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6 }}>
        <span style={{ fontSize: 8, color: "var(--text-dim)", width: 28, textAlign: "right" }}>Choke</span>
        {[0, 1, 2, 3, 4].map(g => (
          <button key={g} onClick={() => onMuteGroupChange(g)} style={{
            flex: 1, padding: "3px 0", borderRadius: 3, fontSize: 8, fontWeight: 700,
            background: muteGroup === g ? "var(--preview)" : "var(--bg-cell)",
            color: muteGroup === g ? "#000" : "var(--text-dim)",
            border: "none", cursor: "pointer",
          }}>
            {g === 0 ? "Off" : `G${g}`}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Compact slider row with label and value display. */
function SliderRow({ label, value, min, max, step, display, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  display: string; onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 8, color: "var(--text-dim)", width: 28, textAlign: "right" }}>{label}</span>
      <input
        type="range" className="volume-slider"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1 }}
      />
      <span style={{ fontSize: 8, color: "var(--text-dim)", width: 28 }}>{display}</span>
    </div>
  );
}

/** Waveform canvas with draggable trim start/end handles. */
function TrimWaveform({ buffer, trimStart, trimEnd, onTrimChange }: {
  buffer: Float32Array; trimStart: number; trimEnd: number;
  onTrimChange: (start: number, end: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef<"start" | "end" | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const halfH = h / 2;
    const step = Math.max(1, Math.floor(buffer.length / w));

    ctx.clearRect(0, 0, w, h);

    // Dimmed outside selection
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(0, 0, trimStart * w, h);
    ctx.fillRect(trimEnd * w, 0, (1 - trimEnd) * w, h);

    // Waveform
    for (let x = 0; x < w; x++) {
      const idx = Math.floor((x / w) * buffer.length);
      let max = 0;
      for (let j = 0; j < step && idx + j < buffer.length; j++) {
        const v = Math.abs(buffer[idx + j]);
        if (v > max) max = v;
      }
      const barH = max * halfH * 0.9;
      const inSel = x / w >= trimStart && x / w <= trimEnd;
      ctx.fillStyle = inSel ? "var(--preview)" : "var(--text-dim)";
      ctx.globalAlpha = inSel ? 0.6 : 0.15;
      ctx.fillRect(x, halfH - barH, 1, barH * 2);
    }
    ctx.globalAlpha = 1;

    // Handles
    const drawHandle = (pct: number, color: string) => {
      const x = pct * w;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    };
    drawHandle(trimStart, "#66ff99");
    drawHandle(trimEnd, "#ff4444");
  }, [buffer, trimStart, trimEnd]);

  useEffect(() => { draw(); }, [draw]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    dragging.current = Math.abs(pct - trimStart) < Math.abs(pct - trimEnd) ? "start" : "end";
    canvas.setPointerCapture(e.pointerId);
  }, [trimStart, trimEnd]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (dragging.current === "start") {
      onTrimChange(Math.min(pct, trimEnd - 0.01), trimEnd);
    } else {
      onTrimChange(trimStart, Math.max(pct, trimStart + 0.01));
    }
  }, [trimStart, trimEnd, onTrimChange]);

  const handlePointerUp = useCallback(() => { dragging.current = null; }, []);

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        width: "100%", height: 60, borderRadius: 4, cursor: "ew-resize",
        background: "var(--bg-cell)", border: "1px solid var(--border)",
        touchAction: "none",
      }}
    />
  );
}
