import { describe, it, expect, beforeAll } from "vitest";

/**
 * Loads public/recorder-worklet.js with stubbed AudioWorklet globals so the
 * processor's lifecycle can be tested: `process()` returning true pins the
 * processor alive forever, so after "stop" it must return false or every
 * recording leaks a perpetually-running audio-thread processor.
 */

type ProcessorInstance = {
  port: { onmessage: ((e: { data: { type: string; buffer?: ArrayBuffer } }) => void) | null; postMessage: (msg: unknown, transfer?: unknown[]) => void };
  process: (inputs: Float32Array[][]) => boolean;
};

/** Must match CHUNK_SIZE in public/recorder-worklet.js. */
const CHUNK_SIZE = 44100 * 5;

let ProcessorClass: new () => ProcessorInstance;

beforeAll(async () => {
  (globalThis as Record<string, unknown>).AudioWorkletProcessor = class {
    port = { onmessage: null, postMessage: () => {} };
  };
  (globalThis as Record<string, unknown>).registerProcessor = (
    _name: string,
    cls: new () => ProcessorInstance,
  ) => { ProcessorClass = cls; };
  // @ts-expect-error — plain worklet JS served from public/, no type declarations
  await import("../../public/recorder-worklet.js");
});

function makeProcessor() {
  const p = new ProcessorClass();
  const send = (type: string) => p.port.onmessage!({ data: { type } });
  return { p, send };
}

describe("RecorderWorkletProcessor lifecycle", () => {
  it("stays alive while recording", () => {
    const { p, send } = makeProcessor();
    send("start");
    expect(p.process([[new Float32Array(128)]])).toBe(true);
  });

  it("terminates (returns false) after stop so the processor can be GC'd", () => {
    const { p, send } = makeProcessor();
    send("start");
    p.process([[new Float32Array(128)]]);
    send("stop");
    expect(p.process([[new Float32Array(128)]])).toBe(false);
  });

  it("streams each filled chunk to the main thread instead of retaining it", () => {
    const { p, send } = makeProcessor();
    const posted: { type: string; buffer: Float32Array }[] = [];
    p.port.postMessage = (msg: unknown) => { posted.push(msg as { type: string; buffer: Float32Array }); };
    send("start");
    p.process([[new Float32Array(CHUNK_SIZE).fill(0.25)]]);
    // Filled chunk goes to the main thread immediately (which accumulates it)
    expect(posted.length).toBe(1);
    expect(posted[0].type).toBe("chunk");
    expect(posted[0].buffer.length).toBe(CHUNK_SIZE);
    expect(posted[0].buffer[0]).toBeCloseTo(0.25);
    p.process([[new Float32Array(128).fill(0.5)]]);
    send("stop");
    // Stop posts only the unfilled tail — earlier chunks live on the main thread
    expect(posted[1].type).toBe("buffer");
    expect(posted[1].buffer.length).toBe(128);
    expect(posted[1].buffer[0]).toBeCloseTo(0.5);
  });

  it("reuses buffers recycled by the main thread instead of allocating in process()", () => {
    const { p, send } = makeProcessor();
    const posted: { type: string; buffer: Float32Array }[] = [];
    p.port.postMessage = (msg: unknown) => { posted.push(msg as { type: string; buffer: Float32Array }); };
    send("start");
    const block = new Float32Array(CHUNK_SIZE);
    p.process([[block]]); // fills chunk 1 (initial buffer) — swaps to the pre-allocated spare
    const recycled = new ArrayBuffer(CHUNK_SIZE * 4);
    p.port.onmessage!({ data: { type: "replace", buffer: recycled } });
    p.process([[block]]); // fills chunk 2 (the spare)
    p.process([[block]]); // fills chunk 3 — must reuse the recycled buffer, not allocate
    expect(posted.length).toBe(3);
    expect(posted[2].buffer.buffer).toBe(recycled);
  });

  it("captures samples until stopped", () => {
    const { p, send } = makeProcessor();
    let posted: { type: string; buffer: Float32Array } | null = null;
    p.port.postMessage = (msg: unknown) => { posted = msg as { type: string; buffer: Float32Array }; };
    send("start");
    p.process([[new Float32Array(128).fill(0.5)]]);
    send("stop");
    expect(posted!.type).toBe("buffer");
    expect(posted!.buffer.length).toBe(128);
    expect(posted!.buffer[0]).toBeCloseTo(0.5);
  });
});
