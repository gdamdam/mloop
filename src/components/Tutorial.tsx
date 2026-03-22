/**
 * Tutorial Wizard — first-visit walkthrough or triggered from HelpModal.
 * Simple centered modal steps (no DOM highlighting), describes what to look at.
 */

import { useState } from "react";

const STEPS = [
  {
    title: "PAD / LOOPER Toggle",
    description:
      "At the top of the screen you'll see a PAD | LOOPER toggle. PAD mode gives you a 16-pad MPC-style sampler with step sequencer. LOOPER mode gives you 3 loop tracks with overdub, reverse, half-speed, and a KAOS XY effects pad.",
    area: "Header — top left, next to the logo",
  },
  {
    title: "Pad Grid",
    description:
      "In PAD mode, you get a 4x4 grid of sample pads. Tap an empty pad to record from your mic. Tap a loaded pad to play the sound. Drag pads to rearrange them. Click a pad to open its detail panel with volume, pan, pitch, trim, and play mode controls.",
    area: "Center of the screen in PAD mode",
  },
  {
    title: "Step Sequencer",
    description:
      "Below the pad grid is the step sequencer. Click cells to toggle which pads trigger on which steps. Use 8/16/32/64 step modes, add swing, generate random patterns with RND, and mute individual rows. Press ● REC to record pad hits into the grid in real-time. The sequencer drives the rhythm while you perform live on top.",
    area: "Below the pad grid — the grid of small cells",
  },
  {
    title: "Scratchpad Recorder",
    description:
      "Above the sequencer is the scratchpad recorder strip. Choose MIC (record from microphone), RESAMPLE (capture master output), or DUB (mic + output combined). Record, preview, auto-trim, then drag the result onto any pad. Great for sampling on the fly.",
    area: "Above the sequencer — the record strip with MIC/RESAMPLE/DUB buttons",
  },
  {
    title: "Kit Selector & Sound Browser",
    description:
      "Use the Kit dropdown to switch between 7 built-in drum kits (Default, Hip-Hop, House, Lo-Fi, Industrial, Reggaeton, FX). Click the music note icon on any pad to open the Sound Browser and mix sounds from different kits.",
    area: "Pad toolbar — Kit dropdown and note icons on pads",
  },
  {
    title: "KAOS XY Pad",
    description:
      "In LOOPER mode, the KAOS pad lets you drag to control two effect parameters at once (e.g. Cutoff + Reverb). It shows neon touch trails and audio-reactive visuals. You can record gesture loops that replay your XY movements in sync with audio.",
    area: "Center of LOOPER mode — the large square pad",
  },
  {
    title: "Effects Chain",
    description:
      "9 real-time effects: Low-Pass, Compressor, High-Pass, Distortion, Bitcrusher, Chorus, Phaser, Delay, Reverb. Tap to toggle, long-press to edit parameters. Drag the chain badges to reorder. Effects apply per-track or globally via the KAOS pad.",
    area: "Below the KAOS pad in LOOPER mode / effect buttons",
  },
  {
    title: "Transport & Timing",
    description:
      "The header has BPM controls (+/-), tap tempo (T), metronome toggle, FREE/QNT recording mode, and sync modes (FREE/SYNC/LOCK). Use the LINK button to sync tempo with mpump. The big play/stop button controls all tracks at once.",
    area: "Header — center and right side controls",
  },
  {
    title: "Keyboard Shortcuts",
    description:
      "Press ? to see all keyboard shortcuts. In PAD mode, use the QWERTY 4x4 grid (M,./  JKL;  UIOP  7890) for finger drumming. In LOOPER mode, 1/2/3 record, Q/W/E play, A/S/D mute, Z/X/C clear. Hold pad keys for roll/repeat.",
    area: "Press ? anytime — or click the ? button in the header",
  },
  {
    title: "Sessions & Sharing",
    description:
      "Save sessions (persisted in your browser), export as JSON or WAV, pin a session to auto-load on next visit, and share settings links. Access everything from the session manager (arrow-down button) and Settings (gear icon).",
    area: "Header — star, arrow-down, share, and gear buttons",
  },
];

interface TutorialProps {
  onClose: () => void;
}

export function Tutorial({ onClose }: TutorialProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const total = STEPS.length;

  const handleNext = () => {
    if (step < total - 1) {
      setStep(step + 1);
    } else {
      handleDone();
    }
  };

  const handlePrev = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleDone = () => {
    localStorage.setItem("mloop-tutorial-seen", "true");
    onClose();
  };

  const handleSkip = () => {
    localStorage.setItem("mloop-tutorial-seen", "true");
    onClose();
  };

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) handleSkip(); }}
      style={{ alignItems: "center", justifyContent: "center" }}
    >
      <div style={{
        width: "90%",
        maxWidth: 440,
        background: "var(--bg-panel)",
        border: "2px solid var(--preview)",
        borderRadius: 16,
        padding: 0,
        animation: "slideUp 0.2s ease-out",
        boxShadow: "0 0 40px rgba(0,0,0,0.5), 0 0 20px color-mix(in srgb, var(--preview) 30%, transparent)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 16px 10px",
          borderBottom: "1px solid var(--border)",
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--preview)", letterSpacing: 1 }}>
            TUTORIAL
          </span>
          <span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 700 }}>
            {step + 1}/{total}
          </span>
        </div>

        {/* Step indicator bar */}
        <div style={{
          display: "flex",
          gap: 3,
          padding: "8px 16px 0",
        }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              background: i <= step ? "var(--preview)" : "var(--bg-cell)",
              transition: "background 0.2s",
            }} />
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: "16px 16px 12px" }}>
          <h3 style={{
            fontSize: 16,
            fontWeight: 700,
            color: "var(--text)",
            margin: "0 0 8px",
          }}>
            {current.title}
          </h3>
          <p style={{
            fontSize: 12,
            lineHeight: 1.7,
            color: "var(--text-dim)",
            margin: "0 0 12px",
          }}>
            {current.description}
          </p>

          {/* Target area hint */}
          <div style={{
            fontSize: 10,
            color: "var(--preview)",
            background: "color-mix(in srgb, var(--preview) 10%, var(--bg-cell))",
            border: "1px solid color-mix(in srgb, var(--preview) 30%, transparent)",
            borderRadius: 6,
            padding: "6px 10px",
            fontWeight: 600,
          }}>
            Look at: {current.area}
          </div>
        </div>

        {/* Buttons */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px 14px",
          gap: 8,
        }}>
          <button onClick={handleSkip} style={{
            fontSize: 11,
            color: "var(--text-dim)",
            padding: "6px 12px",
          }}>
            Skip
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && (
              <button onClick={handlePrev} style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "6px 14px",
                borderRadius: 6,
                background: "var(--bg-cell)",
                color: "var(--text)",
              }}>
                Back
              </button>
            )}
            <button onClick={handleNext} style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "6px 14px",
              borderRadius: 6,
              background: "var(--preview)",
              color: "#000",
            }}>
              {step === total - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
