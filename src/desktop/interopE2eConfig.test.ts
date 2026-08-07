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
      expect(config).not.toContain("tauri-driver");
      expect(config).not.toContain("hostname");
      expect(config).not.toContain("port: 4444");
    }
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
  });
});
