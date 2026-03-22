/**
 * MegaKaos — Fullscreen XY pad easter egg (5x logo click).
 * Features floating spinning tape reels in random colors instead of rainbow rays.
 * ESC or click × to close.
 */

import { useEffect, useRef, useState, useCallback } from "react";

interface Props {
  getAnalyser?: () => AnalyserNode | null;
  onClose: () => void;
}

const CREDITS = [
  "", "",
  "█▀▄▀█ █   █▀█ █▀█ █▀█",
  "█ ▀ █ █▄▄ █▄█ █▄█ █▀▀",
  "", "mloop.mpump.live", "",
  "- - - - - - - - - - - -", "",
  "LOOP STATION & SAMPLER", "",
  "16 PADS · 3 LOOP TRACKS",
  "9 EFFECTS · KAOS XY PAD",
  "7 DRUM KITS · 56 SOUNDS", "",
  "SAMPLE SLICER · CHROMATIC",
  "DESTRUCTION MODE",
  "MASTER RECORD TO WAV",
  "GESTURE LOOPS", "",
  "- - - - - - - - - - - -", "",
  "CREATED BY", "", "gdamdam", "",
  "BUILT WITH CLAUDE CODE", "",
  "GPL-3.0 + COMMONS CLAUSE", "",
  "github.com/gdamdam/mloop", "",
  "- - - - - - - - - - - -", "",
  "ko-fi.com/gdamdam", "",
  "- - - - - - - - - - - -", "",
  "GR33TZ & R3SP3CT", "",
  "·· 1LL0B0 ··", "·· CL4UD3 ··", "·· J4M3S ··",
  "·· 0V3TT0 ··", "·· TR0N1X ··",
  "", "", "ESC TO CLOSE", "", "",
];

const REEL_COLORS = [
  "#ff0044", "#ff6600", "#ffcc00", "#00ff66", "#00ccff",
  "#6600ff", "#ff00cc", "#00ffcc", "#b388ff", "#66ff99",
  "#ff9900", "#ff4488", "#44ff88", "#8844ff", "#ff8844",
];

const FLASH_COLORS = [
  "#ff0044", "#ff6600", "#ffcc00", "#00ff66", "#00ccff",
  "#6600ff", "#ff00cc", "#00ffcc", "#ff3366", "#33ff99",
];

/** Draw a tape reel pair on canvas. */
function drawReelPair(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, size: number,
  color: string, rotation: number, alpha: number,
) {
  const gap = size * 0.15;
  ctx.save();
  ctx.globalAlpha = alpha;
  // Left reel
  drawReel(ctx, x - size / 2 - gap, y, size / 2, color, rotation);
  // Right reel
  drawReel(ctx, x + size / 2 + gap, y, size / 2, color, rotation);
  // Tape line between reels (bottom)
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = alpha * 0.4;
  ctx.beginPath();
  ctx.moveTo(x - size / 2 - gap, y + size / 2 * 0.85);
  ctx.lineTo(x + size / 2 + gap, y + size / 2 * 0.85);
  ctx.stroke();
  ctx.restore();
}

