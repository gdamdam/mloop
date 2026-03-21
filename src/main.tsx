import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import { PALETTES, applyPalette, loadPaletteId } from "./themes";

// Apply saved theme immediately so splash page has correct colors
const p = PALETTES.find(x => x.id === loadPaletteId());
if (p) applyPalette(p);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
