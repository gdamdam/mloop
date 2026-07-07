// Guards the manual version-sync convention (see src/config.ts): package.json
// is the source of truth; the README badge and CHANGELOG must move with it.
// APP_VERSION and version.json are derived from package.json at build time by
// vite.config.ts, so they cannot drift — these checks cover what's still manual.
import { describe, expect, it } from "vitest";
import { APP_VERSION } from "../config";
import pkgRaw from "../../package.json?raw";
import readme from "../../README.md?raw";
import changelog from "../../CHANGELOG.md?raw";

const pkgVersion = (JSON.parse(pkgRaw) as { version: string }).version;

describe("version sync", () => {
  it("APP_VERSION matches package.json", () => {
    expect(APP_VERSION).toBe(pkgVersion);
  });

  it("README badge matches package.json", () => {
    const badge = readme.match(/badge\/version-([\d.]+)-/);
    expect(badge?.[1]).toBe(pkgVersion);
  });

  it("CHANGELOG has an entry for the current version", () => {
    expect(changelog).toContain(`[${pkgVersion}]`);
  });
});
