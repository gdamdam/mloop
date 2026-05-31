/// <reference types="vitest/config" />
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
    rollupOptions: {
      output: {
        // Split the React runtime (and other deps) into a vendor chunk. It
        // changes far less often than app code, so browsers keep it cached
        // across app deploys.
        manualChunks(id) {
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
    globals: true,
  },
});
