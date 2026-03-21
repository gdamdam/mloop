import { describe, it, expect, beforeAll } from "vitest";
import { encodeShareLink, decodeShareLink } from "../utils/shareLink";

// Mock window.location for Node environment
beforeAll(() => {
  Object.defineProperty(globalThis, "window", {
    value: {
      location: {
        origin: "https://example.com",
        pathname: "/mloop/",
      },
    },
    writable: true,
  });
});

describe("encodeShareLink / decodeShareLink roundtrip", () => {
  it("roundtrips basic settings", () => {
    const input = {
      bpm: 120,
      timingMode: "quantized",
      syncMode: "sync",
      effects: { lowpass: { on: true, cutoff: 4000, q: 2 } },
    };
    const link = encodeShareLink(input);
    expect(link).toContain("#share=");

    // Extract hash portion
    const hash = link.substring(link.indexOf("#"));
    const decoded = decodeShareLink(hash);
    expect(decoded).not.toBeNull();
    expect(decoded!.bpm).toBe(120);
    expect(decoded!.tm).toBe("quantized");
    expect(decoded!.sm).toBe("sync");
    expect(decoded!.fx).toEqual({ lowpass: { on: true, cutoff: 4000, q: 2 } });
    expect(decoded!.v).toBe(1);
  });

  it("roundtrips with empty effects", () => {
    const link = encodeShareLink({
      bpm: 90,
      timingMode: "free",
      syncMode: "free",
      effects: {},
    });
    const hash = link.substring(link.indexOf("#"));
    const decoded = decodeShareLink(hash);
    expect(decoded!.bpm).toBe(90);
    expect(decoded!.fx).toEqual({});
  });

  it("produces a URL with origin and pathname", () => {
    const link = encodeShareLink({
      bpm: 100,
      timingMode: "free",
      syncMode: "lock",
      effects: {},
    });
    expect(link).toMatch(/^https:\/\/example\.com\/mloop\/#share=/);
  });
});

describe("decodeShareLink", () => {
  it("returns null for empty string", () => {
    expect(decodeShareLink("")).toBeNull();
  });

  it("returns null for hash without share param", () => {
    expect(decodeShareLink("#other=abc")).toBeNull();
  });

  it("returns null for invalid base64", () => {
    expect(decodeShareLink("#share=!!!invalid!!!")).toBeNull();
  });

  it("returns null for valid base64 but wrong version", () => {
    const payload = JSON.stringify({ v: 99, bpm: 120, tm: "free", sm: "free", fx: {} });
    const encoded = btoa(unescape(encodeURIComponent(payload)));
    expect(decodeShareLink(`#share=${encoded}`)).toBeNull();
  });

  it("decodes valid v1 payload", () => {
    const payload = JSON.stringify({ v: 1, bpm: 140, tm: "quantized", sm: "lock", fx: { delay: { on: true } } });
    const encoded = btoa(unescape(encodeURIComponent(payload)));
    const result = decodeShareLink(`#share=${encoded}`);
    expect(result).not.toBeNull();
    expect(result!.bpm).toBe(140);
    expect(result!.tm).toBe("quantized");
  });

  it("handles unicode in effect names", () => {
    const input = {
      bpm: 100,
      timingMode: "free",
      syncMode: "free",
      effects: { "name-with-special": { value: "test" } },
    };
    const link = encodeShareLink(input);
    const hash = link.substring(link.indexOf("#"));
    const decoded = decodeShareLink(hash);
    expect(decoded!.fx).toEqual({ "name-with-special": { value: "test" } });
  });
});
