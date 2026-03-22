import { Recorder } from "../engine/Recorder";

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
      fontSize: 10,
      color: "var(--text-dim)",
      opacity: 0.5,
      lineHeight: 1.8,
    }}>
      <span style={{ cursor: "pointer" }} onClick={onShowCredits}>v1.0.0-pre.13</span>
      {" · "}
      <a href="https://github.com/gdamdam/mloop" target="_blank" rel="noopener"
        style={{ color: "var(--text-dim)", textDecoration: "none" }}>
        github.com/gdamdam/mloop
      </a>
      <div style={{ marginTop: 4 }}>
        <span style={{ cursor: "pointer" }} onClick={onShowHelp}>Help</span>
        {" · "}
        <a href="https://ko-fi.com/gdamdam" target="_blank" rel="noopener"
          style={{ color: "var(--text-dim)", textDecoration: "none" }}>Support ♥</a>
        {" · "}
        <a href="https://github.com/gdamdam/mloop/blob/main/LICENSE" target="_blank" rel="noopener"
          style={{ color: "var(--text-dim)", textDecoration: "none" }}>GPL-3.0</a>
        {" · "}
        Built with Claude Code
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
