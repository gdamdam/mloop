import { describe, it, expect, vi } from "vitest";
import { MidiController } from "../engine/MidiController";

/** Minimal mock of a MIDIInput port with a settable onmidimessage handler. */
function makeInput() {
  return { onmidimessage: null as ((e: unknown) => void) | null };
}

/** Build a mock MIDIAccess exposing the given inputs + an onstatechange slot. */
function makeAccess(inputs: ReturnType<typeof makeInput>[]) {
  return {
    onstatechange: null as (() => void) | null,
    inputs: { values: () => inputs.values() },
  };
}

describe("MidiController dispose", () => {
  it("detaches onstatechange and all input.onmidimessage handlers", async () => {
    const inputs = [makeInput(), makeInput()];
    const access = makeAccess(inputs);

    Object.defineProperty(navigator, "requestMIDIAccess", {
      value: vi.fn().mockResolvedValue(access),
      configurable: true,
    });

    const ctrl = new MidiController();
    const ok = await ctrl.init();
    expect(ok).toBe(true);

    // Handlers are attached after init
    expect(access.onstatechange).toBeTypeOf("function");
    for (const input of inputs) {
      expect(input.onmidimessage).toBeTypeOf("function");
    }

    ctrl.dispose();

    // Handlers are detached after dispose
    expect(access.onstatechange).toBeNull();
    for (const input of inputs) {
      expect(input.onmidimessage).toBeNull();
    }
  });
});
