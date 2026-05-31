import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SampleSlicer } from "../../components/SampleSlicer";

function stubOfflineAudioContext(decode: () => Promise<unknown>) {
  class StubOfflineAudioContext {
    constructor(..._args: unknown[]) { void _args; }
    decodeAudioData = decode;
  }
  Object.defineProperty(globalThis, "OfflineAudioContext", {
    value: StubOfflineAudioContext,
    writable: true,
    configurable: true,
  });
}

function makeFile(type: string): File {
  const f = new File([new Uint8Array([1, 2, 3])], "loop.wav", { type });
  if (!f.arrayBuffer) {
    Object.defineProperty(f, "arrayBuffer", {
      value: () => Promise.resolve(new ArrayBuffer(3)),
    });
  }
  return f;
}

describe("SampleSlicer", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("shows an error message and does not set a buffer when decode rejects", async () => {
    stubOfflineAudioContext(() => Promise.reject(new Error("corrupt")));
    render(<SampleSlicer padEngine={null} onClose={vi.fn()} />);
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile("audio/wav")] } });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText(/couldn't|failed|error|decode/i)).toBeInTheDocument();
    // Still on the file-picker view (buffer not set) → picker prompt visible
    expect(screen.getByText(/Choose audio file/i)).toBeInTheDocument();
  });
});
