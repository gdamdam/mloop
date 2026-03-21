import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    // Match mpump's browser support — ES2020 works in all modern browsers
    // including Firefox. Vite 8 defaults to "esnext" which can emit syntax
    // that older Firefox versions don't support.
    target: "es2020",
  },
});
