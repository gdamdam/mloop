# Changelog

All notable changes to mloop. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project tries to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.5] — 2026-07-22

### Fixed
- **Vendored mbus client re-synced from canonical** — the WebRTC receiver now pins its jitter buffer to the minimum (`jitterBufferTarget` / legacy `playoutDelayHint` → 0) on `ontrack`. The localhost/LAN path has ~no jitter to absorb, so the browser's default adaptive buffer was pure latency that made mixed-back audio lag the source. (Supersedes 1.4.4, which shipped the sync without the required CHANGELOG/README-badge bump and failed the version-sync check.)

## [1.4.3] — 2026-07-13

### Fixed
- **Quantized mode now aligns recording START to the bar grid.** `recordTrack` started recording immediately and only the loop *length* was later snapped (`quantizeToBar`), so a loop begun mid-bar stayed offset from the grid forever. In quantized mode with the clock already running, the start is now deferred to `getNextBarBoundary()` (scheduled on the audio clock, same silent-source idiom as the auto-stop). When the record tap itself starts the metronome, "now" is the grid origin and recording begins immediately, as before. A stop tap during the count-in cancels the pending start.
- **Recorder worklet no longer allocates on the audio thread while recording.** `process()` allocated a fresh ~880 KB `Float32Array` every ~5 s of recording (and retained all chunks until stop), causing GC pressure on the audio render thread (audible underrun click on long takes). Filled chunks are now transferred to the main thread as they fill, which sends a same-size buffer back for reuse — steady-state recording performs zero audio-thread allocations. Final assembly also moved off the audio thread.
- **Vendored mbus client re-synced from canonical** (reconnect/ICE/stale-peer-connection/media-leak fixes): subscription intent survives connection drops as `connecting`; `failed` is terminal-only.
- README version badge (stuck at 1.4.1) synced with `package.json`.

## [1.4.2] — 2026-07-12

### Fixed
- **Master recording no longer throws on Safari.** `startMasterRecord` hardcoded `mimeType: "audio/webm"`, which Safari's MediaRecorder rejects with `NotSupportedError`. The container is now negotiated via `MediaRecorder.isTypeSupported` (webm → mp4 → browser default), and the raw-blob fallback returned when WAV encoding fails is labelled with the container that was actually recorded instead of always `audio/webm`.

## [1.4.1] — 2026-07-09

### Fixed
- **First-loop length no longer includes a trailing silent gap.** Latency compensation trimmed the leading samples of the first recording but left `loopLengthSamples` at the raw length, so the master loop everyone conforms to ran ~20–40 ms long with a silent tail. The loop length now uses the compensated length.
- **Undo after "load chromatic" reverts all 16 pads.** `loadChromatic` snapshotted undo on each of its 16 imports, so the saved state already had 15 pads overwritten and undo only restored the last. It now snapshots once before loading.
- **Chromatic pad labels are root-relative.** The note name is now computed from the semitone offset (pad 7 = root), instead of the pad index, which mislabeled the root pad.
- **Instrument voices disconnect on natural end.** Classic (repitch) instrument voices now release their gain/panner nodes when the one-shot finishes, not only on note-off, avoiding an accumulation of nodes wired to the master bus.
- **Session listing survives a malformed record.** `listSessions` no longer throws (taking down the whole list) when a stored session is missing its `tracks`/`slots` arrays.

## [1.4.0] — 2026-07-09

