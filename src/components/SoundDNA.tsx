/**
 * SoundDNA — generates a unique circular spectral fingerprint
 * for a recorded loop buffer. Each loop gets a visually distinct
 * identity based on its frequency content.
 */

import { useRef, useEffect } from "react";

interface SoundDNAProps {
  /** The audio buffer to analyze. */
  buffer: Float32Array | null;
  /** Diameter of the DNA glyph in pixels. */
  size?: number;
}

/**
 * Analyze buffer into frequency bands using a simple DFT approximation.
 * Returns 12 normalized band values (0–1) roughly mapping to musical octaves.
 */
function analyzeSpectrum(buffer: Float32Array): number[] {
  const bands = 12;
  const result = new Array(bands).fill(0);
  const blockSize = 2048;
  const samples = Math.min(buffer.length, blockSize);

  // Simple energy-per-band using windowed autocorrelation approximation
  for (let b = 0; b < bands; b++) {
    const freq = 60 * Math.pow(2, b * 0.75); // 60Hz to ~8kHz
    const period = 44100 / freq;
    let sum = 0;
    for (let i = 0; i < samples - Math.ceil(period); i++) {
      sum += buffer[i] * buffer[i + Math.floor(period)];
    }
    result[b] = Math.abs(sum / samples);
  }

  // Normalize to 0–1
  const max = Math.max(...result, 0.001);
  return result.map(v => v / max);
}

export function SoundDNA({ buffer, size = 28 }: SoundDNAProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer || buffer.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const bands = analyzeSpectrum(buffer);
    const cx = size / 2;
    const cy = size / 2;
    const maxR = size / 2 - 2;
    const preview = getComputedStyle(document.documentElement).getPropertyValue("--preview").trim() || "#b388ff";

    ctx.clearRect(0, 0, size, size);

    // Draw circular fingerprint: each band is a petal/spoke
    for (let i = 0; i < bands.length; i++) {
      const angle = (i / bands.length) * Math.PI * 2 - Math.PI / 2;
      const r = 4 + bands[i] * (maxR - 4);
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;

      // Spoke line
      ctx.strokeStyle = preview;
      ctx.globalAlpha = 0.3 + bands[i] * 0.7;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.stroke();

      // Dot at tip
      ctx.fillStyle = preview;
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Connect tips to form shape
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = preview;
    ctx.beginPath();
    for (let i = 0; i <= bands.length; i++) {
      const idx = i % bands.length;
      const angle = (idx / bands.length) * Math.PI * 2 - Math.PI / 2;
      const r = 4 + bands[idx] * (maxR - 4);
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // Center dot
    ctx.globalAlpha = 1;
    ctx.fillStyle = preview;
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();
  }, [buffer, size]);

  if (!buffer || buffer.length === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, flexShrink: 0 }}
      title="Sound DNA — spectral fingerprint"
    />
  );
}
