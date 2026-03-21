import { useRef, useCallback, useEffect, useState } from "react";
import type { EffectName, EffectParams } from "../types";
import { DEFAULT_EFFECTS } from "../types";
import { EffectEditor } from "./EffectEditor";
import type { AudioEngine } from "../engine/AudioEngine";

// ── XY target definitions ────────────────────────────────────────────────

type XYTarget = "cutoff" | "resonance" | "distortion" | "highpass" | "delay_mix" | "reverb_mix" | "volume";

const XY_TARGETS: { id: XYTarget; label: string }[] = [
  { id: "cutoff", label: "Cutoff" },
  { id: "resonance", label: "Resonance" },
  { id: "distortion", label: "Distortion" },
  { id: "highpass", label: "Highpass" },
  { id: "delay_mix", label: "Delay" },
  { id: "reverb_mix", label: "Reverb" },
  { id: "volume", label: "Volume" },
];

function applyXYValue(target: XYTarget, value: number, engine: AudioEngine): void {
  // value is 0–1, apply to master effects on all tracks
  const apply = (name: EffectName, params: Record<string, unknown>) => {
    for (const track of engine.tracks) {
      track.setEffect(name, { on: true, ...params } as never);
    }
  };
  switch (target) {
    case "cutoff": apply("highpass", { cutoff: 100 + value * 7900 }); break;
    case "resonance": apply("highpass", { q: 0.5 + value * 19.5 }); break;
    case "distortion": apply("distortion", { drive: 1 + value * 99 }); break;
    case "highpass": apply("highpass", { cutoff: 20 + value * 1980 }); break;
    case "delay_mix": apply("delay", { mix: value }); break;
    case "reverb_mix": apply("reverb", { mix: value }); break;
    case "volume":
      for (const track of engine.tracks) {
        track.volume = value;
      }
      break;
  }
}

// ── Effect labels ────────────────────────────────────────────────────────

const EFFECT_LABELS: { name: EffectName; label: string }[] = [
  { name: "compressor", label: "COMP" },
  { name: "highpass", label: "HPF" },
  { name: "distortion", label: "DIST" },
  { name: "bitcrusher", label: "CRUSH" },
  { name: "chorus", label: "CHOR" },
  { name: "phaser", label: "PHAS" },
  { name: "delay", label: "DLY" },
  { name: "reverb", label: "VERB" },
];

// ── Trail type ───────────────────────────────────────────────────────────

interface Trail {
  x: number;
  y: number;
  age: number;
}

// ── Component ────────────────────────────────────────────────────────────

interface KaosPadProps {
  engine: AudioEngine | null;
}

