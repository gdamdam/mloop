import { describe, it, expect } from "vitest";
import { detectTransients, chopAtPoints } from "../utils/autoChop";

describe("detectTransients", () => {
  it("returns [0] for silent buffer", () => {
    const buf = new Float32Array(4096);
    expect(detectTransients(buf, 8)).toEqual([0]);
  });

  it("returns [0] for very short buffer", () => {
    const buf = new Float32Array(100);
    expect(detectTransients(buf, 4)).toEqual([0]);
  });

  it("detects onset in a buffer with a loud burst", () => {
    const buf = new Float32Array(44100); // 1 second
    // Silence then loud burst at 0.5s
    for (let i = 22050; i < 22050 + 512; i++) buf[i] = 0.8;
    const points = detectTransients(buf, 8, 0.3);
    expect(points.length).toBeGreaterThanOrEqual(1);
    expect(points[0]).toBe(0); // always includes start
  });

  it("respects maxSlices", () => {
    const buf = new Float32Array(44100);
    // Multiple bursts
    for (let b = 0; b < 8; b++) {
      const start = b * 5000 + 2000;
      for (let i = start; i < start + 256; i++) buf[i] = 0.9;
    }
    const points = detectTransients(buf, 4, 0.5);
    expect(points.length).toBeLessThanOrEqual(4);
  });
});

describe("chopAtPoints", () => {
  it("returns one slice for single point at 0", () => {
    const buf = new Float32Array([1, 2, 3, 4, 5]);
    const slices = chopAtPoints(buf, [0]);
    expect(slices.length).toBe(1);
    expect(slices[0].length).toBe(5);
  });

  it("chops at given points", () => {
    const buf = new Float32Array([1, 2, 3, 4, 5, 6]);
    const slices = chopAtPoints(buf, [0, 3]);
    expect(slices.length).toBe(2);
    expect(Array.from(slices[0])).toEqual([1, 2, 3]);
    expect(Array.from(slices[1])).toEqual([4, 5, 6]);
  });

  it("sorts points before chopping", () => {
    const buf = new Float32Array([1, 2, 3, 4, 5, 6]);
    const slices = chopAtPoints(buf, [3, 0]);
    expect(slices.length).toBe(2);
    expect(slices[0].length).toBe(3);
  });

  it("handles empty points array", () => {
    const buf = new Float32Array([1, 2, 3]);
    const slices = chopAtPoints(buf, []);
    expect(slices.length).toBe(0);
  });

  it("each slice is independent (not a view into original)", () => {
    const buf = new Float32Array([1, 2, 3, 4]);
    const slices = chopAtPoints(buf, [0, 2]);
    slices[0][0] = 99;
    expect(buf[0]).toBe(1); // original unchanged
  });

  it("handles single-sample slices", () => {
    const buf = new Float32Array([10, 20, 30]);
    const slices = chopAtPoints(buf, [0, 1, 2]);
    expect(slices.length).toBe(3);
    expect(slices[0].length).toBe(1);
    expect(slices[1].length).toBe(1);
    expect(slices[2].length).toBe(1);
  });
});

describe("detectTransients + chopAtPoints integration", () => {
  it("detected points can be used to chop the same buffer", () => {
    const buf = new Float32Array(8820);
    // Impulse in the middle
    for (let i = 4410; i < 4410 + 256; i++) buf[i] = 0.9;
    const points = detectTransients(buf, 8, 0.5);
    const slices = chopAtPoints(buf, points);
    expect(slices.length).toBe(points.length);
    // Total samples across all slices should equal original length
    const totalLen = slices.reduce((s, sl) => s + sl.length, 0);
    expect(totalLen).toBe(buf.length);
  });
});
