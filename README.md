<h1 align="center">mloop</h1>
<p align="center">Browser-based loop station & sample pad.<br>Record, layer, perform with real-time effects — no install, no subscription, no account.</p>

<p align="center">
  <a href="https://github.com/gdamdam/mloop"><img src="https://img.shields.io/badge/version-0.4.0-blue" alt="Version"></a>
  <a href="https://github.com/gdamdam/mloop/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-green" alt="License"></a>
  <a href="https://claude.ai/code"><img src="https://img.shields.io/badge/Built%20with-Claude%20Code-blueviolet?logo=anthropic&logoColor=white" alt="Built with Claude Code"></a>
  <br>
  <a href="https://gdamdam.github.io/mloop/">https://gdamdam.github.io/mloop/</a>
</p>

---

Open **[mloop](https://gdamdam.github.io/mloop/)** and start looping immediately — no MIDI device required. Built-in mic recording, 9 real-time effects, KAOS XY pad, and 16-pad sampler with step sequencer — all running in the browser via Web Audio API.

Companion to [mpump](https://github.com/gdamdam/mpump) — the browser-based drum machine & synth sequencer.

## Features

### Two Modes

| Mode | Description |
|---|---|
| **3-TRACK** | 3 independent loop tracks with record, overdub, undo, reverse, half-speed. Centered KAOS XY pad with master effects. |
| **PAD** | 4×4 MPC-style sample pads with step sequencer (8/16/32/64 steps). Record samples from mic, play one-shot, trim & edit. |

### Loop Station
- **Record / Overdub / Play / Stop** per track
- **Undo** last overdub layer
- **Reverse** and **half-speed** playback
- **3 sync modes**: FREE (independent), SYNC (phase-locked), LOCK (fixed time window)
- **Free-time** or **quantized** recording (snap to bar boundaries)
- **Metronome** with tap tempo
- **Latency compensation** (auto-trim based on measured input latency)

### KAOS XY Pad
- Drag to control 2 effect parameters simultaneously
- 7 assignable targets: Cutoff, Resonance, Distortion, Highpass, Delay, Reverb, Volume
- Neon touch trails with audio-reactive visualizer
- Auto-enables effects when selected as XY target

### Effects (9 total)
Low-Pass Filter · Compressor · High-Pass Filter · Distortion · Bitcrusher · Chorus · Phaser · Delay · Reverb

- **Per-track** independent effect chains
- **Master effects** via KAOS pad (applies to all tracks)
- Tap to toggle, long-press to edit parameters
- Drag-to-reorder effect chain
- Smooth parameter updates (no audio clicks)

### Sample Pads
- **16 pads** — tap empty to record, tap loaded to play
- **Step sequencer** — 8/16/32/64 steps, multiple pads per step
- **Drag & drop** pads onto sequencer steps
- **Sample editor** — waveform trim with draggable handles
- **Delete / edit** icons on loaded pads
- Auto-stop recording when tapping another pad

### Sessions & Export
- **Save / Load** sessions (IndexedDB — persists in browser)
- **Export WAV** mixdown of all tracks
- **Import audio** files (drag & drop WAV/MP3/OGG onto tracks)

### Themes
12 color themes ported from mpump:
- **Dark**: Midnight, Neon, Forest, Ember, Cobalt, Violet
- **Light**: Minimal, Cream, Artic, Sand, Rosé, Slate

### Controls
- **Keyboard shortcuts** (press `?` to see all)
- **MIDI controller mapping** with learn mode (Chrome/Edge)
- **Fullscreen** mode
- **PWA** — works offline, add to home screen

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

## Tech Stack

- **React 19** + **TypeScript** + **Vite**
- **Web Audio API** — all synthesis and effects in-browser
- **AudioWorklet** — sample-accurate recording
- **Zero runtime dependencies** beyond React
- **~280KB** production bundle (gzipped ~84KB)

## Development

```bash
npm install
npm run dev      # dev server at localhost:5173
npm run build    # production build
npm run deploy   # build + deploy to GitHub Pages
```

## License

[GPL-3.0](LICENSE)
