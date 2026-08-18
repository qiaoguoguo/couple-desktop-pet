import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as interopEnv from "../../e2e/interop/support/env";

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
      expect(config).toContain("mkdirSync");
      expect(config).toContain("Object.values(isolatedAppEnv)");
      expect(config).toContain('logLevel: "error"');
      expect(config).not.toContain('logLevel: "info"');
      expect(config).not.toContain("tauri-driver");
      expect(config).not.toContain("hostname");
      expect(config).not.toContain("port: 4444");
    }
    expect(readText("e2e/interop/wdio.windows.conf.ts")).toContain(
      "src-tauri/target/release/couple-desktop-pet.exe",
    );
    const windowsConfig = readText("e2e/interop/wdio.windows.conf.ts");
    expect(windowsConfig).toContain("INTEROP_USE_HOST_PROFILE");
    expect(windowsConfig).toContain("useHostProfile");
    expect(windowsConfig).toContain("filterChildAppEnv(process.env)");
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
    expect(evidenceHelper).toContain("recordFailureAndRethrow");
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
    expect(crossPlatformSpec).toContain("recordFailureAndRethrow");
    expect(crossPlatformSpec).not.toContain("summarizeInteropError");
    expect(crossPlatformSpec).not.toContain("errorSummary");
    expect(restartSpec).toContain("recordAndSend");
    expect(restartSpec).toContain("recordFailureAndRethrow");
    expect(restartSpec).not.toContain("summarizeInteropError");
    expect(restartSpec).not.toContain("errorSummary");
  });

  it("creates evidence before opening the encrypted rendezvous session", () => {
    for (const specPath of [
      "e2e/interop/specs/cross-platform.e2e.ts",
      "e2e/interop/specs/restart-unpaired.e2e.ts",
    ]) {
      const spec = readText(specPath);
      const evidenceIndex = spec.indexOf("createEvidenceRecorder(readEvidenceRoleFromEnv())");
      const rendezvousIndex = spec.indexOf("createRendezvousSession()");

      expect(evidenceIndex, `${specPath} should create evidence first`).toBeGreaterThanOrEqual(0);
      expect(rendezvousIndex, `${specPath} should create rendezvous`).toBeGreaterThanOrEqual(0);
      expect(evidenceIndex).toBeLessThan(rendezvousIndex);
      expect(spec).toMatch(/try\s*\{[\s\S]*createRendezvousSession\(\)/);
      expect(spec).toContain("recordFailureAndRethrow");
    }
  });

  it("acknowledges remote messages through a shared pointerenter-compatible hover helper", () => {
    const helperPath = "e2e/support/pointerHover.ts";
    expect(existsSync(join(repoRoot, helperPath))).toBe(true);

    const helper = readText(helperPath);
    const uiHelper = readText("e2e/interop/support/ui.ts");

    expect(helper).toContain("PointerEvent");
    expect(helper).toContain('new PointerEvent("pointerover"');
    expect(helper).toContain("bubbles: true");
    expect(helper).toContain("cancelable: true");
    expect(helper).toContain("composed: true");
    expect(helper).toContain('pointerType: "mouse"');
    expect(helper).toContain("clientX");
    expect(helper).toContain("clientY");
    expect(uiHelper).toContain("dispatchPointerHover");
    expect(uiHelper).not.toContain(".moveTo()");
  });

  it("registers the guarded paired-weather native QA suite on Windows and macOS", () => {
    const weatherSpecPath = "e2e/interop/specs/couple-weather.e2e.ts";
    expect(existsSync(join(repoRoot, weatherSpecPath))).toBe(true);

    for (const configPath of [
      "e2e/interop/wdio.windows.conf.ts",
      "e2e/interop/wdio.macos.conf.ts",
    ]) {
      expect(readText(configPath)).toContain(
        'weather: ["./specs/couple-weather.e2e.ts"]',
      );
    }

    const spec = readText(weatherSpecPath);
    for (const requiredAssertion of [
      "双方天气",
      "杭州",
      "深圳",
      "晴间多云",
      "小雨",
      "最高 31° · 最低 22°",
      "最高 27° · 最低 20°",
      "降雨 20%",
      "降雨 80%",
      "TA 那边可能会下雨，今天记得提醒 TA 带伞。",
      "WeatherAPI.com",
      "resolveNativeEvidenceStem",
      "e2e_window_state",
      "setE2ePairWeatherOverride",
      "projectedPeerProfile",
    ]) {
      expect(spec).toContain(requiredAssertion);
    }
    expect(spec).toContain("getSize");
    expect(spec).toContain("getLocation");

    const overrideSupport = readText("e2e/support/realtimeOverride.ts");
    expect(overrideSupport).toContain("createE2ePairWeatherFixture");
    expect(overrideSupport).toContain("setE2ePairWeatherOverride");
    expect(overrideSupport).toContain("clearE2ePairWeatherOverride");
    expect(overrideSupport).not.toContain("localStorage");
    expect(overrideSupport).not.toContain("URLSearchParams");

    const weatherHook = readText("src/weather/usePairWeather.ts");
    expect(weatherHook).toContain('import.meta.env.VITE_TAURI_E2E === "1"');
    expect(weatherHook).toContain('import("../sync/e2eRealtimeOverride")');
  });

  it("fails closed before every weather E2E settings write unless app data is dedicated", () => {
    const qaSafety = interopEnv as typeof interopEnv & {
      assertDedicatedE2eAppDataPaths?: (
        paths: { app_data_dir: string; settings_path: string },
        platform: NodeJS.Platform,
      ) => void;
    };

    expect(typeof qaSafety.assertDedicatedE2eAppDataPaths).toBe("function");
    if (!qaSafety.assertDedicatedE2eAppDataPaths) {
      return;
    }

    expect(() =>
      qaSafety.assertDedicatedE2eAppDataPaths!(
        {
          app_data_dir:
            "C:\\qa\\AppData\\Roaming\\com.couple.desktoppet.e2e",
          settings_path:
            "C:\\qa\\AppData\\Roaming\\com.couple.desktoppet.e2e\\settings.json",
        },
        "win32",
      ),
    ).not.toThrow();
    expect(() =>
      qaSafety.assertDedicatedE2eAppDataPaths!(
        {
          app_data_dir:
            "/tmp/qa/Library/Application Support/com.couple.desktoppet.e2e",
          settings_path:
            "/tmp/qa/Library/Application Support/com.couple.desktoppet.e2e/settings.json",
        },
        "darwin",
      ),
    ).not.toThrow();

    for (const paths of [
      {
        app_data_dir: "C:\\Users\\qa\\AppData\\Roaming\\com.couple.desktoppet",
        settings_path:
          "C:\\Users\\qa\\AppData\\Roaming\\com.couple.desktoppet\\settings.json",
      },
      {
        app_data_dir:
          "C:\\Users\\qa\\AppData\\Roaming\\com.couple.desktoppet.e2e-unsafe",
        settings_path:
          "C:\\Users\\qa\\AppData\\Roaming\\com.couple.desktoppet.e2e-unsafe\\settings.json",
      },
      {
        app_data_dir:
          "C:\\Users\\qa\\AppData\\Roaming\\com.couple.desktoppet.e2e\\nested",
        settings_path:
          "C:\\Users\\qa\\AppData\\Roaming\\com.couple.desktoppet.e2e\\nested\\settings.json",
      },
      {
        app_data_dir:
          "C:\\Users\\qa\\AppData\\Roaming\\com.couple.desktoppet.e2e",
        settings_path: "C:\\Users\\qa\\AppData\\Roaming\\settings.json",
      },
    ]) {
      expect(() =>
        qaSafety.assertDedicatedE2eAppDataPaths!(paths, "win32"),
      ).toThrow(/refusing E2E settings write/);
    }

    const spec = readText("e2e/interop/specs/couple-weather.e2e.ts");
    expect(spec).toContain("writeE2eSettingsSafely");
    expect(spec).toContain('invokeTauri<E2eAppDataPaths>("e2e_app_data_paths")');
    expect(spec).toContain("assertDedicatedE2eAppDataPaths");
    expect(spec.match(/invokeTauri\("write_settings"/g)).toHaveLength(1);
    expect(spec).toMatch(
      /e2e_app_data_paths[\s\S]*assertDedicatedE2eAppDataPaths[\s\S]*invokeTauri\("write_settings"/,
    );
    expect(readText("e2e/interop/wdio.windows.conf.ts")).toContain(
      "INTEROP_APP_BINARY",
    );
  });

  it("uses platform and verified scale in native weather evidence names", () => {
    const qaSafety = interopEnv as typeof interopEnv & {
      resolveNativeEvidenceStem?: (
        subject: "weather-panel" | "basic-information-settings",
        platform: NodeJS.Platform,
        scaleFactor: number,
      ) => string;
    };

    expect(typeof qaSafety.resolveNativeEvidenceStem).toBe("function");
    if (!qaSafety.resolveNativeEvidenceStem) {
      return;
    }

    expect(
      qaSafety.resolveNativeEvidenceStem("weather-panel", "win32", 1),
    ).toBe("weather-panel-windows-100");
    expect(
      qaSafety.resolveNativeEvidenceStem("weather-panel", "win32", 1.25),
    ).toBe("weather-panel-windows-125");
    expect(
      qaSafety.resolveNativeEvidenceStem("weather-panel", "darwin", 2),
    ).toBe("weather-panel-macos-200");
    expect(() =>
      qaSafety.resolveNativeEvidenceStem("weather-panel", "win32", 0),
    ).toThrow(/invalid native evidence scale/);

    const spec = readText("e2e/interop/specs/couple-weather.e2e.ts");
    expect(spec).toContain("resolveNativeEvidenceStem");
    expect(spec).toContain("basic-information-settings");
    expect(spec).not.toContain('"weather-panel-100.png"');
    expect(spec).not.toContain('"weather-panel-100-metrics.json"');
  });

  it("asserts every required weather field within its own native row", () => {
    const spec = readText("e2e/interop/specs/couple-weather.e2e.ts");

    expect(spec).toContain('[data-testid="weather-row-self"]');
    expect(spec).toContain('[data-testid="weather-row-peer"]');
    expect(spec).toContain("assertReadyWeatherRow");
    expect(spec).toMatch(
      /weather-row-self[\s\S]*小满[\s\S]*杭州[\s\S]*晴间多云[\s\S]*26°[\s\S]*最高 31° · 最低 22°[\s\S]*降雨 20%/,
    );
    expect(spec).toMatch(
      /weather-row-peer[\s\S]*阿岚[\s\S]*深圳[\s\S]*小雨[\s\S]*23°[\s\S]*最高 27° · 最低 20°[\s\S]*降雨 80%/,
    );
  });

  it("scopes updated peer projection assertions to the peer weather row", () => {
    const spec = readText("e2e/interop/specs/couple-weather.e2e.ts");
    const projectionStart = spec.indexOf("const projectedPeerProfile");
    const projectionEnd = spec.indexOf(
      'await $(\'button[aria-label="关闭双方天气"]\').click()',
      projectionStart,
    );
    const projectionBlock = spec.slice(projectionStart, projectionEnd);

    expect(projectionStart).toBeGreaterThanOrEqual(0);
    expect(projectionEnd).toBeGreaterThan(projectionStart);
    expect(projectionBlock).toContain(
      'const projectedPeerRow = await $(\'[data-testid="weather-row-peer"]\')',
    );
    expect(projectionBlock).toContain(
      "const projectedPeerText = await projectedPeerRow.getText()",
    );
    expect(projectionBlock).toContain(
      "expect(projectedPeerText).toContain(projectedPeerProfile.nickname)",
    );
    expect(projectionBlock).toContain(
      "expect(projectedPeerText).toContain(projectedPeerProfile.cityName)",
    );
    expect(projectionBlock).not.toContain("projectedPanel.getText()");
  });

  it("keeps every missing native artifact as an explicit release blocker", () => {
    const manual = readText("docs/manual-verification/couple-weather.md");

    for (const requiredGate of [
      "weather-panel-windows-100.png",
      "basic-information-settings-windows-100.png",
      "100% OS-level gutter click-through",
      "weather-panel-windows-125.png",
      "125% OS-level gutter click-through",
      "weather-panel-windows-150.png",
      "150% OS-level gutter click-through",
      "Release sign-off is blocked if any item above is missing",
    ]) {
      expect(manual).toContain(requiredGate);
    }
  });
});
