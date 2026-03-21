import { useEffect, useRef } from "react";
import { MidiController } from "../engine/MidiController";
import type { MidiAction } from "../engine/MidiController";
import type { LoopCommand } from "../types";

/** Map MIDI actions to LoopCommands. */
function actionToCommand(action: MidiAction, value: number): LoopCommand | null {
  // Track-specific actions
  const trackMatch = action.match(/^track_(\d)_(\w+)$/);
  if (trackMatch) {
    const trackId = parseInt(trackMatch[1]) - 1;
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

  // Global actions
  switch (action) {
    case "play_all": return { type: "play_all" };
    case "stop_all": return { type: "stop_all" };
    case "metronome_toggle": return { type: "toggle_metronome" };
    case "tap_tempo": return { type: "tap_tempo" };
  }

  return null;
}

export function useMidiMapping(command: (cmd: LoopCommand) => void, enabled: boolean) {
  const controllerRef = useRef<MidiController | null>(null);

  useEffect(() => {
    if (!enabled || !MidiController.isSupported()) return;

    const ctrl = new MidiController();
    controllerRef.current = ctrl;

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
