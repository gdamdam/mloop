<h1 align="center">mloop</h1>
<p align="center">Browser-based loop station & MPC-style sampler.<br>Record, layer, slice, sequence, perform — no install, no subscription, no account.</p>

<p align="center">
  <a href="https://github.com/gdamdam/mloop"><img src="https://img.shields.io/badge/version-1.0.0--pre.40-blue" alt="Version"></a>
  <a href="https://github.com/gdamdam/mloop/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-green" alt="License"></a>
  <a href="https://claude.ai/code"><img src="https://img.shields.io/badge/Built%20with-Claude%20Code-blueviolet?logo=anthropic&logoColor=white" alt="Built with Claude Code"></a>
  <br>
  <a href="https://mloop.mpump.live/">https://mloop.mpump.live/</a>
</p>

---

Open **[mloop](https://mloop.mpump.live/)** and start making music — no MIDI device required. 16-pad sampler with step sequencer, 3 loop tracks with overdub, 9 real-time effects, KAOS XY pad, 7 synthesized drum kits (56 sounds), sample slicer, mic recording, and Link Bridge sync — all in the browser via Web Audio API.

Companion to [mpump](https://mpump.live) — the browser-based drum machine & synth sequencer.

## Two Modes

| Mode | Description |
|---|---|
| **PAD** (default) | 4x4 MPC-style sample pads, step sequencer (8/16/32/64 steps), sample slicer, chromatic mode, resample, 7 built-in drum kits, keyboard finger drumming |
| **LOOPER** | 3 independent loop tracks with record, overdub, undo, reverse, half-speed, KAOS XY pad with master effects |

---

## Sample Pads & Sequencer

- **16 pads** — tap empty to record from mic, tap loaded to play
- **7 built-in kits** — all synthesized via `OfflineAudioContext`, zero sample files
- **Step sequencer** — 8/16/32/64 steps, swing, random pattern generator
- **Per-pad controls** — volume, pan, pitch (±12 semitones), trim, play mode (ONE/GATE/LOOP)
- **Mute groups** (choke) — assign pads to groups 1-4
- **Drag & drop** — rearrange pads, drop onto sequencer
- **Pad detail panel** — waveform trim, editable name, all controls
- **Roll/repeat** — hold for rapid-fire retriggering
- **URL import** — paste a link to load a sample from any URL

---

## Sample Slicer

- **Equal slicing** — divide evenly into N slices (2-16)
- **Auto-chop** — transient detection with sensitivity control
- Access via **✂** in the pad toolbar

---

## Kits & Sounds

7 drum kits × 8 sounds (56 total), all synthesized — zero sample files:

| Kit | Sounds |
|---|---|
| **Default** | Kick, Snare, HH, Clap, Open HH, Rim, Tom, Cymbal |
| **Hip-Hop** | 808 Sub, Snare, HH, Open HH, Snap, Perc, Zap, Crash |
| **House** | Deep Kick, Rim, HH, Open HH, Clap, Shaker, Conga, Ride |
| **Lo-Fi** | Dusty Kick, Snare, Soft HH, Snap, Brush, Thud, Shaker, Chime |
| **Industrial** | Kick, Metal Snare, Anvil, Buzz, Glitch, Static, Boom, Zap |
| **Reggaeton** | Kick, Side Stick, Tick HH, Open HH, Clap, Clave, Bongo, Cowbell |
| **FX** | Uh, Ah, Breath, Whistle, Water Drop, Wood Knock, Wind, Cricket |

Save, export, import custom kits. Sound browser lets you mix sounds across kits.

---

## Scratchpad Recorder

Quick sampling strip in PAD mode:
- **MIC** — record from microphone
- **RESAMPLE** — capture master output
- **DUB** — mic + master combined
- Auto-trim silence, drag onto any pad, configurable count-in

---

## Loop Station

- **Record / Overdub / Play / Stop** per track
- **Undo** last overdub layer
- **Reverse** and **half-speed** playback
- **3 sync modes** — FREE, SYNC (phase-locked), LOCK (fixed time window)
- **Metronome** with tap tempo
- **Destruction Mode** — progressive tape degradation per loop cycle
- **Master record** — capture full output as WAV with live timer
- **Tape reel animation** — spinning reels with color states
- **Analog needle VU meter** — input (idle), output (playing), red (recording)
- **Audio input selector** — choose mic/line-in device
- **Low signal detection** with auto-gain option

---

## KAOS XY Pad

- 7 assignable targets: Cutoff, Resonance, Distortion, Highpass, Delay, Reverb, Volume
- Neon touch trails with audio-reactive visualizer
- **Gesture Loops** — record and loop XY movements as automation
- Drag-to-reorder effect chain

---

## Effects (9 total)

Low-Pass · Compressor · High-Pass · Distortion · Bitcrusher · Chorus · Phaser · Delay · Reverb

Per-track independent chains + master effects via KAOS pad. Smooth parameter updates.

---

## Sessions & Export

- **Save / Load** sessions (IndexedDB)
- **Export / Import** session as JSON
- **Export WAV** mixdown with metadata (title, software, date)
- **Import audio** files (drag & drop)
- **PIN** session — auto-loads on next visit
- **Share** settings link

---

## Link Bridge

Sync with [mpump](https://mpump.live) via Link Bridge:
- **BPM sync** — bidirectional, changes push both ways
- **Play/stop sync** — play in one app, the other follows
- Enable with the **L** button in the header
- Both apps must be on the same computer with Link Bridge running

---

## Themes

12 color themes (6 dark, 6 light):
- **Dark**: Midnight, Neon, Forest, Ember, Cobalt, Violet
- **Light**: Minimal, Cream, Artic, Sand, Rose, Slate
- Default: Sand (day), Forest (night)

Logo click: 1× random theme, 2× beat pulse, 3× credits

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
| `Space` | Play/Stop all |
| `M` | Metronome |
| `T` | Tap tempo |
| `?` | Show shortcuts |

### PAD Mode — Finger Drumming

| Keys | Pads |
|---|---|
| `7` `8` `9` `0` | Pads 13-16 (top row) |
| `U` `I` `O` `P` | Pads 9-12 |
| `J` `K` `L` `;` | Pads 5-8 |
| `M` `,` `.` `/` | Pads 1-4 (bottom row) |

### Global

| Key | Action |
|---|---|
| `⌘/Ctrl+Z` | Undo |
| `⌘/Ctrl+S` | Save session |

---

## Tech Stack

- **React 19** + **TypeScript** + **Vite 8**
- **Web Audio API** — all synthesis and effects in-browser
- **AudioWorklet** — sample-accurate recording (ScriptProcessorNode fallback for Firefox)
- **Zero runtime dependencies** beyond React
- **~413KB** production bundle (gzipped ~119KB)
- **PWA** — works offline via service worker

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

[GPL-3.0](LICENSE) with Commons Clause (no commercial use) and attribution requirement.
