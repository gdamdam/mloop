/**
 * SampleSlicer — import a long audio file and chop it into 8 or 16
 * equal slices across the pad grid. Common MPC/SP-404 workflow.
 */

import { useRef, useEffect, useState, useCallback } from "react";
import type { PadEngine } from "../engine/PadEngine";

const SLICE_COUNTS = [4, 8, 16] as const;

interface SampleSlicerProps {
  padEngine: PadEngine | null;
  onClose: () => void;
}

export function SampleSlicer({ padEngine, onClose }: SampleSlicerProps) {
  const [buffer, setBuffer] = useState<Float32Array | null>(null);
  const [fileName, setFileName] = useState("");
  const [sliceCount, setSliceCount] = useState<number>(8);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /** Load audio file and decode to mono Float32Array. */
  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name.replace(/\.[^.]+$/, ""));
    const arrayBuffer = await file.arrayBuffer();
    const offlineCtx = new OfflineAudioContext(1, 1, 44100);
    const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);
    // Mono downmix
    const numCh = audioBuffer.numberOfChannels;
    const len = audioBuffer.length;
    const mono = new Float32Array(len);
    for (let ch = 0; ch < numCh; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = 0; i < len; i++) mono[i] += data[i];
    }
    if (numCh > 1) for (let i = 0; i < len; i++) mono[i] /= numCh;
    setBuffer(mono);
  }, []);

  /** Draw waveform with slice markers. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) return;
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

    // Waveform
    ctx.fillStyle = "var(--preview)";
    for (let x = 0; x < w; x++) {
      const idx = Math.floor((x / w) * buffer.length);
      let max = 0;
      for (let j = 0; j < step && idx + j < buffer.length; j++) {
        const v = Math.abs(buffer[idx + j]);
        if (v > max) max = v;
      }
      const barH = max * halfH * 0.9;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x, halfH - barH, 1, barH * 2);
    }
    ctx.globalAlpha = 1;

    // Slice markers
    for (let i = 1; i < sliceCount; i++) {
      const x = (i / sliceCount) * w;
      ctx.strokeStyle = "var(--record)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      ctx.setLineDash([]);
      // Slice number
      ctx.fillStyle = "var(--text-dim)";
      ctx.font = "8px monospace";
      ctx.fillText(`${i + 1}`, x + 2, 10);
    }
    ctx.fillStyle = "var(--text-dim)";
    ctx.font = "8px monospace";
    ctx.fillText("1", 2, 10);
  }, [buffer, sliceCount]);

  /** Apply slicing — chop buffer into N equal parts and load into pads. */
  const handleSlice = useCallback(() => {
    if (!buffer || !padEngine) return;
    const sliceLen = Math.floor(buffer.length / sliceCount);
    for (let i = 0; i < sliceCount && i < 16; i++) {
      const start = i * sliceLen;
      const end = Math.min(start + sliceLen, buffer.length);
      const slice = buffer.slice(start, end);
      const name = `${fileName || "Slice"} ${i + 1}`;
      padEngine.importBuffer(i, slice, name);
    }
    onClose();
  }, [buffer, padEngine, sliceCount, fileName, onClose]);

  return (
    <div className="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" style={{ maxWidth: 480 }}>
        <div className="sheet-header">
          <span className="sheet-title">Sample Slicer</span>
          <button className="sheet-close" onClick={onClose}>✕</button>
        </div>
        <div className="sheet-body">
          {!buffer ? (
            <>
              <p style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 12, textAlign: "center" }}>
                Drop or select a long audio file to chop it into equal slices across the pads.
              </p>
              <label style={{
                display: "block", padding: 24, textAlign: "center",
                border: "2px dashed var(--border)", borderRadius: 8,
                color: "var(--text-dim)", fontSize: 12, cursor: "pointer",
              }}>
                <span style={{ color: "var(--preview)" }}>Choose audio file</span>
                <br /><span style={{ fontSize: 10 }}>WAV, MP3, OGG, FLAC</span>
                <input type="file" accept="audio/*" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </label>
            </>
          ) : (
            <>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6 }}>
                {fileName} · {(buffer.length / 44100).toFixed(1)}s · {sliceCount} slices
              </div>

              {/* Waveform with slice markers */}
              <canvas ref={canvasRef} style={{
                width: "100%", height: 80, borderRadius: 6,
                background: "var(--bg-cell)", border: "1px solid var(--border)",
                marginBottom: 8,
              }} />

              {/* Slice count selector */}
              <div style={{ display: "flex", gap: 4, marginBottom: 12, justifyContent: "center" }}>
                {SLICE_COUNTS.map(n => (
                  <button key={n} onClick={() => setSliceCount(n)} style={{
                    padding: "6px 16px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                    background: sliceCount === n ? "var(--preview)" : "var(--bg-cell)",
                    color: sliceCount === n ? "#000" : "var(--text-dim)",
                    cursor: "pointer", border: "none",
                  }}>
                    {n} slices
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setBuffer(null)} style={{
                  flex: 1, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 700,
                  background: "var(--bg-cell)", color: "var(--text-dim)",
                }}>
                  Back
                </button>
                <button onClick={handleSlice} style={{
                  flex: 1, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 700,
                  background: "var(--preview)", color: "#000",
                }}>
                  Slice & Load
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
