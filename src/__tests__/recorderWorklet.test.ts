import { describe, it, expect, beforeAll } from "vitest";

/**
 * Loads public/recorder-worklet.js with stubbed AudioWorklet globals so the
 * processor's lifecycle can be tested: `process()` returning true pins the
 * processor alive forever, so after "stop" it must return false or every
 * recording leaks a perpetually-running audio-thread processor.
 */

type ProcessorInstance = {
  port: { onmessage: ((e: { data: { type: string } }) => void) | null; postMessage: (msg: unknown, transfer?: unknown[]) => void };
  process: (inputs: Float32Array[][]) => boolean;
};

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
