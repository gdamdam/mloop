<h1 align="center">mloop</h1>
<p align="center">Browser-based loop station & sample pad.<br>Record, layer, perform with real-time effects — no install, no subscription, no account.</p>

<p align="center">
  <a href="https://github.com/gdamdam/mloop"><img src="https://img.shields.io/badge/version-0.9.2-blue" alt="Version"></a>
  <a href="https://github.com/gdamdam/mloop/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-green" alt="License"></a>
  <a href="https://claude.ai/code"><img src="https://img.shields.io/badge/Built%20with-Claude%20Code-blueviolet?logo=anthropic&logoColor=white" alt="Built with Claude Code"></a>
  <br>
  <a href="https://mloop.mpump.live/">https://mloop.mpump.live/</a>
</p>

---

Open **[mloop](https://mloop.mpump.live/)** and start looping immediately — no MIDI device required. Built-in mic recording, 9 real-time effects, KAOS XY pad, 16-pad sampler with step sequencer, and 7 synthesized drum kits — all running in the browser via Web Audio API.

Companion to [mpump](https://github.com/gdamdam/mpump) — the browser-based drum machine & synth sequencer.

## Table of Contents

- [Features](#features)
- [Sample Presets](#sample-presets)
- [KAOS XY Pad](#kaos-xy-pad)
- [Effects](#effects-9-total)
- [Sample Pads & Sequencer](#sample-pads--sequencer)
- [Gesture Loops](#gesture-loops)
- [Destruction Mode](#destruction-mode)
- [Sessions & Export](#sessions--export)
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
| **PAD** (default) | 4×4 MPC-style sample pads with step sequencer (8/16/32/64 steps). 7 built-in drum kits. Record samples from mic, play one-shot, trim & edit. |
| **LOOPER** | 3 independent loop tracks with record, overdub, undo, reverse, half-speed. Centered KAOS XY pad with master effects. |

### Loop Station
- **Record / Overdub / Play / Stop** per track
- **Undo** last overdub layer
- **Reverse** and **half-speed** playback
- **3 sync modes**: FREE (independent), SYNC (phase-locked), LOCK (fixed time window)
- **Free-time** or **quantized** recording (snap to bar boundaries)
- **Metronome** with tap tempo
- **Latency compensation** (auto-trim based on measured input latency)
- **Destruction Mode** — progressive tape degradation per loop cycle
- **Sound DNA** — unique spectral fingerprint glyph per loop
- **→PAD** button to copy a track recording into a pad slot

---

## Sample Presets

7 drum kits × 8 sounds each (56 sounds total), all synthesized via `OfflineAudioContext` — zero sample files:

| Kit | Sounds |
|---|---|
| **Default** | Kick, Snare, HH, Clap, Open HH, Rim, Tom, Cymbal |
| **Hip-Hop** | 808 Sub, Snare, HH, Open HH, Snap, Perc, Zap, Crash |
| **House** | Deep Kick, Rim, HH, Open HH, Clap, Shaker, Conga, Ride |
| **Lo-Fi** | Dusty Kick, Snare, Soft HH, Snap, Brush, Thud, Shaker, Chime |
| **Industrial** | Kick, Metal Snare, Anvil, Buzz, Glitch, Static, Boom, Zap |
| **Reggaeton** | Kick, Side Stick, Tick HH, Open HH, Clap, Clave, Bongo, Cowbell |
| **FX** | Uh, Ah, Breath, Whistle, Water Drop, Wood Knock, Wind, Cricket |

Select kits from the dropdown in PAD view. Default kit loads automatically on first visit.

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
Low-Pass Filter · Compressor · High-Pass Filter · Distortion · Bitcrusher · Chorus · Phaser · Delay · Reverb

- **Per-track** independent effect chains
- **Master effects** via KAOS pad (applies to all tracks)
- Tap to toggle, long-press to edit parameters
- Drag-to-reorder effect chain
- Smooth parameter updates (no audio clicks)

---

## Sample Pads & Sequencer
- **16 pads** — tap empty to record, tap loaded to play
- **7 built-in kits** — select from dropdown, all synthesized
- **Step sequencer** — 8/16/32/64 steps, multiple pads per step
- **Drag & drop** pads onto sequencer steps
- **Sample editor** — waveform trim with draggable handles
- **Delete / edit** icons on loaded pads
- Auto-stop recording when tapping another pad

---

## Gesture Loops
Record XY pad movements as automation that loops alongside your audio.
- **● REC GESTURE** — records your finger/mouse movements on the XY pad
- **▶ PLAY GESTURE** — loops the recorded movement in sync with audio, continuously automating effects
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
- **PIN** session (★) — auto-loads on next visit
- **Share** settings link (⤴) — copies URL with encoded BPM, effects, sync mode
- **Recording limits** — configurable max time per track and max session size

---

## Themes
12 color themes (6 dark, 6 light):
- **Dark**: Midnight, Neon, Forest, Ember, Cobalt, Violet
- **Light**: Cream (default daytime), Minimal, Artic, Sand, Rosé, Slate

Logo click: 1× = random theme, 2× = toggle beat pulse, 3× = help.

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `1` `2` `3` | Record track 1/2/3 |
| `Q` `W` `E` | Play track 1/2/3 |
| `A` `S` `D` | Mute track 1/2/3 |
| `Z` `X` `C` | Clear track 1/2/3 |
| `Shift+1/2/3` | Overdub track 1/2/3 |
| `Space` | Stop recording / Stop all |
| `P` | Play all |
| `M` | Metronome toggle |
| `T` | Tap tempo |
| `R` | Reverse track 1 |
| `H` | Half-speed track 1 |
| `?` | Show shortcuts |

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
- **~318KB** production bundle (gzipped ~92KB)
- **84 unit tests** (vitest)

---

## Development

```bash
npm install
npm run dev      # dev server at localhost:5173
npm run build    # production build
npm run test     # run 84 tests
npm run deploy   # build + deploy to GitHub Pages
```

## License

[GPL-3.0](LICENSE)
