/**
 * Kit Manager — save, load, export, import custom sample kits.
 *
 * Kits are stored as named collections of Float32Array buffers in localStorage
 * (serialized as number arrays). Export/import uses JSON files via Save As dialog.
 */

import { saveFileAs, openFile } from "./fileExport";

/** A saved kit: name + array of named sample buffers. */
export interface SavedKit {
  name: string;
  samples: { name: string; data: number[] }[]; // Float32 as number[] for JSON
}

const STORAGE_KEY = "mloop-saved-kits";

/** Load all saved kits from localStorage. */
export function loadSavedKits(): SavedKit[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* corrupt */ }
  return [];
}

/** Save a kit to localStorage. Overwrites if name exists. */
export function saveKit(kit: SavedKit): void {
  const kits = loadSavedKits().filter(k => k.name !== kit.name);
  kits.push(kit);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(kits));
}

/** Delete a saved kit by name. */
export function deleteKit(name: string): void {
  const kits = loadSavedKits().filter(k => k.name !== name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(kits));
}

/** Export a kit as a JSON file via system Save As dialog. */
export async function exportKit(kit: SavedKit): Promise<void> {
  const json = JSON.stringify(kit);
  await saveFileAs(new Blob([json], { type: "application/json" }), `${kit.name}.mloop-kit.json`);
}

/** Import a kit from a JSON file. Returns the kit or null on cancel/error. */
export async function importKit(): Promise<SavedKit | null> {
  const file = await openFile(".json");
  if (!file) return null;
  try {
    const text = await file.text();
    const kit = JSON.parse(text) as SavedKit;
    if (!kit.name || !kit.samples || !Array.isArray(kit.samples)) {
      throw new Error("Invalid kit file");
    }
    return kit;
  } catch (e) {
    alert("Failed to import kit: " + (e instanceof Error ? e.message : "Invalid file"));
    return null;
  }
}

/** Convert current pad slots to a SavedKit. */
export function padsToKit(
  name: string,
  slots: { buffer: Float32Array | null }[],
): SavedKit {
  return {
    name,
    samples: slots.map((s, i) => ({
      name: `Pad ${i + 1}`,
      data: s.buffer ? Array.from(s.buffer) : [],
    })),
  };
}

/** Load a SavedKit into pad slots via importBuffer callback. */
export function kitToPads(
  kit: SavedKit,
  importBuffer: (slotId: number, data: Float32Array) => void,
  clearSlot: (slotId: number) => void,
): void {
  for (let i = 0; i < 16; i++) {
    const sample = kit.samples[i];
    if (sample && sample.data.length > 0) {
      importBuffer(i, new Float32Array(sample.data));
    } else {
      clearSlot(i);
    }
  }
}

// ── Pad layouts ─────────────────────────────────────────────────────────

/**
 * Pad layout maps logical sound index (0=kick, 1=snare, etc.)
 * to physical pad position (0-15 in the 4x4 grid).
 *
 * The grid is numbered left-to-right, top-to-bottom:
 *   0  1  2  3
 *   4  5  6  7
 *   8  9 10 11
 *  12 13 14 15
 */

export type PadLayoutId = "sequential" | "mpc" | "sp404";

export interface PadLayout {
  id: PadLayoutId;
  name: string;
  description: string;
  /** Maps sound index (0-7) to pad position (0-15). */
  mapping: number[];
}

export const PAD_LAYOUTS: PadLayout[] = [
  {
    id: "sequential",
    name: "Sequential",
    description: "Sounds fill pads 1→8 left to right, top to bottom",
    mapping: [0, 1, 2, 3, 4, 5, 6, 7],
  },
  {
    id: "mpc",
    name: "MPC",
    description: "Akai MPC standard — kick bottom-left, grouped by type",
    // Bottom row (12-15): Kick, Snare, CHH, OHH
    // Next row (8-11): Clap, Rim, Tom, Cymbal
    mapping: [12, 13, 14, 15, 8, 9, 10, 11],
  },
  {
    id: "sp404",
    name: "SP-404mk2",
    description: "Roland SP-404mk2 — kick pad 13, snare 14, hats top row",
    // SP-404mk2 typical: bottom row = main hits, top = accents/fx
    // Pad 13=Kick, 14=Snare, 15=CHH, 16=OHH (bottom row)
    // Pad 1=Clap, 2=Rim, 3=Tom, 4=Cymbal (top row)
    mapping: [12, 13, 14, 15, 0, 1, 2, 3],
  },
];

const LAYOUT_STORAGE_KEY = "mloop-pad-layout";

export function loadPadLayout(): PadLayoutId {
  const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
  if (stored && PAD_LAYOUTS.find(l => l.id === stored)) return stored as PadLayoutId;
  return "sequential";
}

export function savePadLayout(id: PadLayoutId): void {
  localStorage.setItem(LAYOUT_STORAGE_KEY, id);
}
