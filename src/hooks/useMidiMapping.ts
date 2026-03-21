/**
 * useMidiMapping — React hook that bridges the MidiController to the
 * loop engine command system.
 *
 * Translates incoming MIDI actions (e.g., "track_1_record") into
 * LoopCommands and dispatches them. Handles the MIDI action naming
 * convention (1-indexed tracks in MIDI, 0-indexed in engine).
 */

import { useEffect, useRef } from "react";
import { MidiController } from "../engine/MidiController";
import type { MidiAction } from "../engine/MidiController";
import type { LoopCommand } from "../types";

/**
 * Convert a MIDI action string to a LoopCommand.
 * MIDI actions use 1-indexed track numbers (user-facing), but
 * the engine uses 0-indexed — this handles the translation.
 * For CC volume, scales the 0–127 MIDI range to 0–1.
 */
function actionToCommand(action: MidiAction, value: number): LoopCommand | null {
  // Parse track-specific actions like "track_1_record"
  const trackMatch = action.match(/^track_(\d)_(\w+)$/);
  if (trackMatch) {
    const trackId = parseInt(trackMatch[1]) - 1; // 1-indexed → 0-indexed
    const op = trackMatch[2];
    switch (op) {
      case "record": return { type: "track_record", trackId };
      case "play": return { type: "track_play", trackId };
      case "stop": return { type: "track_stop", trackId };
      case "overdub": return { type: "track_overdub", trackId };
      case "mute": return { type: "track_mute", trackId };
      case "clear": return { type: "track_clear", trackId };
      case "undo": return { type: "track_undo", trackId };
      case "volume": return { type: "set_volume", trackId, volume: value / 127 };
    }
  }

  // Global transport actions
  switch (action) {
    case "play_all": return { type: "play_all" };
    case "stop_all": return { type: "stop_all" };
    case "metronome_toggle": return { type: "toggle_metronome" };
    case "tap_tempo": return { type: "tap_tempo" };
  }

  return null;
}

/**
 * Hook that initializes Web MIDI and routes incoming messages to the command system.
 * Returns a ref to the controller for MIDI learn UI integration.
 */
export function useMidiMapping(command: (cmd: LoopCommand) => void, enabled: boolean) {
  const controllerRef = useRef<MidiController | null>(null);

  useEffect(() => {
    if (!enabled || !MidiController.isSupported()) return;

    const ctrl = new MidiController();
    controllerRef.current = ctrl;

    // Wire MIDI actions to the engine command dispatcher
    ctrl.onAction = (action, value) => {
      const cmd = actionToCommand(action, value);
      if (cmd) command(cmd);
    };

    ctrl.init();

    return () => {
      controllerRef.current = null;
    };
  }, [command, enabled]);

  return controllerRef;
}
