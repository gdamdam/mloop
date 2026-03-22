import { describe, it, expect } from "vitest";
import { DestructionEngine } from "../engine/DestructionEngine";

describe("DestructionEngine", () => {
  it("initializes with amount=0 and cycleCount=0", () => {
    const engine = new DestructionEngine();
    expect(engine.amount).toBe(0);
    expect(engine.cycleCount).toBe(0);
  });

  it("does not modify buffer when amount is 0", () => {
    const engine = new DestructionEngine();
    const buf = new Float32Array([0.5, -0.3, 0.7]);
    const original = Float32Array.from(buf);
    engine.degrade(buf);
    expect(Array.from(buf)).toEqual(Array.from(original));
    expect(engine.cycleCount).toBe(0);
  });

  it("increments cycleCount on each degrade call", () => {
    const engine = new DestructionEngine();
    engine.amount = 0.5;
    const buf = new Float32Array(10);
    engine.degrade(buf);
    expect(engine.cycleCount).toBe(1);
    engine.degrade(buf);
    expect(engine.cycleCount).toBe(2);
    engine.degrade(buf);
    expect(engine.cycleCount).toBe(3);
  });

  it("modifies buffer in-place when amount > 0", () => {
    const engine = new DestructionEngine();
    engine.amount = 1.0;
    // Use a non-trivial signal so degradation is observable
    const buf = new Float32Array(100);
    for (let i = 0; i < buf.length; i++) {
      buf[i] = Math.sin((2 * Math.PI * i) / 100);
    }
    const original = Float32Array.from(buf);

    engine.degrade(buf);

    // At least some samples should differ after degradation
    let diffCount = 0;
    for (let i = 0; i < buf.length; i++) {
      if (Math.abs(buf[i] - original[i]) > 1e-6) diffCount++;
    }
    expect(diffCount).toBeGreaterThan(0);
  });

  it("keeps samples clamped to [-1, 1]", () => {
    const engine = new DestructionEngine();
    engine.amount = 1.0;
    const buf = new Float32Array([1.0, -1.0, 0.99, -0.99]);

    // Run many cycles to accumulate degradation
    for (let i = 0; i < 30; i++) {
      engine.degrade(buf);
    }

    for (let i = 0; i < buf.length; i++) {
      expect(buf[i]).toBeGreaterThanOrEqual(-1);
      expect(buf[i]).toBeLessThanOrEqual(1);
    }
  });

  it("progressive degradation increases with more cycles", () => {
    // Compare the amount of change after 1 cycle vs 5 cycles
    // Engine ramps intensity over 5 cycles (Math.min(cycleCount/5, 1))
    const engine1 = new DestructionEngine();
    engine1.amount = 1.0;
    const buf1 = new Float32Array(50);
    for (let i = 0; i < 50; i++) buf1[i] = Math.sin((2 * Math.PI * i) / 50) * 0.5;
    const orig1 = Float32Array.from(buf1);
    engine1.degrade(buf1);

    let diff1 = 0;
    for (let i = 0; i < 50; i++) diff1 += Math.abs(buf1[i] - orig1[i]);

    const engine5 = new DestructionEngine();
    engine5.amount = 1.0;
    const buf5 = new Float32Array(50);
    for (let i = 0; i < 50; i++) buf5[i] = Math.sin((2 * Math.PI * i) / 50) * 0.5;
    // Run 4 cycles to build up cycleCount, then measure the 5th
    for (let c = 0; c < 4; c++) engine5.degrade(buf5);
    const before5 = Float32Array.from(buf5);
    engine5.degrade(buf5);

    let diff5 = 0;
    for (let i = 0; i < 50; i++) diff5 += Math.abs(buf5[i] - before5[i]);

    // The 5th cycle should cause more change than the 1st due to intensity ramp
    expect(diff5).toBeGreaterThan(diff1);
  });

  it("reset clears cycleCount", () => {
    const engine = new DestructionEngine();
    engine.amount = 0.5;
    const buf = new Float32Array(10);
    engine.degrade(buf);
    engine.degrade(buf);
    expect(engine.cycleCount).toBe(2);

    engine.reset();
    expect(engine.cycleCount).toBe(0);
  });

  it("reset does not change amount", () => {
    const engine = new DestructionEngine();
    engine.amount = 0.7;
    engine.reset();
    expect(engine.amount).toBe(0.7);
  });
});
