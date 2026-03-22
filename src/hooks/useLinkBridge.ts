/**
 * useLinkBridge — connects mloop to mpump's Link Bridge for tempo + transport sync.
 *
 * When connected:
 * - BPM syncs bidirectionally
 * - Play/stop syncs: mpump play → mloop plays, and vice versa
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  onLinkState, enableLinkBridge, autoDetectLinkBridge,
  sendLinkTempo, sendLinkPlaying, getLinkState, type LinkState,
} from "../utils/linkBridge";
import type { LoopCommand } from "../types";

export function useLinkBridge(
  command: (cmd: LoopCommand) => void,
  enabled: boolean,
  onLinkPlay?: () => void,
  onLinkStop?: () => void,
) {
  const [linkState, setLinkState] = useState<LinkState>(getLinkState);
  const prevPlaying = useRef<boolean | null>(null);
  const prevBpm = useRef<number>(0);

  // Subscribe to Link state updates
  useEffect(() => {
    const unsub = onLinkState((state) => {
      setLinkState(state);
      if (state.connected && state.tempo > 0) {
        // Sync BPM from Link — only when it actually changes
        const roundedBpm = Math.round(state.tempo);
        if (roundedBpm !== prevBpm.current) {
          prevBpm.current = roundedBpm;
          command({ type: "set_bpm", bpm: roundedBpm });
        }

        // Sync play/stop — only react to changes, not every tick
        if (prevPlaying.current !== null && state.playing !== prevPlaying.current) {
          if (state.playing) {
            onLinkPlay?.();
          } else {
            onLinkStop?.();
          }
        }
        prevPlaying.current = state.playing;
      }
    });
    return unsub;
  }, [command, onLinkPlay, onLinkStop]);

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

  const pushPlaying = useCallback((playing: boolean) => {
    sendLinkPlaying(playing);
  }, []);

  return { linkState, setEnabled, pushTempo, pushPlaying };
}
