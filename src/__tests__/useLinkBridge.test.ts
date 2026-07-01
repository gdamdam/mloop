import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { LinkState } from "../utils/linkBridge";
import type { LoopCommand } from "../types";

// Mock only the bridge I/O (socket side); keep the real pure helpers
// (followTransportDecision / joinOnConnect / shouldSendPlaying).
const bridge = vi.hoisted(() => {
  let listener: ((s: LinkState) => void) | null = null;
  let current: LinkState = { tempo: 120, beat: 0, phase: 0, playing: false, peers: 0, connected: false, receivedAt: 0 };
  return {
    listener: () => listener,
    onLinkState: (fn: (s: LinkState) => void) => { listener = fn; return () => { listener = null; }; },
    getLinkState: () => current,
    setCurrent: (s: LinkState) => { current = s; },
    emit: (s: LinkState) => { current = s; listener?.(s); },
    sendLinkPlaying: vi.fn(),
    sendLinkTempo: vi.fn(),
  };
});

vi.mock("../utils/linkBridge", async (importActual) => {
  const actual = await importActual<typeof import("../utils/linkBridge")>();
  return {
    ...actual,
    onLinkState: bridge.onLinkState,
    getLinkState: bridge.getLinkState,
    enableLinkBridge: () => {},
    autoDetectLinkBridge: () => {},
    sendLinkPlaying: bridge.sendLinkPlaying,
    sendLinkTempo: bridge.sendLinkTempo,
  };
});

import { useLinkBridge } from "../hooks/useLinkBridge";

const st = (over: Partial<LinkState> = {}): LinkState => ({
  tempo: 120, beat: 0, phase: 0, playing: false, peers: 1, connected: true, receivedAt: 100, ...over,
});

function setup() {
  const onPlay = vi.fn();
  const onStop = vi.fn();
  const command = vi.fn<(c: LoopCommand) => void>();
  const hook = renderHook(() => useLinkBridge(command, false, onPlay, onStop));
  return { onPlay, onStop, command, hook };
}

beforeEach(() => {
  vi.clearAllMocks();
  bridge.setCurrent(st({ connected: false, peers: 0 }));
});

describe("useLinkBridge transport follow", () => {
  it("connect while stopped does not start; syncs fractional tempo", () => {
    const { onPlay, command } = setup();
    act(() => bridge.emit(st({ playing: false, tempo: 121.5 })));
    expect(onPlay).not.toHaveBeenCalled();
    // Tempo passed through fractional, never rounded.
    expect(command).toHaveBeenCalledWith({ type: "set_bpm", bpm: 121.5 });
  });

  it("connect while already playing joins (onPlay once, no Play command sent)", () => {
    const { onPlay } = setup();
    act(() => bridge.emit(st({ playing: true }))); // first observation, playing
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(bridge.sendLinkPlaying).not.toHaveBeenCalled();
  });

  it("remote start schedules once", () => {
    const { onPlay } = setup();
    act(() => bridge.emit(st({ playing: false }))); // establish prev=false
    act(() => bridge.emit(st({ playing: true })));  // remote start
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it("remote stop triggers stop", () => {
    const { onStop } = setup();
    act(() => bridge.emit(st({ playing: true })));  // join
    act(() => bridge.emit(st({ playing: false }))); // remote stop
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("does not echo-loop: our own pushed Play doesn't re-trigger onPlay", () => {
    const { onPlay, hook } = setup();
    act(() => bridge.emit(st({ playing: false }))); // prev=false, not playing
    act(() => hook.result.current.pushPlaying(true)); // local Play → send
    expect(bridge.sendLinkPlaying).toHaveBeenCalledWith(true);
    onPlay.mockClear();
    act(() => bridge.emit(st({ playing: true }))); // bridge echoes our own state
    expect(onPlay).not.toHaveBeenCalled(); // echo consumed, not re-triggered
  });

  it("resets follow state on disconnect so reconnect re-joins", () => {
    const { onPlay } = setup();
    act(() => bridge.emit(st({ playing: true }))); // join
    onPlay.mockClear();
    act(() => bridge.emit(st({ connected: false, playing: true }))); // drop
    act(() => bridge.emit(st({ playing: true }))); // reconnect while playing → re-join
    expect(onPlay).toHaveBeenCalledTimes(1);
  });
});
