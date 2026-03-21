import { useRef, useEffect, useCallback } from "react";

interface WaveformDisplayProps {
  /** Static buffer data for recorded loops. */
  bufferData: Float32Array | null;
  /** Track status for coloring. */
  status: "empty" | "recording" | "playing" | "overdubbing" | "stopped";
  /** Loop length in samples (for playhead calculation). */
  loopLengthSamples: number;
  /** AnalyserNode for live input visualization during recording. */
  analyser?: AnalyserNode | null;
}

const STATUS_COLORS: Record<string, string> = {
  recording: "#ff4444",
  playing: "#66ff99",
  overdubbing: "#f0883e",
  stopped: "#7d8590",
  empty: "#30363d",
};

export function WaveformDisplay({ bufferData, status, loopLengthSamples, analyser }: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    // Resize canvas if needed
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, w, h);
    const color = STATUS_COLORS[status] || STATUS_COLORS.empty;

    if (status === "recording" && analyser) {
      // Live waveform from analyser during recording
      const dataLen = analyser.fftSize;
      const data = new Uint8Array(dataLen);
      analyser.getByteTimeDomainData(data);

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      const sliceWidth = w / dataLen;
      let x = 0;
      for (let i = 0; i < dataLen; i++) {
        const v = data[i] / 128.0;
        const y = (v * h) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.stroke();

    } else if (bufferData && bufferData.length > 0) {
      // Static waveform from buffer
      const samples = bufferData;
      const step = Math.max(1, Math.floor(samples.length / w));
      const halfH = h / 2;

      // Fill waveform shape
      ctx.fillStyle = color + "40"; // 25% opacity
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(0, halfH);

      // Top half
      for (let x = 0; x < w; x++) {
        const idx = Math.floor((x / w) * samples.length);
        let max = 0;
        for (let j = 0; j < step && idx + j < samples.length; j++) {
          const v = Math.abs(samples[idx + j]);
          if (v > max) max = v;
        }
        ctx.lineTo(x, halfH - max * halfH);
      }

      // Bottom half (mirror)
      for (let x = w - 1; x >= 0; x--) {
        const idx = Math.floor((x / w) * samples.length);
        let max = 0;
        for (let j = 0; j < step && idx + j < samples.length; j++) {
          const v = Math.abs(samples[idx + j]);
          if (v > max) max = v;
        }
        ctx.lineTo(x, halfH + max * halfH);
      }

      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Playhead
      if ((status === "playing" || status === "overdubbing") && loopLengthSamples > 0) {
        const now = performance.now();
        if (startTimeRef.current === 0) startTimeRef.current = now;
        const elapsed = (now - startTimeRef.current) / 1000;
        const sampleRate = 44100;
        const loopDuration = loopLengthSamples / sampleRate;
        const position = (elapsed % loopDuration) / loopDuration;
        const headX = position * w;

        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(headX, 0);
        ctx.lineTo(headX, h);
        ctx.stroke();
      }
    } else {
      // Empty state — draw a flat center line
      ctx.strokeStyle = STATUS_COLORS.empty;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
    }
  }, [bufferData, status, loopLengthSamples, analyser]);

  useEffect(() => {
    // Reset playhead start time when status changes
    if (status === "playing" || status === "overdubbing") {
      startTimeRef.current = performance.now();
    } else {
      startTimeRef.current = 0;
    }
  }, [status]);

  useEffect(() => {
    const animate = () => {
      draw();
      animRef.current = requestAnimationFrame(animate);
    };

    // Only animate when there's something dynamic to show
    if (status === "recording" || status === "playing" || status === "overdubbing") {
      animate();
    } else {
      // Static draw once
      draw();
    }

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [draw, status]);

  return (
    <canvas
      ref={canvasRef}
      className="waveform-area"
      style={{ width: "100%", height: 64 }}
    />
  );
}
