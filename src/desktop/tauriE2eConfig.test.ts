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

describe("macOS Tauri embedded E2E config", () => {
  it("declares WDIO frontend dependencies and macOS E2E scripts", () => {
    const packageJson = readJson<{
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    }>("package.json");

    for (const dependency of [
      "@wdio/tauri-service",
      "@wdio/tauri-plugin",
      "@wdio/cli",
      "@wdio/local-runner",
      "@wdio/mocha-framework",
      "@wdio/spec-reporter",
      "@wdio/globals",
      "@wdio/types",
      "@types/node",
      "@types/mocha",
    ]) {
      expect(packageJson.devDependencies).toHaveProperty(dependency);
    }

    expect(packageJson.scripts?.["e2e:macos:build"]).toContain("VITE_TAURI_E2E=1");
    expect(packageJson.scripts?.["e2e:macos:build"]).toContain("--features e2e");
    expect(packageJson.scripts?.["e2e:macos:build"]).toContain(
      "--config src-tauri/tauri.e2e.conf.json",
    );
    expect(packageJson.scripts?.["e2e:macos"]).toBe("wdio run e2e/macos/wdio.conf.ts");
  });

  it("keeps Rust WDIO plugins behind the e2e feature", () => {
    const cargoToml = readText("src-tauri/Cargo.toml");
    const mainRs = readText("src-tauri/src/main.rs");

    expect(cargoToml).toContain("tauri-plugin-wdio = { version = \"1.3\"");
    expect(cargoToml).toContain("tauri-plugin-wdio-webdriver = { version = \"1.3\"");
    expect(cargoToml).toContain("e2e = [");
    expect(cargoToml).toContain("dep:tauri-plugin-wdio");
    expect(cargoToml).toContain("dep:tauri-plugin-wdio-webdriver");
    expect(mainRs).toContain("#[cfg(feature = \"e2e\")]");
    expect(mainRs).toContain("tauri_plugin_wdio::init()");
    expect(mainRs).toContain("tauri_plugin_wdio_webdriver::init()");
  });

  it("adds WDIO permissions only in the E2E overlay", () => {
    const defaultCapability = readJson<{ permissions?: string[] }>(
      "src-tauri/capabilities/default.json",
    );
    const e2eConfig = readJson<{
      app?: {
        withGlobalTauri?: boolean;
        security?: {
          capabilities?: Array<{
            identifier?: string;
            windows?: string[];
            permissions?: string[];
          }>;
        };
      };
    }>("src-tauri/tauri.e2e.conf.json");

    expect(defaultCapability.permissions).not.toContain("wdio:default");
    expect(defaultCapability.permissions).not.toContain("wdio-webdriver:default");
    expect(e2eConfig.app?.withGlobalTauri).toBe(true);
    expect(e2eConfig.app?.security?.capabilities).toEqual([
      expect.objectContaining({
        identifier: "e2e",
        windows: ["main"],
        permissions: expect.arrayContaining([
          "core:window:allow-start-dragging",
          "core:window:allow-close",
          "core:event:allow-emit",
          "core:event:allow-listen",
          "core:event:allow-unlisten",
          "dialog:allow-open",
          "wdio:default",
          "wdio-webdriver:default",
        ]),
      }),
    ]);
  });

  it("awaits frontend WDIO plugin bootstrap before mounting React", () => {
    const mainTsx = readText("src/main.tsx");

    expect(mainTsx).toContain('import.meta.env.VITE_TAURI_E2E === "1"');
    expect(mainTsx).toContain('await import("@wdio/tauri-plugin")');
    expect(mainTsx.indexOf('await import("@wdio/tauri-plugin")')).toBeLessThan(
      mainTsx.indexOf("createRoot("),
    );
  });

  it("uses WebdriverIO Tauri embedded provider without the legacy tauri-driver", () => {
    const wdioConfig = readText("e2e/macos/wdio.conf.ts");

    expect(wdioConfig).toContain('services: [["tauri"');
    expect(wdioConfig).toContain('driverProvider: "embedded"');
    expect(wdioConfig).toContain("appBinaryPath");
    expect(wdioConfig).toContain('browserName: "tauri"');
    expect(wdioConfig).toContain('"tauri:options"');
    expect(wdioConfig).toContain("application: appBinaryPath");
    expect(wdioConfig).not.toContain("tauri-driver");
    expect(wdioConfig).not.toContain("hostname: \"127.0.0.1\"");
    expect(wdioConfig).not.toContain("port: 4444");
  });

  it("includes E2E TypeScript in the root typecheck project graph", () => {
    const rootTsconfig = readJson<{
      references?: Array<{ path?: string }>;
    }>("tsconfig.json");
    const e2eTsconfig = readJson<{
      compilerOptions?: {
        types?: string[];
        declaration?: boolean;
        emitDeclarationOnly?: boolean;
        outDir?: string;
        tsBuildInfoFile?: string;
      };
      include?: string[];
    }>("tsconfig.e2e.json");

    expect(rootTsconfig.references).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "./tsconfig.e2e.json" })]),
    );
    expect(e2eTsconfig.compilerOptions?.declaration).toBe(true);
    expect(e2eTsconfig.compilerOptions?.emitDeclarationOnly).toBe(true);
    expect(e2eTsconfig.compilerOptions?.outDir).toBe("node_modules/.cache/tsbuild/e2e");
    expect(e2eTsconfig.compilerOptions?.tsBuildInfoFile).toBe(
      "node_modules/.cache/tsbuild/e2e.tsbuildinfo",
    );
    expect(e2eTsconfig.compilerOptions?.types).toEqual(
      expect.arrayContaining(["node", "mocha", "@wdio/globals/types"]),
    );
    expect(e2eTsconfig.include).toEqual(["e2e/**/*.ts"]);
  });

  it("defines specs with existing stable selectors", () => {
    const spec = readText("e2e/macos/specs/app-shell.e2e.ts");

    expect(spec).toContain('aria-label="情侣桌宠 MVP"');
    expect(spec).toContain("桌宠菜单");
    expect(spec).toContain("桌宠设置");
    expect(spec).toContain("形象管理");
    expect(spec).toContain("远程互动");
    expect(spec).toContain("互动选项");
    expect(spec).toContain("我的状态");
    expect(spec).toContain("dialog");
    expect(spec).not.toContain("$('button[role=\"menuitem\"]')");
    expect(spec).toContain("关闭设置");
    expect(spec).not.toContain("data-testid");
  });
});