### Added
- **Warp engine (granular time-stretch + pitch-shift).** New opt-in per-pad `warp` mode decouples pitch from time via a granular windowed overlap-add core (`WarpCore`) running in a real-time `warp-worklet` (with a ScriptProcessorNode fallback). A pad can stretch its clip to the session tempo (`syncToTempo` + `nativeBeats`) with pitch held constant, or shift pitch without changing length. Off by default — existing sessions are byte-identical to before (the classic `playbackRate` path is untouched).
- **Chromatic instrument mode.** Turn a pad into a polyphonic, playable multisample instrument across QWERTY + MIDI: per-key semitone offset from a selectable root, scale-lock (snap-to-nearest or mute out-of-scale), an 8-voice cap with oldest-voice stealing, and a **Keep Tempo** (warp) vs **Classic** (repitch) toggle.
- **Vendored DSP.** Grain window, RNG, stereo circular buffer, grain filter, and the scale masks / snap-to-scale are vendored verbatim from the sibling project [mgrains](https://github.com/gdamdam/mgrains) (same author, AGPL-3.0-or-later) under `src/vendor/mgrains-dsp/`, with their upstream tests brought along.

## [1.3.5] — 2026-07-08

### Added
- **Measured latency readout.** Settings → Info now shows an honest round-trip estimate (`≈ N ms`, `baseLatency + outputLatency`) read live from the AudioContext, with a tooltip noting it is the browser floor and not app-reducible. README gains a **Latency & live use** note.

## [1.3.4] — 2026-07-07

### Fixed
- **mbus subscription no longer shows a false 'live' badge.** The vendored mbus client (synced from upstream mbus-client 0.2.0) now reports a subscription 'live' only once the RTCPeerConnection reaches `connectionState` 'connected', instead of at ontrack/SDP time — ICE can still fail after the track arrives, and the premature badge hid exactly that failure.

## [1.3.3] — 2026-07-07

### Changed
- **Maintenance release.** Documentation polish and version bump; no functional changes.

## [1.3.2] — 2026-07-07

### Fixed
- **Version drift.** The in-app version (footer, About, update check) had been stuck at 1.2.0 and the README badge at 1.1.3 since those releases only bumped package.json.

### Changed
- **Version is now derived at build time.** `APP_VERSION` and `version.json` are injected/emitted from package.json by the Vite config, so they can no longer drift; a test guards the remaining manual points (README badge, this changelog).

## [1.3.1] — 2026-07-06

### Added
- **mbus input.** Settings → Audio Input gains a Mic / mbus source toggle: selecting mbus subscribes to another m-suite tab's published output over the local link-bridge (WebRTC, peer-to-peer) and feeds it into the record path in place of the mic; a small picker lists advertised sources. The client (vendored verbatim from the sibling mbus project under `src/transport/mbus/`) is created lazily on first selection — no client, no socket, and zero behavior change while the mic input is in use or the bridge is absent. Nothing is persisted.

## [1.3.0] — 2026-07-01

_Backfilled entry — this release shipped without a changelog note._

### Added
- **Shared-phase Link starts.** Link state is stamped in the audio clock domain with beat/phase projection: pad step 0 anchors to the next shared bar, existing loops start at the correct shared-phase offset, and joining an already-playing session waits for the next bar without re-sending Play. Remote start/stop is followed with an echo guard + voice flush; drift correction is forward-only skip (no catch-up).

## [1.2.0] — 2026-06-09

Correctness pass from a full engine review: loop-length conformance, overdub alignment, sync math, and lifecycle/resource fixes. Saved sessions gain an optional `layerVolumes` field; older sessions still load.

### Fixed
- **Quantized/LOCK loop lengths no longer corrupt the mix.** Snapping the loop length after recording left layers shorter than the loop; the next rebuild (overdub/reverse/undo) read past the layer end and filled the buffer with NaN, which could permanently silence the master chain. Layers are now re-padded/truncated via `LoopTrack.setLoopLength()` and playback restarts on the snapped buffer (no more drift against the metronome).
- **Overdubs land where you played them.** Overdubs started mid-loop were written at buffer position 0, rotating the layer by the start phase; playback also jumped back to the loop start when the overdub ended. The layer is now rotated to the captured playhead phase and playback resumes from the current position.
- **Recording limits are actually enforced.** The configured max recording time now auto-stops free-length track recordings (audio-clock accurate) and pad recordings; previously only the settings UI read the limits and a forgotten recording grew until the tab ran out of memory.
- **`playAll` keeps later tracks in phase.** The master clock is anchored at the offset tracks actually start at, so a track started later in SYNC/LOCK no longer joins misaligned.
- **Default drum kit can't overwrite a restored session.** The kit loader re-checks pad/grid content after its async gap, closing the race with the pinned-session autoload.
- **Recorder worklet processors terminate after stop** instead of running on the audio thread forever (one leak per recording).
- **Modifier chords are no longer bare-key shortcuts.** Cmd+R reversed a track (and blocked reload), Ctrl+C cleared one; Cmd/Ctrl+Z and Cmd/Ctrl+S keep working.
- **Pad count-in re-taps are guarded.** A second tap during count-in spawned a second recorder, leaking the first and sticking the slot on "recording"; `cancelCountIn` also resets the armed slot now.
- **Resample decode failures reset state** instead of leaving `isResampling` stuck true.
- **Mic is released when unmounting during init** — the cleanup path now runs the full `shutdown()` instead of only closing the AudioContext.
- **Session restore applies reverse before the rebuild** (audio matched the UI only after the next rebuild before) and **per-layer volumes round-trip** through both IndexedDB and JSON sessions instead of resetting to 1.
- **Racing stop calls** (manual stop vs auto-stop) no longer transiently flag a track "empty"; `getNextBarBoundary` now computes from the beat grid instead of wall-clock now.
- **Master recording reuses one capture node** instead of connecting a fresh `MediaStreamAudioDestinationNode` to the analyser per recording.

### Added
- **27 new tests** covering quantize conformance, overdub rotation/resume, the stop race, recording caps, playAll anchoring, master-record node reuse, worklet lifecycle, modifier-chord shortcuts, pad arming/resample failure, unmount-during-init shutdown, persistence round-trips, and bar-boundary math.

## [1.0.1] — 2026-05-31

Reliability pass from a full code review: error handling, lifecycle teardown, and audio-clock race fixes. No public API breaks.

### Fixed
- **Audio import no longer fails silently.** `FileImport` and `SampleSlicer` now catch `decodeAudioData` errors and surface them (new optional `onError` prop / inline message) instead of throwing an unhandled rejection. The file picker also filters by audio MIME type, matching the drag-and-drop path.
- **`AudioEngine` is now torn down on unmount.** `useLoopEngine` calls `engine.shutdown()` in its unmount cleanup; `shutdown()` is idempotent and removes the document resume-event listeners that previously leaked for the page lifetime.
- **MIDI handlers are detached on teardown.** New `MidiController.dispose()` nulls `onstatechange` and every input's `onmidimessage`; `useMidiMapping` calls it on cleanup, so a disabled/replaced controller stops firing stale callbacks.
- **Keyboard undo no longer uses a stale callback.** `useKeyboardShortcuts` reads `onUndo`/`onSpaceBar` through refs (updated in an effect), so the latest handler always fires without re-binding the listener.
- **Destruction-cycle race.** `LoopTrack` cancels the pending loop-boundary `onended` on stop, so a late callback can no longer overwrite/resurrect the active source after playback stops.
- **Double `Recorder.stop()`** is now a no-op that doesn't orphan the first promise or stack a second safety timeout.
- **Defensive `disconnect()`/`close()`.** Remaining unguarded `AudioNode.disconnect()` and `ctx.close()` calls (`switchDevice`, `rebuildFxChain`) are wrapped in try/catch — Safari/Firefox throw on already-disconnected nodes or closed contexts.

### Changed
- **Build splits the React runtime into a cacheable `vendor` chunk** (Vite `manualChunks`), so app-code deploys don't invalidate the vendor bundle.

### Added
- **19 new tests** covering engine teardown/idempotency, the destruction-cycle and double-stop races, throwing-disconnect non-propagation, `MidiController.dispose()`, the keyboard-undo ref fix, and the audio-import error paths.

## [0.2.0] — 2026-04-08

Fixes verified persistence gaps around PAD-mode and session round-tripping.

### Added
- **PAD-mode session persistence.** `PadEngine` gains `getSnapshot()` / `loadSnapshot()` and a narrow `PadPersistencePort` interface. Full PAD workspace (all 16 slots with buffers, per-pad settings, sequencer grid, step count, swing) now round-trips through every persistence surface.
- **Shared `applySessionData` applier.** Pinned autoload and regular "load session" now use one code path, so there is no way for one to quietly diverge from the other.
- **13 new persistence tests** covering `serializeSessionData` / `serializeSessionExport` / `applySessionData` / `applySessionExport` / `handleSaveSession` / `handleLoadSession` / pad-snapshot converters.
- **`src/hooks/useLoopEngine.ts`** now owns the `PadEngine` instance (was previously created ad-hoc in `Layout`). This closes the structural gap that kept persistence out of PAD state.

### Changed
- **`SessionData`** (IndexedDB shape) gains optional `syncMode` and `pad` fields. Missing fields default safely so legacy sessions keep loading.
- **`SessionExport`** (JSON `.mloop-session.json`) gains version bump to `2` when a pad section is present; version `1` files still load.
- **Regular save/load now round-trips `syncMode`** — previously dropped.
- **Pinned autoload** now restores everything that regular load restores: `syncMode`, `isReversed`, `playbackRate`, and the PAD workspace — not just looper layers/BPM/volume.
- **`runLoopCommand` signature**: `(engine, padEngine, cmd)`. All persistence commands thread through both engines.
- **Layout no longer creates its own `PadEngine`.** It receives one as a prop from `useLoopEngine` and only mirrors it into the local rAF-poll ref.

### Backwards compatibility
- Sessions saved by v0.1.0 (no `syncMode`, no `pad`) still load. `syncMode` is left at the current engine value; the pad workspace is left untouched so the user's current pads / default kit survive.
- JSON exports emitted by v0.1.0 (`version: 1`, no `pad`) still load.

### Fixed
- Pinned autoload used to silently drop `syncMode`, `isReversed`, and `playbackRate` on restore.
- PAD workspace (samples, pad settings, sequencer grid) was never persisted — a fresh visit always booted the default kit and lost any user-loaded samples.

## [0.1.0] — 2026-04-08

First public release on the new versioning line. Resets the version after a full parity pass against the mpump companion project (P0–P4 of `misc/OPUS-REPORT.md`).

### Added
- **Documentation structure mirrors mpump.** `docs/BUILD.md`, `docs/DEPLOY.md`, `docs/TROUBLESHOOTING.md`, `docs/PWA.md`, `docs/LINK-BRIDGE.md`, plus a tracked `CONTRIBUTING.md`. Local-only engineering notes under `misc/` (gitignored).
- **CI workflow** (`.github/workflows/ci.yml`): lint + vitest + build on every PR and push to `main`.
- **Central configuration module** (`src/config.ts`) — `APP_VERSION`, `NUM_TRACKS`, timing constants, storage keys. Single source of truth for values that used to be scattered across components.
- **Reverb type picker** in the Effects sheet — choose between `room`, `hall`, `plate`, and `spring` impulse responses, wired to the new algorithmic IR generator.
- **Accessibility pass** on the track strip: `role="group"`, `aria-label`, and `aria-pressed` on every transport button.
- **Shared-core barrel** (`src/shared/index.ts`) documenting the extraction target (EffectsChain, DestructionEngine, GestureRecorder, WAV encoder, share-link codec, mixBuffers, ReverbType) for a future `@mpump/audio-core` split.
- **Reducer and TrackStrip unit tests** with `@testing-library/react` — 14 new cases.

### Changed
- **Effects chain ported in-depth from mpump's `AudioPort.ts` + `drumSynth.ts`:**
  - Distortion curve: 1024 samples with an asymmetric tube term for even-harmonic warmth.
  - Bitcrusher curve: 65536 samples plus pre/post gain compensation so perceived level stays stable at low bit depths.
  - Reverb: full algorithmic impulse response (early reflections → diffuse tail → Schroeder allpass diffusion → DC block) with `room` / `hall` / `plate` / `spring` presets. IR is cached on decay+type. New gain staging (`dry = 1 - mix*0.5`, `wet = mix * 1.5`) gives the wet signal proper presence.
  - Chorus: 3-voice (L / center / R) with per-voice LFO offsets and ~20% stereo feedback.
  - Phaser: 6 allpass stages at 200 / 450 / 1000 / 2200 / 4800 / 10000 Hz with LFO depth scaled to 30% of each stage's centre frequency.
- **`useLoopEngine` split.** The hook shrank from ~495 lines to ~134 lines. The pure reducer moved to `src/hooks/loopEngineReducer.ts` (testable without `AudioContext`), and the async command runner moved to `src/hooks/loopEngineCommands.ts`. The remaining hook body is just React wiring.
- **Unmount guards** around every optimistic state sync. Late-arriving engine operations can no longer dispatch after the hook has been torn down, and an `AudioContext` created mid-init is properly closed if the component unmounts during `initMic`.
- **Package metadata.** Dropped `private: true` and added a `description` + `license` field so the manifest matches mpump.
- **README cross-link.** Added a companion badge and expanded the mpump paragraph to mention the shared DSP and Link Bridge handshake.
- **Service worker** cache bumped to `mloop-v6` for the 1.0 asset set.

### Fixed
- Long-standing flake in `DestructionEngine.test.ts` (`progressive degradation increases with more cycles`). The test compared two RNG-driven buffers of 50 samples each; the intensity ramp was smaller than the per-sample variance, so ~1 run in 5 failed. Buffer is now 4096 samples, so the deterministic ramp dominates. Verified 5/5 clean runs.
- Stale hardcoded version strings (`1.0.0-pre.62`) in `AboutModal`, `AppFooter`, `Layout`, and `StartGate`. All now import `APP_VERSION` from `src/config.ts`.
