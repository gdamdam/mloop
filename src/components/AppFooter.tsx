import { Recorder } from "../engine/Recorder";
import { APP_VERSION } from "../config";

interface AppFooterProps {
  onShowHelp: () => void;
  onShowCredits?: () => void;
  onShowPrivacy?: () => void;
}

export function AppFooter({ onShowHelp, onShowCredits, onShowPrivacy }: AppFooterProps) {
  return (
    <footer className="app-footer" style={{
      textAlign: "center",
      padding: "16px 12px 24px",
      fontSize: 12,
      color: "var(--text-dim)",
      opacity: 0.7,
      lineHeight: 1.8,
    }}>
      <span style={{ cursor: "pointer" }} onClick={onShowCredits}>v{APP_VERSION}</span>
      {" · "}
      <span>© 2026</span>
      {" · "}
      <a href="https://github.com/gdamdam/mloop" target="_blank" rel="noopener"
        style={{ color: "var(--text-dim)", textDecoration: "none" }}>
        github.com/gdamdam/mloop
      </a>
      <div style={{ marginTop: 4 }}>
        <span style={{ cursor: "pointer" }} onClick={onShowHelp}>Help</span>
        {" · "}
        <a href="https://ko-fi.com/gdamdam" target="_blank" rel="noopener"
          style={{ color: "#ff4466", fontWeight: 700, textDecoration: "none" }}>Support ♥</a>
        {" · "}
        <a href="https://github.com/gdamdam/mloop/blob/main/LICENSE" target="_blank" rel="noopener"
          style={{ color: "var(--text-dim)", textDecoration: "none" }}>AGPL-3.0</a>
        {" · "}
        <a href="https://mpump.live/app.html" target="_blank" rel="noopener"
          style={{ color: "var(--preview)", textDecoration: "none", fontWeight: 700 }}>Try mpump →</a>
        {" · "}
        <span style={{ cursor: "pointer", textDecoration: "underline dotted" }} onClick={onShowPrivacy}>No cookies · No personal data</span>
        {Recorder.isFallback && (
          <span> · <span title="AudioWorklet unavailable — using ScriptProcessorNode (slightly lower recording quality)" style={{ color: "#f0883e" }}>
            compat mode
          </span></span>
        )}
      </div>
    </footer>
  );
}
