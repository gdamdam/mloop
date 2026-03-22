/**
 * NeedleMeter — compact analog needle VU meter for the header.
 * Ported from mpump MixerPanel's needle meter. Shows RMS level
 * with smoothed attack/release, arc zones, and a glowing needle.
 */

import { useRef, useEffect } from "react";

const DB_FLOOR = -40;
const DB_MAX = 3;
const DB_RANGE = DB_MAX - DB_FLOOR;
const ATTACK_COEFF = 0.12;
const RELEASE_COEFF = 0.96;
const ARC_START = (220 * Math.PI) / 180;
const ARC_END = (320 * Math.PI) / 180;
const ARC_SPAN = ARC_END - ARC_START;

const DB_TICKS = [
  { db: -20, label: "-20" },
  { db: -10, label: "-10" },
  { db: 0, label: "0" },
  { db: 3, label: "+3" },
];

function toDB(linear: number): number {
  if (linear < 1e-6) return DB_FLOOR;
  return Math.max(DB_FLOOR, Math.min(DB_MAX, 20 * Math.log10(linear)));
}

function dbToAngle(db: number): number {
  const t = (db - DB_FLOOR) / DB_RANGE;
  return ARC_START + t * ARC_SPAN;
}

interface NeedleMeterProps {
  getAnalyser: () => AnalyserNode | null;
  /** Accent goes green only when a track is playing */
  isPlaying?: boolean;
}

export function NeedleMeter({ getAnalyser, isPlaying }: NeedleMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const ms = useRef({
    smoothedRms: 0,
    needleAngle: ARC_START,
    buf: null as Uint8Array<ArrayBuffer> | null,
    accent: "#999",
    accentFrame: 0,
    isPlaying: false,
  });
  // Keep refs in sync without triggering effect re-runs
  ms.current.isPlaying = isPlaying ?? false;
  const getAnalyserRef = useRef(getAnalyser);
  getAnalyserRef.current = getAnalyser;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const analyser = getAnalyserRef.current();
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);
      const s = ms.current;

      if (analyser) {
        const size = analyser.fftSize;
        if (!s.buf || s.buf.length !== size) s.buf = new Uint8Array(new ArrayBuffer(size));
        analyser.getByteTimeDomainData(s.buf);
        let sumSq = 0;
        for (let i = 0; i < size; i++) {
          const sample = (s.buf[i] - 128) / 128;
          sumSq += sample * sample;
        }
        const rms = Math.sqrt(sumSq / size);
        if (rms > s.smoothedRms) {
          s.smoothedRms = ATTACK_COEFF * s.smoothedRms + (1 - ATTACK_COEFF) * rms;
        } else {
          s.smoothedRms = RELEASE_COEFF * s.smoothedRms + (1 - RELEASE_COEFF) * rms;
        }
      } else {
        s.smoothedRms *= 0.95;
      }

      // Green only when tracks are playing; gray otherwise
      s.accent = s.isPlaying ? "#66ff99" : "#999";

      const db = toDB(s.smoothedRms);
      const targetAngle = dbToAngle(db);
      s.needleAngle += (targetAngle - s.needleAngle) * 0.18;

      // Render
      const cx = w / 2;
      const cy = h - 4;
      const radius = Math.min(w / 2 - 8, h - 8);
      const zeroAngle = dbToAngle(0);

      // Arc zones: green → yellow → red
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, radius, ARC_START, zeroAngle);
      ctx.strokeStyle = s.accent; ctx.globalAlpha = 0.25; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, radius, zeroAngle, ARC_END);
      ctx.strokeStyle = "#ff4444"; ctx.globalAlpha = 0.35; ctx.stroke();
      ctx.globalAlpha = 1;

      // Tick marks
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = `${Math.max(7, w * 0.04)}px monospace`;
      for (const tick of DB_TICKS) {
        const angle = dbToAngle(tick.db);
        const cos = Math.cos(angle), sin = Math.sin(angle);
        ctx.beginPath();
        ctx.moveTo(cx + cos * (radius - 4), cy + sin * (radius - 4));
        ctx.lineTo(cx + cos * (radius + 1), cy + sin * (radius + 1));
        ctx.strokeStyle = tick.db >= 0 ? "#ff4444" : "#7d8590";
        ctx.globalAlpha = tick.db >= 0 ? 0.7 : 0.4; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fillText(tick.label, cx + cos * (radius + 9), cy + sin * (radius + 9));
        ctx.globalAlpha = 1;
      }

      // Needle
      const ncos = Math.cos(s.needleAngle), nsin = Math.sin(s.needleAngle);
      // Shadow
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + ncos * (radius - 2), cy + nsin * (radius - 2));
      ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 2.5; ctx.stroke();
      // Colored needle
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + ncos * (radius - 2), cy + nsin * (radius - 2));
      const t = (s.needleAngle - ARC_START) / ARC_SPAN;
      ctx.strokeStyle = t > 0.93 ? "#ff4444" : t > 0.81 ? "#ffaa00" : s.accent;
      ctx.lineWidth = 1.5; ctx.lineCap = "round"; ctx.stroke();
      // Tip glow
      ctx.beginPath(); ctx.arc(cx + ncos * (radius - 4), cy + nsin * (radius - 4), 2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle; ctx.globalAlpha = 0.7; ctx.fill();
      // Pivot dot
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fillStyle = s.accent; ctx.fill();
    };

    draw();
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — refs keep values current

  return (
    <canvas ref={canvasRef} style={{
      width: "100%", height: "100%", display: "block",
      borderRadius: 4, background: "var(--bg-cell)",
      border: "1px solid var(--border)",
    }} />
  );
}
