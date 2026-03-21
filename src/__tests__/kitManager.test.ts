import { describe, it, expect, beforeEach } from "vitest";
import { loadSavedKits, saveKit, deleteKit, padsToKit } from "../utils/kitManager";

// Mock localStorage
const storage: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => { storage[key] = value; },
  removeItem: (key: string) => { delete storage[key]; },
  clear: () => { for (const k of Object.keys(storage)) delete storage[k]; },
  get length() { return Object.keys(storage).length; },
  key: (i: number) => Object.keys(storage)[i] ?? null,
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });

beforeEach(() => { localStorageMock.clear(); });

describe("loadSavedKits", () => {
  it("returns empty array when nothing stored", () => {
    expect(loadSavedKits()).toEqual([]);
  });

  it("returns stored kits", () => {
    const kit = { name: "Test", samples: [{ name: "S1", data: [0.1, 0.2] }] };
    localStorageMock.setItem("mloop-saved-kits", JSON.stringify([kit]));
    const kits = loadSavedKits();
    expect(kits.length).toBe(1);
    expect(kits[0].name).toBe("Test");
  });

  it("handles corrupt JSON", () => {
    localStorageMock.setItem("mloop-saved-kits", "not-json");
    expect(loadSavedKits()).toEqual([]);
  });
});

describe("saveKit", () => {
  it("saves a kit", () => {
    saveKit({ name: "Kit1", samples: [] });
    const kits = loadSavedKits();
    expect(kits.length).toBe(1);
    expect(kits[0].name).toBe("Kit1");
  });

  it("overwrites kit with same name", () => {
    saveKit({ name: "Kit1", samples: [{ name: "A", data: [1] }] });
    saveKit({ name: "Kit1", samples: [{ name: "B", data: [2] }] });
    const kits = loadSavedKits();
    expect(kits.length).toBe(1);
    expect(kits[0].samples[0].name).toBe("B");
  });

  it("stores multiple kits", () => {
    saveKit({ name: "Kit1", samples: [] });
    saveKit({ name: "Kit2", samples: [] });
    expect(loadSavedKits().length).toBe(2);
  });
});

describe("deleteKit", () => {
  it("removes a kit by name", () => {
    saveKit({ name: "Kit1", samples: [] });
    saveKit({ name: "Kit2", samples: [] });
    deleteKit("Kit1");
    const kits = loadSavedKits();
    expect(kits.length).toBe(1);
    expect(kits[0].name).toBe("Kit2");
  });

  it("no-op for nonexistent name", () => {
    saveKit({ name: "Kit1", samples: [] });
    deleteKit("Nope");
    expect(loadSavedKits().length).toBe(1);
  });
});

describe("padsToKit", () => {
  it("converts pad slots to a SavedKit", () => {
    const slots = [
      { buffer: new Float32Array([0.5, -0.5]) },
      { buffer: null },
    ];
    const kit = padsToKit("MyKit", slots);
    expect(kit.name).toBe("MyKit");
    expect(kit.samples.length).toBe(2);
    expect(kit.samples[0].data).toEqual([0.5, -0.5]);
    expect(kit.samples[1].data).toEqual([]);
  });

  it("preserves sample data accurately for 16 slots", () => {
    const slots = Array.from({ length: 16 }, (_, i) => ({
      buffer: i % 2 === 0 ? new Float32Array([i * 0.1]) : null,
    }));
    const kit = padsToKit("Full", slots);
    expect(kit.samples.length).toBe(16);
    expect(kit.samples[0].data.length).toBe(1);
    expect(kit.samples[1].data.length).toBe(0);
    expect(kit.samples[14].data[0]).toBeCloseTo(1.4);
  });

  it("handles empty slots array", () => {
    const kit = padsToKit("Empty", []);
    expect(kit.name).toBe("Empty");
    expect(kit.samples.length).toBe(0);
  });
});

describe("saveKit + deleteKit round-trip", () => {
  it("save then delete leaves storage empty", () => {
    saveKit({ name: "Temp", samples: [] });
    expect(loadSavedKits().length).toBe(1);
    deleteKit("Temp");
    expect(loadSavedKits().length).toBe(0);
  });

  it("delete is case-sensitive", () => {
    saveKit({ name: "Kit1", samples: [] });
    deleteKit("kit1"); // wrong case
    expect(loadSavedKits().length).toBe(1);
  });
});
