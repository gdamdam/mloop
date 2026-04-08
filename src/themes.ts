/**
 * Theme system — 6 color palettes (3 dark, 3 light).
 *
 * Palettes mirror mpump's six by ID (forest/ember/neon, minimal/cream/rose)
 * so a fresh visit to either app feels like the same family, but every
 * palette here has been nudged slightly in hue and accent to give mloop
 * its own identity. The `preview` accent is always a sibling — not
 * identical — to mpump's, typically shifted toward cyan/cool to cue
 * "loops / flow" versus mpump's warmer "sequencing" voice.
 *
 * Palettes are applied by setting CSS custom properties on :root,
 * allowing all components to inherit colors without prop drilling.
 */

export type PaletteId = "forest" | "ember" | "neon" | "minimal" | "cream" | "rose";

/** Color palette definition — maps semantic roles to hex values. */
export interface PaletteDef {
  id: PaletteId;
  name: string;
  dark: boolean;
  bg: string;       // page background
  panel: string;    // card/panel background
  cell: string;     // interactive cell background
  border: string;   // borders and dividers
  text: string;     // primary text
  dim: string;      // secondary/muted text
  preview: string;  // accent color for active states
}

export const PALETTES: PaletteDef[] = [
  // ── Dark palettes ────────────────────────────────────────────────────
  // Forest — greens, but with a teal tilt and a cyan accent instead of mpump's mint.
  { id: "forest", name: "Forest", dark: true,
    bg: "#0a1815", panel: "#112420", cell: "#183028", border: "#284a40",
    text: "#c8e6d8", dim: "#6a8a80", preview: "#5fddff" },
  // Ember — warmer reds, pushed toward amber/orange vs mpump's red-tomato.
  { id: "ember", name: "Ember", dark: true,
    bg: "#1a0d08", panel: "#241610", cell: "#2e1e14", border: "#4a2c1e",
    text: "#f0d8c8", dim: "#8a6550", preview: "#ff8a3d" },
  // Neon — pitch black with a hint of blue in the panels; cyan accent (mpump is magenta).
  { id: "neon", name: "Neon", dark: true,
    bg: "#000000", panel: "#080810", cell: "#14141c", border: "#1f1f2a",
    text: "#ffffff", dim: "#666666", preview: "#00ffff" },

  // ── Light palettes ───────────────────────────────────────────────────
  // Minimal — cool off-white with a slate-blue accent (mpump's is neutral gray).
  { id: "minimal", name: "Minimal", dark: false,
    bg: "#f8f9fa", panel: "#e9ecef", cell: "#dde2e8", border: "#a5acb5",
    text: "#111111", dim: "#444444", preview: "#4d5a6a" },
  // Cream — warm paper, peach accent vs mpump's violet.
  { id: "cream", name: "Cream", dark: false,
    bg: "#faf3e8", panel: "#efe5d0", cell: "#e5d8bc", border: "#cfc29a",
    text: "#2a2218", dim: "#8a7558", preview: "#ff6e40" },
  // Rose — soft pink, deeper rose accent vs mpump's brighter magenta-pink.
  { id: "rose", name: "Rose", dark: false,
    bg: "#fbecef", panel: "#f2dbe0", cell: "#ead0d6", border: "#d5b6bd",
    text: "#2a1820", dim: "#8a5a6a", preview: "#b83280" },
];

/** Apply a palette by setting CSS custom properties on :root. */
export function applyPalette(p: PaletteDef): void {
  const root = document.documentElement;
  root.style.setProperty("--bg", p.bg);
  root.style.setProperty("--bg-panel", p.panel);
  root.style.setProperty("--bg-cell", p.cell);
  root.style.setProperty("--border", p.border);
  root.style.setProperty("--text", p.text);
  root.style.setProperty("--text-dim", p.dim);
  root.style.setProperty("--preview", p.preview);
  document.body.style.background = p.bg;
  document.body.style.color = p.text;
}

/**
 * Load the saved palette ID from localStorage.
 * Defaults to "forest" to stay in the same family as mpump. If the user
 * has an old, removed palette id cached (midnight, cobalt, violet, artic,
 * sand, slate), the find() check will miss and fall back cleanly.
 */
export function loadPaletteId(): PaletteId {
  const stored = localStorage.getItem("mloop-palette");
  if (stored && PALETTES.find(p => p.id === stored)) return stored as PaletteId;
  return "forest";
}
