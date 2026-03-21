import { useState, useEffect } from "react";
import type { MidiAction, MidiMapping } from "../engine/MidiController";
import { MidiController } from "../engine/MidiController";

const ALL_ACTIONS: { action: MidiAction; label: string }[] = [
  { action: "track_1_record", label: "Track 1 Record" },
  { action: "track_1_play", label: "Track 1 Play" },
  { action: "track_1_stop", label: "Track 1 Stop" },
  { action: "track_1_overdub", label: "Track 1 Overdub" },
  { action: "track_1_mute", label: "Track 1 Mute" },
  { action: "track_1_clear", label: "Track 1 Clear" },
  { action: "track_1_undo", label: "Track 1 Undo" },
  { action: "track_1_volume", label: "Track 1 Volume" },
  { action: "track_2_record", label: "Track 2 Record" },
  { action: "track_2_play", label: "Track 2 Play" },
  { action: "track_2_stop", label: "Track 2 Stop" },
  { action: "track_2_overdub", label: "Track 2 Overdub" },
  { action: "track_2_mute", label: "Track 2 Mute" },
  { action: "track_2_clear", label: "Track 2 Clear" },
  { action: "track_2_undo", label: "Track 2 Undo" },
  { action: "track_2_volume", label: "Track 2 Volume" },
  { action: "track_3_record", label: "Track 3 Record" },
  { action: "track_3_play", label: "Track 3 Play" },
  { action: "track_3_stop", label: "Track 3 Stop" },
  { action: "track_3_overdub", label: "Track 3 Overdub" },
  { action: "track_3_mute", label: "Track 3 Mute" },
  { action: "track_3_clear", label: "Track 3 Clear" },
  { action: "track_3_undo", label: "Track 3 Undo" },
  { action: "track_3_volume", label: "Track 3 Volume" },
  { action: "play_all", label: "Play All" },
  { action: "stop_all", label: "Stop All" },
  { action: "metronome_toggle", label: "Metronome" },
  { action: "tap_tempo", label: "Tap Tempo" },
];

interface MidiMapperProps {
  controller: MidiController;
  onClose: () => void;
}

export function MidiMapper({ controller, onClose }: MidiMapperProps) {
  const [, setMappings] = useState<MidiMapping[]>(controller.getMappings());
  const [learning, setLearning] = useState<MidiAction | null>(null);

  useEffect(() => {
    return () => controller.cancelLearn();
  }, [controller]);

  const startLearn = (action: MidiAction) => {
    setLearning(action);
    controller.startLearn((partial) => {
      controller.setMapping({ ...partial, action });
      setMappings(controller.getMappings());
      setLearning(null);
    });
  };

  const clearMapping = (action: MidiAction) => {
    controller.removeMapping(action);
    setMappings(controller.getMappings());
  };

  const formatMapping = (m: MidiMapping | undefined): string => {
    if (!m) return "—";
    return `${m.type.toUpperCase()} ${m.number} Ch ${m.channel + 1}`;
  };

  return (
    <div className="sheet-backdrop" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div className="sheet">
        <div className="sheet-header">
          <span className="sheet-title">MIDI Mapping</span>
          <button className="sheet-close" onClick={onClose}>×</button>
        </div>
        <div className="sheet-body">
          {!MidiController.isSupported() && (
            <p style={{ fontSize: 12, color: "var(--record)", marginBottom: 12 }}>
              Web MIDI not supported in this browser (Chrome/Edge only)
            </p>
          )}
          {ALL_ACTIONS.map(({ action, label }) => {
            const mapping = controller.getMappingForAction(action);
            const isLearning = learning === action;
            return (
              <div
                key={action}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ fontSize: 12, flex: 1 }}>{label}</span>
                <span style={{ fontSize: 10, color: "var(--text-dim)", minWidth: 80, textAlign: "center" }}>
                  {isLearning ? "Waiting..." : formatMapping(mapping)}
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    onClick={() => startLearn(action)}
                    style={{
                      fontSize: 9, fontWeight: 700, padding: "4px 8px", borderRadius: 4,
                      background: isLearning ? "var(--record)" : "var(--bg-cell)",
                      color: isLearning ? "#fff" : "var(--text-dim)",
                    }}
                  >
                    {isLearning ? "..." : "Learn"}
                  </button>
                  {mapping && (
                    <button
                      onClick={() => clearMapping(action)}
                      style={{
                        fontSize: 9, fontWeight: 700, padding: "4px 6px", borderRadius: 4,
                        background: "var(--bg-cell)", color: "#f85149",
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
