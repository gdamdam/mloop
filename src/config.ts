/**
 * Central configuration constants for mloop.
 *
 * Keeps magic numbers out of the engine and hook layers so timing,
 * storage keys, and track count can be tuned from a single place.
 */

/** Number of loop tracks in the app. */
export const NUM_TRACKS = 3;

/** Default tempo when no session is loaded. */
export const DEFAULT_BPM = 120;

/** Interval (ms) used by the AudioContext keep-alive / resume poll. */
export const RESUME_INTERVAL_MS = 5000;

/** Ramp constant (seconds) for smooth AudioParam.setTargetAtTime updates. */
export const PARAM_RAMP_SECONDS = 0.02;

/** Crossfade duration (seconds) during effects-chain rebuilds. */
export const FX_REBUILD_FADE_SECONDS = 0.01;

/** localStorage keys used by the persistence layer. */
export const STORAGE_KEYS = {
  sessions: "mloop.sessions",
  pinned: "mloop.pinned",
  lastSession: "mloop.lastSession",
  settings: "mloop.settings",
} as const;
