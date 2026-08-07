import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(repoRoot, path), "utf8")) as T;
}

function readText(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("cross-platform interop E2E harness config", () => {
  it("declares Windows and macOS interop scripts plus sanitized validation", () => {
    const packageJson = readJson<{ scripts?: Record<string, string> }>("package.json");

    expect(packageJson.scripts?.["e2e:windows:build"]).toContain("VITE_TAURI_E2E=1");
    expect(packageJson.scripts?.["e2e:windows:build"]).toContain("--features e2e");
    expect(packageJson.scripts?.["e2e:windows:build"]).toContain("--no-bundle");
    expect(packageJson.scripts?.["e2e:interop:windows"]).toBe(
      "wdio run e2e/interop/wdio.windows.conf.ts --suite interop",
    );
    expect(packageJson.scripts?.["e2e:interop:windows:restart"]).toBe(
      "wdio run e2e/interop/wdio.windows.conf.ts --suite restart",
    );
    expect(packageJson.scripts?.["e2e:interop:macos"]).toBe(
      "wdio run e2e/interop/wdio.macos.conf.ts --suite interop",
    );
    expect(packageJson.scripts?.["e2e:interop:macos:restart"]).toBe(
      "wdio run e2e/interop/wdio.macos.conf.ts --suite restart",
    );
    expect(packageJson.scripts?.["interop:rendezvous:create"]).toBe(
      "node scripts/interop/github-rendezvous.mjs create",
    );
    expect(packageJson.scripts?.["interop:rendezvous:cleanup"]).toBe(
      "node scripts/interop/github-rendezvous.mjs cleanup",
    );
    expect(packageJson.scripts?.["interop:validate"]).toBe(
      "node scripts/interop/cross-platform-smoke.mjs validate",
    );
  });

  it("configures both real Tauri runners with embedded provider and app isolation", () => {
    for (const configPath of [
      "e2e/interop/wdio.windows.conf.ts",
      "e2e/interop/wdio.macos.conf.ts",
    ]) {
      const config = readText(configPath);

      expect(config).toContain('services: [["tauri"');
      expect(config).toContain('driverProvider: "embedded"');
      expect(config).toContain('browserName: "tauri"');
      expect(config).toContain('"tauri:options"');
      expect(config).toContain("application: appBinaryPath");
      expect(config).toContain("filterChildAppEnv");
      expect(config).toContain("createIsolatedAppEnv");
      expect(config).toContain('logLevel: "error"');
      expect(config).not.toContain('logLevel: "info"');
      expect(config).not.toContain("tauri-driver");
      expect(config).not.toContain("hostname");
      expect(config).not.toContain("port: 4444");
    }
    expect(readText("e2e/interop/wdio.windows.conf.ts")).toContain(
      "src-tauri/target/release/couple-desktop-pet.exe",
    );
    const envHelper = readText("e2e/interop/support/env.ts");
    expect(envHelper).toContain('filtered[key] = ""');
    expect(envHelper).toContain('key.startsWith("APPLE_")');
  });

  it("keeps interop E2E TypeScript in root typecheck coverage", () => {
    const e2eTsconfig = readJson<{ include?: string[] }>("tsconfig.e2e.json");

    expect(e2eTsconfig.include).toEqual(["e2e/**/*.ts"]);
    expect(readText("e2e/interop/specs/cross-platform.e2e.ts")).toContain(
      "输入绑定码",
    );
    expect(readText("e2e/interop/specs/cross-platform.e2e.ts")).toContain(
      "对方桌宠消息",
    );
    expect(readText("e2e/interop/specs/cross-platform.e2e.ts")).not.toContain(
      "data-testid",
    );
    const uiHelper = readText("e2e/interop/support/ui.ts");
    expect(uiHelper).toContain('data-motion-id="motion-message-pair"');
    expect(uiHelper).not.toContain('getAttribute("data-motion-id")) !== null');
    expect(readText("e2e/interop/specs/cross-platform.e2e.ts")).toContain(
      "windows-message-received",
    );
    expect(readText("e2e/interop/specs/cross-platform.e2e.ts")).toContain(
      "macos-message-received",
    );
    expect(readText("e2e/interop/specs/cross-platform.e2e.ts")).toContain(
      "windows-unpair-completed",
    );
    expect(readText("e2e/interop/specs/cross-platform.e2e.ts")).toContain(
      "macos-unpair-completed",
    );
  });

  it("records sanitized event logs and screenshots from both E2E specs", () => {
    const crossPlatformSpec = readText("e2e/interop/specs/cross-platform.e2e.ts");
    const restartSpec = readText("e2e/interop/specs/restart-unpaired.e2e.ts");
    const evidenceHelper = readText("e2e/interop/support/evidence.ts");

    expect(evidenceHelper).toContain("INTEROP_EVENT_LOG");
    expect(evidenceHelper).toContain("INTEROP_SCREENSHOT_DIR");
    expect(evidenceHelper).toContain("createInteropEventLogger");
    expect(evidenceHelper).toContain("saveScreenshot");
    expect(evidenceHelper).toContain('selector = ".pet-frame-stage"');
    expect(evidenceHelper).not.toContain("browser.saveScreenshot");
    expect(crossPlatformSpec).toContain("recordAndSend");
    expect(crossPlatformSpec).toContain("captureEvidenceScreenshot");
    expect(crossPlatformSpec).toMatch(
      /captureEvidenceScreenshot\(\s*"message-animation",\s*'\.pet-frame-stage\[data-motion-id="motion-message-pair"\]'/,
    );
    expect(crossPlatformSpec).not.toContain(
      'captureEvidenceScreenshot("message-animation", \'section[aria-label="情侣桌宠 MVP"]\')',
    );
    expect(crossPlatformSpec).toContain("failure");
    expect(restartSpec).toContain("recordAndSend");
  });
});
