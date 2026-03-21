import { describe, it, expect } from "vitest";
import {
  reverseBuffer,
  mixBuffers,
  normalizeBuffer,
  trimToLength,
} from "../utils/bufferOps";

describe("reverseBuffer", () => {
  it("reverses sample order", () => {
    const input = new Float32Array([1, 2, 3, 4, 5]);
    const result = reverseBuffer(input);
    expect(Array.from(result)).toEqual([5, 4, 3, 2, 1]);
  });

  it("returns a new buffer, does not mutate input", () => {
    const input = new Float32Array([1, 2, 3]);
    const result = reverseBuffer(input);
    expect(result).not.toBe(input);
    expect(Array.from(input)).toEqual([1, 2, 3]);
  });

  it("handles single-element buffer", () => {
    const input = new Float32Array([42]);
    expect(Array.from(reverseBuffer(input))).toEqual([42]);
  });

  it("handles empty buffer", () => {
    const input = new Float32Array(0);
    expect(reverseBuffer(input).length).toBe(0);
  });

  it("double reverse returns original values", () => {
    const input = new Float32Array([0.1, -0.5, 0.9, 0.0]);
    const result = reverseBuffer(reverseBuffer(input));
    for (let i = 0; i < input.length; i++) {
      expect(result[i]).toBeCloseTo(input[i]);
    }
  });
});

describe("mixBuffers", () => {
  it("returns empty buffer when given no buffers", () => {
    expect(mixBuffers([]).length).toBe(0);
  });

  it("returns a copy when given a single buffer", () => {
    const buf = new Float32Array([0.1, 0.2, 0.3]);
    const result = mixBuffers([buf]);
    expect(Array.from(result)).toEqual(Array.from(buf));
    expect(result).not.toBe(buf);
  });

  it("sums two buffers", () => {
    const a = new Float32Array([0.2, 0.3]);
    const b = new Float32Array([0.1, 0.4]);
    const result = mixBuffers([a, b]);
    expect(result[0]).toBeCloseTo(0.3);
    expect(result[1]).toBeCloseTo(0.7);
  });

  it("clamps output to [-1, 1]", () => {
    const a = new Float32Array([0.8, -0.9]);
    const b = new Float32Array([0.5, -0.5]);
    const result = mixBuffers([a, b]);
    expect(result[0]).toBe(1);
    expect(result[1]).toBe(-1);
  });

  it("mixes three buffers and clamps correctly", () => {
    const a = new Float32Array([0.5]);
    const b = new Float32Array([0.5]);
    const c = new Float32Array([0.5]);
    const result = mixBuffers([a, b, c]);
    expect(result[0]).toBe(1); // 1.5 clamped to 1
  });
});

describe("normalizeBuffer", () => {
  it("scales peak to 0.95", () => {
    const buf = new Float32Array([0.0, 0.5, -0.5]);
    const result = normalizeBuffer(buf);
    // peak is 0.5, scale = 0.95/0.5 = 1.9
    expect(result[1]).toBeCloseTo(0.95);
    expect(result[2]).toBeCloseTo(-0.95);
    expect(result[0]).toBeCloseTo(0);
  });

  it("returns original buffer if all zeros", () => {
    const buf = new Float32Array([0, 0, 0]);
    const result = normalizeBuffer(buf);
    expect(result).toBe(buf); // same reference when peak is 0
  });

  it("handles buffer that is already at 0.95 peak", () => {
    const buf = new Float32Array([0.95, -0.5]);
    const result = normalizeBuffer(buf);
    expect(result[0]).toBeCloseTo(0.95);
  });

  it("normalizes negative-peak buffer", () => {
    const buf = new Float32Array([0.1, -0.8]);
    const result = normalizeBuffer(buf);
    // peak is 0.8, scale = 0.95/0.8
    expect(result[1]).toBeCloseTo(-0.95);
    expect(result[0]).toBeCloseTo(0.1 * (0.95 / 0.8));
  });

  it("does not mutate input", () => {
    const buf = new Float32Array([0.5]);
    normalizeBuffer(buf);
    expect(buf[0]).toBe(0.5);
  });
});

describe("trimToLength", () => {
  it("returns same buffer if length matches", () => {
    const buf = new Float32Array([1, 2, 3]);
    expect(trimToLength(buf, 3)).toBe(buf);
  });

  it("truncates longer buffer", () => {
    const buf = new Float32Array([1, 2, 3, 4, 5]);
    const result = trimToLength(buf, 3);
    expect(result.length).toBe(3);
    expect(Array.from(result)).toEqual([1, 2, 3]);
  });

  it("zero-pads shorter buffer", () => {
    const buf = new Float32Array([1, 2]);
    const result = trimToLength(buf, 5);
    expect(result.length).toBe(5);
    expect(Array.from(result)).toEqual([1, 2, 0, 0, 0]);
  });

  it("handles trimming to zero length", () => {
    const buf = new Float32Array([1, 2, 3]);
    const result = trimToLength(buf, 0);
    expect(result.length).toBe(0);
  });

  it("handles empty buffer padded to target length", () => {
    const buf = new Float32Array(0);
    const result = trimToLength(buf, 3);
    expect(result.length).toBe(3);
    expect(Array.from(result)).toEqual([0, 0, 0]);
  });
});
