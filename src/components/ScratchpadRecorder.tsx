/**
 * ScratchpadRecorder — a dedicated recorder strip above the sequencer.
 * Record from mic, resample master output, or dub (mic + output).
 * Preview waveform, auto-trim, then drag result onto any pad.
 */

import { useRef, useEffect, useState, useCallback } from "react";
import type { AudioEngine } from "../engine/AudioEngine";
import { Recorder } from "../engine/Recorder";

type RecordSource = "mic" | "resample" | "dub";

interface ScratchpadRecorderProps {
  engine: AudioEngine | null;
}

/** Auto-trim silence from a buffer: remove leading, cap trailing at 1s. */
function autoTrimBuffer(raw: Float32Array, sampleRate: number): Float32Array {
  if (raw.length === 0) return raw;
  const threshold = 0.01;
  let first = 0;
  for (let i = 0; i < raw.length; i++) { if (Math.abs(raw[i]) > threshold) { first = i; break; } }
  let last = raw.length - 1;
  for (let i = raw.length - 1; i >= 0; i--) { if (Math.abs(raw[i]) > threshold) { last = i; break; } }
  const tail = Math.min(sampleRate, raw.length - last - 1);
  return raw.slice(first, last + tail + 1);
}

export function ScratchpadRecorder({ engine }: ScratchpadRecorderProps) {
  const [source, setSource] = useState<RecordSource>("mic");
  const [recording, setRecording] = useState(false);
  const [buffer, setBuffer] = useState<Float32Array | null>(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [looping, setLooping] = useState(false);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recorderRef = useRef<Recorder | null>(null);
  // For resample/dub: MediaStreamDestination to capture master output
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const dubRecorderRef = useRef<MediaRecorder | null>(null);
  const dubChunksRef = useRef<Blob[]>([]);

  /** Start recording from selected source. */
  const startRec = useCallback(async () => {
    if (!engine) return;

    if (source === "mic") {
      // Record from mic input
      const rec = new Recorder(engine.ctx, engine.getInputNode());
      await rec.start();
      recorderRef.current = rec;
    } else {
      // Resample or dub: capture from master output (+ mic for dub)
      const dest = engine.ctx.createMediaStreamDestination();
      engine.getMasterNode().connect(dest);
      if (source === "dub") {
        // Also connect mic input to the destination for dubbing
        engine.getInputNode().connect(dest);
      }
      destRef.current = dest;
      dubChunksRef.current = [];
      const mr = new MediaRecorder(dest.stream);
      mr.ondataavailable = (e) => { if (e.data.size > 0) dubChunksRef.current.push(e.data); };
      mr.start();
      dubRecorderRef.current = mr;
    }

    setRecording(true);
    setBuffer(null);
  }, [engine, source]);

  /** Stop recording and produce buffer. */
  const stopRec = useCallback(async () => {
    if (!engine) return;

    if (source === "mic" && recorderRef.current) {
      const raw = await recorderRef.current.stop();
      recorderRef.current = null;
      const trimmed = raw.length > 0 ? autoTrimBuffer(raw, engine.ctx.sampleRate) : null;
      setBuffer(trimmed);
      setTrimStart(0);
      setTrimEnd(1);
    } else if (dubRecorderRef.current) {
      const mr = dubRecorderRef.current;
      await new Promise<void>(resolve => { mr.onstop = () => resolve(); mr.stop(); });
      // Disconnect
      if (destRef.current) {
        try { engine.getMasterNode().disconnect(destRef.current); } catch { /* ok */ }
        if (source === "dub") {
          try { engine.getInputNode().disconnect(destRef.current); } catch { /* ok */ }
        }
      }
      // Decode blob to Float32Array
      const blob = new Blob(dubChunksRef.current, { type: "audio/webm" });
      const arrBuf = await blob.arrayBuffer();
      const audioBuf = await engine.ctx.decodeAudioData(arrBuf);
      const mono = new Float32Array(audioBuf.length);
      for (let ch = 0; ch < audioBuf.numberOfChannels; ch++) {
        const d = audioBuf.getChannelData(ch);
        for (let i = 0; i < mono.length; i++) mono[i] += d[i];
      }
      if (audioBuf.numberOfChannels > 1) {
        for (let i = 0; i < mono.length; i++) mono[i] /= audioBuf.numberOfChannels;
      }
      dubRecorderRef.current = null;
      destRef.current = null;
      const trimmedMono = mono.length > 0 ? autoTrimBuffer(mono, engine.ctx.sampleRate) : null;
      setBuffer(trimmedMono);
      setTrimStart(0);
      setTrimEnd(1);
    }

    setRecording(false);
  }, [engine, source]);

  /** Auto-trim silence. */
  const autoTrim = useCallback(() => {
    if (!buffer) return;
    const threshold = 0.01;
    const len = buffer.length;
    let first = 0;
    for (let i = 0; i < len; i++) { if (Math.abs(buffer[i]) > threshold) { first = i; break; } }
    let last = len - 1;
    for (let i = len - 1; i >= 0; i--) { if (Math.abs(buffer[i]) > threshold) { last = i; break; } }
    const tail = Math.min(44100, len - last - 1);
    setTrimStart(first / len);
    setTrimEnd(Math.min(1, (last + tail) / len));
  }, [buffer]);

  /** Get trimmed buffer for dragging. */
  const getTrimmedBuffer = useCallback((): Float32Array | null => {
    if (!buffer) return null;
    const start = Math.floor(trimStart * buffer.length);
    const end = Math.floor(trimEnd * buffer.length);
    return buffer.slice(start, end);
  }, [buffer, trimStart, trimEnd]);

  /** Play the trimmed buffer preview. */
  const playPreview = useCallback(() => {
    if (!engine || !buffer) return;
    // Stop any existing playback
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); sourceNodeRef.current.disconnect(); } catch { /* ok */ }
    }
    const trimmed = getTrimmedBuffer();
    if (!trimmed || trimmed.length === 0) return;
    const audioBuf = engine.ctx.createBuffer(1, trimmed.length, engine.ctx.sampleRate);
    audioBuf.copyToChannel(new Float32Array(trimmed), 0);
    const src = engine.ctx.createBufferSource();
    src.buffer = audioBuf;
    src.loop = looping;
    src.connect(engine.getMasterNode());
    src.onended = () => { if (!looping) setPlaying(false); };
    src.start();
    sourceNodeRef.current = src;
    setPlaying(true);
  }, [engine, buffer, looping, getTrimmedBuffer]);

  /** Stop preview playback. */
  const stopPreview = useCallback(() => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); sourceNodeRef.current.disconnect(); } catch { /* ok */ }
      sourceNodeRef.current = null;
    }
    setPlaying(false);
  }, []);

  // Draw waveform
  useEffect(() => {
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
    ctx.clearRect(0, 0, w, h);

    const preview = getComputedStyle(document.documentElement).getPropertyValue("--preview").trim() || "#b388ff";

    if (!buffer || buffer.length === 0) {
      ctx.strokeStyle = preview + "44";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
      return;
    }

    const halfH = h / 2;
    const step = Math.max(1, Math.floor(buffer.length / w));

    // Dim outside trim
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
      ctx.fillStyle = preview;
      ctx.globalAlpha = inSel ? 0.7 : 0.15;
      ctx.fillRect(x, halfH - barH, 1, barH * 2);
    }
    ctx.globalAlpha = 1;

    // Trim handles
    ctx.strokeStyle = "#66ff99"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(trimStart * w, 0); ctx.lineTo(trimStart * w, h); ctx.stroke();
    ctx.strokeStyle = "#ff4444";
    ctx.beginPath(); ctx.moveTo(trimEnd * w, 0); ctx.lineTo(trimEnd * w, h); ctx.stroke();
  }, [buffer, trimStart, trimEnd]);

  // Trim handle drag
  const dragging = useRef<"start" | "end" | null>(null);

  const duration = buffer ? buffer.length / 44100 : 0;
  const trimmedDur = duration * (trimEnd - trimStart);

  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: 8,
      background: "var(--bg-panel)", padding: 8, marginBottom: 8,
    }}>
      {/* Source selector + record controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
        {/* Source toggle */}
        {(["mic", "resample", "dub"] as const).map(s => (
          <button key={s} onClick={() => !recording && setSource(s)} style={{
            fontSize: 8, fontWeight: 700, padding: "3px 6px", borderRadius: 3,
            background: source === s ? "var(--preview)" : "var(--bg-cell)",
            color: source === s ? "#000" : "var(--text-dim)",
            textTransform: "uppercase", cursor: recording ? "default" : "pointer",
            opacity: recording && source !== s ? 0.3 : 1,
            border: "none",
          }}>
            {s}
          </button>
        ))}

        <div style={{ width: 1, height: 16, background: "var(--border)", margin: "0 2px" }} />

        {/* Record / Stop */}
        <button onClick={recording ? stopRec : startRec} style={{
          fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4,
          background: recording ? "var(--record)" : "var(--bg-cell)",
          color: recording ? "#fff" : "var(--text)",
          border: "none", cursor: "pointer",
          animation: recording ? "pulse 0.8s infinite" : "none",
        }}>
          {recording ? "■ STOP" : "● REC"}
        </button>

        {/* Auto-trim + duration */}
        {buffer && (
          <>
            <button onClick={playing ? stopPreview : playPreview} style={{
              fontSize: 8, fontWeight: 700, padding: "3px 6px", borderRadius: 3,
              background: playing ? "var(--playing)" : "var(--bg-cell)",
              color: playing ? "#000" : "var(--text)",
              border: "none", cursor: "pointer",
            }}>
              {playing ? "■" : "▶"}
            </button>
            <button onClick={() => { setLooping(!looping); if (playing) { stopPreview(); } }} style={{
              fontSize: 8, fontWeight: 700, padding: "3px 6px", borderRadius: 3,
              background: looping ? "var(--preview)" : "var(--bg-cell)",
              color: looping ? "#000" : "var(--text-dim)",
              border: "none", cursor: "pointer",
            }}>
              ↻
            </button>
            <button onClick={autoTrim} style={{
              fontSize: 8, fontWeight: 700, padding: "3px 6px", borderRadius: 3,
              background: "var(--bg-cell)", color: "var(--text-dim)",
              border: "none", cursor: "pointer",
            }}>
              Trim
            </button>
            <span style={{ fontSize: 8, color: "var(--text-dim)", marginLeft: "auto" }}>
              {trimmedDur.toFixed(1)}s
            </span>
          </>
        )}
      </div>

      {/* Waveform — draggable to pads */}
      <canvas
        ref={canvasRef}
        draggable={!!buffer}
        onDragStart={(e) => {
          const trimmed = getTrimmedBuffer();
          if (trimmed) {
            // Store in a global for the drop handler to pick up
            (window as unknown as Record<string, unknown>).__mloop_scratch_buffer = trimmed;
            e.dataTransfer.setData("text/scratch", "1");
            e.dataTransfer.effectAllowed = "copy";
          }
        }}
        onPointerDown={(e) => {
          if (!buffer) return;
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          const pct = (e.clientX - rect.left) / rect.width;
          dragging.current = Math.abs(pct - trimStart) < Math.abs(pct - trimEnd) ? "start" : "end";
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragging.current || !buffer) return;
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          if (dragging.current === "start") setTrimStart(Math.min(pct, trimEnd - 0.01));
          else setTrimEnd(Math.max(pct, trimStart + 0.01));
        }}
        onPointerUp={() => { dragging.current = null; }}
        style={{
          width: "100%", height: 40, borderRadius: 4, cursor: buffer ? "ew-resize" : "default",
          background: "var(--bg-cell)", border: "1px solid var(--border)",
          touchAction: "none",
        }}
        title={buffer ? "Drag waveform onto a pad to load it" : "Record something first"}
      />
    </div>
  );
}
