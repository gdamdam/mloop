import { useState } from "react";

// Same logo as the header — block-art style
const LOGO = "█▀▄▀█ █   █▀█ █▀█ █▀█\n█ ▀ █ █▄▄ █▄█ █▄█ █▀▀";

interface StartGateProps {
  onStart: () => void;
}

export function StartGate({ onStart }: StartGateProps) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    setStarting(true);
    setError(null);
    try {
      await onStart();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start audio");
      setStarting(false);
    }
  };

  return (
    <div className="start-gate">
      <pre className="start-gate-title">{LOGO}</pre>
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
      <div style={{ fontSize: 10, color: "var(--text-dim)", opacity: 0.5, marginTop: 12 }}>
        Works offline — save this page to play anywhere, no internet needed.
      </div>
      <span style={{ fontSize: 10, color: "var(--text-dim)", opacity: 0.4, marginTop: 8 }}>v1.0.0-pre.10</span>
    </div>
  );
}