function drawReel(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  color: string, rotation: number,
) {
  const hubR = r * 0.22;
  const spoolR = r * 0.85;
  const spokeW = r * 0.08;

  // Spool ring
  ctx.beginPath();
  ctx.arc(cx, cy, spoolR, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Tape area
  ctx.beginPath();
  ctx.arc(cx, cy, spoolR * 0.7, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.15;
  ctx.fill();
  ctx.globalAlpha = (ctx.globalAlpha || 0.15) / 0.15; // restore

  // 3 spokes (rotating)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3;
    const sx = Math.cos(angle) * (spoolR - 2);
    const sy = Math.sin(angle) * (spoolR - 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(sx, sy);
    ctx.strokeStyle = color;
    ctx.lineWidth = spokeW;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  ctx.restore();

  // Hub
  ctx.beginPath();
  ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Hub hole
  ctx.beginPath();
  ctx.arc(cx, cy, hubR * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = "#000";
  ctx.fill();
}

export function MegaKaos({ getAnalyser, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const posRef = useRef<{ x: number; y: number } | null>(null);
  const trailsRef = useRef<{ x: number; y: number; age: number }[]>([]);
  const dragging = useRef(false);
  const [flashColor, setFlashColor] = useState<string | null>(null);
  const flashTimer = useRef(0);
  const colorIdx = useRef(0);

  const handleMove = useCallback((clientX: number, clientY: number) => {
    const nx = clientX / window.innerWidth;
    const ny = clientY / window.innerHeight;
    posRef.current = { x: nx, y: ny };
    trailsRef.current = [...trailsRef.current.slice(-50), { x: nx, y: ny, age: Date.now() }];
  }, []);

  const handleClick = () => {
    if (dragging.current) return;
    const color = FLASH_COLORS[colorIdx.current % FLASH_COLORS.length];
    colorIdx.current++;
    setFlashColor(color);
    clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashColor(null), 150);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = false;
    handleMove(e.clientX, e.clientY);
    const onMove = (ev: MouseEvent) => { dragging.current = true; handleMove(ev.clientX, ev.clientY); };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); posRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onTouchStart = (e: React.TouchEvent) => { e.preventDefault(); dragging.current = false; handleMove(e.touches[0].clientX, e.touches[0].clientY); };
  const onTouchMove = (e: React.TouchEvent) => { e.preventDefault(); dragging.current = true; handleMove(e.touches[0].clientX, e.touches[0].clientY); };
  const onTouchEnd = () => { posRef.current = null; };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const buf = new Uint8Array(128);
    let frame = 0;

    // Floating tape reels
    type ReelFloat = { x: number; y: number; vx: number; vy: number; size: number; color: string; spinSpeed: number; rotation: number; alpha: number };
    const reels: ReelFloat[] = [];

    // Rainbow laser rays
    const RAINBOW = ["#ff0000", "#ff8800", "#ffff00", "#00ff00", "#0088ff", "#8800ff"];
    type Ray = { x: number; y: number; speed: number; len: number; alpha: number; phase: number; pulseSpeed: number; dir: number; angle: number };
    const rays: Ray[] = [];

    // Floating credits
    type CreditFloat = { text: string; x: number; y: number; vx: number; vy: number; phase: number; alpha: number };
    const floats: CreditFloat[] = [];
    let nextCreditIdx = 0;
    let lastCreditFrame = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const w = window.innerWidth;
      const h = window.innerHeight;

      let level = 0;
      const analyser = getAnalyser?.();
      if (analyser) {
        analyser.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i];
        level = sum / buf.length / 255;
      }

      // Dark background with fade
      ctx.fillStyle = `rgba(0, 0, 0, ${0.92 - level * 0.1})`;
      ctx.fillRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = "#b388ff";
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.06;
      for (let i = 1; i < 8; i++) {
        ctx.beginPath(); ctx.moveTo(w * i / 8, 0); ctx.lineTo(w * i / 8, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, h * i / 8); ctx.lineTo(w, h * i / 8); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Neon trails
      const now = Date.now();
      const trails = trailsRef.current;
      for (let i = 1; i < trails.length; i++) {
        const age = (now - trails[i].age) / 1000;
        if (age > 2) continue;
        const alpha = Math.max(0, 1 - age / 2);
        const hue = (frame * 2 + i * 20) % 360;
        ctx.strokeStyle = `hsla(${hue}, 100%, 65%, ${alpha})`;
        ctx.lineWidth = 3 + (1 - age / 2) * 4;
        ctx.beginPath();
        ctx.moveTo(trails[i - 1].x * w, trails[i - 1].y * h);
        ctx.lineTo(trails[i].x * w, trails[i].y * h);
        ctx.stroke();
      }

      // Cursor glow
      const pos = posRef.current;
      if (pos) {
        const px = pos.x * w, py = pos.y * h;
        const grad = ctx.createRadialGradient(px, py, 0, px, py, 80 + level * 60);
        grad.addColorStop(0, `hsla(${(frame * 3) % 360}, 100%, 65%, 0.4)`);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.fillRect(px - 150, py - 150, 300, 300);
      }

      // Spawn tape reel pairs — float across screen
      const spawnInterval = level > 0.3 ? 30 : 60;
      if (frame % spawnInterval === 0) {
        const color = REEL_COLORS[Math.floor(Math.random() * REEL_COLORS.length)];
        const size = 20 + Math.random() * 30 + level * 20;
        const fromLeft = Math.random() > 0.5;
        reels.push({
          x: fromLeft ? -size : w + size,
          y: Math.random() * h,
          vx: (fromLeft ? 1 : -1) * (0.5 + Math.random() * 1.5 + level * 2),
          vy: (Math.random() - 0.5) * 0.5,
          size, color,
          spinSpeed: 0.03 + Math.random() * 0.05,
          rotation: Math.random() * Math.PI * 2,
          alpha: 0.4 + Math.random() * 0.4,
        });
      }

      // Draw and update reels
      for (let r = reels.length - 1; r >= 0; r--) {
        const reel = reels[r];
        reel.x += reel.vx;
        reel.y += reel.vy + Math.sin(frame * 0.02 + r) * 0.3;
        reel.rotation += reel.spinSpeed;
        drawReelPair(ctx, reel.x, reel.y, reel.size, reel.color, reel.rotation, reel.alpha);
        // Remove when off screen
        if (reel.x < -reel.size * 3 || reel.x > w + reel.size * 3) reels.splice(r, 1);
      }

      // Rainbow laser rays
      const rayInterval = level > 0.3 ? 15 : 30;
      if (frame % rayInterval === 0) {
        const baseY = Math.random() * h;
        const spd = 1.5 + Math.random() * 3 + level * 4;
        const len = 60 + Math.random() * 120;
        const a = 0.25 + Math.random() * 0.3;
        rays.push({ x: w + 20, y: baseY, speed: spd, len, alpha: a, phase: Math.random() * Math.PI * 2, pulseSpeed: 0.05 + Math.random() * 0.1, dir: -1, angle: 0 });
        rays.push({ x: -len, y: h - baseY, speed: spd, len, alpha: a, phase: Math.random() * Math.PI * 2, pulseSpeed: 0.05 + Math.random() * 0.1, dir: 1, angle: 0 });
      }
      // Diagonal rays after 10s
      if (frame > 600 && frame % (rayInterval * 2) === 0) {
        const spd = 1.5 + Math.random() * 3 + level * 3;
        const len = 60 + Math.random() * 120;
        const a = 0.2 + Math.random() * 0.3;
        const diagAngle = Math.PI / 6 + Math.random() * Math.PI / 6;
        rays.push({ x: -len, y: Math.random() * h * 0.6, speed: spd, len, alpha: a, phase: Math.random() * Math.PI * 2, pulseSpeed: 0.04 + Math.random() * 0.08, dir: 1, angle: diagAngle });
        rays.push({ x: w + 20, y: h - Math.random() * h * 0.6, speed: spd, len, alpha: a, phase: Math.random() * Math.PI * 2, pulseSpeed: 0.04 + Math.random() * 0.08, dir: -1, angle: -diagAngle });
      }
      for (let r = rays.length - 1; r >= 0; r--) {
        const ray = rays[r];
        ray.x += ray.speed * ray.dir;
        ray.y += Math.sin(ray.angle) * ray.speed * ray.dir;
        ray.phase += ray.pulseSpeed;
        const twinkle = 0.5 + 0.5 * Math.sin(ray.phase);
        const boost = 1 + level * 1.5;
        ctx.save();
        ctx.translate(ray.x, ray.y);
        ctx.rotate(ray.angle * ray.dir);
        for (let i = 0; i < RAINBOW.length; i++) {
          ctx.fillStyle = RAINBOW[i];
          ctx.globalAlpha = Math.min(0.8, ray.alpha * twinkle * boost);
          ctx.fillRect(0, i * 2, ray.len, 2);
        }
        ctx.restore();
        ctx.globalAlpha = 1;
        const offRight = ray.dir > 0 && ray.x > w + ray.len;
        const offLeft = ray.dir < 0 && ray.x + ray.len < -ray.len;
        const offVert = ray.y < -ray.len * 2 || ray.y > h + ray.len * 2;
        if (offRight || offLeft || offVert) rays.splice(r, 1);
      }

      // Floating credits
      if (frame - lastCreditFrame > 40 && nextCreditIdx < CREDITS.length) {
        lastCreditFrame = frame;
        const text = CREDITS[nextCreditIdx++];
        if (text.trim()) {
          const isLogo = text.startsWith("█");
          floats.push({
            text, x: 0.15 + Math.random() * 0.7, y: 1.05,
            vx: (Math.random() - 0.5) * 0.0003,
            vy: -0.001 - Math.random() * 0.001,
            phase: Math.random() * Math.PI * 2,
            alpha: isLogo ? 1 : 0.7,
          });
        }
      }
      for (let f = floats.length - 1; f >= 0; f--) {
        const fl = floats[f];
        fl.x += fl.vx + Math.sin(fl.phase + frame * 0.01) * 0.0002;
        fl.y += fl.vy;
        fl.alpha *= 0.999;
        if (fl.y < -0.05 || fl.alpha < 0.05) { floats.splice(f, 1); continue; }
        const isLogo = fl.text.startsWith("█");
        ctx.font = `${isLogo ? "bold 11px" : "bold 13px"} "Courier New", monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = isLogo ? `rgba(255, 204, 0, ${fl.alpha})` : `rgba(179, 136, 255, ${fl.alpha * 0.8})`;
        ctx.fillText(fl.text, fl.x * w, fl.y * h);
      }

      frame++;
    };

    draw();
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("resize", resize); };
  }, [getAnalyser]);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 300, cursor: "crosshair", background: flashColor || "#000", transition: "background 0.1s" }}
      onMouseDown={onMouseDown}
      onClick={handleClick}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={{
          position: "absolute", top: 16, right: 16, zIndex: 301,
          width: 32, height: 32, borderRadius: "50%", border: "none",
          background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 16,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        ✕
      </button>
    </div>
  );
}
