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
      <span style={{ fontSize: 10, color: "var(--text-dim)" }}>v0.16.1</span>
      <p className="start-gate-sub">
        Browser-based loop station.<br />
        Record, layer, and perform — no install needed.
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
    </div>
  );
}
