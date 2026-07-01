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
  followTransportDecision, joinOnConnect,
} from "../utils/linkBridge";
import type { LoopCommand } from "../types";

/** Ignore sub-milli-BPM jitter so fractional Link tempo is preserved without
 *  spamming set_bpm on every 20Hz frame. */
const BPM_EPSILON = 1e-6;

export function useLinkBridge(
  command: (cmd: LoopCommand) => void,
  enabled: boolean,
  onLinkPlay?: () => void,
  onLinkStop?: () => void,
) {
  const [linkState, setLinkState] = useState<LinkState>(getLinkState);
  const prevPlaying = useRef<boolean | null>(null);
  const prevBpm = useRef<number>(0);
  /**
   * The playing state we last pushed to the session ourselves. When the bridge
   * echoes that state back at 20Hz we must consume it WITHOUT re-triggering our
   * own transport — otherwise a local Play double-starts (echo loop). Cleared
   * once the matching echo is observed.
   */
  const selfPushedPlaying = useRef<boolean | null>(null);

  // Use refs for callbacks so the effect doesn't re-subscribe when they change
  const onPlayRef = useRef(onLinkPlay);
  const onStopRef = useRef(onLinkStop);
  const commandRef = useRef(command);
  // eslint-disable-next-line react-hooks/refs
  onPlayRef.current = onLinkPlay;
  // eslint-disable-next-line react-hooks/refs
  onStopRef.current = onLinkStop;
  // eslint-disable-next-line react-hooks/refs
  commandRef.current = command;

  // Subscribe to Link state updates — single subscription, refs avoid stale closures
  useEffect(() => {
    const unsub = onLinkState((state) => {
      setLinkState(state);

      // On disconnect, reset follow/echo guards so a later reconnect re-joins
      // cleanly rather than acting on a stale prior state.
      if (!state.connected) {
        prevPlaying.current = null;
        selfPushedPlaying.current = null;
        return;
      }

      if (state.tempo > 0) {
        // Sync BPM — keep fractional Link tempo; only send on a real change.
        if (prevBpm.current === 0 || Math.abs(state.tempo - prevBpm.current) > BPM_EPSILON) {
          prevBpm.current = state.tempo;
          commandRef.current({ type: "set_bpm", bpm: state.tempo });
        }

        // Transport follow.
        if (joinOnConnect(prevPlaying.current, state.connected, state.playing)) {
          // Connected into an already-playing session: start locally aligned to
          // the next shared bar. onPlay must NOT send a Play command back.
          onPlayRef.current?.();
        } else if (selfPushedPlaying.current === state.playing) {
          // This state reflects a transport change we caused — consume the echo
          // without re-triggering local transport. Clear the guard now that the
          // matching echo has been observed.
          selfPushedPlaying.current = null;
        } else {
          const follow = followTransportDecision(prevPlaying.current, state.playing);
          if (follow === "start") onPlayRef.current?.();
          else if (follow === "stop") onStopRef.current?.();
        }
        prevPlaying.current = state.playing;
      }
    });
    return unsub;
  }, []);

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
    // Remember what we sent so the bridge's echo of this state doesn't loop
    // back and re-trigger our own transport (see selfPushedPlaying).
    selfPushedPlaying.current = playing;
    sendLinkPlaying(playing);
  }, []);

  return { linkState, setEnabled, pushTempo, pushPlaying };
}
