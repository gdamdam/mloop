/**
 * useKeyboardShortcuts — maps keyboard keys to loop engine commands.
 *
 * Layout follows a spatial pattern on QWERTY keyboards:
 *   Row 1 (1/2/3)   → Record tracks
 *   Row 2 (Q/W/E)   → Play tracks
 *   Row 3 (A/S/D)   → Mute tracks
 *   Row 4 (Z/X/C)   → Clear tracks
 *   Shift+1/2/3     → Overdub tracks
 *
 * Ignores keypresses when focus is in text inputs to avoid
 * conflicts with typing (e.g., session name input).
 */

import { useEffect, useState } from "react";
import type { LoopCommand } from "../types";

interface ShortcutMap {
  [key: string]: LoopCommand | { type: "show_shortcuts" };
}

/** Default keyboard mapping — spatial layout mirrors the track grid. */
const DEFAULT_SHORTCUTS: ShortcutMap = {
  // Record (toggle) — 1/2/3
  "1": { type: "track_record", trackId: 0 },
  "2": { type: "track_record", trackId: 1 },
  "3": { type: "track_record", trackId: 2 },
  // Play (toggle) — q/w/e
  "q": { type: "track_play", trackId: 0 },
  "w": { type: "track_play", trackId: 1 },
  "e": { type: "track_play", trackId: 2 },
  // Mute — a/s/d
  "a": { type: "track_mute", trackId: 0 },
  "s": { type: "track_mute", trackId: 1 },
  "d": { type: "track_mute", trackId: 2 },
  // Clear — z/x/c
  "z": { type: "track_clear", trackId: 0 },
  "x": { type: "track_clear", trackId: 1 },
  "c": { type: "track_clear", trackId: 2 },
  // Overdub — shift+1/2/3 produces these characters
  "!": { type: "track_overdub", trackId: 0 },
  "@": { type: "track_overdub", trackId: 1 },
  "#": { type: "track_overdub", trackId: 2 },
  // Global transport
  "p": { type: "play_all" },
  "m": { type: "toggle_metronome" },
  "t": { type: "tap_tempo" },
  // Track 0 modifiers (R = reverse, H = half-speed)
  "r": { type: "track_reverse", trackId: 0 },
  "h": { type: "track_half_speed", trackId: 0 },
  // Help overlay
  "?": { type: "show_shortcuts" },
};

/** Human-readable shortcut descriptions for the help overlay. */
export const SHORTCUT_DESCRIPTIONS: { key: string; description: string }[] = [
  { key: "1 / 2 / 3", description: "Record track 1/2/3" },
  { key: "Q / W / E", description: "Play track 1/2/3" },
  { key: "A / S / D", description: "Mute track 1/2/3" },
  { key: "Z / X / C", description: "Clear track 1/2/3" },
  { key: "Shift+1/2/3", description: "Overdub track 1/2/3" },
  { key: "Space", description: "Stop all" },
  { key: "P", description: "Play all" },
  { key: "M", description: "Metronome toggle" },
  { key: "T", description: "Tap tempo" },
  { key: "R", description: "Reverse track 1" },
  { key: "H", description: "Half-speed track 1" },
  { key: "?", description: "Show shortcuts" },
];

/**
 * Hook that listens for keyboard shortcuts and dispatches loop commands.
 * @param command Dispatch function from useLoopEngine.
 * @param enabled Only active when engine is started (prevents pre-init commands).
 * @param onSpaceBar Optional handler for space bar (allows smart stop behavior).
 */
export function useKeyboardShortcuts(
  command: (cmd: LoopCommand) => void,
  enabled: boolean,
  onSpaceBar?: () => void,
) {
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      // Don't capture shortcuts when user is typing in form fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key;

      // Space bar gets special handling — smart stop (stop recording if active,
      // otherwise stop all playback)
      if (key === " ") {
        e.preventDefault();
        if (onSpaceBar) onSpaceBar();
        else command({ type: "stop_all" });
        return;
      }

      const mapping = DEFAULT_SHORTCUTS[key];

      if (!mapping) return;

      e.preventDefault();

      if ("type" in mapping && mapping.type === "show_shortcuts") {
        setShowOverlay((v) => !v);
        return;
      }

      const cmd = mapping as LoopCommand;
      command(cmd);
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [command, enabled]);

  return { showOverlay, setShowOverlay };
}
