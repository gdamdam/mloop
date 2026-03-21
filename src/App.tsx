import { Component, type ReactNode } from "react";
import { useLoopEngine } from "./hooks/useLoopEngine";
import { StartGate } from "./components/StartGate";
import { Layout } from "./components/Layout";

/** Error boundary — catches any React render crash and shows the error. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: Error) {
    return { error: err.message + "\n" + err.stack };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: "monospace", fontSize: 12, color: "#ff4444", background: "#0d1117", minHeight: "100dvh" }}>
          <h2 style={{ color: "#fff" }}>mloop error</h2>
          <p>Something went wrong. Please try refreshing.</p>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 16, color: "#f0883e" }}>{this.state.error}</pre>
          <button onClick={() => location.reload()} style={{ marginTop: 16, padding: "8px 16px", background: "#b388ff", color: "#000", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 700 }}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppInner() {
  const { state, command, startEngine, getEngine } = useLoopEngine();

  if (!state.started) {
    return <StartGate onStart={startEngine} />;
  }

  return <Layout state={state} command={command} engine={getEngine()} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
