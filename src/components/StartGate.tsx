import { useState, useRef } from "react";
import { PALETTES, applyPalette } from "../themes";
import { APP_VERSION } from "../config";

// Same logo as the header — block-art style
const LOGO = "█▀▄▀█ █   █▀█ █▀█ █▀█\n█ ▀ █ █▄▄ █▄█ █▄█ █▀▀";

interface StartGateProps {
  onStart: () => void;
}

export function StartGate({ onStart }: StartGateProps) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flashTimer = useRef(0);

  const isIOS = /iPad|iPhone/.test(navigator.userAgent) && !("standalone" in navigator && (navigator as unknown as { standalone: boolean }).standalone);
  const logoRef = useRef<HTMLPreElement>(null);
  const logoClickCount = useRef(0);
  const logoClickTimer = useRef(0);

  const flashLogo = () => {
    const el = logoRef.current;
    if (!el) return;
    el.classList.remove("logo-flash");
    void el.offsetWidth; // force reflow to restart animation
    el.classList.add("logo-flash");
  };

  const handleLogoClick = () => {
    logoClickCount.current++;
    flashLogo();
    clearTimeout(logoClickTimer.current);
    logoClickTimer.current = window.setTimeout(() => {
      if (logoClickCount.current >= 2) {
        // 2+ clicks: random theme
        const randomPalette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
        applyPalette(randomPalette);
      }
      logoClickCount.current = 0;
    }, 400);
  };

  const handleStart = () => {
    flashLogo();
    clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(async () => {
      setStarting(true);
      setError(null);
      try {
        await onStart();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to start audio");
        setStarting(false);
        flashLogo();
      }
    }, 450);
  };

  return (
    <div className="start-gate">
      <pre ref={logoRef} className="start-gate-title" onClick={handleLogoClick} style={{ cursor: "pointer", textAlign: "left", display: "inline-block" }}>{LOGO} <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 5px", borderRadius: 3, background: "var(--preview)", color: "#000", letterSpacing: 1 }}>EXPERIMENTAL</span></pre>
      <p className="start-gate-sub">
        Loop Station &amp; Sampler<br />
        Record, loop, sample, perform<br />
        all in your browser.
      </p>
      <button
        className="start-btn"
        onClick={handleStart}
        disabled={starting}
      >
        {starting ? "..." : "START"}
      </button>
      {error && (
        <p style={{ color: "var(--record)", fontSize: 12, textAlign: "center" }}>
          {error}
        </p>
      )}

      <div style={{ fontSize: 10, color: "var(--text-dim)", opacity: 0.5, marginTop: 12, textAlign: "center" }}>
        Works offline — save this page to play anywhere.<br />No internet needed.
      </div>

      {/* iOS: manual Add to Home Screen hint */}
      {isIOS && (
        <div style={{ fontSize: 10, color: "var(--text-dim)", opacity: 0.4, marginTop: 8 }}>
          Tap Share → Add to Home Screen for a full-screen app
        </div>
      )}

      <span style={{ fontSize: 10, color: "var(--text-dim)", opacity: 0.4, marginTop: 8 }}>v{APP_VERSION}</span>
    </div>
  );
}
