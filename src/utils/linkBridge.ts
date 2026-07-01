/**
 * Link Bridge client — connects to the mpump Link Bridge companion app.
 *
 * The companion app runs a WebSocket server on localhost:19876 that bridges
 * Ableton Link (UDP multicast) to the browser. This module manages the
 * WebSocket connection and provides a simple pub/sub API for Link state.
 *
 * Connection strategy:
 *   - Tries ws://127.0.0.1, ws://[::1], ws://localhost (for Safari compatibility)
 *   - Auto-detect mode: tries once on page load, silently gives up if bridge isn't running
 *   - Explicit mode: retries every 5s until connected (when user enables in Settings)
 *
 * No internet connections are made — all traffic stays on localhost.
 */

/** Link session state received from the bridge at 20Hz. */
export interface LinkState {
  tempo: number;    // BPM from the Link session (fractional — never rounded here)
  beat: number;     // Current beat position (e.g. 2.5 = halfway through beat 3)
  phase: number;    // Phase within a bar (0.0–3.999 for 4/4 time)
  playing: boolean; // Whether the Link session is playing
  peers: number;    // Number of other Link peers (e.g. Ableton Live instances)
  connected: boolean; // Whether we're connected to the bridge
  /**
   * performance.now() timestamp (ms) captured the instant this message was
   * received. mloop's schedulers run on the AudioContext clock; both clocks
   * advance in real time, so we project beat/phase from this wall-clock stamp
   * and add the resulting delay to ctx.currentTime when scheduling. Stamping
   * here (not in the engine) keeps the sample as close to arrival as possible.
   */
  receivedAt: number;
}

type LinkListener = (state: LinkState) => void;

/** Monotonic wall-clock reading in ms, matching LinkState.receivedAt's domain. */
export function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Beats per bar assumed for the shared Link grid (4/4). */
export const BEATS_PER_BAR = 4;

/**
 * The minimal projectable Link clock — a snapshot of the session's beat
 * timeline plus the wall-clock instant it was sampled. LinkState satisfies
 * this structurally, so helpers accept either.
 */
export interface LinkClock {
  tempo: number;      // BPM (fractional preserved)
  beat: number;       // beat position at `receivedAt`
  phase: number;      // phase within the bar at `receivedAt`
  receivedAt: number; // performance.now() ms when sampled
}

/** Beats advanced between the sample and `now` (both performance.now ms). */
function beatsSince(c: LinkClock, now: number): number {
  if (!(c.tempo > 0)) return 0;
  const elapsedSec = Math.max(0, (now - c.receivedAt) / 1000);
  return elapsedSec * (c.tempo / 60);
}

/** Project the absolute Link beat position at wall-clock `now` (ms). */
export function projectBeat(c: LinkClock, now: number): number {
  return c.beat + beatsSince(c, now);
}

/** Project the phase within the bar (0..beatsPerBar) at wall-clock `now` (ms). */
export function projectPhase(c: LinkClock, now: number, beatsPerBar = BEATS_PER_BAR): number {
  const p = (c.phase + beatsSince(c, now)) % beatsPerBar;
  return p < 0 ? p + beatsPerBar : p;
}

/**
 * Seconds from `now` (ms) until the next shared bar downbeat (phase wraps to
 * 0). Returns 0 when exactly on the downbeat, so callers can schedule at
 * `ctx.currentTime + secondsUntilNextBar(...)` to land on the shared grid.
 */
export function secondsUntilNextBar(c: LinkClock, now: number, beatsPerBar = BEATS_PER_BAR): number {
  if (!(c.tempo > 0)) return 0;
  const phase = projectPhase(c, now, beatsPerBar);
  const beatsToBar = (beatsPerBar - phase) % beatsPerBar; // 0 when on the downbeat
  return beatsToBar * (60 / c.tempo);
}

/** What a follower should do when the remote playing state changes. */
export type TransportFollow = "none" | "start" | "stop";

/**
 * Decide how to follow a remote transport change. `prev === null` means we
 * have not observed a connected state yet (fresh connect) — the connect-time
 * join is handled separately (see {@link joinOnConnect}), so this returns
 * "none". Only a genuine change (prev → next) yields start/stop.
 */
export function followTransportDecision(prev: boolean | null, next: boolean): TransportFollow {
  if (prev === null || next === prev) return "none";
  return next ? "start" : "stop";
}

