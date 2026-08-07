import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(repoRoot, path), "utf8")) as T;
}

describe("macOS Tauri release config", () => {
  it("keeps platform overlay free of signing identity and plist injection keys", () => {
    const config = readJson<{
      app?: { macOSPrivateApi?: boolean };
      bundle?: {
        targets?: string[];
        icon?: string[];
        macOS?: {
          minimumSystemVersion?: string;
          signingIdentity?: string;
        };
      };
    }>("src-tauri/tauri.macos.conf.json");

    expect(config.app?.macOSPrivateApi).toBe(true);
    expect(config.bundle?.targets).toEqual(["app", "dmg"]);
    expect(config.bundle?.icon).toContain("icons/icon.icns");
    expect(config.bundle?.macOS?.minimumSystemVersion).toBe("12.0");
    expect(config.bundle?.macOS).not.toHaveProperty("signingIdentity");
    expect(config.bundle?.macOS).not.toHaveProperty("infoPlist");
  });

  it("keeps ad hoc signing only in the QA overlay", () => {
    const qaConfig = readJson<{
      bundle?: { macOS?: { signingIdentity?: string } };
    }>("src-tauri/tauri.macos.qa.conf.json");

    expect(qaConfig.bundle?.macOS?.signingIdentity).toBe("-");
  });

  it("uses src-tauri/Info.plist for scoped ATS Relay exception", () => {
    const plist = readFileSync(join(repoRoot, "src-tauri/Info.plist"), "utf8");

    expect(plist).toContain("<key>NSAppTransportSecurity</key>");
    expect(plist).toContain("<key>NSExceptionDomains</key>");
    expect(plist).toContain("<key>159.75.175.47</key>");
    expect(plist).toContain("<key>NSExceptionAllowsInsecureHTTPLoads</key>");
    expect(plist).not.toContain("NSAllowsArbitraryLoads");
  });

  it("exposes separate formal and QA build scripts", () => {
    const packageJson = readJson<{ scripts?: Record<string, string> }>(
      "package.json",
    );

    expect(packageJson.scripts?.["tauri:build:mac"]).toBe(
      "tauri build --target universal-apple-darwin --bundles app,dmg",
    );
    expect(packageJson.scripts?.["tauri:build:mac:qa"]).toBe(
      "tauri build --target universal-apple-darwin --bundles app,dmg --config src-tauri/tauri.macos.qa.conf.json",
    );
  });
});
