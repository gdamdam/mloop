/**
 * VuMeter — audio visualizer. Click to cycle between 4 styles.
 * Accepts an optional `height` prop so PAD/LOOPER placements can be taller
 * than the header instance.
 */

import { useRef, useEffect, useState, useCallback } from "react";

interface VuMeterProps {
  getAnalyser: () => AnalyserNode | null;
  /** Override the default CSS height (e.g. 64 for PAD/LOOPER views). */
  height?: number;
}

type VuStyle = "wave" | "accent" | "classic" | "spectrum";
const STYLES: VuStyle[] = ["wave", "accent", "classic", "spectrum"];
const STYLE_LABELS: Record<VuStyle, string> = {
  wave: "Waveform",
  accent: "Bars",
  classic: "Classic",
  spectrum: "Spectrum",
};

export function VuMeter({ getAnalyser, height }: VuMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const [style, setStyle] = useState<VuStyle>("wave");
  const [hover, setHover] = useState(false);
  const peakRef = useRef(0);
  const rmsRef = useRef(0);
  const peakFreqRef = useRef(0);
  const tooltipRef = useRef<HTMLDivElement>(null);
  // Stable ref so the draw loop never restarts due to a new inline arrow prop.
  const getAnalyserRef = useRef(getAnalyser);
  useEffect(() => { getAnalyserRef.current = getAnalyser; });

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const tt = tooltipRef.current;
    if (!tt) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tt.style.left = `${e.clientX - rect.left}px`;
  }, []);

  const cycleStyle = () => {
    setStyle(prev => STYLES[(STYLES.indexOf(prev) + 1) % STYLES.length]);
  };

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
      if (!analyser) return;

      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);

      const accent = getComputedStyle(document.documentElement).getPropertyValue("--preview").trim() || "#b388ff";

      if (style === "wave") {
        // Oscilloscope — time-domain waveform
        try { analyser.fftSize = 2048; } catch { /* read-only in some contexts */ }
        const timeData = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(timeData);

        // Centre line
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.15;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Build waveform path
        const sliceW = w / timeData.length;
        ctx.beginPath();
        for (let i = 0; i < timeData.length; i++) {
          const v = timeData[i] / 128 - 1; // -1..1
          const y = h / 2 - v * h * 0.48;  // fill most of the height
          if (i === 0) ctx.moveTo(0, y);
          else ctx.lineTo(i * sliceW, y);
        }

        // Fill between waveform and midline
        ctx.lineTo(w, h / 2);
        ctx.lineTo(0, h / 2);
        ctx.closePath();
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.18;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Stroke the waveform on top
        ctx.beginPath();
        for (let i = 0; i < timeData.length; i++) {
          const v = timeData[i] / 128 - 1;
          const y = h / 2 - v * h * 0.48;
          if (i === 0) ctx.moveTo(0, y);
          else ctx.lineTo(i * sliceW, y);
        }
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Update peak/rms from freq data for tooltip
        const freqData = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freqData);
        let peak = 0, sumSq = 0, peakBin = 0, peakBinVal = 0;
        for (let i = 0; i < freqData.length; i++) {
          const v = freqData[i] / 255;
          if (v > peak) peak = v;
          sumSq += v * v;
          if (freqData[i] > peakBinVal) { peakBinVal = freqData[i]; peakBin = i; }
        }
        peakRef.current = peak;
        rmsRef.current = Math.sqrt(sumSq / freqData.length);
        peakFreqRef.current = (peakBin * analyser.context.sampleRate) / analyser.fftSize;

      } else {
        const freqData = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freqData);

        let peak = 0, sumSq = 0, peakBin = 0, peakBinVal = 0;
        for (let i = 0; i < freqData.length; i++) {
          const v = freqData[i] / 255;
          if (v > peak) peak = v;
          sumSq += v * v;
          if (freqData[i] > peakBinVal) { peakBinVal = freqData[i]; peakBin = i; }
        }
        peakRef.current = peak;
        rmsRef.current = Math.sqrt(sumSq / freqData.length);
        peakFreqRef.current = (peakBin * analyser.context.sampleRate) / analyser.fftSize;

        if (style === "spectrum") {
          ctx.strokeStyle = accent;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          const sliceW = w / freqData.length;
          for (let i = 0; i < freqData.length; i++) {
            const val = freqData[i] / 255;
            const y = h - val * h;
            if (i === 0) ctx.moveTo(0, y);
            else ctx.lineTo(i * sliceW, y);
          }
          ctx.stroke();
          ctx.lineTo(w, h);
          ctx.lineTo(0, h);
          ctx.closePath();
          ctx.fillStyle = accent;
          ctx.globalAlpha = 0.25;
          ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          const BARS = 24;
          const barW = Math.floor(w / BARS) - 1;
          const step = Math.floor(freqData.length / BARS);
          for (let i = 0; i < BARS; i++) {
            let sum = 0;
            for (let j = 0; j < step; j++) sum += freqData[i * step + j];
            const val = sum / step / 255;
            const barH = val * h;
            if (style === "classic") {
              const pct = val;
              let r: number, g: number;
              if (pct < 0.5) { r = Math.round(pct * 2 * 255); g = 255; }
              else { r = 255; g = Math.round((1 - (pct - 0.5) * 2) * 255); }
              ctx.fillStyle = `rgb(${r},${g},0)`;
            } else {
              ctx.fillStyle = accent;
              ctx.globalAlpha = 0.5 + val * 0.5;
            }
            ctx.fillRect(i * (barW + 1), h - barH, barW, barH);
            ctx.globalAlpha = 1;
          }
        }
      }
    };

    draw();
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, [style]); // getAnalyser is kept in a ref — no restart on new inline arrows

  /* eslint-disable react-hooks/refs */
  const peakDb = peakRef.current > 0 ? (20 * Math.log10(peakRef.current)).toFixed(1) : "-∞";
  const rmsDb = rmsRef.current > 0 ? (20 * Math.log10(rmsRef.current)).toFixed(1) : "-∞";
  const freqLabel = peakFreqRef.current >= 1000
    ? `${(peakFreqRef.current / 1000).toFixed(1)}kHz`
    : `${Math.round(peakFreqRef.current)}Hz`;
  /* eslint-enable react-hooks/refs */

  return (
    <div
      className="vu-meter-wrap"
      style={height !== undefined ? { height } : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseMove={onMouseMove}
    >
      <canvas ref={canvasRef} className="vu-meter" onClick={cycleStyle} />
      {hover && (
        <div ref={tooltipRef} className="vu-tooltip">
          <span>Peak <b>{peakDb} dB</b></span>
          <span>RMS <b>{rmsDb} dB</b></span>
          <span>Freq <b>{freqLabel}</b></span>
          <span className="vu-tooltip-hint">{STYLE_LABELS[style]} · click to cycle</span>
        </div>
      )}
    </div>
  );
}
