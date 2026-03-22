/**
 * PrivacyModal — explains what data mloop collects (none).
 * Same content as mpump's privacy modal, adapted for mloop.
 */

import { useEffect } from "react";

interface Props {
  onClose: () => void;
}

export function PrivacyModal({ onClose }: Props) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" style={{ maxWidth: 420 }}>
        <div className="sheet-header">
          <span className="sheet-title">Privacy</span>
          <button className="sheet-close" onClick={onClose}>✕</button>
        </div>
        <div className="sheet-body" style={{ fontSize: 13, lineHeight: 1.7 }}>
          <p style={{ marginBottom: 12 }}>mloop respects your privacy.</p>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li><strong style={{ color: "var(--text)" }}>No cookies</strong> — mloop does not set any cookies</li>
            <li><strong style={{ color: "var(--text)" }}>No personal data</strong> — no accounts, no emails, no tracking IDs</li>
            <li><strong style={{ color: "var(--text)" }}>No fingerprinting</strong> — no device or browser identification</li>
            <li><strong style={{ color: "var(--text)" }}>No third-party trackers</strong> — no Google, no Facebook, no ad networks</li>
            <li><strong style={{ color: "var(--text)" }}>Anonymous page views</strong> — we count visits using <a href="https://goatcounter.com" target="_blank" rel="noopener" style={{ color: "var(--preview)" }}>GoatCounter</a>, a privacy-first analytics tool that collects no personal data and sets no cookies</li>
            <li><strong style={{ color: "var(--text)" }}>Local storage only</strong> — your sessions, samples, and settings are saved in your browser. Nothing is sent to any server</li>
            <li><strong style={{ color: "var(--text)" }}>Open source</strong> — all code is public at <a href="https://github.com/gdamdam/mloop" target="_blank" rel="noopener" style={{ color: "var(--preview)" }}>github.com/gdamdam/mloop</a></li>
          </ul>
          <p style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>Your music stays on your device. Always.</p>
        </div>
      </div>
    </div>
  );
}