export function KaosPad({ engine }: KaosPadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<HTMLDivElement>(null);
  const trailsRef = useRef<Trail[]>([]);
  const posRef = useRef<{ x: number; y: number } | null>(null);
  const animRef = useRef<number>(0);
  const [xTarget, setXTarget] = useState<XYTarget>("cutoff");
  const [yTarget, setYTarget] = useState<XYTarget>("resonance");
  const [editingEffect, setEditingEffect] = useState<EffectName | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const didLongPress = useRef(false);

  // Get current effects from first track (they're synced)
  const effects: EffectParams = engine?.tracks[0]?.getEffects() ?? DEFAULT_EFFECTS;

  const handlePadMove = useCallback((clientX: number, clientY: number) => {
    const pad = padRef.current;
    if (!pad || !engine) return;
    const rect = pad.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    posRef.current = { x, y };

    trailsRef.current.push({ x: clientX - rect.left, y: clientY - rect.top, age: Date.now() });
    if (trailsRef.current.length > 60) trailsRef.current.shift();

    applyXYValue(xTarget, x, engine);
    applyXYValue(yTarget, y, engine);
  }, [engine, xTarget, yTarget]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    handlePadMove(e.clientX, e.clientY);
    const onMove = (ev: MouseEvent) => handlePadMove(ev.clientX, ev.clientY);
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      posRef.current = null;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [handlePadMove]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const t = e.touches[0];
    handlePadMove(t.clientX, t.clientY);
  }, [handlePadMove]);

  const handleTouchEnd = useCallback(() => {
    posRef.current = null;
  }, []);

  // Canvas visualizer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
      }

      ctx.clearRect(0, 0, w, h);

      // Grid
      const preview = getComputedStyle(document.documentElement).getPropertyValue("--preview").trim() || "#b388ff";
      ctx.strokeStyle = preview + "18";
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(w * i / 4, 0); ctx.lineTo(w * i / 4, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, h * i / 4); ctx.lineTo(w, h * i / 4); ctx.stroke();
      }

      // Audio visualization (bars)
      if (engine) {
        const analyser = engine.getAnalyser();
        const dataLen = analyser.frequencyBinCount;
        const data = new Uint8Array(dataLen);
        analyser.getByteFrequencyData(data);

        const barCount = 32;
        const barW = w / barCount;
        ctx.fillStyle = preview + "30";
        for (let i = 0; i < barCount; i++) {
          const idx = Math.floor(i * dataLen / barCount);
          const v = data[idx] / 255;
          const barH = v * h * 0.4;
          ctx.fillRect(i * barW + 1, h / 2 - barH, barW - 2, barH);
          ctx.fillRect(i * barW + 1, h / 2, barW - 2, barH);
        }
      }

      // Trails
      const now = Date.now();
      trailsRef.current = trailsRef.current.filter(t => now - t.age < 800);
      for (const t of trailsRef.current) {
        const alpha = Math.max(0, 1 - (now - t.age) / 800);
        ctx.beginPath();
        ctx.arc(t.x, t.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = preview + Math.round(alpha * 180).toString(16).padStart(2, "0");
        ctx.fill();
      }

      // Cursor
      if (posRef.current) {
        const cx = posRef.current.x * w;
        const cy = (1 - posRef.current.y) * h;
        // Crosshairs
        ctx.strokeStyle = preview + "66";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
        // Circle
        ctx.beginPath();
        ctx.arc(cx, cy, 12, 0, Math.PI * 2);
        ctx.strokeStyle = preview;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, 12, 0, Math.PI * 2);
        ctx.fillStyle = preview + "20";
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [engine]);

  // Effect toggle/edit handlers
  const handleFxPointerDown = useCallback((name: EffectName) => {
    didLongPress.current = false;
    longPressTimer.current = window.setTimeout(() => {
      didLongPress.current = true;
      setEditingEffect(name);
    }, 400);
  }, []);

  const handleFxPointerUp = useCallback((name: EffectName) => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    if (!didLongPress.current && engine) {
      const fx = engine.tracks[0]?.getEffects();
      if (fx) {
        const isOn = !fx[name].on;
        for (const track of engine.tracks) {
          track.setEffect(name, { on: isOn } as never);
        }
      }
    }
  }, [engine]);

  const handleFxPointerLeave = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }, []);

  const handleFxParamChange = useCallback((params: Record<string, unknown>) => {
    if (!engine || !editingEffect) return;
    for (const track of engine.tracks) {
      track.setEffect(editingEffect, params as never);
    }
  }, [engine, editingEffect]);

  return (
    <div style={{ padding: "0 16px 8px" }}>
      {/* XY Target selectors */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "var(--text-dim)" }}>X:</span>
          <select
            value={xTarget}
            onChange={(e) => setXTarget(e.target.value as XYTarget)}
            style={{ font: "inherit", fontSize: 10, background: "var(--bg-cell)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 4px" }}
          >
            {XY_TARGETS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "var(--text-dim)" }}>Y:</span>
          <select
            value={yTarget}
            onChange={(e) => setYTarget(e.target.value as XYTarget)}
            style={{ font: "inherit", fontSize: 10, background: "var(--bg-cell)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 4px" }}
          >
            {XY_TARGETS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* XY Pad */}
      <div
        ref={padRef}
        onMouseDown={handleMouseDown}
        onTouchStart={(e) => { e.preventDefault(); handlePadMove(e.touches[0].clientX, e.touches[0].clientY); }}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "1",
          maxHeight: "50vh",
          borderRadius: 12,
          border: "2px solid var(--preview)",
          background: "var(--bg-cell)",
          boxShadow: "0 0 30px color-mix(in srgb, var(--preview) 15%, transparent), inset 0 0 60px rgba(0,0,0,0.5)",
          cursor: "crosshair",
          touchAction: "none",
          overflow: "hidden",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
        {/* Axis labels */}
        <span style={{ position: "absolute", bottom: 4, left: 8, fontSize: 9, color: "var(--text-dim)", opacity: 0.5, pointerEvents: "none" }}>
          {XY_TARGETS.find(t => t.id === xTarget)?.label} →
        </span>
        <span style={{ position: "absolute", top: 8, left: 4, fontSize: 9, color: "var(--text-dim)", opacity: 0.5, pointerEvents: "none", writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
          {XY_TARGETS.find(t => t.id === yTarget)?.label} →
        </span>
      </div>

      {/* Master Effects (global — applies to all tracks) */}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 9, color: "var(--text-dim)", marginBottom: 4, letterSpacing: 1 }}>MASTER FX</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
          {EFFECT_LABELS.map(({ name, label }) => {
            const isOn = effects[name].on;
            return (
              <button
                key={name}
                onPointerDown={() => handleFxPointerDown(name)}
                onPointerUp={() => handleFxPointerUp(name)}
                onPointerLeave={handleFxPointerLeave}
                style={{
                  fontSize: 10, fontWeight: 700, padding: "8px 4px", borderRadius: 5,
                  border: `1px solid var(--preview)`,
                  background: isOn ? "var(--preview)" : "transparent",
                  color: isOn ? "#000" : "var(--preview)",
                  opacity: isOn ? 1 : 0.5,
                  boxShadow: isOn ? "0 0 10px color-mix(in srgb, var(--preview) 45%, transparent)" : "none",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        {/* Chain display */}
        <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 6, textAlign: "center" }}>
          Chain: {EFFECT_LABELS.filter(e => effects[e.name].on).map(e => e.label).join(" → ") || "none"}
        </div>
      </div>

      {editingEffect && (
        <EffectEditor
          name={editingEffect}
          params={effects[editingEffect]}
          onClose={() => setEditingEffect(null)}
          onChange={handleFxParamChange}
        />
      )}
    </div>
  );
}
