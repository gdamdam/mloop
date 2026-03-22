import { useState, useRef, useEffect } from "react";

// Same logo as the header — block-art style
const LOGO = "█▀▄▀█ █   █▀█ █▀█ █▀█\n█ ▀ █ █▄▄ █▄█ █▄█ █▀▀";

// Capture the beforeinstallprompt event for Android/Chrome install
let deferredPrompt: Event | null = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
});

function triggerInstallPrompt() {
  if (deferredPrompt && "prompt" in deferredPrompt) {
    (deferredPrompt as { prompt: () => void }).prompt();
    deferredPrompt = null;
  }
}

interface StartGateProps {
  onStart: () => void;
}

export function StartGate({ onStart }: StartGateProps) {
  const [starting, setStarting] = useState(false);
  const [logoFlash, setLogoFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canInstall, setCanInstall] = useState(!!deferredPrompt);
  const flashTimer = useRef(0);

  useEffect(() => {
    const handler = () => setCanInstall(true);
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const isIOS = /iPad|iPhone/.test(navigator.userAgent) && !("standalone" in navigator && (navigator as unknown as { standalone: boolean }).standalone);

  const handleStart = () => {
    setLogoFlash(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(async () => {
      setStarting(true);
      setError(null);
      try {
        await onStart();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to start audio");
        setStarting(false);
        setLogoFlash(false);
      }
    }, 450);
  };

  return (
    <div className="start-gate">
      <pre className={`start-gate-title ${logoFlash ? "logo-flash" : ""}`}>{LOGO}</pre>
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

      {/* Android: native install prompt */}
      {canInstall && (
        <button
          onClick={() => { triggerInstallPrompt(); setCanInstall(false); }}
          style={{
            marginTop: 8, padding: "6px 16px", borderRadius: 6,
            fontSize: 11, fontWeight: 700, cursor: "pointer",
            background: "var(--preview)", color: "#000", border: "none",
          }}
        >
          Install App
        </button>
      )}

      {/* iOS: manual Add to Home Screen hint */}
      {isIOS && (
        <div style={{ fontSize: 10, color: "var(--text-dim)", opacity: 0.4, marginTop: 8 }}>
          Tap Share → Add to Home Screen for a full-screen app
        </div>
      )}

      <span style={{ fontSize: 10, color: "var(--text-dim)", opacity: 0.4, marginTop: 8 }}>v1.0.0-pre.37</span>
    </div>
  );
}
