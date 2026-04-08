import { useState, useEffect, useCallback } from "react";
import { listSessions, deleteSession } from "../utils/storage";
import type { SessionMeta } from "../utils/storage";

interface SessionManagerProps {
  onClose: () => void;
  onSave: (name: string) => void;
  onLoad: (name: string) => void;
  onExportWav: () => void;
}

/** Mini looper-track bar: filled segments = layers recorded. */
function TrackBars({ layers }: { layers: number[] }) {
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 18 }}>
      {layers.map((count, i) => (
        <div
          key={i}
          title={`Track ${i + 1}: ${count} layer${count !== 1 ? "s" : ""}`}
          style={{
            width: 10,
            borderRadius: 2,
            background: count > 0 ? "var(--preview)" : "var(--border)",
            opacity: count > 0 ? Math.min(0.4 + count * 0.2, 1) : 0.35,
            height: count > 0 ? Math.min(8 + count * 4, 18) : 6,
            transition: "height 0.2s",
          }}
        />
      ))}
    </div>
  );
}

/** Mini 4x4 pad grid: filled = slot has audio. */
function PadGrid({ count }: { count: number }) {
  const cells = Array.from({ length: 16 }, (_, i) => i < count);
  return (
    <div
      title={`${count} pad${count !== 1 ? "s" : ""} loaded`}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 6px)",
        gap: 2,
      }}
    >
      {cells.map((on, i) => (
        <div
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: 1,
            background: on ? "var(--preview)" : "var(--border)",
            opacity: on ? 0.85 : 0.3,
          }}
        />
      ))}
    </div>
  );
}

function SessionCard({ s, onLoad, onDelete }: { s: SessionMeta; onLoad: () => void; onDelete: () => void }) {
  const hasTracks = s.trackLayers.some((n) => n > 0);
  const hasPad = s.padSlots > 0;
  const date = new Date(s.savedAt);
  const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const timeStr = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid var(--border)",
        background: "var(--bg-cell)",
        marginBottom: 8,
      }}
    >
      {/* Thumbnail */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
        {hasTracks && <TrackBars layers={s.trackLayers} />}
        {hasPad && <PadGrid count={s.padSlots} />}
        {!hasTracks && !hasPad && (
          <div style={{ width: 36, height: 18, borderRadius: 3, background: "var(--border)", opacity: 0.4 }} />
        )}
      </div>

      {/* Meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {s.name}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "monospace" }}>
            {s.bpm} bpm
          </span>
          <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "monospace", textTransform: "uppercase" }}>
            {s.syncMode}
          </span>
          <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
            {dateStr} {timeStr}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button
          onClick={onLoad}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 700,
            background: "var(--preview)",
            color: "var(--bg)",
          }}
        >
          Load
        </button>
        <button
          onClick={onDelete}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 700,
            background: "var(--bg-cell)",
            color: "#f85149",
            border: "1px solid var(--border)",
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function SessionManager({ onClose, onSave, onLoad, onExportWav }: SessionManagerProps) {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [saveName, setSaveName] = useState("");

  const refresh = useCallback(async () => {
    const list = await listSessions();
    setSessions(list);
  }, []);

  useEffect(() => { refresh(); }, [refresh]); // eslint-disable-line react-hooks/set-state-in-effect

  const handleSave = () => {
    const name = saveName.trim();
    if (!name) return;
    onSave(name);
    setSaveName("");
    setTimeout(refresh, 300); // give IDB a moment to commit
  };

  const handleDelete = async (name: string) => {
    await deleteSession(name);
    refresh();
  };

  return (
    <div className="sheet-backdrop" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div className="sheet">
        <div className="sheet-header">
          <span className="sheet-title">Sessions</span>
          <button className="sheet-close" onClick={onClose}>×</button>
        </div>
        <div className="sheet-body">
          {/* Save */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="Session name..."
              style={{
                flex: 1,
                font: "inherit",
                fontSize: 14,
                background: "var(--bg-cell)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "8px 12px",
                outline: "none",
              }}
            />
            <button
              onClick={handleSave}
              disabled={!saveName.trim()}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                background: "var(--preview)",
                color: "var(--bg)",
                opacity: saveName.trim() ? 1 : 0.4,
              }}
            >
              Save
            </button>
          </div>

          {/* Export WAV */}
          <button
            onClick={onExportWav}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              background: "var(--bg-cell)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              marginBottom: 16,
            }}
          >
            Export Mixdown (WAV)
          </button>

          {/* Session list */}
          {sessions.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", padding: "20px 0" }}>
              No saved sessions yet
            </p>
          ) : (
            sessions.map((s) => (
              <SessionCard
                key={s.name}
                s={s}
                onLoad={() => { onLoad(s.name); onClose(); }}
                onDelete={() => handleDelete(s.name)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
