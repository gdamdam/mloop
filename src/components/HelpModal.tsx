import { useState } from "react";

const SECTIONS = [
  {
    title: "Getting Started",
    items: [
      "Click **START** to initialize audio and grant mic permission",
      "Press the **●** (record) button on any track to start recording",
      "Press **●** again to stop — your loop plays back immediately",
      "The first loop sets the **master length** — all other loops sync to it",
      "Use **FREE** mode for unquantized loops, **QUANT** for beat-snapped recording",
    ],
  },
  {
    title: "Track Controls",
    items: [
      "**●** Record — start/stop recording on this track",
      "**▶** Play — play/stop the recorded loop",
      "**◎** Overdub — record a new layer on top of existing loop",
      "**M** Mute — toggle track mute",
      "**↩** Undo — remove the last overdub layer",
      "**✕** Clear — delete all layers and reset the track",
      "**REV** — reverse the loop playback",
      "**½×** — half-speed playback",
      "**Volume slider** — adjust track volume",
      "**Drop audio** — drag & drop an audio file onto an empty track",
    ],
  },
  {
    title: "KAOS Pad & Effects",
    items: [
      "Drag on the **XY pad** to control two effect parameters simultaneously",
      "Select X and Y targets from the dropdowns above the pad",
      "Tap an effect button to **toggle** it on/off",
      "Long-press an effect button to **edit parameters**",
      "Master FX applies to **all tracks** globally",
      "Per-track effects are in each track's effect rack below the transport",
      "Chain shows the active signal flow order",
    ],
  },
  {
    title: "Timing & Metronome",
    items: [
      "**FREE** mode — first loop sets the master length, no beat grid",
      "**QUANT** mode — loops snap to bar boundaries based on BPM",
      "**♩** Metronome — toggle click track (1500Hz downbeat, 1000Hz others)",
      "**TAP** — tap repeatedly to set tempo from your tapping rhythm",
      "**+/−** buttons in header to fine-tune BPM",
    ],
  },
  {
    title: "Sessions & Export",
    items: [
      "Click **💾** to open the session manager",
      "**Save** — stores all loops, effects, and settings to browser storage",
      "**Load** — restore a previously saved session",
      "**Export Mixdown** — download all tracks mixed as a WAV file",
      "Sessions persist in your browser (IndexedDB) — no account needed",
    ],
  },
  {
    title: "MIDI & Keyboard",
    items: [
      "**MIDI** button — map any MIDI CC/note to loop controls (Chrome/Edge)",
      "Click **Learn** next to an action, then move a MIDI control to assign it",
      "**Keyboard shortcuts** (press **?** to see all):",
      "**1/2/3** — record track 1/2/3",
      "**Q/W/E** — play track 1/2/3",
      "**A/S/D** — mute track 1/2/3",
      "**Space** — stop all, **P** — play all, **M** — metronome",
    ],
  },
  {
    title: "Themes",
    items: [
      "Click **☀/☾** in the header to toggle light/dark mode",
      "Open **⚙ Settings** to choose from 12 color themes",
      "6 dark themes: Midnight, Neon, Forest, Ember, Cobalt, Violet",
      "6 light themes: Minimal, Cream, Artic, Sand, Rosé, Slate",
      "Theme preference is saved automatically",
    ],
  },
];

interface HelpModalProps {
  onClose: () => void;
}

export function HelpModal({ onClose }: HelpModalProps) {
  const [expanded, setExpanded] = useState<number | null>(0);

  return (
    <div className="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" style={{ maxHeight: "80dvh" }}>
        <div className="sheet-header">
          <span className="sheet-title">How to use mloop</span>
          <button className="sheet-close" onClick={onClose}>✕</button>
        </div>
        <div className="sheet-body">
          {SECTIONS.map((s, i) => (
            <div key={i} style={{ borderBottom: "1px solid var(--border)" }}>
              <button
                onClick={() => setExpanded(expanded === i ? null : i)}
                style={{
                  width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 0", fontSize: 13, fontWeight: 700, textAlign: "left",
                }}
              >
                <span>{s.title}</span>
                <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{expanded === i ? "▼" : "▶"}</span>
              </button>
              {expanded === i && (
                <ul style={{ listStyle: "none", padding: "0 0 10px 0", fontSize: 12, lineHeight: 1.8 }}>
                  {s.items.map((item, j) => (
                    <li key={j} style={{ color: "var(--text-dim)", paddingLeft: 8, borderLeft: "2px solid var(--border)" }}
                      dangerouslySetInnerHTML={{ __html: item.replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text)">$1</strong>') }}
                    />
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
