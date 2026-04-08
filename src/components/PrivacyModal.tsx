/**
 * PrivacyModal — explains what data mloop collects (almost none).
 * Structure mirrors mpump's privacy modal: not-collected, does-collect,
 * stays-local, short version — adapted for mloop (no share relay, no
 * jam server, no beat counters — just GoatCounter for page views).
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
          <p style={{ marginBottom: 12 }}>mloop does not use accounts, cookies, ads, or personal tracking.</p>
          <p style={{ marginBottom: 12 }}>A tiny amount of anonymous page-count data does exist, because the project still needs to know whether anyone is actually using it.</p>

          <p style={{ marginTop: 14, marginBottom: 6, fontWeight: 700, fontSize: 13 }}>What mloop does not collect</p>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li><strong style={{ color: "var(--text)" }}>No accounts</strong> — no sign-up, no email, no user profile</li>
            <li><strong style={{ color: "var(--text)" }}>No cookies</strong> — mloop does not set login, ad, or analytics cookies</li>
            <li><strong style={{ color: "var(--text)" }}>No user IDs</strong> — mloop does not assign you a persistent personal identifier</li>
            <li><strong style={{ color: "var(--text)" }}>No fingerprinting</strong> — mloop does not try to build a hidden identity from your device or browser</li>
            <li><strong style={{ color: "var(--text)" }}>No third-party ad trackers</strong> — no Google Ads, Meta Pixel, or similar ad-tech</li>
            <li><strong style={{ color: "var(--text)" }}>No audio leaves your device</strong> — your mic, samples, and loops are never uploaded</li>
          </ul>

          <p style={{ marginTop: 14, marginBottom: 6, fontWeight: 700, fontSize: 13 }}>What mloop does collect</p>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li><strong style={{ color: "var(--text)" }}>Anonymous page counts</strong> via <a href="https://goatcounter.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--preview)" }}>GoatCounter</a>. GoatCounter is a privacy-first analytics service that records a plain "+1" each time a page loads. It does not use cookies, does not assign a visitor ID, does not fingerprint the browser, and does not collect personal data. What we see is a single number per day — nothing more. You can read the <a href="https://www.goatcounter.com/help/gdpr" target="_blank" rel="noopener noreferrer" style={{ color: "var(--preview)" }}>GoatCounter privacy notes</a> for the full story</li>
          </ul>

          <p style={{ marginTop: 14, marginBottom: 6, fontWeight: 700, fontSize: 13 }}>What stays local</p>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li><strong style={{ color: "var(--text)" }}>Your sessions, samples, and settings</strong> — stored in your browser's localStorage / IndexedDB, on your device</li>
            <li><strong style={{ color: "var(--text)" }}>Your music</strong> — recorded and rendered locally in the browser; nothing is sent to any server</li>
            <li><strong style={{ color: "var(--text)" }}>Share links</strong> — they encode settings (BPM, effect params) into the URL hash, not into a database. No relay</li>
            <li><strong style={{ color: "var(--text)" }}>Link Bridge</strong> — Ableton Link sync talks to a local Tauri app on <code style={{ fontSize: 12 }}>ws://127.0.0.1:20808</code>. Nothing leaves your machine</li>
            <li><strong style={{ color: "var(--text)" }}>Open source</strong> — full source code at <a href="https://github.com/gdamdam/mloop" target="_blank" rel="noopener noreferrer" style={{ color: "var(--preview)" }}>github.com/gdamdam/mloop</a> under AGPL-3.0-or-later</li>
          </ul>

          <p style={{ marginTop: 12, fontSize: 12, color: "var(--text-dim)" }}>
            mloop is hosted on <a href="https://pages.github.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--preview)" }}>GitHub Pages</a> — a free static hosting service by GitHub. No backend, no database. Everything runs in your browser.
          </p>

          <p style={{ marginTop: 12, fontSize: 12 }}>Short version: mloop tries to know as little about you as possible while still being usable and maintainable.</p>
          <p style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>Your music stays on your device. Always.</p>
        </div>
      </div>
    </div>
  );
}
