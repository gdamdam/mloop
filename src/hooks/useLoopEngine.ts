/**
 * useLoopEngine — React hook that bridges the AudioEngine (real-time audio)
 * with React state (UI rendering).
 *
 * Uses an optimistic-update pattern: the reducer immediately updates UI
 * state, then the async engine operation runs and syncs the real state
 * back. This keeps the UI responsive even when audio operations have
 * latency.
 *
 * The reducer logic lives in `loopEngineReducer.ts` and the async
 * command runner in `loopEngineCommands.ts`, so this file is just the
 * React wiring: state, refs, dispatch, engine init.
 */

import { useReducer, useRef, useCallback, useEffect } from "react";
import type { LoopCommand } from "../types";
import { createInitialState } from "../types";
import { AudioEngine } from "../engine/AudioEngine";
import { loadSession } from "../utils/storage";
import { loopEngineReducer, syncFromEngine } from "./loopEngineReducer";
import { runLoopCommand } from "./loopEngineCommands";

/**
 * Main hook for the loop engine — provides state, command dispatch,
 * engine initialization, and direct engine access.
 */
export function useLoopEngine() {
  const [state, dispatch] = useReducer(loopEngineReducer, undefined, createInitialState);
  const engineRef = useRef<AudioEngine | null>(null);
  // Guards against setState after unmount — async engine ops may resolve late.
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Push real engine state into React (called after every engine operation). */
  const syncState = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!mountedRef.current) return; // component went away mid-op — don't dispatch
    dispatch({ type: "state_sync", state: syncFromEngine(engine) });
  }, []);

  /**
   * Dispatch a command — applies optimistic UI update immediately,
   * then runs the real audio engine operation asynchronously.
   */
  const command = useCallback(
    (cmd: LoopCommand) => {
      // Optimistic UI update — keeps buttons feeling instant
      dispatch(cmd);

      const engine = engineRef.current;
      if (!engine) return;

      // Run the real engine operation, then sync state back
      runLoopCommand(engine, cmd)
        .then(() => syncState())
        .catch((e) => console.error("Loop command failed:", cmd.type, e));
    },
    [syncState],
  );

  /**
   * Initialize the audio engine — requests mic permission, creates
   * AudioContext, and restores any pinned session from IndexedDB.
   */
  const startEngine = useCallback(async () => {
    if (engineRef.current) return;

    const engine = new AudioEngine();
    // Mic access is optional — app works without it (pads, file import, sessions).
    try {
      await engine.initMic();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("Mic access denied or unavailable:", msg);
      console.warn("mediaDevices:", !!navigator.mediaDevices);
      console.warn("isSecureContext:", window.isSecureContext);
      if (window.location.hostname.endsWith(".github.io")) {
        console.warn("GitHub Pages may block microphone access on *.github.io");
      }
    }

    if (!mountedRef.current) {
      // Unmounted during init — release audio resources and bail
      try { await engine.ctx.close(); } catch { /* ok */ }
      return;
    }

    // Wire track state change callbacks so engine-initiated changes
    // (e.g., auto-stop timers) propagate to React
    for (const track of engine.tracks) {
      track.onStateChange = () => {
        if (!mountedRef.current) return;
        dispatch({ type: "state_sync", state: syncFromEngine(engine) });
      };
    }

    engineRef.current = engine;
    dispatch({ type: "state_sync", state: { started: true, ...syncFromEngine(engine) } });

    // Auto-load pinned session if one exists (session recovery)
    try {
      const pinned = await loadSession("__pinned__");
      if (pinned && pinned.tracks.some((t) => t.layers.length > 0)) {
        engine.masterLoopLength = pinned.masterLoopLength;
        engine.timing.bpm = pinned.bpm;
        engine.timingMode = pinned.timingMode;
        for (let i = 0; i < engine.tracks.length; i++) {
          const td = pinned.tracks[i];
          if (!td || td.layers.length === 0) continue;
          const layers = td.layers.map((ab) => new Float32Array(ab));
          engine.tracks[i].restoreLayers(layers, td.loopLengthSamples);
          engine.tracks[i].volume = td.volume;
        }
        if (mountedRef.current) {
          dispatch({ type: "state_sync", state: syncFromEngine(engine) });
        }
      }
    } catch {
      /* no pinned session or corrupt — skip silently */
    }
  }, []);

  /** Direct access to the engine instance (for visualizers, pad engine, etc). */
  const getEngine = useCallback(() => engineRef.current, []);

  return { state, command, startEngine, getEngine };
}
