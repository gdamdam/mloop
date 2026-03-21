import { useState } from "react";

const SECTIONS = [
  {
    title: "Getting Started",
    items: [
      "Click **START** to initialize audio and grant mic permission",
      "**PAD** mode (default) — tap pads to play built-in drum sounds, record your own",
      "**LOOPER** mode — record, layer, and loop audio from your mic",
      "Switch modes with the **PAD | LOOPER** toggle in the header",
      "7 built-in drum kits — select from the **Kit** dropdown in PAD view",
    ],
  },
  {
    title: "Sample Pads",
    items: [
      "**16 pads** — tap empty pad to record from mic, tap loaded to play",
      "**7 kits**: Default, Hip-Hop, House, Lo-Fi, Industrial, Reggaeton, FX",
      "**✎** edit — trim sample with draggable start/end handles",
      "**✕** delete — remove sample from pad",
      "Recording auto-stops when tapping another pad",
      "**Drag pads** onto the step sequencer to place them",
    ],
  },
  {
    title: "Step Sequencer",
    items: [
      "Click cells to toggle which pads play on which steps",
      "**▶/■** — start/stop sequencer playback",
      "Step counts: **8, 16, 32, 64** steps",
      "Multiple pads can trigger on the same step",
      "**Drag** loaded pads from the grid onto sequencer cells",
      "**CLR** — clear entire pattern",
    ],
  },
  {
    title: "Looper Controls",
    items: [
      "**●** Record — start/stop recording on a track",
      "**▶** Play — play/stop the recorded loop",
      "**◎** Overdub — record a new layer on top of existing loop",
      "**M** Mute — toggle track mute",
      "**↩** Undo — remove the last overdub layer",
      "**✕** Clear — delete all layers and reset the track",
      "**REV** — reverse the loop, **½×** — half-speed playback",
      "**→PAD** — copy track recording to an empty pad slot",
      "**DECAY** slider — progressive tape degradation per loop cycle",
      "**Sound DNA** — spectral fingerprint glyph shows loop character",
    ],
  },
  {
    title: "KAOS Pad & Effects",
    items: [
      "Drag on the **XY pad** to control two effect parameters simultaneously",
      "**7 targets**: Cutoff, Resonance, Distortion, Highpass, Delay, Reverb, Volume",
      "Tap an effect button to **toggle**, long-press to **edit parameters**",
      "**Chain badges** show signal order — click chain text to **drag-reorder**",
      "**9 effects**: LPF, Compressor, HPF, Distortion, Bitcrusher, Chorus, Phaser, Delay, Reverb",
      "**● REC GESTURE** — record XY movements as looping automation",
      "**▶ PLAY GESTURE** — replays gesture in sync with audio loops",
    ],
  },
  {
    title: "Timing & Sync",
    items: [
      "**FREE/QNT** — toggle free-time or quantized (bar-snapped) recording",
      "**3 sync modes** (cycle with ⊘/⟳/🔒): FREE, SYNC (phase-locked), LOCK (fixed window)",
      "**♩** Metronome — toggle click track",
      "**T** — tap tempo (averages last 5 taps)",
      "**+/−** — fine-tune BPM",
    ],
  },
  {
    title: "Sessions & Export",
    items: [
      "**↓** — open session manager (save, load, delete, export WAV)",
      "**⬇ Export / ⬆ Import** session as JSON file (in Settings)",
      "**★** PIN — saves current state, auto-loads on next visit",
      "**⤴** Share — copies settings link to clipboard",
      "**Recording limits** — configurable in Settings (max time, max session size)",
      "Sessions persist in IndexedDB — no account needed",
    ],
  },
  {
    title: "MIDI & Keyboard",
    items: [
      "**M** button — map any MIDI CC/note to controls (Chrome/Edge)",
      "Click **Learn** next to an action, then move a MIDI control to assign it",
      "**Keyboard shortcuts** (press **?** to see all):",
      "**1/2/3** — record, **Q/W/E** — play, **A/S/D** — mute, **Z/X/C** — clear",
      "**Space** — stop recording or stop all, **P** — play all, **M** — metronome",
    ],
  },
  {
    title: "Themes & Settings",
    items: [
      "**◑** — toggle light/dark mode (Cream/Midnight)",
      "**⚙** Settings — 12 themes, session export/import, recording limits",
      "**Logo click**: 1× = random theme, 2× = toggle beat pulse, 3× = help",
      "Logo pulses with the beat when audio is playing",
      "**⛶** — fullscreen mode",
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
