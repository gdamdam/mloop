import { useState, useRef, useCallback } from "react";
import type { EffectParams, EffectName } from "../types";
import { EffectEditor } from "./EffectEditor";

const EFFECT_LABELS: { name: EffectName; label: string }[] = [
  { name: "compressor", label: "COMP" },
  { name: "highpass", label: "HPF" },
  { name: "distortion", label: "DIST" },
  { name: "bitcrusher", label: "CRUSH" },
  { name: "chorus", label: "CHOR" },
  { name: "phaser", label: "PHAS" },
  { name: "delay", label: "DLY" },
  { name: "reverb", label: "VERB" },
];

interface EffectRackProps {
  trackId: number;
  effects: EffectParams;
  onToggle: (name: EffectName) => void;
  onSetParams: (name: EffectName, params: Record<string, unknown>) => void;
}

export function EffectRack({ effects, onToggle, onSetParams }: EffectRackProps) {
  const [editing, setEditing] = useState<EffectName | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const didLongPress = useRef(false);

  const handlePointerDown = useCallback((name: EffectName) => {
    didLongPress.current = false;
    longPressTimer.current = window.setTimeout(() => {
      didLongPress.current = true;
      setEditing(name);
    }, 400);
  }, []);

  const handlePointerUp = useCallback((name: EffectName) => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    // Short tap = toggle, but only if it wasn't a long press
    if (!didLongPress.current) {
      onToggle(name);
    }
  }, [onToggle]);

  const handlePointerLeave = useCallback(() => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  return (
    <>
      <div style={{
        display: "flex",
        gap: 4,
        marginTop: 8,
        flexWrap: "wrap",
      }}>
        {EFFECT_LABELS.map(({ name, label }) => {
          const isOn = effects[name].on;
          return (
            <button
              key={name}
              onPointerDown={() => handlePointerDown(name)}
              onPointerUp={() => handlePointerUp(name)}
              onPointerLeave={handlePointerLeave}
              style={{
                flex: "1 1 auto",
                minWidth: 40,
                height: 32,
                borderRadius: 6,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.5,
                background: isOn ? "var(--accent)" : "var(--bg-cell)",
                color: isOn ? "var(--bg)" : "var(--text-dim)",
                boxShadow: isOn ? "0 0 8px rgba(88,166,255,0.4)" : "none",
                transition: "background 0.15s, color 0.15s, box-shadow 0.15s",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {editing && (
        <EffectEditor
          name={editing}
          params={effects[editing]}
          onClose={() => setEditing(null)}
          onChange={(params) => onSetParams(editing, params)}
        />
      )}
    </>
  );
}