/**
 * True when we should JOIN an already-playing session on first observation
 * after connecting: connected, playing, and no prior state seen. Joining
 * starts locally aligned to the next shared bar WITHOUT sending a Play command.
 */
export function joinOnConnect(prev: boolean | null, connected: boolean, playing: boolean): boolean {
  return connected && playing && prev === null;
}

/**
 * Idempotent transport send guard: only send a set_playing command when the
 * desired state actually differs from the session's current state. Prevents
 * redundant commands (e.g. local Play while the session already plays) and the
 * echo loops they cause.
 */
export function shouldSendPlaying(currentLinkPlaying: boolean, desired: boolean): boolean {
  return desired !== currentLinkPlaying;
}

// Try multiple localhost variants — Safari blocks some from HTTPS pages
const WS_URLS = ["ws://127.0.0.1:19876", "ws://[::1]:19876", "ws://localhost:19876"];
const RETRY_MS = 5000;
let wsUrlIdx = 0;

let ws: WebSocket | null = null;
let retryTimer: number | null = null;
let listeners: LinkListener[] = [];
let lastState: LinkState = { tempo: 120, beat: 0, phase: 0, playing: false, peers: 0, connected: false, receivedAt: 0 };
let enabled = false;
let autoMode = false; // true = auto-detect (try once), false = explicit (retry on disconnect)

/** Notify all registered listeners with current state. */
function notify() {
  for (const fn of listeners) fn(lastState);
}

/** Open a WebSocket connection to the bridge. Cycles through URL variants on error. */
function connect() {
  if (ws) return;
  try {
    ws = new WebSocket(WS_URLS[wsUrlIdx]);

    ws.onopen = () => {
      enabled = true;
      lastState = { ...lastState, connected: true };
      notify();
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "link") {
          lastState = {
            tempo: msg.tempo ?? lastState.tempo,
            beat: msg.beat ?? lastState.beat,
            phase: msg.phase ?? lastState.phase,
            playing: msg.playing ?? lastState.playing,
            peers: msg.peers ?? lastState.peers,
            connected: true,
            // Stamp arrival in the wall clock we project from (see LinkState).
            receivedAt: nowMs(),
          };
          notify();
        }
      } catch { /* ignore malformed JSON */ }
    };

    ws.onclose = () => {
      ws = null;
      if (lastState.connected) {
        lastState = { ...lastState, connected: false, peers: 0 };
        notify();
      }
      // Auto-detect mode gives up after first failure; explicit mode retries
      if (enabled && !autoMode) scheduleRetry();
    };

    ws.onerror = () => {
      // Try the next URL variant (127.0.0.1 → [::1] → localhost)
      wsUrlIdx = (wsUrlIdx + 1) % WS_URLS.length;
      ws?.close();
    };
  } catch {
    wsUrlIdx = (wsUrlIdx + 1) % WS_URLS.length;
    if (enabled && !autoMode) scheduleRetry();
  }
}

/** Schedule a reconnection attempt after RETRY_MS. */
function scheduleRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = window.setTimeout(connect, RETRY_MS);
}

/** Enable or disable the Link Bridge connection. */
export function enableLinkBridge(on: boolean) {
  enabled = on;
  autoMode = false;
  if (on) {
    connect();
  } else {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    if (ws) { ws.close(); ws = null; }
    lastState = { ...lastState, connected: false, peers: 0 };
    notify();
  }
}

/**
 * Subscribe to Link state changes.
 * Returns an unsubscribe function.
 */
export function onLinkState(fn: LinkListener) {
  listeners.push(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
}

/** Send a tempo change to the Link session via the bridge. */
export function sendLinkTempo(tempo: number) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "set_tempo", tempo }));
  }
}

/** Send a play/stop command to the Link session via the bridge. */
export function sendLinkPlaying(playing: boolean) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "set_playing", playing }));
  }
}

/** Get the current Link state (synchronous snapshot). */
export function getLinkState(): LinkState {
  return lastState;
}

/**
 * Auto-detect: try connecting once on page load.
 * If the bridge is running, stays connected. If not, silently gives up.
 * Does not retry — use enableLinkBridge(true) for persistent connection.
 */
export function autoDetectLinkBridge() {
  if (enabled || ws) return;
  autoMode = true;
  connect();
}
