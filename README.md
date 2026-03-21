<h1 align="center">mloop</h1>
<p align="center">Browser-based loop station & MPC-style sampler.<br>Record, layer, slice, sequence, perform — no install, no subscription, no account.</p>

<p align="center">
  <a href="https://github.com/gdamdam/mloop"><img src="https://img.shields.io/badge/version-0.12.0-blue" alt="Version"></a>
  <a href="https://github.com/gdamdam/mloop/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-green" alt="License"></a>
  <a href="https://claude.ai/code"><img src="https://img.shields.io/badge/Built%20with-Claude%20Code-blueviolet?logo=anthropic&logoColor=white" alt="Built with Claude Code"></a>
  <br>
  <a href="https://mloop.mpump.live/">https://mloop.mpump.live/</a>
</p>

---

Open **[mloop](https://mloop.mpump.live/)** and start making beats immediately — no MIDI device required. Built-in mic recording, 9 real-time effects, KAOS XY pad, 16-pad sampler with step sequencer, sample slicer, chromatic mode, 7 synthesized drum kits, and Link Bridge sync — all running in the browser via Web Audio API.

Companion to [mpump](https://github.com/gdamdam/mpump) — the browser-based drum machine & synth sequencer.

## Table of Contents

- [Features](#features)
- [Sample Pads & Sequencer](#sample-pads--sequencer)
- [Sample Slicer](#sample-slicer)
- [Kit Management](#kit-management)
- [Sound Browser](#sound-browser)
- [Sample Presets](#sample-presets)
- [Loop Station](#loop-station)
- [KAOS XY Pad](#kaos-xy-pad)
- [Effects](#effects-9-total)
- [Gesture Loops](#gesture-loops)
- [Destruction Mode](#destruction-mode)
- [Sessions & Export](#sessions--export)
- [Link Bridge](#link-bridge)
- [Themes](#themes)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Tech Stack](#tech-stack)
- [Development](#development)
- [License](#license)

---

## Features

### Two Modes

| Mode | Description |
|---|---|
| **PAD** (default) | 4x4 MPC-style sample pads with step sequencer (8/16/32/64 steps), sample slicer, chromatic mode, resample, 7 built-in drum kits. Keyboard finger drumming via QWERTY 4x4 grid. |
| **LOOPER** | 3 independent loop tracks with record, overdub, undo, reverse, half-speed. Centered KAOS XY pad with master effects. |

### What's in v0.11+

- **Sample slicer** — equal slicing or auto-chop with transient detection
- **Chromatic mode** (♪) — spread a sample across 16 pads at different pitches
- **Resample** (⏺R) — record master output back into a pad
- **Keyboard finger drumming** — QWERTY 4x4 grid triggers pads in PAD mode
- **Swing slider** — adjustable swing on the step sequencer
- **Mute groups** (choke) — per-pad groups so e.g. closed hat cuts open hat
- **Random pattern generator** (RND) — generates musically-weighted drum patterns
- **Sequencer row mute toggles** — mute individual rows in the sequencer
- **Drag-and-drop pad swap** — rearrange pads by dragging
- **Per-pad controls** — volume, pan, pitch, trim, play mode (ONE/GATE/LOOP)
- **Loop window presets** — musical lengths (1/4, 1 beat, 1 bar, etc.)
- **Sound browser** (♫) — mix and match sounds across all kits
- **Kit save/export/import** — persist custom kits, share as files
- **Auto-trim silence** in sample editor
- **Default 4-on-the-floor** pattern on startup
- **Pad detail panel** — editable names, waveform trim, all per-pad settings
- **7 synthesized drum kits** — Default, Hip-Hop, House, Lo-Fi, Industrial, Reggaeton, FX
- **Link Bridge** — tempo sync with mpump

---

## Sample Pads & Sequencer

- **16 pads** — tap empty to record from mic, tap loaded to play
- **7 built-in kits** — all synthesized via `OfflineAudioContext`, zero sample files
- **Step sequencer** — 8/16/32/64 steps, multiple pads per step
- **Swing** — adjustable swing amount on the sequencer
- **Random patterns** (RND) — auto-generate believable drum patterns
- **Row mute toggles** — silence individual pads in the sequencer without editing
- **Drag & drop** pads onto sequencer steps, or drag between pads to swap
- **Per-pad controls**: volume, pan, pitch (±12 semitones), trim start/end, play mode
- **Play modes**: ONE (one-shot), GATE (plays while held), LOOP (continuous)
- **Mute groups** (choke) — assign pads to groups 1-4; triggering one stops others in the group
- **Loop window presets** — snap loop length to musical values (1/4, 1 beat, 1 bar, etc.)
- **Pad detail panel** — click a pad to see waveform, editable name, all controls
- **Roll/repeat** — hold a pad key or pointer for rapid-fire retriggering at 1/16 rate
- **Default 4-on-the-floor** pattern loads on startup
- **Sample editor** — waveform trim with draggable handles, auto-trim silence
- **Delete / edit / browse** icons on loaded pads

---

## Sample Slicer

Load any audio file and slice it across pads:
- **Equal slicing** — divide evenly into N slices (2-16)
- **Auto-chop** — transient detection finds natural slice points (energy-based onset detection with zero-crossing snap)
- **Sensitivity control** — tune how aggressively transients are detected
- Access via the **✂** button in the pad toolbar

---

## Kit Management

- **Save** current pad configuration as a named kit (stored in localStorage)
- **Export** kits as `.mloop-kit.json` files to share
- **Import** kit files to load into pads
- **Sound browser** (♫) — pick individual sounds from any built-in kit and mix across kits
- Saved kits appear in the kit dropdown alongside built-in presets

---

## Sound Browser

Browse all sounds from all 7 built-in kits in one panel:
- Click **♫** on any pad (empty or loaded) to open the browser
- Preview and select individual sounds from any kit
- Mix and match — put a Hip-Hop kick with a House hi-hat and an FX whistle

---

## Sample Presets

7 drum kits x 8 sounds each (56 sounds total), all synthesized via `OfflineAudioContext` — zero sample files:

| Kit | Sounds |
|---|---|
| **Default** | Kick, Snare, HH, Clap, Open HH, Rim, Tom, Cymbal |
| **Hip-Hop** | 808 Sub, Snare, HH, Open HH, Snap, Perc, Zap, Crash |
| **House** | Deep Kick, Rim, HH, Open HH, Clap, Shaker, Conga, Ride |
| **Lo-Fi** | Dusty Kick, Snare, Soft HH, Snap, Brush, Thud, Shaker, Chime |
| **Industrial** | Kick, Metal Snare, Anvil, Buzz, Glitch, Static, Boom, Zap |
| **Reggaeton** | Kick, Side Stick, Tick HH, Open HH, Clap, Clave, Bongo, Cowbell |
| **FX** | Uh, Ah, Breath, Whistle, Water Drop, Wood Knock, Wind, Cricket |

Select kits from the dropdown in PAD view. Default kit with 4-on-the-floor pattern loads automatically on first visit.

---

## Loop Station
- **Record / Overdub / Play / Stop** per track
- **Undo** last overdub layer
- **Reverse** and **half-speed** playback
- **3 sync modes**: FREE (independent), SYNC (phase-locked), LOCK (fixed time window)
- **Free-time** or **quantized** recording (snap to bar boundaries)
- **Metronome** with tap tempo
- **Latency compensation** (auto-trim based on measured input latency)
- **Destruction Mode** — progressive tape degradation per loop cycle
- **Sound DNA** — unique spectral fingerprint glyph per loop
- **->PAD** button to copy a track recording into a pad slot

---

## KAOS XY Pad
- Drag to control 2 effect parameters simultaneously
- 7 assignable targets: Cutoff, Resonance, Distortion, Highpass, Delay, Reverb, Volume
- Neon touch trails with audio-reactive visualizer
- Auto-enables effects when selected as XY target
- Effect chain with numbered badges, click chain to drag-reorder
- **Gesture Loops** — record XY movements as repeating automation

---

## Effects (9 total)
Low-Pass Filter . Compressor . High-Pass Filter . Distortion . Bitcrusher . Chorus . Phaser . Delay . Reverb

- **Per-track** independent effect chains
- **Master effects** via KAOS pad (applies to all tracks)
- Tap to toggle, long-press to edit parameters
- Drag-to-reorder effect chain
- Smooth parameter updates (no audio clicks)

---

## Gesture Loops
Record XY pad movements as automation that loops alongside your audio.
- **REC GESTURE** — records your finger/mouse movements on the XY pad
- **PLAY GESTURE** — loops the recorded movement in sync with audio, continuously automating effects
- Syncs to master loop length or defaults to 4 bars

---

## Destruction Mode
Progressive tape degradation — loops evolve over time instead of staying static.
- **DECAY slider** per track (0% = pristine digital, 100% = cassette-from-hell)
- Each loop cycle applies cumulative: bitcrush, noise floor rise, high-frequency roll-off

---

## Sessions & Export
- **Save / Load** sessions (IndexedDB — persists in browser)
- **Export / Import** full session as JSON file (system Save As dialog)
- **Export WAV** mixdown of all tracks
- **Import audio** files (drag & drop WAV/MP3/OGG onto tracks)
- **PIN** session (star) — auto-loads on next visit
- **Share** settings link — copies URL with encoded BPM, effects, sync mode
- **Recording limits** — configurable max time per track and max session size

---

## Link Bridge
Sync mloop with [mpump](https://github.com/gdamdam/mpump) via localhost:19876:
- Tempo sync — mloop follows mpump's BPM
- Enable with the **LINK** button in the header

---

## Themes
12 color themes (6 dark, 6 light):
- **Dark**: Midnight, Neon, Forest, Ember, Cobalt, Violet
- **Light**: Cream (default daytime), Minimal, Artic, Sand, Rose, Slate

Logo click: 1x = random theme, 2x = toggle beat pulse, 3x = help.

---

## Keyboard Shortcuts

### Looper Mode

| Key | Action |
|---|---|
| `1` `2` `3` | Record track 1/2/3 |
| `Q` `W` `E` | Play track 1/2/3 |
| `A` `S` `D` | Mute track 1/2/3 |
| `Z` `X` `C` | Clear track 1/2/3 |
| `Shift+1/2/3` | Overdub track 1/2/3 |
| `Space` | Stop all |
| `P` | Play all |
| `M` | Metronome toggle |
| `T` | Tap tempo |
| `R` | Reverse track 1 |
| `H` | Half-speed track 1 |
| `?` | Show shortcuts |

### PAD Mode — Finger Drumming

| Keys | Pads |
|---|---|
| `7` `8` `9` `0` | Pads 13-16 (top row) |
| `U` `I` `O` `P` | Pads 9-12 |
| `J` `K` `L` `;` | Pads 5-8 |
| `M` `,` `.` `/` | Pads 1-4 (bottom row) |

The keyboard grid mirrors the 4x4 pad layout — bottom-left key = bottom-left pad.

---

## Controls
- **Keyboard shortcuts** (press `?` to see all)
- **MIDI controller mapping** with learn mode (Chrome/Edge)
- **Fullscreen** mode
- **Auto-update check** — notifies when new version is available

---

## Tech Stack

- **React 19** + **TypeScript** + **Vite 8**
- **Web Audio API** — all synthesis and effects in-browser
- **AudioWorklet** — sample-accurate recording (ScriptProcessorNode fallback)
- **Zero runtime dependencies** beyond React
- **~348KB** production bundle (gzipped ~100KB)

---

## Development

```bash
npm install
npm run dev      # dev server at localhost:5173
npm run build    # production build
npm run test     # run tests
npm run deploy   # build + deploy to GitHub Pages
```

## License

[GPL-3.0](LICENSE)
