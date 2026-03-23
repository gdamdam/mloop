/**
 * PadSequencer — 16-step sequencer grid for the sample pads.
 * Each step can trigger multiple pads simultaneously.
 * Supports drag-and-drop from pads onto steps.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { PadSlot } from "../engine/PadEngine";
import type { PadEngine } from "../engine/PadEngine";

const STEP_OPTIONS = [8, 16, 32, 64] as const;

interface PadSequencerProps {
  slots: PadSlot[];
  bpm: number;
  onTrigger: (slotIds: number[]) => void;
  padEngine: PadEngine | null;
  /** Ref filled with a function to record a pad hit at the current step. */
  recordHitRef?: React.MutableRefObject<((padId: number) => void) | null>;
}

/** Generate a random believable drum pattern. */
function generateRandomPattern(numSteps: number, loadedIds: number[]): boolean[][] {
  const grid = Array.from({ length: 64 }, () => Array(16).fill(false));
  for (const id of loadedIds) {
    // Assign pattern density based on sound type (lower id = more fundamental)
    const density = id === 0 ? 0.3   // kick: sparse
      : id === 1 ? 0.15              // snare: on 2&4 area
      : id === 2 ? 0.6               // hh: busy
      : id === 3 ? 0.12              // clap: sparse
      : id === 4 ? 0.2               // open hh: off-beats
      : 0.1;                          // others: rare accents
    for (let step = 0; step < numSteps; step++) {
      // Musical bias: kicks on downbeats, snares on backbeats
      let prob = density;
      if (id === 0 && step % 4 === 0) prob = 0.8;        // kick on quarters
      else if (id === 0 && step % 4 === 2) prob = 0.2;   // kick sometimes on &
      else if (id === 1 && step % 8 === 4) prob = 0.9;   // snare on 2&4
      else if (id === 2 && step % 2 === 0) prob = 0.85;  // hh on 1/8s
      else if (id === 4 && step % 2 === 1) prob = 0.3;   // open hh off-beats
      grid[step][id] = Math.random() < prob;
    }
  }
  return grid;
}

