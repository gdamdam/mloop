import { useLoopEngine } from "./hooks/useLoopEngine";
import { StartGate } from "./components/StartGate";
import { Layout } from "./components/Layout";

export default function App() {
  const { state, command, startEngine, getEngine } = useLoopEngine();

  if (!state.started) {
    return <StartGate onStart={startEngine} />;
  }

  return <Layout state={state} command={command} engine={getEngine()} />;
}
