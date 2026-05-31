import { describe, it, expect, vi } from "vitest";
import { Recorder } from "../engine/Recorder";

function makeCtx() {
  return new (window.AudioContext as unknown as { new (): AudioContext })();
}

/**
 * The AudioWorklet path can't be exercised under jsdom (AudioWorkletNode is
 * not stubbed and there is no real audio thread). To test the concurrent-stop
 * guard we inject a fake worklet node with a controllable message port,
 * mirroring exactly the fields Recorder.stop() touches.
 */
function makeFakeWorkletNode() {
  const port = {
    onmessage: null as ((e: MessageEvent) => void) | null,
    postMessage: vi.fn(),
  };
  return { port } as unknown as AudioWorkletNode & {
    port: { onmessage: ((e: MessageEvent) => void) | null; postMessage: ReturnType<typeof vi.fn> };
  };
}

describe("Recorder.stop concurrent guard (worklet path)", () => {
  it("second concurrent stop() is a no-op that does not clobber resolveBuffer", async () => {
    const ctx = makeCtx();
    const rec = new Recorder(ctx, ctx.createGain());
    const fake = makeFakeWorkletNode();
    // Inject worklet state directly (private fields) to simulate an active
    // worklet recording without a real audio thread.
    (rec as unknown as { workletNode: unknown }).workletNode = fake;

    const first = rec.stop(); // arms resolveBuffer + posts "stop"
    const postCallsAfterFirst = fake.port.postMessage.mock.calls.length;

    // Second concurrent stop must resolve empty immediately and NOT post again
    // or overwrite the pending resolver.
    const second = await rec.stop();
    expect(second).toBeInstanceOf(Float32Array);
    expect(second.length).toBe(0);
    expect(fake.port.postMessage.mock.calls.length).toBe(postCallsAfterFirst);

    // The first promise must still resolve with the real worklet buffer when
    // the port replies — proving it was not orphaned.
    const payload = new Float32Array([0.1, 0.2, 0.3]);
    fake.port.onmessage?.({ data: { type: "buffer", buffer: payload } } as MessageEvent);
    const firstResult = await first;
    expect(firstResult.length).toBe(3);
    expect(firstResult[0]).toBeCloseTo(0.1);
    expect(firstResult[1]).toBeCloseTo(0.2);
    expect(firstResult[2]).toBeCloseTo(0.3);
  });

  it("returns an empty buffer when nothing was recording", async () => {
    const ctx = makeCtx();
    const rec = new Recorder(ctx, ctx.createGain());
    const buf = await rec.stop();
    expect(buf.length).toBe(0);
  });
});
