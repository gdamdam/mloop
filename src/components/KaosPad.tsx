import { useRef, useCallback, useEffect, useState } from "react";
import type { EffectName, EffectParams } from "../types";
import { DEFAULT_EFFECTS } from "../types";
import { EffectEditor } from "./EffectEditor";
import { ChainEditor } from "./ChainEditor";
import type { AudioEngine } from "../engine/AudioEngine";
import { GestureRecorder } from "../engine/GestureRecorder";

/**
 * Default chain order — mirrors mpump. lowpass/highpass sit at the front
 * (hidden from the visible grid, routed to by the XY pad). The rest are
 * in mpump's GRID_EFFECTS order so the toggles match visually.
 */
const DEFAULT_EFFECT_ORDER: EffectName[] = [
  "lowpass", "highpass",
  "delay", "distortion", "reverb", "compressor", "flanger", "duck", "chorus", "phaser", "bitcrusher", "tremolo",
];

/** Effect IDs rendered in the kaos-fx grid, in mpump's order. */
const GRID_EFFECTS: EffectName[] = [
  "delay", "distortion", "reverb", "compressor", "flanger", "duck", "chorus", "phaser", "bitcrusher", "tremolo",
];

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
    case "cutoff": apply("lowpass", { cutoff: 100 + value * 7900 }); break;
    case "resonance": apply("lowpass", { q: 0.5 + value * 14.5 }); break;
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

/** Short labels used by the kaos-fx grid and the chain readout. Matches mpump. */
const EFFECT_LABELS: Record<EffectName, string> = {
  lowpass: "LPF",
  highpass: "HPF",
  delay: "DELAY",
  distortion: "DIST",
  reverb: "REVERB",
  compressor: "COMP",
  flanger: "FLANG",
  duck: "DUCK",
  chorus: "CHORUS",
  phaser: "PHASER",
  bitcrusher: "CRUSH",
  tremolo: "TREM",
};

