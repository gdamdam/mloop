# Changelog

All notable changes to mloop. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project tries to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-04-08

First stable release. Drops the `-pre` suffix after a full parity pass against the mpump companion project (P0–P4 of `misc/OPUS-REPORT.md`).

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
