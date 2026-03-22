import { useState, useEffect, useCallback } from "react";
import { listSessions, deleteSession } from "../utils/storage";

interface SessionManagerProps {
  onClose: () => void;
  onSave: (name: string) => void;
  onLoad: (name: string) => void;
  onExportWav: () => void;
}

export function SessionManager({ onClose, onSave, onLoad, onExportWav }: SessionManagerProps) {
  const [sessions, setSessions] = useState<{ name: string; savedAt: number }[]>([]);
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
    refresh();
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
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
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
              marginBottom: 16,
            }}
          >
            Export Mixdown (WAV)
          </button>

          {/* Session list */}
          {sessions.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center" }}>
              No saved sessions
            </p>
          ) : (
            sessions.map((s) => (
              <div
                key={s.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: "var(--text-dim)" }}>
                    {new Date(s.savedAt).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => onLoad(s.name)}
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
                    onClick={() => handleDelete(s.name)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      background: "var(--bg-cell)",
                      color: "#f85149",
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
