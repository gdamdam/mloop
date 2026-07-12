import { describe, it, expect } from "vitest";
import { pickRecorderMimeType } from "../engine/recorderMime";

describe("pickRecorderMimeType", () => {
  it("prefers audio/webm when supported (Chrome/Firefox)", () => {
    expect(pickRecorderMimeType(() => true)).toBe("audio/webm");
  });

  it("falls back to audio/mp4 when webm is unsupported (Safari)", () => {
    expect(pickRecorderMimeType((t) => t === "audio/mp4")).toBe("audio/mp4");
  });

  it("returns undefined when no known container is supported", () => {
    expect(pickRecorderMimeType(() => false)).toBeUndefined();
  });

  it("returns undefined when isTypeSupported is unavailable", () => {
    // The test-env MediaRecorder stub has no static isTypeSupported, so the
    // default checker must resolve to "let the browser pick".
    expect(pickRecorderMimeType()).toBeUndefined();
  });
});
