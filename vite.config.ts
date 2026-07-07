/// <reference types="vitest/config" />
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

/** Serve (dev) and emit (build) version.json from package.json, so the
 *  update-check endpoint can never drift from the released version. */
function versionJson(): Plugin {
  const body = JSON.stringify({ v: pkg.version });
  return {
    name: "version-json",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] === "/version.json") {
          res.setHeader("Content-Type", "application/json");
          res.end(body);
        } else next();
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: body });
    },
  };
}

export default defineConfig({
  plugins: [react(), versionJson()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