export function PadSequencer({ slots, bpm, onTrigger: _onTrigger, padEngine, recordHitRef }: PadSequencerProps) {
  void _onTrigger;
  const [numSteps, setNumSteps] = useState(16);
  const [grid, setGrid] = useState<boolean[][]>(() =>
    Array.from({ length: 64 }, () => Array(16).fill(false))
  );
  const [recording, setRecording] = useState(false);
  const [swing, setSwing] = useState(0);
  // Playing state derived from engine — single source of truth
  const playing = padEngine?.isSeqPlaying ?? false;
  const [currentStep, setCurrentStep] = useState(-1);
  const [dragOverCell, setDragOverCell] = useState<{ step: number; slot: number } | null>(null);
  const [mutedRows, setMutedRows] = useState<Set<number>>(new Set());
  const [selectedSteps, setSelectedSteps] = useState<Set<number>>(new Set());
  const [selectAnchor, setSelectAnchor] = useState<number | null>(null);
  const draggingSelect = useRef(false);
  const currentStepRef = useRef(-1);

  // Real-time step recording — when recording + playing, pad hits write to grid
  const recordingRef = useRef(false);
  recordingRef.current = recording;

  const recordHit = useCallback((padId: number) => {
    if (!recordingRef.current || currentStepRef.current < 0) return;
    const step = currentStepRef.current;
    setGrid(prev => {
      const next = prev.map(row => [...row]);
      next[step][padId] = true; // overdub — always add, never remove
      return next;
    });
  }, []);

  // Expose recordHit to parent via ref
  useEffect(() => {
    if (recordHitRef) recordHitRef.current = recordHit;
    return () => { if (recordHitRef) recordHitRef.current = null; };
  }, [recordHitRef, recordHit]);

  // Duplicate pattern when increasing step count (e.g. 16→32 fills second half)
  const changeSteps = useCallback((newSteps: number) => {
    if (newSteps > numSteps) {
      setGrid(prev => {
        const next = prev.map(row => [...row]);
        // Copy pattern from first half into empty second half
        for (let step = numSteps; step < newSteps; step++) {
          const src = step % numSteps;
          for (let s = 0; s < 16; s++) {
            if (!next[step][s]) next[step][s] = next[src][s];
          }
        }
        return next;
      });
    }
    setNumSteps(newSteps);
    setSelectedSteps(new Set());
  }, [numSteps]);

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
  // Load initial grid from engine (e.g. default pattern set in Layout).
  // Re-reads when slots change — catches async default pattern loaded after samples.
  useEffect(() => {
    if (!padEngine) return;
    const engineGrid = (padEngine as unknown as { seqGrid: boolean[][] }).seqGrid;
    if (engineGrid && engineGrid.some(row => row.some(Boolean))) {
      setGrid(engineGrid.map(row => [...row]));
    }
  }, [padEngine, slots]);

  // Sync grid/bpm/steps to PadEngine, applying mutes
  useEffect(() => {
    if (!padEngine) return;
    // Apply mutes: zero out muted rows before sending to engine
    const effectiveGrid = grid.map(row => row.map((v, slotId) => v && !mutedRows.has(slotId)));
    padEngine.setSeqGrid(effectiveGrid);
    padEngine.setSeqNumSteps(numSteps);
    padEngine.setSeqBpm(bpm);
  }, [padEngine, grid, numSteps, bpm, mutedRows]);

  // Wire step change callback for UI indicator
  useEffect(() => {
    if (!padEngine) return;
    // eslint-disable-next-line react-hooks/immutability -- padEngine is an external class instance, not React state
    padEngine.onStepChange = (step) => {
      setCurrentStep(step); currentStepRef.current = step;
    };
    return () => { padEngine.onStepChange = null; };
  }, [padEngine]);

  const [, forceRender] = useState(0);
  // Start/stop sequencer
  const handleSeqPlayStop = useCallback(() => {
    if (!padEngine) return;
    if (padEngine.isSeqPlaying) {
      padEngine.stopSequencer();
      setRecording(false);
      setCurrentStep(-1);
    } else {
      padEngine.startSequencer();
    }
    forceRender(n => n + 1);
  }, [padEngine]);

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
          onClick={handleSeqPlayStop}
          style={{
            width: 32, height: 32, borderRadius: "50%", fontSize: 14,
            background: playing ? "var(--playing)" : "var(--bg-cell)",
            color: playing ? "#000" : "var(--text)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          title="Play / Stop sequencer"
        >
          {playing ? "■" : "▶"}
        </button>
        <button
          onClick={() => { if (!playing && padEngine) { padEngine.startSequencer(); forceRender(n => n + 1); } setRecording(!recording); }}
          style={{
            width: 32, height: 32, borderRadius: "50%", fontSize: 9, fontWeight: 700,
            background: recording ? "var(--record)" : "var(--bg-cell)",
            color: recording ? "#fff" : "var(--text-dim)",
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: recording ? "pulse 1s ease-in-out infinite" : "none",
          }}
          title="Real-time step recording — play pads to record into grid"
        >
          ●
        </button>
        <span style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: 1 }}>SEQ</span>
        {/* Swing — inline */}
        <span style={{ fontSize: 7, color: "var(--text-dim)", marginLeft: 4 }}>Sw</span>
        <input type="range" className="volume-slider" min={0} max={1} step={0.05}
          value={swing}
          onChange={(e) => { const v = parseFloat(e.target.value); setSwing(v); padEngine?.setSeqSwing(v); }}
          title={`Swing ${Math.round(swing * 100)}%`}
          style={{ width: 40, flex: "none" }} />
        {/* Swing — inline with transport */}
        {/* Step count selector */}
        <div style={{ display: "flex", gap: 2, marginLeft: "auto" }}>
          {STEP_OPTIONS.map(n => (
            <button
              key={n}
              onClick={() => changeSteps(n)}
              title={`Set to ${n} steps`}
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
          onClick={() => {
            if (selectedSteps.size > 0) {
              // Clear only selected steps
              setGrid(prev => {
                const next = prev.map(row => [...row]);
                for (const step of selectedSteps) {
                  for (let s = 0; s < 16; s++) next[step][s] = false;
                }
                return next;
              });
              setSelectedSteps(new Set());
            } else {
              setGrid(Array.from({ length: 64 }, () => Array(16).fill(false)));
            }
          }}
          style={{ fontSize: 9, color: selectedSteps.size > 0 ? "var(--record)" : "var(--text-dim)", padding: "2px 6px", borderRadius: 4, background: "var(--bg-cell)" }}
          title={selectedSteps.size > 0 ? `Clear ${selectedSteps.size} selected steps` : "Clear all"}
        >
          CLR{selectedSteps.size > 0 ? ` ${selectedSteps.size}` : ""}
        </button>
        <button
          onClick={() => {
            setGrid(prev => {
              const next = prev.map(row => [...row]);
              const half = Math.floor(numSteps / 2);
              for (let step = half; step < numSteps; step++) {
                for (let s = 0; s < 16; s++) next[step][s] = false;
              }
              return next;
            });
          }}
          style={{ fontSize: 9, color: "var(--text-dim)", padding: "2px 6px", borderRadius: 4, background: "var(--bg-cell)" }}
          title="Clear second half"
        >
          CLR½
        </button>
        <button
          onClick={() => {
            const loadedIds = slots.filter(s => s.status === "loaded").map(s => s.id);
            setGrid(generateRandomPattern(numSteps, loadedIds));
          }}
          style={{ fontSize: 9, color: "var(--preview)", padding: "2px 6px", borderRadius: 4, background: "var(--bg-cell)" }}
          title="Generate random pattern"
        >
          RND
        </button>
      </div>

      {/* Step grid */}
      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        {loadedSlots.map((slot) => (
          <div key={slot.id} style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 2 }}>
            <button
              onClick={() => setMutedRows(prev => {
                const next = new Set(prev);
                if (next.has(slot.id)) next.delete(slot.id); else next.add(slot.id);
                return next;
              })}
              title={mutedRows.has(slot.id) ? "Unmute" : "Mute"}
              style={{
                fontSize: 8, fontWeight: 700,
                color: mutedRows.has(slot.id) ? "var(--bg-cell)" : "var(--preview)",
                background: mutedRows.has(slot.id) ? "var(--text-dim)" : "var(--bg-cell)",
                width: 18, height: 18, textAlign: "center", flexShrink: 0,
                borderRadius: 3, border: "none", cursor: "pointer", padding: 0,
                opacity: mutedRows.has(slot.id) ? 0.4 : 1,
              }}
            >
              {slot.id + 1}
            </button>
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
                        : isActive && isCurrent ? "var(--preview)"
                        : isActive ? "var(--preview)"
                        : isCurrent ? "var(--preview)" : "var(--bg-cell)",
                      opacity: isDragOver ? 0.6
                        : isActive && isCurrent ? 1
                        : isActive ? 0.7
                        : isCurrent ? 0.35 : 0.4,
                      border: "none", cursor: "pointer",
                      boxShadow: isCurrent ? "0 0 6px var(--preview)" : "none",
                      marginLeft: step % 4 === 0 && step > 0 ? 3 : 0,
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}

      {/* Step indicators — inside scrollable area so always visible */}
      <div style={{ display: "flex", gap: 1, paddingLeft: 20, marginTop: 4, touchAction: "none", userSelect: "none", flexShrink: 0 }}
        title="Click to select steps · Shift+click for range · Drag to select · CLR clears selected"
        onPointerUp={() => { draggingSelect.current = false; }}
        onPointerLeave={() => { draggingSelect.current = false; }}
        onPointerMove={(e) => {
          if (!draggingSelect.current || selectAnchor === null) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left - 20;
          const stepWidth = (rect.width - 20) / numSteps;
          const step = Math.max(0, Math.min(numSteps - 1, Math.floor(x / stepWidth)));
          const from = Math.min(selectAnchor, step);
          const to = Math.max(selectAnchor, step);
          const range = new Set<number>();
          for (let s = from; s <= to; s++) range.add(s);
          setSelectedSteps(range);
        }}
      >
        {Array.from({ length: numSteps }, (_, i) => (
          <div
            key={i}
            onPointerDown={(e) => {
              e.preventDefault();
              draggingSelect.current = true;
              if (e.shiftKey && selectAnchor !== null) {
                const from = Math.min(selectAnchor, i);
                const to = Math.max(selectAnchor, i);
                const range = new Set<number>();
                for (let s = from; s <= to; s++) range.add(s);
                setSelectedSteps(range);
              } else {
                setSelectAnchor(i);
                setSelectedSteps(prev => {
                  const next = new Set(prev);
                  if (next.has(i)) next.delete(i); else next.add(i);
                  return next;
                });
              }
            }}
            title={`Step ${i + 1}`}
            style={{
              flex: 1, height: 10, borderRadius: 2, cursor: "pointer",
              background: selectedSteps.has(i) ? "var(--record)"
                : i === currentStep ? "var(--preview)" : "var(--bg-cell)",
              opacity: selectedSteps.has(i) ? 0.9 : i === currentStep ? 1 : 0.5,
              boxShadow: i === currentStep ? "0 0 4px var(--preview)" : "none",
              marginLeft: i % 4 === 0 && i > 0 ? 3 : 0,
              border: selectedSteps.has(i) ? "1px solid var(--record)" : "1px solid transparent",
            }}
          />
        ))}
      </div>
      </div>

    </div>
  );
}
