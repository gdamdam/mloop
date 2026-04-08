/**
 * useLoopEngine — React hook that owns both the AudioEngine (looper)
 * and the PadEngine (PAD mode) and bridges them to React state.
 *
 * Uses an optimistic-update pattern: the reducer immediately updates UI
 * state, then the async engine operation runs and syncs the real state
 * back. This keeps the UI responsive even when audio operations have
 * latency.
 *
 * The reducer logic lives in `loopEngineReducer.ts`, the async command
 * runner in `loopEngineCommands.ts`, and the persistence helpers in
 * `loopEnginePersistence.ts`. This file is just the React wiring:
 * state, refs, dispatch, engine init, and pinned-session restore.
 */

import { useReducer, useRef, useCallback, useEffect } from "react";
import type { LoopCommand } from "../types";
import { createInitialState } from "../types";
import { AudioEngine } from "../engine/AudioEngine";
import { PadEngine } from "../engine/PadEngine";
import { loadSession } from "../utils/storage";
import { loopEngineReducer, syncFromEngine } from "./loopEngineReducer";
import { runLoopCommand } from "./loopEngineCommands";
import { applySessionData } from "./loopEnginePersistence";

/**
 * Main hook for the loop engine — provides state, command dispatch,
 * engine initialization, and direct engine access.
 */
export function useLoopEngine() {
  const [state, dispatch] = useReducer(loopEngineReducer, undefined, createInitialState);
  const engineRef = useRef<AudioEngine | null>(null);
  const padEngineRef = useRef<PadEngine | null>(null);
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
    if (!mountedRef.current) return;
    dispatch({ type: "state_sync", state: syncFromEngine(engine) });
  }, []);

  /**
   * Dispatch a command — applies optimistic UI update immediately,
   * then runs the real audio engine operation asynchronously.
   */
  const command = useCallback(
    (cmd: LoopCommand) => {
      dispatch(cmd);

      const engine = engineRef.current;
      if (!engine) return;

      runLoopCommand(engine, padEngineRef.current, cmd)
        .then(() => syncState())
        .catch((e) => console.error("Loop command failed:", cmd.type, e));
    },
    [syncState],
  );

  /**
   * Initialize the audio engine and PAD engine — requests mic permission,
   * creates the AudioContext, wires callbacks, and restores any pinned
   * session (looper + PAD) from IndexedDB.
   */
  const startEngine = useCallback(async () => {
    if (engineRef.current) return;

    const engine = new AudioEngine();
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

    // PadEngine lives alongside AudioEngine — it has to share the same
    // AudioContext so routing and timing stay aligned. Creating it here
    // (rather than in Layout) means session persistence can reach it.
    const padEngine = new PadEngine(engine.ctx, engine.getInputNode(), engine.getMasterNode());
    padEngine.countInBeats = parseInt(localStorage.getItem("mloop-count-in") ?? "4", 10);
    padEngineRef.current = padEngine;

    engineRef.current = engine;
    dispatch({ type: "state_sync", state: { started: true, ...syncFromEngine(engine) } });

    // Auto-load pinned session if one exists (session recovery).
    // Restores BOTH looper and PAD state through the shared applier so
    // there is exactly one code path for "hydrate engines from session".
    try {
      const pinned = await loadSession("__pinned__");
      const looperHasContent = !!pinned && pinned.tracks.some((t) => t.layers.length > 0);
      const padHasContent = !!pinned?.pad?.slots.some((s) => !!s.buffer);
      if (pinned && (looperHasContent || padHasContent)) {
        applySessionData(engine, padEngine, pinned);
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
  /** Direct access to the pad engine instance. */
  const getPadEngine = useCallback(() => padEngineRef.current, []);

  return { state, command, startEngine, getEngine, getPadEngine };
}
