# Link Bridge

mloop consumes the [mpump Ableton Link bridge](https://github.com/gdamdam/mpump) — a small Tauri desktop app that speaks the Ableton Link protocol on the local network and re-exposes it over WebSocket so browser apps can sync tempo with hardware and DAWs.

**mpump is read-only from mloop's perspective — the bridge lives in the mpump repo and is shared, not forked.**

## Handshake

1. User launches the `link-bridge` Tauri app (from the mpump repo). It starts a WebSocket server on `ws://127.0.0.1:20808`.
2. mloop's `useLinkBridge` hook attempts to connect on startup. If the socket is absent, mloop silently falls back to its internal clock — Link sync is opt-in.
3. On open, the bridge sends a JSON hello frame with peer count and current session tempo.
4. The bridge then streams state updates whenever the local Link session changes:
   ```json
   { "type": "tempo", "bpm": 128.0 }
   { "type": "peers", "count": 2 }
   { "type": "beat", "time": 12345.678, "phase": 0.25 }
   ```
5. mloop mirrors the `bpm` into its engine via `set_bpm` and uses `beat` phase for metronome alignment.
6. To nudge the session tempo from mloop (tap tempo, slider), mloop sends:
   ```json
   { "type": "set_bpm", "bpm": 130.0 }
   ```

## Failure modes
- Bridge not running → WebSocket error → mloop falls back to internal clock, no UI nag.
- Bridge crashes mid-session → WebSocket close event → hook schedules reconnect with exponential backoff.
- Multiple tabs → each tab opens its own socket; bridge handles fan-out. Last tempo wins.

## Implementation
- mloop side: `src/hooks/useLinkBridge.ts` (85 lines, thin WebSocket client).
- mpump side: `link-bridge/` in the mpump repo (Tauri app — do not edit from mloop).

## Testing locally
1. Clone mpump, `cd link-bridge`, `npm run tauri dev` (or the bundled dev script).
2. `npm run dev` in mloop.
3. Open DevTools → Network → WS — confirm the `ws://127.0.0.1:20808` frame stream.
4. Change tempo in Ableton Live / another Link-aware app → mloop should follow within a frame.
