# Troubleshooting

## No sound on first load
The browser suspends `AudioContext` until a user gesture. Click anywhere or press a transport key to resume it. On mobile, backgrounding the tab also suspends it — there's a 5s resume poll (see `RESUME_INTERVAL_MS` in `src/config.ts`).

## Mic permission denied
Chrome requires HTTPS for `getUserMedia`. If you're on `http://` (non-localhost), the browser silently blocks the mic. Serve over HTTPS or use `localhost`.

## Effects cause audible clicks
Toggling an effect rebuilds the audio graph. The rebuild disconnects and reconnects nodes; on some browsers a micro-glitch is audible. Parameter tweaks (knob drags) use `setTargetAtTime` ramping and should stay smooth. If you hear zipper noise during a knob drag, the effect probably falls through to `rebuildFxChain` — check `updateLiveParams` in `src/engine/EffectsChain.ts`.

## Session won't load
Sessions are stored in `localStorage` under keys prefixed `mloop.` (see `STORAGE_KEYS` in `src/config.ts`). If the browser has cleared site data or storage quota is exhausted, load silently fails. Export important sessions to `.mloop.json` files via the session menu.

## Link Bridge not syncing
mloop talks to the Tauri `link-bridge` over WebSocket on `ws://127.0.0.1:20808`. If the bridge isn't running, tempo sync is disabled and the UI falls back to internal clock. Start `link-bridge` from the mpump repo.

## Build fails with TS errors
Run `npm run build` locally. `tsc -b` is strict; the CI mirrors it. Fix types rather than loosening `tsconfig.json`.
