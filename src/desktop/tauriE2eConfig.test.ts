import { existsSync, readFileSync } from "node:fs";
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
    const productionConfig = readJson<{ identifier?: string }>("src-tauri/tauri.conf.json");
    const defaultCapability = readJson<{ permissions?: string[] }>(
      "src-tauri/capabilities/default.json",
    );
    const e2eConfig = readJson<{
      identifier?: string;
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
    const packageJson = readJson<{ scripts?: Record<string, string> }>("package.json");

    expect(productionConfig.identifier).toBe("com.couple.desktoppet");
    expect(e2eConfig.identifier).toBe("com.couple.desktoppet.e2e");
    expect(e2eConfig.identifier).not.toBe(productionConfig.identifier);
    expect(packageJson.scripts?.["e2e:macos:build"]).toContain(
      "--config src-tauri/tauri.e2e.conf.json",
    );
    expect(packageJson.scripts?.["e2e:windows:build"]).toContain(
      "--config src-tauri/tauri.e2e.conf.json",
    );
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
    const contextMenuHelper = readText("e2e/support/contextMenu.ts");
    const interactionMenuHelper = readText("e2e/support/interactionMenu.ts");
    const stableSelectors = `${spec}\n${contextMenuHelper}\n${interactionMenuHelper}`;

    expect(spec).toContain('aria-label="情侣桌宠 MVP"');
    expect(stableSelectors).toContain("桌宠菜单");
    expect(spec).toContain("桌宠设置");
    expect(spec).toContain("形象管理");
    expect(spec).toContain("远程互动");
    expect(stableSelectors).toContain("互动选项");
    expect(spec).toContain("我的状态");
    expect(spec).toContain("dialog");
    expect(spec).not.toContain("$('button[role=\"menuitem\"]')");
    expect(spec).toContain("关闭设置");
    expect(spec).not.toContain("data-testid");
  });

  it("invokes Tauri commands through the stable internal bridge, not the optional global API", () => {
    const helper = readText("e2e/support/tauri.ts");

    expect(helper).toContain("__TAURI_INTERNALS__");
    expect(helper).toContain(".invoke(commandName, commandArgs)");
    expect(helper).not.toContain("__TAURI__");
    expect(helper).not.toContain(".core?.invoke");
    expect(helper).not.toContain(".core.invoke");
  });

  it("adds a macOS native parity spec with e2e-only native evidence commands", () => {
    const specPath = "e2e/macos/specs/native-parity.e2e.ts";
    expect(existsSync(join(repoRoot, specPath))).toBe(true);

    const spec = readText(specPath);

    for (const command of [
      "e2e_window_state",
      "e2e_trigger_tray_hide",
      "e2e_trigger_tray_show",
      "e2e_trigger_tray_settings",
      "e2e_close_main_window",
      "e2e_move_window",
      "e2e_read_window_position",
      "e2e_trigger_auto_move",
      "e2e_create_pet_package_fixture",
      "e2e_remove_pet_package_fixture",
    ]) {
      expect(spec).toContain(command);
    }
    expect(spec).not.toContain("e2e_apply_saved_window_position");
    expect(spec).toContain("browser.reloadSession()");
    expect(spec).toContain("chooseSafeDistinctWindowPosition");
    expect(spec).toContain("originalWindowPosition");
    expect(spec).toContain("restoreOriginalWindowPosition");
    expect(spec).not.toContain("before.position.x + 32");
    expect(spec).not.toContain("before.position.y + 32");
    expect(spec).toContain("position-restored-after-restart");
    expect(spec).toContain("trayExists");
    expect(spec).toContain("HTMLInputElement.prototype");
    expect(spec).not.toContain("input.value = nextValue");
    expect(spec).not.toMatch(/e2e_remove_pet_package_fixture"[\s\S]{0,120}sourcePath/);
    expect(spec).not.toMatch(
      /const\s+after\s*=\s*await\s+invokeTauri<WindowState>\("e2e_trigger_auto_move"/,
    );
    expect(spec).toMatch(
      /await\s+invokeTauri<WindowState>\("e2e_trigger_auto_move"[\s\S]*?const\s+after\s*=\s*await\s+waitForWindowState\(\s*\(\s*state\s*\)\s*=>[\s\S]*?before\.position/,
    );
    const scaleAutoMoveSpec = spec.slice(
      spec.indexOf("async function verifyScaleAndAutoMove"),
      spec.indexOf("async function verifyPackageImportSelectDelete"),
    );
    expect(scaleAutoMoveSpec).toMatch(
      /await\s+setCheckbox\("自动移动",\s*true\);[\s\S]*?settings\.autoMoveEnabled\s*===\s*true/,
    );
    expect(scaleAutoMoveSpec).toMatch(
      /await\s+setCheckbox\("自动移动",\s*false\);[\s\S]*?settings\.autoMoveEnabled\s*===\s*false[\s\S]*?await\s+closeSettings\(\);[\s\S]*?await\s+invokeTauri<WindowState>\("e2e_trigger_auto_move"/,
    );

    for (const artifact of [
      "tray-show.log",
      "tray-settings.log",
      "close-to-hide.log",
      "drag-position-after.log",
      "restart-position.log",
      "scale-auto-move.log",
      "click-through-recovered.log",
      "package-import.png",
      "message-composer.png",
      "edge-left.png",
      "edge-right.png",
      "edge-top.png",
      "edge-bottom.png",
    ]) {
      expect(spec).toContain(artifact);
    }
  });

  it("registers native parity driver commands only behind the e2e feature", () => {
    const mainRs = readText("src-tauri/src/main.rs");
    const e2eCommandsPath = "src-tauri/src/e2e_commands.rs";
    expect(existsSync(join(repoRoot, e2eCommandsPath))).toBe(true);

    const e2eCommands = readText(e2eCommandsPath);

    expect(mainRs).toContain("#[cfg(feature = \"e2e\")]");
    expect(mainRs).toContain("mod e2e_commands;");
    expect(mainRs).toContain("e2e_commands::e2e_window_state");
    expect(mainRs).toContain("e2e_commands::e2e_trigger_tray_show");
    expect(mainRs).toContain("#[cfg(not(feature = \"e2e\"))]");
    expect(e2eCommands).toContain("#[tauri::command]");
    expect(e2eCommands).toContain("tray_by_id(\"main\")");
    expect(e2eCommands).toContain("recover_click_through_and_show_main_window");
    expect(e2eCommands).toContain("ClickThroughRecoveryReason::Show");
    expect(e2eCommands).toContain("ClickThroughRecoveryReason::Settings");
    expect(e2eCommands).toContain("fn fixed_fixture_source_path");
    expect(e2eCommands).not.toContain("pub fn e2e_remove_pet_package_fixture(source_path");
    expect(e2eCommands).not.toContain("cfg_attr");

    const spec = readText("e2e/macos/specs/native-parity.e2e.ts");
    expect(spec).toContain('"import_pet_package"');
    expect(spec).toContain('"list_pet_packages"');
  });

  it("routes macOS QA native parity evidence into the hidden SDD evidence directory", () => {
    const workflow = readText(".github/workflows/macos-qa.yml");
    const finalGate = readText("scripts/macos/final-release-gate.mjs");
    const helper = readText("e2e/support/nativeEvidence.ts");
    const matrix = readText(
      ".superpowers/sdd/2026-08-07-macos-cross-platform/final-acceptance-matrix.md",
    );

    expect(workflow).not.toContain("MACOS_NATIVE_PARITY_EVIDENCE_DIR");
    expect(helper).toContain("resolveNativeParityEvidenceDir");
    expect(helper).toContain("MACOS_NATIVE_PARITY_EVIDENCE_DIR");
    expect(helper).toContain("GITHUB_ACTIONS");
    expect(helper).toContain("GITHUB_WORKSPACE");
    expect(helper).toContain(".superpowers/sdd/2026-08-07-macos-cross-platform/native");
    expect(workflow).toContain("e2e-macos.log");
    expect(workflow).toContain("include-hidden-files: true");
    expect(finalGate).toContain("native/native-parity-events.jsonl");
    expect(finalGate).toContain("native/no-dock-runtime.log");
    expect(finalGate).toContain("native/package-import.png");
    expect(finalGate).toContain("native/edge-left.png");
    expect(matrix).toContain("native/native-parity-events.jsonl");
    expect(matrix).toContain("macOS native parity WDIO");
  });

  it("opens the pet context menu through a shared DOM contextmenu helper", () => {
    const helper = readText("e2e/support/contextMenu.ts");
    const appShellSpec = readText("e2e/macos/specs/app-shell.e2e.ts");
    const interopUi = readText("e2e/interop/support/ui.ts");

    expect(helper).toContain('section[aria-label="情侣桌宠 MVP"]');
    expect(helper).toContain('new MouseEvent("contextmenu"');
    expect(helper).toContain("bubbles: true");
    expect(helper).toContain("cancelable: true");
    expect(helper).toContain("composed: true");
    expect(helper).toContain("button: 2");
    expect(helper).toContain("buttons: 0");
    expect(helper).toContain("clientX");
    expect(helper).toContain("clientY");
    expect(helper).toContain('[role="menu"][aria-label="桌宠菜单"]');

    for (const source of [appShellSpec, interopUi]) {
      expect(source).toContain("openPetContextMenu");
      expect(source).not.toContain('click({ button: "right" })');
    }
  });

  it("opens the interaction menu through a shared pet frame click helper", () => {
    const helperPath = "e2e/support/interactionMenu.ts";
    expect(existsSync(join(repoRoot, helperPath))).toBe(true);

    const helper = readText(helperPath);
    const appShellSpec = readText("e2e/macos/specs/app-shell.e2e.ts");
    const interopUi = readText("e2e/interop/support/ui.ts");

    expect(helper).toContain('const petFrameStageSelector = ".pet-frame-stage"');
    expect(helper).toContain("await stage.click()");
    expect(helper).toContain('[role="menu"][aria-label="互动选项"]');
    expect(helper).not.toContain('section[aria-label="情侣桌宠 MVP"]');

    for (const source of [appShellSpec, interopUi]) {
      expect(source).toContain("openInteractionMenu");
      expect(source).not.toMatch(/await\s+surface\.click\(\)/);
      expect(source).not.toMatch(/\$\('section\[aria-label="情侣桌宠 MVP"\]'\)[\s\S]{0,120}\.click\(\)/);
    }
  });
});
