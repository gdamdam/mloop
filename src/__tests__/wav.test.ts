import { describe, it, expect } from "vitest";
import { encodeWav } from "../utils/wav";

describe("encodeWav", () => {
  it("produces correct total size", () => {
    const buf = new Float32Array(100);
    const wav = encodeWav(buf);
    // 44 byte header + 100 samples * 2 bytes = 244
    expect(wav.byteLength).toBe(244);
  });

  it("starts with RIFF header", () => {
    const wav = encodeWav(new Float32Array(10));
    const view = new DataView(wav);
    const riff = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3),
    );
    expect(riff).toBe("RIFF");
  });

  it("contains WAVE format marker", () => {
    const wav = encodeWav(new Float32Array(10));
    const view = new DataView(wav);
    const wave = String.fromCharCode(
      view.getUint8(8),
      view.getUint8(9),
      view.getUint8(10),
      view.getUint8(11),
    );
    expect(wave).toBe("WAVE");
  });

  it("has correct file size in RIFF header", () => {
    const numSamples = 50;
    const wav = encodeWav(new Float32Array(numSamples));
    const view = new DataView(wav);
    // RIFF chunk size = total - 8
    expect(view.getUint32(4, true)).toBe(wav.byteLength - 8);
  });

  it("has fmt chunk with PCM format", () => {
    const wav = encodeWav(new Float32Array(10));
    const view = new DataView(wav);
    // fmt chunk ID
    const fmt = String.fromCharCode(
      view.getUint8(12),
      view.getUint8(13),
      view.getUint8(14),
      view.getUint8(15),
    );
    expect(fmt).toBe("fmt ");
    // PCM format = 1
    expect(view.getUint16(20, true)).toBe(1);
    // Mono = 1 channel
    expect(view.getUint16(22, true)).toBe(1);
  });

  it("uses correct sample rate", () => {
    const wav = encodeWav(new Float32Array(10), 48000);
    const view = new DataView(wav);
    expect(view.getUint32(24, true)).toBe(48000);
  });

  it("defaults to 44100 sample rate", () => {
    const wav = encodeWav(new Float32Array(10));
    const view = new DataView(wav);
    expect(view.getUint32(24, true)).toBe(44100);
  });

  it("has 16-bit depth", () => {
    const wav = encodeWav(new Float32Array(10));
    const view = new DataView(wav);
    expect(view.getUint16(34, true)).toBe(16);
  });

  it("has correct data chunk size", () => {
    const numSamples = 200;
    const wav = encodeWav(new Float32Array(numSamples));
    const view = new DataView(wav);
    // data chunk ID
    const data = String.fromCharCode(
      view.getUint8(36),
      view.getUint8(37),
      view.getUint8(38),
      view.getUint8(39),
    );
    expect(data).toBe("data");
    // data size = numSamples * 2
    expect(view.getUint32(40, true)).toBe(numSamples * 2);
  });

  it("encodes sample values as 16-bit PCM", () => {
    // A known positive value
    const buf = new Float32Array([1.0, -1.0, 0.0]);
    const wav = encodeWav(buf);
    const view = new DataView(wav);
    // sample at offset 44: 1.0 -> 0x7FFF = 32767
    expect(view.getInt16(44, true)).toBe(32767);
    // sample at offset 46: -1.0 -> -0x8000 = -32768
    expect(view.getInt16(46, true)).toBe(-32768);
    // sample at offset 48: 0.0 -> 0
    expect(view.getInt16(48, true)).toBe(0);
  });

  it("handles empty buffer", () => {
    const wav = encodeWav(new Float32Array(0));
    expect(wav.byteLength).toBe(44); // header only
  });

  it("clamps out-of-range samples", () => {
    const buf = new Float32Array([2.0, -3.0]);
    const wav = encodeWav(buf);
    const view = new DataView(wav);
    // should be clamped to max/min 16-bit
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
  });
});
