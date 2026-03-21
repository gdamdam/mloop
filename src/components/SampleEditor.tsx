/**
 * SampleEditor — modal to view and trim a recorded sample waveform.
 */

import { useRef, useEffect, useState, useCallback } from "react";

interface SampleEditorProps {
  buffer: Float32Array;
  sampleRate: number;
  onSave: (trimmed: Float32Array) => void;
  onClose: () => void;
}

export function SampleEditor({ buffer, sampleRate, onSave, onClose }: SampleEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [startPct, setStartPct] = useState(0);
  const [endPct, setEndPct] = useState(1);
  const dragging = useRef<"start" | "end" | null>(null);

  const duration = buffer.length / sampleRate;
  const startSample = Math.floor(startPct * buffer.length);
  const endSample = Math.floor(endPct * buffer.length);
  const trimmedDuration = (endSample - startSample) / sampleRate;

  // Draw waveform with selection
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

    // Dimmed area outside selection
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, startPct * w, h);
    ctx.fillRect(endPct * w, 0, (1 - endPct) * w, h);

    // Waveform
    for (let x = 0; x < w; x++) {
      const idx = Math.floor((x / w) * buffer.length);
      let max = 0;
      for (let j = 0; j < step && idx + j < buffer.length; j++) {
        const v = Math.abs(buffer[idx + j]);
        if (v > max) max = v;
      }
      const barH = max * halfH * 0.9;
      const inSelection = x / w >= startPct && x / w <= endPct;
      ctx.fillStyle = inSelection ? "var(--preview)" : "var(--text-dim)";
      ctx.globalAlpha = inSelection ? 0.7 : 0.2;
      ctx.fillRect(x, halfH - barH, 1, barH * 2);
    }
    ctx.globalAlpha = 1;

    // Selection handles
    const drawHandle = (pct: number, color: string) => {
      const x = pct * w;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      // Triangle handle
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x - 6, 0);
      ctx.lineTo(x + 6, 0);
      ctx.lineTo(x, 10);
      ctx.closePath();
      ctx.fill();
    };
    drawHandle(startPct, "#66ff99");
    drawHandle(endPct, "#ff4444");
  }, [buffer, startPct, endPct]);

  useEffect(() => { draw(); }, [draw]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    // Which handle is closer?
    if (Math.abs(pct - startPct) < Math.abs(pct - endPct)) {
      dragging.current = "start";
    } else {
      dragging.current = "end";
    }
    canvas.setPointerCapture(e.pointerId);
  }, [startPct, endPct]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (dragging.current === "start") {
      setStartPct(Math.min(pct, endPct - 0.01));
    } else {
      setEndPct(Math.max(pct, startPct + 0.01));
    }
  }, [startPct, endPct]);

  const handlePointerUp = useCallback(() => {
    dragging.current = null;
  }, []);

  const handleSave = () => {
    const trimmed = buffer.slice(startSample, endSample);
    onSave(trimmed);
  };

  return (
    <div className="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" style={{ maxWidth: 500 }}>
        <div className="sheet-header">
          <span className="sheet-title">Edit Sample</span>
          <button className="sheet-close" onClick={onClose}>✕</button>
        </div>
        <div className="sheet-body">
          <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
            <span>Duration: {duration.toFixed(2)}s</span>
            <span>Selection: {trimmedDuration.toFixed(2)}s</span>
          </div>

          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{
              width: "100%", height: 120, borderRadius: 6, cursor: "ew-resize",
              background: "var(--bg-cell)", border: "1px solid var(--border)",
              touchAction: "none",
            }}
          />

          <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 4, textAlign: "center" }}>
            Drag green/red handles to set trim points
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 700,
                background: "var(--bg-cell)", color: "var(--text-dim)",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              style={{
                flex: 1, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 700,
                background: "var(--preview)", color: "#000",
              }}
            >
              Trim & Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
