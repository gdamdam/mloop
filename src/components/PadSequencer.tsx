/**
 * PadSequencer — 16-step sequencer grid for the sample pads.
 * Each step can trigger multiple pads simultaneously.
 * Supports drag-and-drop from pads onto steps.
 */

import { useState, useEffect, useCallback } from "react";
import type { PadSlot } from "../engine/PadEngine";
import type { PadEngine } from "../engine/PadEngine";

const STEP_OPTIONS = [8, 16, 32, 64] as const;

interface PadSequencerProps {
  slots: PadSlot[];
  bpm: number;
  onTrigger: (slotIds: number[]) => void;
  padEngine: PadEngine | null;
}

export function PadSequencer({ slots, bpm, onTrigger: _onTrigger, padEngine }: PadSequencerProps) {
  void _onTrigger; // kept in interface for backwards compat, scheduling now in PadEngine
  const [numSteps, setNumSteps] = useState(16);
  const [grid, setGrid] = useState<boolean[][]>(() =>
    Array.from({ length: 64 }, () => Array(16).fill(false))
  );
  const [playing, setPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [dragOverCell, setDragOverCell] = useState<{ step: number; slot: number } | null>(null);

  const loadedSlots = slots.filter(s => s.status === "loaded");

  const toggleCell = useCallback((step: number, slotId: number) => {
    setGrid(prev => {
      const next = prev.map(row => [...row]);
      next[step][slotId] = !next[step][slotId];
      return next;
    });
  }, []);

  // Handle drop from pad onto a step cell
  const handleDrop = useCallback((e: React.DragEvent, step: number, slotId: number) => {
    e.preventDefault();
    setDragOverCell(null);
    const padId = e.dataTransfer.getData("text/pad-id");
    if (padId !== "") {
      const id = parseInt(padId);
      // If dropped on a specific row, activate that cell
      if (slotId === id) {
        setGrid(prev => {
          const next = prev.map(row => [...row]);
          next[step][id] = true;
          return next;
        });
      } else {
        // Dropped on a different row — activate the dragged pad's row at this step
        setGrid(prev => {
          const next = prev.map(row => [...row]);
          next[step][id] = true;
          return next;
        });
      }
    }
  }, []);

  // Handle drop on just a step column (no specific row)
  const handleStepDrop = useCallback((e: React.DragEvent, step: number) => {
    e.preventDefault();
    setDragOverCell(null);
    const padId = e.dataTransfer.getData("text/pad-id");
    if (padId !== "") {
      const id = parseInt(padId);
      setGrid(prev => {
        const next = prev.map(row => [...row]);
        next[step][id] = true;
        return next;
      });
    }
  }, []);

  // Sync grid/bpm/steps to PadEngine's sequencer
  useEffect(() => {
    if (!padEngine) return;
    padEngine.setSeqGrid(grid);
    padEngine.setSeqNumSteps(numSteps);
    padEngine.setSeqBpm(bpm);
  }, [padEngine, grid, numSteps, bpm]);

  // Wire step change callback for UI indicator
  useEffect(() => {
    if (!padEngine) return;
    padEngine.onStepChange = (step) => setCurrentStep(step);
    return () => { padEngine.onStepChange = null; };
  }, [padEngine]);

  // Start/stop sequencer via PadEngine (Web Audio scheduled)
  useEffect(() => {
    if (!padEngine) return;
    if (playing) {
      padEngine.startSequencer();
    } else {
      padEngine.stopSequencer();
      setCurrentStep(-1);
    }
    return () => { padEngine.stopSequencer(); };
  }, [playing, padEngine]);

  if (loadedSlots.length === 0) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100%", color: "var(--text-dim)", fontSize: 11, padding: 16,
        textAlign: "center", flexDirection: "column", gap: 8,
      }}>
        <span style={{ fontSize: 16, opacity: 0.3 }}>♪</span>
        Record samples in the pads to enable the sequencer
        <span style={{ fontSize: 9, opacity: 0.5 }}>Drag pads here to place them on steps</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%" }}>
      {/* Transport */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={() => setPlaying(!playing)}
          style={{
            width: 32, height: 32, borderRadius: "50%", fontSize: 14,
            background: playing ? "var(--playing)" : "var(--bg-cell)",
            color: playing ? "#000" : "var(--text)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {playing ? "■" : "▶"}
        </button>
        <span style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: 1 }}>SEQUENCER</span>
        {/* Step count selector */}
        <div style={{ display: "flex", gap: 2, marginLeft: "auto" }}>
          {STEP_OPTIONS.map(n => (
            <button
              key={n}
              onClick={() => setNumSteps(n)}
              style={{
                fontSize: 8, fontWeight: 700, padding: "2px 5px", borderRadius: 3,
                background: numSteps === n ? "var(--preview)" : "var(--bg-cell)",
                color: numSteps === n ? "#000" : "var(--text-dim)",
              }}
            >
              {n}
            </button>
          ))}
        </div>
        <button
          onClick={() => setGrid(Array.from({ length: 64 }, () => Array(16).fill(false)))}
          style={{ fontSize: 9, color: "var(--text-dim)", padding: "2px 6px", borderRadius: 4, background: "var(--bg-cell)" }}
        >
          CLR
        </button>
      </div>

      {/* Swing slider */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 8, color: "var(--text-dim)", width: 28 }}>Swing</span>
        <input type="range" className="volume-slider" min={0} max={1} step={0.05}
          value={padEngine?.getSeqSwing() ?? 0}
          onChange={(e) => padEngine?.setSeqSwing(parseFloat(e.target.value))}
          style={{ flex: 1 }} />
        <span style={{ fontSize: 8, color: "var(--text-dim)", width: 20 }}>
          {Math.round((padEngine?.getSeqSwing() ?? 0) * 100)}%
        </span>
      </div>

      {/* Step grid */}
      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        {loadedSlots.map((slot) => (
          <div key={slot.id} style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 2 }}>
            <span style={{
              fontSize: 8, fontWeight: 700, color: "var(--preview)",
              width: 18, textAlign: "right", flexShrink: 0,
            }}>
              {slot.id + 1}
            </span>
            <div style={{ display: "flex", gap: 1, flex: 1 }}>
              {Array.from({ length: numSteps }, (_, step) => {
                const isActive = grid[step][slot.id];
                const isCurrent = step === currentStep;
                const isDragOver = dragOverCell?.step === step && dragOverCell?.slot === slot.id;
                return (
                  <button
                    key={step}
                    onClick={(e) => { e.stopPropagation(); toggleCell(step, slot.id); }}
                    onDragOver={(e) => { e.preventDefault(); setDragOverCell({ step, slot: slot.id }); }}
                    onDragLeave={() => setDragOverCell(null)}
                    onDrop={(e) => handleDrop(e, step, slot.id)}
                    style={{
                      flex: 1, height: 18, borderRadius: 2, padding: 0,
                      background: isDragOver ? "var(--preview)"
                        : isActive ? "var(--preview)"
                        : isCurrent ? "var(--bg-panel)" : "var(--bg-cell)",
                      opacity: isDragOver ? 0.6 : isActive ? 1 : isCurrent ? 0.8 : 0.5,
                      border: "none", cursor: "pointer",
                      boxShadow: isCurrent && isActive ? "0 0 6px var(--preview)" : "none",
                      marginLeft: step % 4 === 0 && step > 0 ? 3 : 0,
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Step indicators — also drop targets for pads without a row */}
      <div style={{ display: "flex", gap: 1, paddingLeft: 20 }}>
        {Array.from({ length: numSteps }, (_, i) => (
          <div
            key={i}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleStepDrop(e, i)}
            style={{
              flex: 1, height: 3, borderRadius: 1,
              background: i === currentStep ? "var(--preview)" : "var(--bg-cell)",
              marginLeft: i % 4 === 0 && i > 0 ? 3 : 0,
            }}
          />
        ))}
      </div>
    </div>
  );
}
