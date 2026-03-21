/**
 * useLinkBridge — connects mloop to mpump's Link Bridge for tempo sync.
 *
 * When connected, mloop follows the Link session's BPM and can optionally
 * sync play/stop state. This allows mloop and mpump to run at the same
 * tempo when both are connected to the same Link Bridge instance.
 */

import { useEffect, useState, useCallback } from "react";
import {
  onLinkState, enableLinkBridge, autoDetectLinkBridge,
  sendLinkTempo, getLinkState, type LinkState,
} from "../utils/linkBridge";
import type { LoopCommand } from "../types";

export function useLinkBridge(
  command: (cmd: LoopCommand) => void,
  enabled: boolean,
) {
  const [linkState, setLinkState] = useState<LinkState>(getLinkState);

  // Subscribe to Link state updates
  useEffect(() => {
    const unsub = onLinkState((state) => {
      setLinkState(state);
      if (state.connected && state.tempo > 0) {
        // Sync BPM from Link session
        command({ type: "set_bpm", bpm: Math.round(state.tempo) });
        // In LOCK mode, auto-set sync so loops align to Link bar boundaries
        // The engine's getLockLength() already uses timing.barLengthSamples
        // which derives from BPM — so syncing BPM is sufficient
      }
    });
    return unsub;
  }, [command]);

  // Auto-detect on mount, or enable/disable based on setting
  useEffect(() => {
    if (enabled) {
      enableLinkBridge(true);
    } else {
      autoDetectLinkBridge();
    }
  }, [enabled]);

  const setEnabled = useCallback((on: boolean) => {
    enableLinkBridge(on);
  }, []);

  const pushTempo = useCallback((bpm: number) => {
    sendLinkTempo(bpm);
  }, []);

  return { linkState, setEnabled, pushTempo };
}
