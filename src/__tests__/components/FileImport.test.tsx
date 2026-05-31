import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { FileImport } from "../../components/FileImport";

// Per-test OfflineAudioContext stub (setup.ts does not provide one).
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
  const f = new File([new Uint8Array([1, 2, 3])], "test", { type });
  // jsdom File lacks arrayBuffer in some versions; ensure present
  if (!f.arrayBuffer) {
    Object.defineProperty(f, "arrayBuffer", {
      value: () => Promise.resolve(new ArrayBuffer(3)),
    });
  }
  return f;
}

describe("FileImport", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("decodes an audio file and calls onFileLoaded", async () => {
    const audioBuffer = {
      numberOfChannels: 1,
      length: 2,
      getChannelData: () => new Float32Array([0.5, -0.5]),
    };
    stubOfflineAudioContext(() => Promise.resolve(audioBuffer));
    const onFileLoaded = vi.fn();
    render(<FileImport onFileLoaded={onFileLoaded} />);
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile("audio/wav")] } });
      await Promise.resolve();
    });
    expect(onFileLoaded).toHaveBeenCalledOnce();
  });

  it("calls onError and not onFileLoaded when decode rejects", async () => {
    stubOfflineAudioContext(() => Promise.reject(new Error("bad audio")));
    const onFileLoaded = vi.fn();
    const onError = vi.fn();
    render(<FileImport onFileLoaded={onFileLoaded} onError={onError} />);
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile("audio/wav")] } });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onFileLoaded).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  });

  it("shows internal error UI when decode rejects without onError prop", async () => {
    stubOfflineAudioContext(() => Promise.reject(new Error("bad audio")));
    const onFileLoaded = vi.fn();
    render(<FileImport onFileLoaded={onFileLoaded} />);
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile("audio/wav")] } });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onFileLoaded).not.toHaveBeenCalled();
    expect(screen.getByText(/couldn't|failed|error|decode/i)).toBeInTheDocument();
  });

  it("ignores non-audio files selected via the file input", async () => {
    const decode = vi.fn(() => Promise.resolve({ numberOfChannels: 1, length: 1, getChannelData: () => new Float32Array([0]) }));
    stubOfflineAudioContext(decode);
    const onFileLoaded = vi.fn();
    render(<FileImport onFileLoaded={onFileLoaded} />);
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile("application/pdf")] } });
      await Promise.resolve();
    });
    expect(decode).not.toHaveBeenCalled();
    expect(onFileLoaded).not.toHaveBeenCalled();
  });
});
