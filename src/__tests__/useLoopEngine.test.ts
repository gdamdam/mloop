import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLoopEngine } from "../hooks/useLoopEngine";

// Mock the AudioEngine so init timing can be controlled. Only the members
// touched on the unmount-during-init path need to exist.
const engineMock = vi.hoisted(() => ({
  instances: [] as Array<{ shutdown: ReturnType<typeof vi.fn>; ctx: { close: ReturnType<typeof vi.fn> } }>,
  resolveInit: null as (() => void) | null,
}));

vi.mock("../engine/AudioEngine", () => ({
  AudioEngine: class {
    ctx = { close: vi.fn(), state: "running" };
    tracks: unknown[] = [];
    shutdown = vi.fn();
    initMic() {
      return new Promise<void>((r) => { engineMock.resolveInit = r; });
    }
    getInputNode() { return {}; }
    getMasterNode() { return {}; }
    constructor() {
      engineMock.instances.push(this as unknown as (typeof engineMock.instances)[number]);
    }
  },
}));

describe("useLoopEngine unmount during init", () => {
  it("runs the full shutdown (mic stream included), not just ctx.close", async () => {
    const { result, unmount } = renderHook(() => useLoopEngine());

    let pending!: Promise<void>;
    act(() => { pending = result.current.startEngine(); });

    // Unmount while initMic is still in flight, then let it resolve.
    unmount();
    engineMock.resolveInit!();
    await act(async () => { await pending; });

    const engine = engineMock.instances[0];
    // ctx.close() alone leaves the MediaStream live (mic indicator stays
    // on); the abandoned engine must go through shutdown().
    expect(engine.shutdown).toHaveBeenCalled();
  });
});
