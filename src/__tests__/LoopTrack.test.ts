import { describe, it, expect, vi } from "vitest";
import { LoopTrack } from "../engine/LoopTrack";

/**
 * Build a LoopTrack backed by the StubAudioContext (from setup.ts) and
 * spy on createBufferSource so tests can reach the internal source nodes
 * (playback source, destruction-cycle source, etc).
 */
function makeTrack() {
  const ctx = new (window.AudioContext as unknown as { new (): AudioContext })();
  const created: Array<Record<string, unknown>> = [];
  const orig = ctx.createBufferSource.bind(ctx);
  vi.spyOn(ctx, "createBufferSource").mockImplementation(() => {
    const src = orig() as unknown as Record<string, unknown>;
    created.push(src);
    return src as unknown as AudioBufferSourceNode;
  });
  const input = ctx.createGain();
  const master = ctx.createGain();
  const track = new LoopTrack(0, ctx, input, master);
  return { ctx, track, created };
}

/** Give the track one layer of content so it can play. */
function seedContent(track: LoopTrack, ctx: AudioContext) {
  // restoreLayers establishes layers + loopLength without needing the mic.
  track.restoreLayers([new Float32Array(2048)], 2048);
  void ctx;
}

describe("LoopTrack destruction cycle cancellation", () => {
  it("nulls out the pending destruction onended when the track is stopped", () => {
    const { ctx, track, created } = makeTrack();
    seedContent(track, ctx);
    track.destruction.amount = 1; // activate destruction so the cycle schedules

    track.play();

    // The destruction-cycle source is the one with an onended callback.
    const destSrc = created.find((s) => typeof s.onended === "function");
    expect(destSrc).toBeDefined();

    track.stop();

    // After stop, the pending callback must have been cleared so it can no
    // longer fire and mutate state.
    expect(destSrc!.onended).toBeNull();
  });

  it("a late destruction callback does not overwrite sourceNode after stop", () => {
    const { ctx, track, created } = makeTrack();
    seedContent(track, ctx);
    track.destruction.amount = 1;

    track.play();
    expect(track.status).toBe("playing");

    const destSrc = created.find((s) => typeof s.onended === "function");
    const callback = destSrc!.onended as (() => void) | null;

    track.stop();
    expect(track.status).toBe("stopped");

    // Even if a stale reference to the old callback is invoked, it must not
    // resurrect playback (status guard + nulled onended both protect this).
    if (callback) callback.call(destSrc);
    expect(track.status).toBe("stopped");
  });

  it("destruction still works while playing (onended chains a new source)", () => {
    const { ctx, track, created } = makeTrack();
    seedContent(track, ctx);
    track.destruction.amount = 1;

    track.play();
    const destSrc = created.find((s) => typeof s.onended === "function");
    expect(destSrc).toBeDefined();

    const countBefore = created.length;
    // Fire the loop-boundary callback while still playing — it should degrade
    // and schedule the next cycle (creating new sources).
    (destSrc!.onended as () => void).call(destSrc);
    expect(track.status).toBe("playing");
    expect(created.length).toBeGreaterThan(countBefore);
  });
});

describe("LoopTrack disconnect guards", () => {
  it("stop() does not propagate a throwing sourceNode.disconnect", () => {
    const { ctx, track, created } = makeTrack();
    seedContent(track, ctx);

    track.play();
    // The playback source is the one connected for output (no onended).
    const playSrc = created.find((s) => typeof s.onended !== "function");
    expect(playSrc).toBeDefined();
    (playSrc as Record<string, unknown>).disconnect = () => {
      throw new Error("InvalidAccessError: already disconnected");
    };

    expect(() => track.stop()).not.toThrow();
  });
});