const EFFECT_FULL_NAMES: Record<EffectName, string> = {
  lowpass: "Low-Pass Filter",
  highpass: "High-Pass Filter",
  delay: "Delay",
  distortion: "Distortion",
  reverb: "Reverb",
  compressor: "Compressor",
  flanger: "Flanger",
  duck: "Sidechain Duck",
  chorus: "Chorus",
  phaser: "Phaser",
  bitcrusher: "Bitcrusher",
  tremolo: "Tremolo",
};

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
  const [xTarget, setXTarget] = useState<XYTarget>(() =>
    (localStorage.getItem("mloop-xy-x") as XYTarget) || "cutoff"
  );
  const [yTarget, setYTarget] = useState<XYTarget>(() =>
    (localStorage.getItem("mloop-xy-y") as XYTarget) || "resonance"
  );
  const [editingEffect, setEditingEffect] = useState<EffectName | null>(null);
  const [showChainEditor, setShowChainEditor] = useState(false);
  const [effectOrder, setEffectOrder] = useState<EffectName[]>(DEFAULT_EFFECT_ORDER);
  const longPressTimer = useRef<number | null>(null);
  const didLongPress = useRef(false);

  // Gesture loop recorder — records XY movements as repeating automation
  const gestureRef = useRef(new GestureRecorder());
  const [gestureState, setGestureState] = useState<"idle" | "recording" | "playing">("idle");
  // Mirror of gestureRef.current.hasGesture in React state — lets the overlay
  // buttons render disabled/enabled without reading the ref during render.
  const [hasGesture, setHasGesture] = useState(false);

  // Pause/resume gesture playback when transport stops/starts
  const anyTrackActive = engine?.tracks.some(t =>
    t.status === "playing" || t.status === "recording" || t.status === "overdubbing"
  ) ?? false;

  useEffect(() => {
    if (gestureState !== "playing") return;
    const gr = gestureRef.current;
    if (!anyTrackActive) {
      gr.pausePlayback();
    } else if (gr.isPaused) {
      gr.resumePlayback();
    }
  }, [anyTrackActive, gestureState]);

  // Gesture loop duration — prefer master loop length, fall back to 4 bars at current BPM
  const gestureDurationMs = useCallback(() => {
    const bpm = engine?.timing.bpm ?? 120;
    const masterLen = engine?.masterLoopLength ?? 0;
    return masterLen > 0 ? (masterLen / 44100) * 1000 : (60 / bpm) * 4 * 4 * 1000;
  }, [engine]);

  const startGestureRec = useCallback(() => {
    gestureRef.current.startRecording(gestureDurationMs());
    setGestureState("recording");
  }, [gestureDurationMs]);

  const stopGestureRec = useCallback(() => {
    gestureRef.current.stopRecording();
    setGestureState("idle");
    setHasGesture(gestureRef.current.hasGesture);
  }, []);

  const startGesturePlay = useCallback(() => {
    gestureRef.current.onPlayback = (x, y) => {
      if (!engine) return;
      applyXYValue(xTarget, x, engine);
      applyXYValue(yTarget, y, engine);
    };
    gestureRef.current.startPlayback(gestureDurationMs());
    setGestureState("playing");
  }, [engine, xTarget, yTarget, gestureDurationMs]);

  const stopGesturePlay = useCallback(() => {
    gestureRef.current.stopPlayback();
    setGestureState("idle");
  }, []);

  const clearGesture = useCallback(() => {
    gestureRef.current.clear();
    setGestureState("idle");
    setHasGesture(false);
  }, []);

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

    // Record gesture point if recording
    if (gestureRef.current.isRecording) {
      gestureRef.current.addPoint(x, y);
    }
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

      // Audio visualization — full-canvas waveform background
      if (engine) {
        const analyser = engine.getAnalyser();
        try { analyser.fftSize = 2048; } catch { /* ok */ }
        const timeData = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(timeData);

        const sliceW = w / timeData.length;

        // Filled shape between waveform and midline
        ctx.beginPath();
        for (let i = 0; i < timeData.length; i++) {
          const v = timeData[i] / 128 - 1;
          const y = h / 2 - v * h * 0.46;
          if (i === 0) ctx.moveTo(0, y);
          else ctx.lineTo(i * sliceW, y);
        }
        ctx.lineTo(w, h / 2);
        ctx.lineTo(0, h / 2);
        ctx.closePath();
        ctx.fillStyle = preview + "3a";
        ctx.fill();

        // Centre line — so silence is still visible on dark backgrounds
        ctx.strokeStyle = preview + "44";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();

        // Waveform line
        ctx.beginPath();
        for (let i = 0; i < timeData.length; i++) {
          const v = timeData[i] / 128 - 1;
          const y = h / 2 - v * h * 0.46;
          if (i === 0) ctx.moveTo(0, y);
          else ctx.lineTo(i * sliceW, y);
        }
        ctx.strokeStyle = preview + "cc";
        ctx.lineWidth = 1.5;
        ctx.stroke();
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

  // ── Effect toggle (tap) — matches mpump behavior ─────────────────────
  const toggleFx = useCallback((name: EffectName) => {
    if (!engine) return;
    const fx = engine.tracks[0]?.getEffects();
    if (!fx) return;
    const turningOn = !fx[name].on;

    for (const track of engine.tracks) {
      track.setEffect(name, { on: turningOn } as never);
    }

    // Update chain order: activated effects move to end
    let newOrder = [...effectOrder];
    if (turningOn) {
      newOrder = newOrder.filter(e => e !== name);
      newOrder.push(name);
    }
    setEffectOrder(newOrder);
    for (const track of engine.tracks) {
      track.effects.setEffectOrder(newOrder);
    }
  }, [engine, effectOrder]);

  // Long-press to edit, short tap to toggle
  const fxPointerDown = useCallback((name: EffectName) => {
    didLongPress.current = false;
    longPressTimer.current = window.setTimeout(() => {
      didLongPress.current = true;
      setEditingEffect(name);
    }, 500);
  }, []);

  const fxPointerUp = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }, []);

  const handleFxParamChange = useCallback((params: Record<string, unknown>) => {
    if (!engine || !editingEffect) return;
    for (const track of engine.tracks) {
      track.setEffect(editingEffect, params as never);
    }
  }, [engine, editingEffect]);

  // Auto-enable effect when selected as XY target
  const autoEnableForTarget = useCallback((target: XYTarget) => {
    if (!engine) return;
    const fx = engine.tracks[0]?.getEffects();
    if (!fx) return;
    const map: Partial<Record<XYTarget, EffectName>> = {
      cutoff: "lowpass", resonance: "lowpass", distortion: "distortion",
      highpass: "highpass", delay_mix: "delay", reverb_mix: "reverb",
    };
    const effectName = map[target];
    if (effectName && !fx[effectName].on) {
      for (const track of engine.tracks) {
        track.setEffect(effectName, { on: true } as never);
      }
    }
  }, [engine]);

  // Save chain order to engine
  const handleChainSave = useCallback((order: EffectName[]) => {
    setEffectOrder(order);
    if (engine) {
      for (const track of engine.tracks) {
        track.effects.setEffectOrder(order);
      }
    }
  }, [engine]);

  return (
    <div className="kaos-split">
      {/* Left: XY pad */}
      <div className="kaos-pad-col">
      {/* XY Target selectors */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "var(--text-dim)" }}>X:</span>
          <select
            value={xTarget}
            onChange={(e) => { const t = e.target.value as XYTarget; setXTarget(t); localStorage.setItem("mloop-xy-x", t); autoEnableForTarget(t); }}
            style={{ font: "inherit", fontSize: 10, background: "var(--bg-cell)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 4px" }}
          >
            {XY_TARGETS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "var(--text-dim)" }}>Y:</span>
          <select
            value={yTarget}
            onChange={(e) => { const t = e.target.value as XYTarget; setYTarget(t); localStorage.setItem("mloop-xy-y", t); autoEnableForTarget(t); }}
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
          role="application"
          aria-label={`KAOS XY pad, X axis ${XY_TARGETS.find(t => t.id === xTarget)?.label}, Y axis ${XY_TARGETS.find(t => t.id === yTarget)?.label}`}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
        {/* Axis labels */}
        <span style={{ position: "absolute", bottom: 4, left: 8, fontSize: 9, color: "var(--text-dim)", opacity: 0.5, pointerEvents: "none" }}>
          {XY_TARGETS.find(t => t.id === xTarget)?.label} →
        </span>
        <span style={{ position: "absolute", top: 8, left: 4, fontSize: 9, color: "var(--text-dim)", opacity: 0.5, pointerEvents: "none", writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
          {XY_TARGETS.find(t => t.id === yTarget)?.label} →
        </span>
        {/* Gesture REC / PLAY / CLR — inside pad, top-right (layout mirrors mpump's kaos-gesture). */}
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            display: "flex",
            gap: 4,
            zIndex: 2,
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (gestureState === "recording") stopGestureRec(); else startGestureRec();
            }}
            aria-pressed={gestureState === "recording"}
            title={gestureState === "recording" ? "Stop recording gesture" : "Record XY gesture"}
            style={{
              fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
              padding: "4px 7px", borderRadius: 4,
              border: "1px solid var(--preview)",
              background: gestureState === "recording" ? "var(--record, #f85149)" : "rgba(0,0,0,0.4)",
              color: gestureState === "recording" ? "#fff" : "var(--preview)",
              cursor: "pointer",
              backdropFilter: "blur(2px)",
            }}
          >
            {gestureState === "recording" ? "STOP" : "REC"}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (gestureState === "playing") stopGesturePlay(); else startGesturePlay();
            }}
            disabled={!hasGesture && gestureState !== "playing"}
            aria-pressed={gestureState === "playing"}
            title={gestureState === "playing" ? "Stop gesture loop" : "Loop recorded gesture"}
            style={{
              fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
              padding: "4px 7px", borderRadius: 4,
              border: "1px solid var(--preview)",
              background: gestureState === "playing" ? "var(--preview)" : "rgba(0,0,0,0.4)",
              color: gestureState === "playing" ? "#000" : "var(--preview)",
              cursor: "pointer",
              opacity: (!hasGesture && gestureState !== "playing") ? 0.4 : 1,
              backdropFilter: "blur(2px)",
            }}
          >
            {gestureState === "playing" ? "STOP" : "PLAY"}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); clearGesture(); }}
            disabled={!hasGesture && gestureState === "idle"}
            title="Clear recorded gesture"
            style={{
              fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
              padding: "4px 7px", borderRadius: 4,
              border: "1px solid var(--preview)",
              background: "rgba(0,0,0,0.4)",
              color: "var(--preview)",
              cursor: "pointer",
              opacity: (!hasGesture && gestureState === "idle") ? 0.4 : 1,
              backdropFilter: "blur(2px)",
            }}
          >
            CLR
          </button>
        </div>
      </div>
      </div>

      {/* Right: Effects chain — markup mirrors mpump's kaos-fx layout. */}
      <div className="kaos-fx-col">
      <div className="kaos-fx">
        <div className="kaos-fx-label">
          EFFECTS <span className="kaos-fx-hint">tap on/off · hold to edit</span>
        </div>
        <div className="kaos-fx-grid">
          {GRID_EFFECTS.map((name) => {
            const isOn = effects[name].on;
            const activeInOrder = effectOrder.filter(e => effects[e].on);
            const chainIdx = isOn ? activeInOrder.indexOf(name) : -1;
            return (
              <button
                key={name}
                className={`kaos-fx-btn ${isOn ? "active" : ""}`}
                style={{ position: "relative" }}
                onClick={() => { if (!didLongPress.current) toggleFx(name); }}
                onPointerDown={() => fxPointerDown(name)}
                onPointerUp={fxPointerUp}
                onPointerLeave={fxPointerUp}
                title={`${EFFECT_FULL_NAMES[name]}: ${isOn ? "on" : "off"} (hold to edit)`}
              >
                {EFFECT_LABELS[name]}
                {chainIdx >= 0 && <span className="kaos-fx-badge">{chainIdx + 1}</span>}
              </button>
            );
          })}
        </div>
        <div className="kaos-fx-chain-row">
          <div
            className="kaos-fx-chain"
            onClick={() => setShowChainEditor(true)}
            title="Click to reorder effect chain"
          >
            Chain: {effectOrder.filter(n => effects[n].on).map(n => EFFECT_LABELS[n]).join(" → ") || "none"}
          </div>
        </div>
      </div>

      {/* Gesture controls now live inside the pad as a top-right overlay (mirrors mpump). */}

      {editingEffect && (
        <EffectEditor
          name={editingEffect}
          params={effects[editingEffect]}
          onClose={() => setEditingEffect(null)}
          onChange={handleFxParamChange}
        />
      )}

      {showChainEditor && (
        <ChainEditor
          order={effectOrder}
          activeEffects={new Set(effectOrder.filter(n => effects[n].on))}
          onSave={handleChainSave}
          onClose={() => setShowChainEditor(false)}
        />
      )}
      </div>
    </div>
  );
}
