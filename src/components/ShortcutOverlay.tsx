import { SHORTCUT_DESCRIPTIONS } from "../hooks/useKeyboardShortcuts";

interface ShortcutOverlayProps {
  onClose: () => void;
}

export function ShortcutOverlay({ onClose }: ShortcutOverlayProps) {
  return (
    <div className="sheet-backdrop" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div className="sheet">
        <div className="sheet-header">
          <span className="sheet-title">Keyboard Shortcuts</span>
          <button className="sheet-close" onClick={onClose}>×</button>
        </div>
        <div className="sheet-body">
          {SHORTCUT_DESCRIPTIONS.map(({ key, description }) => (
            <div
              key={key}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 0",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span style={{ fontSize: 13 }}>{description}</span>
              <kbd style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: 4,
                background: "var(--bg-cell)",
                color: "var(--accent)",
                fontFamily: "inherit",
              }}>
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
