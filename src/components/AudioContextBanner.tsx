/**
 * AudioContextBanner — shows a non-blocking banner when the AudioContext
 * has been suspended (typically on mobile after tab backgrounding).
 *
 * Without this, users see silent meters with no indication that audio
 * has been parked by the OS. The banner polls `ctx.state` on a short
 * interval and offers a single-click resume.
 */

import { useEffect, useState } from "react";
import type { AudioEngine } from "../engine/AudioEngine";

interface Props {
  /** Returns the live engine instance (null before startEngine resolves). */
  getEngine: () => AudioEngine | null;
}

export function AudioContextBanner({ getEngine }: Props) {
  const [suspended, setSuspended] = useState(false);

  useEffect(() => {
    const check = () => {
      const engine = getEngine();
      const state = engine?.ctx?.state;
      setSuspended(state === "suspended");
    };
    check();
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, [getEngine]);

  if (!suspended) return null;

  const handleResume = async () => {
    const engine = getEngine();
    try {
      await engine?.ctx?.resume();
      setSuspended(false);
    } catch {
      /* stay visible; user can retry */
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 8,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 6,
        background: "var(--preview)",
        color: "var(--bg)",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.5,
        boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
      }}
    >
      <span>Audio paused</span>
      <button
        onClick={handleResume}
        aria-label="Resume audio"
        style={{
          background: "var(--bg)",
          color: "var(--preview)",
          border: "none",
          borderRadius: 4,
          fontSize: 10,
          fontWeight: 800,
          padding: "3px 8px",
          cursor: "pointer",
        }}
      >
        RESUME
      </button>
    </div>
  );
}
