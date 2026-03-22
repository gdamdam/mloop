/**
 * Theme system — 12 color palettes (6 dark, 6 light).
 *
 * Palettes are applied by setting CSS custom properties on :root,
 * allowing all components to inherit colors without prop drilling.
 * Default palette is time-of-day aware: dark themes at night, light during day.
 */

export type PaletteId = "midnight" | "neon" | "forest" | "ember" | "cobalt" | "violet" | "minimal" | "cream" | "artic" | "sand" | "rose" | "slate";

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
  // Dark palettes
  { id: "midnight", name: "Midnight", dark: true,
    bg: "#0d1117", panel: "#161b22", cell: "#21262d", border: "#30363d",
    text: "#e6edf3", dim: "#7d8590", preview: "#b388ff" },
  { id: "neon", name: "Neon", dark: true,
    bg: "#000000", panel: "#0a0a0a", cell: "#141414", border: "#222",
    text: "#fff", dim: "#666", preview: "#ff00ff" },
  { id: "forest", name: "Forest", dark: true,
    bg: "#0b1a0b", panel: "#122212", cell: "#1a2e1a", border: "#2a4a2a",
    text: "#c8e6c8", dim: "#6a8a6a", preview: "#66ff99" },
  { id: "ember", name: "Ember", dark: true,
    bg: "#1a0a0a", panel: "#241010", cell: "#2e1818", border: "#4a2222",
    text: "#f0d0c8", dim: "#8a5a50", preview: "#ff6644" },
  { id: "cobalt", name: "Cobalt", dark: true,
    bg: "#0a0e1a", panel: "#101828", cell: "#182238", border: "#283858",
    text: "#c8d8f0", dim: "#5a70a0", preview: "#4488ff" },
  { id: "violet", name: "Violet", dark: true,
    bg: "#120a1a", panel: "#1a1024", cell: "#22182e", border: "#3a2850",
    text: "#d8c8f0", dim: "#7a5aa0", preview: "#aa66ff" },
  // Light palettes
  { id: "minimal", name: "Minimal", dark: false,
    bg: "#ffffff", panel: "#f0f0f0", cell: "#e0e0e0", border: "#aaa",
    text: "#111111", dim: "#444", preview: "#777777" },
  { id: "cream", name: "Cream", dark: false,
    bg: "#faf5eb", panel: "#f0e9d8", cell: "#e8dfc8", border: "#d4c9a8",
    text: "#2a2520", dim: "#8a7a60", preview: "#7c4dff" },
  { id: "artic", name: "Artic", dark: false,
    bg: "#f0f4f8", panel: "#e4eaf0", cell: "#d8e0e8", border: "#c0ccd8",
    text: "#1a2030", dim: "#6a7a8a", preview: "#2979ff" },
  { id: "sand", name: "Sand", dark: false,
    bg: "#f5f0e0", panel: "#e8e0cc", cell: "#ddd4b8", border: "#c8b890",
    text: "#2a2418", dim: "#7a6a48", preview: "#c07020" },
  { id: "rose", name: "Rose", dark: false,
    bg: "#faf0f2", panel: "#f0e0e4", cell: "#e8d4da", border: "#d0b8c0",
    text: "#2a1820", dim: "#8a5a6a", preview: "#d04080" },
  { id: "slate", name: "Slate", dark: false,
    bg: "#eceef0", panel: "#dfe2e6", cell: "#d2d6dc", border: "#b8bec8",
    text: "#1a1e24", dim: "#5a6270", preview: "#4a6080" },
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
 * Falls back to time-of-day default: "sand" during the day, "forest" at night.
 */
export function loadPaletteId(): PaletteId {
  const stored = localStorage.getItem("mloop-palette");
  if (stored && PALETTES.find(p => p.id === stored)) return stored as PaletteId;
  const hour = new Date().getHours();
  return (hour >= 6 && hour < 18) ? "sand" : "forest";
}
