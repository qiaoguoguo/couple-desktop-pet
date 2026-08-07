# macOS Cross-Platform Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify a macOS 12+ Universal DMG release that matches the current Windows client behavior and interoperates with Windows through the existing Relay.

**Architecture:** Keep one React/TypeScript/Tauri codebase and add only platform shell adapters, macOS bundle configuration, QA automation, and release evidence plumbing. Shared React UI, `.cdpet` package format, `shared/syncProtocol`, Relay HTTP, and WebSocket protocol remain single-source and unbranched. Runtime macOS behavior lives behind `cfg(target_os = "macos")` Rust shell code and existing desktop command boundaries.

**Tech Stack:** Tauri 2, Rust 2021, React 19, TypeScript 7, Vite 8, Vitest 4, WebdriverIO with Tauri driver, macOS `hdiutil`/`codesign`/`spctl`/`notarytool`, GitHub Actions or self-hosted real Mac runners.

## Global Constraints

- Supported OS: macOS 12 Monterey and later.
- CPU support: Intel x86_64 and Apple Silicon arm64 in one Universal Binary.
- Delivery artifact: an off-store `.dmg` installer containing the `.app`.
- Product scope: feature baseline is strictly equal to the current Windows client.
- Do not add new business features, change product semantics, or redesign animation.
- Continue using `DEFAULT_RELAY_URL` as `http://159.75.175.47:8787`.
- Do not change auth, pair, status, message, capability, or unpair protocol payloads.
- Keep React, TypeScript, role package rendering, settings model, `shared/syncProtocol`, Relay HTTP APIs, and Relay WebSocket protocol unbranched.
- Rust/Tauri code may add `cfg(target_os = "macos")` only for platform shell behavior.
- Do not create a separate macOS application project.
- Do not fix the existing behavior where `imported:q-girl-complete-v3` does not receive built-in edge animation.
- Do not modify server business logic, account flow, payment, voice, store, or public matching.
- Do not commit device secrets, pair secrets, Apple credentials, certificates, provisioning material, or message bodies.
- Evidence directory for implementation: `.superpowers/sdd/2026-08-07-macos-cross-platform/`.
- Current repository has no git remote or connected GitHub connector; implementation can add reusable CI files, but running CI requires connecting a real Mac service and repository remote.
- Without Apple Developer credentials, only an ad-hoc QA DMG can be produced; it is not a formal no-warning installer.

---

## File Structure

Planned additions and responsibilities:

- `src-tauri/tauri.macos.conf.json` - macOS-only Tauri overlay merged at build time.
- `src-tauri/Info.macos.plist` - scoped App Transport Security exception for `159.75.175.47`.
- `src-tauri/icons/icon.icns` - macOS bundle icon derived from existing project icon assets.
- `src/desktop/tauriMacosConfig.test.ts` - static config contract tests for the macOS overlay and plist.
- `src-tauri/src/platform.rs` - platform shell policy and runtime hooks exported to `main.rs`.
- `src-tauri/src/platform/macos.rs` - macOS activation policy and accessory app behavior.
- `src-tauri/src/platform/default.rs` - non-macOS no-op platform adapter.
- `src-tauri/src/main.rs` - calls platform shell setup during Tauri setup and keeps tray command routing centralized.
- `src-tauri/src/commands.rs` - small command-level safety changes for show/settings and pure geometry policy tests.
- `src/desktop/windowCommands.test.ts` - frontend bridge command name regression coverage.
- `src/app/App.test.tsx` - existing app-level interaction regression coverage for tray/settings/edge overlays.
- `scripts/macos/qa-build.mjs` - macOS engineering build and artifact verification script.
- `scripts/macos/qa-build.test.ts` - unit tests for the build script command plan and log redaction.
- `scripts/macos/native-evidence.mjs` - macOS native evidence collection script.
- `scripts/macos/native-evidence.test.ts` - static and command-plan tests for native evidence collection.
- `scripts/interop/cross-platform-smoke.mjs` - Windows-to-macOS interop smoke runner using real clients and isolated app data directories.
- `scripts/interop/cross-platform-smoke.test.ts` - tests for evidence redaction, app-data isolation, and required event matrix.
- `e2e/macos/wdio.conf.ts` - WebdriverIO config for the Tauri macOS app.
- `e2e/macos/specs/*.e2e.ts` - DOM-visible macOS QA flows.
- `.github/workflows/macos-qa.yml` - real Mac ad-hoc Universal artifact workflow.
- `.github/workflows/macos-release.yml` - Developer ID signing, notarization, stapling, and release assessment workflow.
- `.superpowers/sdd/2026-08-07-macos-cross-platform/README.md` - evidence manifest template committed through the final docs task.
- `.superpowers/sdd/2026-08-07-macos-cross-platform/final-acceptance-matrix.md` - final gate matrix template with required evidence paths.
- `package.json` - adds scripts and test-only dev dependencies.
- `src-tauri/Cargo.toml` - adds only platform features or dependencies required by Tauri macOS shell code.

No task creates an independent macOS project, duplicates the Relay protocol, changes `.cdpet` semantics, or changes the paused imported Q-girl edge behavior.

---

### Task 1: macOS Tauri Overlay And ATS Contract

**Files:**
- Create: `src-tauri/tauri.macos.conf.json`
- Create: `src-tauri/Info.macos.plist`
- Create: `src/desktop/tauriMacosConfig.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: base config at `src-tauri/tauri.conf.json`.
- Produces: package script `tauri:build:mac:adhoc` with command `tauri build --target universal-apple-darwin --bundles app,dmg --config src-tauri/tauri.macos.conf.json`.
- Produces: macOS overlay keys `app.macOSPrivateApi`, `bundle.active`, `bundle.targets`, `bundle.icon`, `bundle.macOS.minimumSystemVersion`, `bundle.macOS.infoPlist`, `bundle.macOS.signingIdentity`, and `bundle.macOS.dmg`.

- [ ] **Step 1: Write the failing config contract test**

Create `src/desktop/tauriMacosConfig.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readJson(path: string) {
  return JSON.parse(readFileSync(join(repoRoot, path), "utf8")) as Record<string, unknown>;
}

describe("macOS Tauri release config", () => {
  it("enables private transparent window support and bundles app plus dmg", () => {
    const config = readJson("src-tauri/tauri.macos.conf.json") as {
      app?: { macOSPrivateApi?: boolean };
      bundle?: {
        active?: boolean;
        targets?: string[];
        icon?: string[];
        macOS?: {
          minimumSystemVersion?: string;
          infoPlist?: string;
          signingIdentity?: string | null;
          hardenedRuntime?: boolean;
        };
      };
    };

    expect(config.app?.macOSPrivateApi).toBe(true);
    expect(config.bundle?.active).toBe(true);
    expect(config.bundle?.targets).toEqual(["app", "dmg"]);
    expect(config.bundle?.icon).toContain("icons/icon.icns");
    expect(config.bundle?.macOS?.minimumSystemVersion).toBe("12.0");
    expect(config.bundle?.macOS?.infoPlist).toBe("Info.macos.plist");
    expect(config.bundle?.macOS?.signingIdentity).toBeNull();
    expect(config.bundle?.macOS?.hardenedRuntime).toBe(true);
  });

  it("keeps the ATS exception scoped to the current relay IP", () => {
    const plist = readFileSync(join(repoRoot, "src-tauri/Info.macos.plist"), "utf8");

    expect(plist).toContain("<key>NSAppTransportSecurity</key>");
    expect(plist).toContain("<key>NSExceptionDomains</key>");
    expect(plist).toContain("<key>159.75.175.47</key>");
    expect(plist).toContain("<key>NSExceptionAllowsInsecureHTTPLoads</key>");
    expect(plist).not.toContain("NSAllowsArbitraryLoads");
  });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run src/desktop/tauriMacosConfig.test.ts`

Expected: FAIL because `src-tauri/tauri.macos.conf.json` and `src-tauri/Info.macos.plist` do not exist.

- [ ] **Step 3: Add the macOS overlay**

Create `src-tauri/tauri.macos.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "app": {
    "macOSPrivateApi": true
  },
  "bundle": {
    "active": true,
    "targets": ["app", "dmg"],
    "icon": ["icons/icon.icns"],
    "macOS": {
      "minimumSystemVersion": "12.0",
      "infoPlist": "Info.macos.plist",
      "signingIdentity": null,
      "hardenedRuntime": true,
      "dmg": {
        "appPosition": { "x": 180, "y": 170 },
        "applicationFolderPosition": { "x": 480, "y": 170 },
        "windowSize": { "width": 660, "height": 400 }
      }
    }
  }
}
```

Create `src-tauri/Info.macos.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSExceptionDomains</key>
    <dict>
      <key>159.75.175.47</key>
      <dict>
        <key>NSExceptionAllowsInsecureHTTPLoads</key>
        <true/>
        <key>NSIncludesSubdomains</key>
        <false/>
      </dict>
    </dict>
  </dict>
</dict>
</plist>
```

Modify `package.json` scripts:

```json
{
  "tauri:build:mac:adhoc": "tauri build --target universal-apple-darwin --bundles app,dmg --config src-tauri/tauri.macos.conf.json"
}
```

If `src-tauri/icons/icon.icns` is missing, generate it from existing committed icon source in a later build-support task and keep this task's test RED until the icon exists.
- [ ] **Step 4: Run GREEN**

Run: `pnpm vitest run src/desktop/tauriMacosConfig.test.ts`

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/tauri.macos.conf.json src-tauri/Info.macos.plist src/desktop/tauriMacosConfig.test.ts package.json
git commit -m "feat: add macos tauri release config"
```

---

### Task 2: Rust macOS Platform Shell Adapter

**Files:**
- Create: `src-tauri/src/platform.rs`
- Create: `src-tauri/src/platform/macos.rs`
- Create: `src-tauri/src/platform/default.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/Cargo.toml`

**Interfaces:**
- Produces: `platform::configure_platform_shell(app: &mut tauri::App) -> tauri::Result<()>`.
- Produces: `platform::platform_shell_policy(kind: DesktopPlatform) -> PlatformShellPolicy`.
- Consumes: existing `setup_tray(app)` and `commands::install_main_window_close_to_hide(app.handle())` sequence in `main.rs`.

- [ ] **Step 1: Write RED Rust policy tests**

Add to `src-tauri/src/platform.rs`:

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum DesktopPlatform {
    Macos,
    Other,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ActivationPolicyKind {
    Accessory,
    Default,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct PlatformShellPolicy {
    pub activation_policy: ActivationPolicyKind,
    pub hide_dock_icon: bool,
    pub uses_menu_bar_tray: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn macos_shell_policy_uses_accessory_menu_bar_app() {
        assert_eq!(
            platform_shell_policy(DesktopPlatform::Macos),
            PlatformShellPolicy {
                activation_policy: ActivationPolicyKind::Accessory,
                hide_dock_icon: true,
                uses_menu_bar_tray: true,
            },
        );
    }

    #[test]
    fn non_macos_shell_policy_keeps_default_activation() {
        assert_eq!(
            platform_shell_policy(DesktopPlatform::Other),
            PlatformShellPolicy {
                activation_policy: ActivationPolicyKind::Default,
                hide_dock_icon: false,
                uses_menu_bar_tray: true,
            },
        );
    }
}
```

- [ ] **Step 2: Run RED**

Run: `cargo test --manifest-path src-tauri/Cargo.toml platform_shell_policy -- --nocapture`

Expected: FAIL because `mod platform;`, `platform_shell_policy`, and runtime adapter files are not wired.

- [ ] **Step 3: Implement platform adapter**

In `src-tauri/src/main.rs`, add `mod platform;` and call it inside `setup` before `setup_tray(app)?`:

```rust
platform::configure_platform_shell(app)?;
setup_tray(app)?;
```

Implement `src-tauri/src/platform.rs`:

```rust
#[cfg(target_os = "macos")]
mod macos;
#[cfg(not(target_os = "macos"))]
mod default;

#[cfg(not(target_os = "macos"))]
use self::default as imp;
#[cfg(target_os = "macos")]
use self::macos as imp;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum DesktopPlatform {
    Macos,
    Other,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ActivationPolicyKind {
    Accessory,
    Default,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct PlatformShellPolicy {
    pub activation_policy: ActivationPolicyKind,
    pub hide_dock_icon: bool,
    pub uses_menu_bar_tray: bool,
}

pub(crate) fn platform_shell_policy(kind: DesktopPlatform) -> PlatformShellPolicy {
    match kind {
        DesktopPlatform::Macos => PlatformShellPolicy {
            activation_policy: ActivationPolicyKind::Accessory,
            hide_dock_icon: true,
            uses_menu_bar_tray: true,
        },
        DesktopPlatform::Other => PlatformShellPolicy {
            activation_policy: ActivationPolicyKind::Default,
            hide_dock_icon: false,
            uses_menu_bar_tray: true,
        },
    }
}

pub(crate) fn configure_platform_shell(app: &mut tauri::App) -> tauri::Result<()> {
    imp::configure_platform_shell(app)
}
```

Implement `src-tauri/src/platform/default.rs`:

```rust
pub(crate) fn configure_platform_shell(_app: &mut tauri::App) -> tauri::Result<()> {
    Ok(())
}
```

Implement `src-tauri/src/platform/macos.rs`:

```rust
pub(crate) fn configure_platform_shell(app: &mut tauri::App) -> tauri::Result<()> {
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);
    Ok(())
}
```

- [ ] **Step 4: Run GREEN**

Run: `cargo test --manifest-path src-tauri/Cargo.toml platform_shell_policy -- --nocapture`

Expected: PASS, policy tests prove macOS Accessory and non-macOS default behavior.

- [ ] **Step 5: Full task verification**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --check --manifest-path src-tauri/Cargo.toml
```

Expected: all Rust tests pass and formatting is clean.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/main.rs src-tauri/src/platform.rs src-tauri/src/platform/macos.rs src-tauri/src/platform/default.rs src-tauri/Cargo.toml
git commit -m "feat: add macos platform shell adapter"
```

---

### Task 3: Tray Recovery From Click-Through And Close-To-Hide

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src/desktop/windowCommands.test.ts`

**Interfaces:**
- Consumes: existing `commands::show_main_window`, `commands::emit_open_settings`, `commands::set_window_click_through`, and tray menu IDs `show`, `hide`, `settings`, `quit`.
- Produces: pure helper `commands::show_window_recovery_steps(click_through_enabled: bool) -> WindowRecoverySteps`.

- [ ] **Step 1: Write RED Rust tests for recovery policy**

Add to `src-tauri/src/commands.rs` tests:

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct WindowRecoverySteps {
    clear_click_through: bool,
    show_window: bool,
    focus_window: bool,
}

#[test]
fn tray_show_clears_click_through_before_showing_and_focusing() {
    assert_eq!(
        show_window_recovery_steps(true),
        WindowRecoverySteps {
            clear_click_through: true,
            show_window: true,
            focus_window: true,
        },
    );
}

#[test]
fn tray_show_still_shows_and_focuses_when_click_through_is_already_disabled() {
    assert_eq!(
        show_window_recovery_steps(false),
        WindowRecoverySteps {
            clear_click_through: false,
            show_window: true,
            focus_window: true,
        },
    );
}
```

- [ ] **Step 2: Write RED frontend bridge tests**

Extend `src/desktop/windowCommands.test.ts`:

```ts
import { showWindow, quitApp } from "./windowCommands";

it("keeps show window command name unchanged for tray recovery", async () => {
  desktopApiMock.invokeCommand.mockResolvedValueOnce(undefined);

  await showWindow();

  expect(desktopApiMock.invokeCommand).toHaveBeenCalledWith("show_window");
});

it("keeps quit command explicit for lifecycle release", async () => {
  desktopApiMock.invokeCommand.mockResolvedValueOnce(undefined);

  await quitApp();

  expect(desktopApiMock.invokeCommand).toHaveBeenCalledWith("quit_app");
});
```

- [ ] **Step 3: Run RED**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml tray_show -- --nocapture
pnpm vitest run src/desktop/windowCommands.test.ts
```

Expected: Rust fails until helper exists. Frontend test can pass if bridge names already match; keep it as regression coverage.

- [ ] **Step 4: Implement recovery helper and runtime behavior**

Add in `src-tauri/src/commands.rs` near `show_main_window`:

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct WindowRecoverySteps {
    clear_click_through: bool,
    show_window: bool,
    focus_window: bool,
}

fn show_window_recovery_steps(click_through_enabled: bool) -> WindowRecoverySteps {
    WindowRecoverySteps {
        clear_click_through: click_through_enabled,
        show_window: true,
        focus_window: true,
    }
}
```

Update `show_main_window` to clear click-through before show/focus:

```rust
pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let window = main_window(app)?;
    set_window_click_through(&window, false)?;
    window
        .show()
        .map_err(|error| format!("failed to show main window: {error}"))?;
    window
        .set_focus()
        .map_err(|error| format!("failed to focus main window: {error}"))
}
```

Keep `emit_open_settings` clearing click-through before show/focus and emitting `open-settings`.

- [ ] **Step 5: Run GREEN**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml tray_show main_window_close -- --nocapture
pnpm vitest run src/desktop/windowCommands.test.ts
```

Expected: Rust recovery and close-to-hide tests pass; frontend command tests pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/main.rs src/desktop/windowCommands.test.ts
git commit -m "fix: recover macos tray window from click through"
```

---

### Task 4: Cross-Platform Work Area And Geometry Regression Tests

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src/app/App.test.tsx`

**Interfaces:**
- Consumes: existing pure geometry helpers `clamp_saved_window_position`, `calculate_message_composer_surface_geometry`, `calculate_message_composer_restore_geometry`, `calculate_edge_peek_snap`, and `calculate_edge_peek_restore_position`.
- Produces: additional tests only unless a macOS-specific work-area bug is exposed.

- [ ] **Step 1: Write RED geometry tests**

Add to `src-tauri/src/commands.rs` tests:

```rust
#[test]
fn saved_position_clamps_inside_macos_menu_bar_work_area_with_negative_origin() {
    let work_area = TestWorkArea {
        x: -1512,
        y: 25,
        width: 1512,
        height: 919,
    };
    let window = TestWindowGeometry {
        x: -1900,
        y: -40,
        width: 480,
        height: 540,
    };
    let saved_position = SavedWindowPosition { x: -1900, y: -40 };

    let position = clamp_saved_window_position(saved_position, work_area, window);

    assert_eq!(position, PhysicalPosition::new(-1488, 49));
}

#[test]
fn message_composer_geometry_uses_macos_work_area_not_full_display() {
    let work_area = TestWorkArea {
        x: 0,
        y: 25,
        width: 1440,
        height: 875,
    };
    let pet_window = TestWindowGeometry {
        x: 1080,
        y: 520,
        width: 320,
        height: 360,
    };

    let surface = calculate_message_composer_surface_geometry(work_area, pet_window);

    assert_eq!(surface.window, TestWindowGeometry {
        x: 500,
        y: 332,
        width: 440,
        height: 260,
    });
    assert_eq!(surface.saved_pet_window, pet_window);
}

#[test]
fn edge_snap_keeps_existing_imported_package_capability_behavior_out_of_scope() {
    let work_area = TestWorkArea {
        x: 0,
        y: 25,
        width: 1440,
        height: 875,
    };
    let window = TestWindowGeometry {
        x: 8,
        y: 200,
        width: 320,
        height: 360,
    };

    assert_eq!(
        calculate_edge_peek_snap(work_area, window),
        Some(EdgePeekSnap {
            side: EdgePeekSide::Left,
            position: PhysicalPosition::new(-71, 200),
        }),
    );
}
```

- [ ] **Step 2: Run RED**

Run: `cargo test --manifest-path src-tauri/Cargo.toml macos_work_area -- --nocapture`

Expected: at least one new test fails if current centering/clamping does not respect the macOS-style work-area constants. If every test passes, record that the existing pure geometry already satisfies the macOS work-area contract and proceed without production changes.

- [ ] **Step 3: Implement minimal geometry fix if RED exposes one**

Keep changes inside existing pure functions. Do not change `src/assets/builtInEdgeInteraction.ts` and do not broaden package IDs for edge animation.

Acceptable minimal change shape:

```rust
fn centered_axis(area_start: i32, area_size: u32, window_size: u32) -> i32 {
    area_start + ((area_size as i32 - window_size as i32) / 2).max(0)
}
```

If this function already produces the expected value, leave production code untouched.

- [ ] **Step 4: Add App regression when native geometry affects UI flow**

If Task 4 changes a command called by React, add or update `src/app/App.test.tsx` to keep message composer and edge overlays hidden/restored with current selectors:

```ts
it("keeps current imported package edge behavior unchanged during macOS geometry work", async () => {
  petPackageCommandsMock.listPetPackages.mockResolvedValueOnce([
    importedPackageSummary("q-girl-complete-v3", "Q 版女孩"),
  ]);
  windowCommandsMock.readSettings.mockResolvedValueOnce({
    appearance: { selectedPetPackageId: "imported:q-girl-complete-v3" },
  });
  const { container } = render(<App />);

  await flushAppEffects();
  await dragPetPastThresholdAndRelease(container);

  expect(windowCommandsMock.snapWindowToEdgeIfNeeded).not.toHaveBeenCalled();
  expect(screen.queryByAltText("桌宠边缘进入")).toBeNull();
});
```

- [ ] **Step 5: Run GREEN**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml macos_work_area edge_peek message_composer -- --nocapture
pnpm vitest run src/app/App.test.tsx
```

Expected: Rust geometry tests and App regressions pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands.rs src/app/App.test.tsx
git commit -m "test: cover macos work area geometry"
```

---

### Task 5: macOS Engineering Build And Artifact Verification Script

**Files:**
- Create: `scripts/macos/qa-build.mjs`
- Create: `scripts/macos/qa-build.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `pnpm macos:qa-build`.
- Produces: function `createMacosQaBuildPlan(options: MacosQaBuildOptions): BuildStep[]` exported from `scripts/macos/qa-build.mjs`.
- Produces evidence files under `.superpowers/sdd/2026-08-07-macos-cross-platform/build/`.

- [ ] **Step 1: Write RED script tests**

Create `scripts/macos/qa-build.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createMacosQaBuildPlan, redactBuildLog } from "./qa-build.mjs";

describe("macOS QA build script", () => {
  it("plans universal target installation, dmg verification, binary inspection, and hashes", () => {
    const steps = createMacosQaBuildPlan({
      repoRoot: "/repo",
      evidenceDir: "/repo/.superpowers/sdd/2026-08-07-macos-cross-platform/build",
      appName: "情侣桌宠",
    });

    expect(steps.map((step) => step.name)).toEqual([
      "environment",
      "rust-target-x86_64",
      "rust-target-aarch64",
      "frontend-tests",
      "typecheck",
      "rust-tests",
      "rust-check",
      "universal-dmg",
      "hdiutil-verify",
      "hdiutil-attach",
      "file",
      "lipo",
      "codesign-verify",
      "sha256",
    ]);
    expect(steps.find((step) => step.name === "universal-dmg")?.command).toContain(
      "pnpm tauri build --target universal-apple-darwin --bundles app,dmg --config src-tauri/tauri.macos.conf.json",
    );
  });

  it("redacts Apple credentials from captured logs", () => {
    expect(
      redactBuildLog("APPLE_ID=user@example.com APPLE_APP_SPECIFIC_PASSWORD=abcd-efgh"),
    ).toBe("APPLE_ID=<redacted> APPLE_APP_SPECIFIC_PASSWORD=<redacted>");
  });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run scripts/macos/qa-build.test.ts`

Expected: FAIL because `scripts/macos/qa-build.mjs` does not exist.

- [ ] **Step 3: Implement script module**

Create `scripts/macos/qa-build.mjs` with:

```js
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { platform } from "node:os";

export function createMacosQaBuildPlan({ repoRoot, evidenceDir, appName }) {
  const dmgGlob = `src-tauri/target/universal-apple-darwin/release/bundle/dmg/${appName}_*.dmg`;
  const appBinary = `src-tauri/target/universal-apple-darwin/release/bundle/macos/${appName}.app/Contents/MacOS/couple-desktop-pet`;
  return [
    { name: "environment", command: "sw_vers && uname -m && rustc -V && cargo -V && node -v && pnpm -v" },
    { name: "rust-target-x86_64", command: "rustup target add x86_64-apple-darwin" },
    { name: "rust-target-aarch64", command: "rustup target add aarch64-apple-darwin" },
    { name: "frontend-tests", command: "pnpm test" },
    { name: "typecheck", command: "pnpm typecheck" },
    { name: "rust-tests", command: "cargo test --manifest-path src-tauri/Cargo.toml" },
    { name: "rust-check", command: "cargo check --manifest-path src-tauri/Cargo.toml" },
    { name: "universal-dmg", command: "pnpm tauri build --target universal-apple-darwin --bundles app,dmg --config src-tauri/tauri.macos.conf.json" },
    { name: "hdiutil-verify", command: `hdiutil verify ${dmgGlob}` },
    { name: "hdiutil-attach", command: `hdiutil attach ${dmgGlob} -nobrowse -readonly` },
    { name: "file", command: `file ${appBinary}` },
    { name: "lipo", command: `lipo -info ${appBinary}` },
    { name: "codesign-verify", command: `codesign --verify --deep --strict --verbose=2 src-tauri/target/universal-apple-darwin/release/bundle/macos/${appName}.app` },
    { name: "sha256", command: `shasum -a 256 ${dmgGlob} ${appBinary}` },
  ].map((step) => ({ ...step, cwd: repoRoot, logPath: join(evidenceDir, `${step.name}.log`) }));
}

export function redactBuildLog(text) {
  return text
    .replace(/APPLE_ID=\\S+/g, "APPLE_ID=<redacted>")
    .replace(/APPLE_APP_SPECIFIC_PASSWORD=\\S+/g, "APPLE_APP_SPECIFIC_PASSWORD=<redacted>")
    .replace(/APPLE_CERTIFICATE_PASSWORD=\\S+/g, "APPLE_CERTIFICATE_PASSWORD=<redacted>");
}
```

Add CLI runner in the same file that refuses non-macOS:

```js
if (import.meta.url === `file://${process.argv[1]}`) {
  if (platform() !== "darwin") {
    console.error("macos qa build must run on macOS");
    process.exit(1);
  }
  const repoRoot = process.cwd();
  const evidenceDir = join(repoRoot, ".superpowers/sdd/2026-08-07-macos-cross-platform/build");
  mkdirSync(evidenceDir, { recursive: true });
  for (const step of createMacosQaBuildPlan({ repoRoot, evidenceDir, appName: "情侣桌宠" })) {
    await runStep(step);
  }
}
```

Implement `runStep(step)` with `spawn("bash", ["-lc", step.command])`, writing redacted stdout and stderr to `step.logPath`, and exiting nonzero on the first failing step.

Modify `package.json`:

```json
{
  "macos:qa-build": "node scripts/macos/qa-build.mjs"
}
```

- [ ] **Step 4: Run GREEN**

Run: `pnpm vitest run scripts/macos/qa-build.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/macos/qa-build.mjs scripts/macos/qa-build.test.ts package.json
git commit -m "feat: add macos qa build script"
```

---

### Task 6: macOS WebdriverIO Tauri DOM Automation

**Files:**
- Create: `e2e/macos/wdio.conf.ts`
- Create: `e2e/macos/specs/app-shell.e2e.ts`
- Create: `e2e/macos/specs/pet-package.e2e.ts`
- Create: `e2e/macos/specs/realtime-ui.e2e.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `pnpm e2e:macos`.
- Adds test-only dev dependencies: `@wdio/cli`, `@wdio/local-runner`, `@wdio/mocha-framework`, `@wdio/spec-reporter`, `@wdio/globals`, and `webdriverio`.
- Consumes the Tauri app built by `pnpm tauri build --target universal-apple-darwin --bundles app,dmg --config src-tauri/tauri.macos.conf.json`.
- Does not add frontend `window` globals, debug bridges, production IPC commands, or protocol fields.

- [ ] **Step 1: Write RED dependency/config test**

Create `e2e/macos/wdio.conf.ts` with the intended exported config shape in the test first by adding `e2e/macos/wdioConfig.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { config } from "./wdio.conf";

describe("macOS WebdriverIO config", () => {
  it("uses the Tauri driver capability against the built macOS app", () => {
    expect(config.runner).toBe("local");
    expect(config.framework).toBe("mocha");
    expect(config.hostname).toBe("127.0.0.1");
    expect(config.port).toBe(4444);
    expect(config.capabilities?.[0]).toMatchObject({
      browserName: "tauri",
      "tauri:options": {
        application: expect.stringContaining(".app"),
      },
    });
  });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run e2e/macos/wdioConfig.test.ts`

Expected: FAIL because `e2e/macos/wdio.conf.ts` does not exist.

- [ ] **Step 3: Add WebdriverIO dependencies and config**

Modify `package.json` devDependencies:

```json
{
  "@wdio/cli": "^9.0.0",
  "@wdio/globals": "^9.0.0",
  "@wdio/local-runner": "^9.0.0",
  "@wdio/mocha-framework": "^9.0.0",
  "@wdio/spec-reporter": "^9.0.0",
  "webdriverio": "^9.0.0"
}
```

Modify `package.json` scripts:

```json
{
  "e2e:macos": "wdio run e2e/macos/wdio.conf.ts"
}
```

Create `e2e/macos/wdio.conf.ts`:

```ts
import { join } from "node:path";
import type { Options } from "@wdio/types";

const repoRoot = process.cwd();
const appPath = join(
  repoRoot,
  "src-tauri/target/universal-apple-darwin/release/bundle/macos/情侣桌宠.app",
);

export const config: Options.Testrunner = {
  runner: "local",
  specs: ["./e2e/macos/specs/**/*.e2e.ts"],
  maxInstances: 1,
  hostname: "127.0.0.1",
  port: 4444,
  path: "/",
  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": {
        application: appPath,
      },
    },
  ],
  logLevel: "info",
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    timeout: 120000,
  },
};
```

Create DOM-visible specs using `@wdio/globals`:

```ts
import { $, expect } from "@wdio/globals";

describe("macOS app shell", () => {
  it("renders the main pet app without a QA bridge", async () => {
    await expect($('[role="region"][aria-label="情侣桌宠 MVP"]')).toBeExisting();
    await expect($(".pet-frame-stage")).toBeExisting();
    await expect(browser.execute(() => "__EDGE_QA__" in window)).resolves.toBe(false);
  });
});
```

Add specs for settings panel, package import/select/delete, message composer, status card, and interaction menu using existing accessible labels from `src/app/App.test.tsx`.

- [ ] **Step 4: Run GREEN for static config**

Run:

```bash
pnpm install
pnpm vitest run e2e/macos/wdioConfig.test.ts
```

Expected: config test passes. `pnpm install` updates `pnpm-lock.yaml`.

- [ ] **Step 5: Document manual driver invocation**

Add comments in `e2e/macos/wdio.conf.ts` header:

```ts
// Run `tauri-driver --port 4444` on the macOS host before `pnpm e2e:macos`
// when the runner does not start the Tauri driver for this environment.
```

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml e2e/macos
git commit -m "test: add macos tauri webdriver flows"
```

---

### Task 7: macOS Native Evidence Script And Checklist

**Files:**
- Create: `scripts/macos/native-evidence.mjs`
- Create: `scripts/macos/native-evidence.test.ts`
- Create: `docs/manual-verification/macos-cross-platform.md`
- Modify: `package.json`

**Interfaces:**
- Produces: `pnpm macos:native-evidence`.
- Produces evidence under `.superpowers/sdd/2026-08-07-macos-cross-platform/native/`.
- Consumes installed app path and DMG path from environment variables `COUPLE_PET_MACOS_APP` and `COUPLE_PET_MACOS_DMG`.

- [ ] **Step 1: Write RED evidence script tests**

Create `scripts/macos/native-evidence.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createNativeEvidencePlan } from "./native-evidence.mjs";

describe("macOS native evidence plan", () => {
  it("collects transparent window, tray, Dock, z-order, and signing evidence", () => {
    const steps = createNativeEvidencePlan({
      appPath: "/Applications/情侣桌宠.app",
      dmgPath: "/tmp/情侣桌宠.dmg",
      evidenceDir: "/repo/.superpowers/sdd/2026-08-07-macos-cross-platform/native",
    });

    expect(steps.map((step) => step.name)).toEqual([
      "environment",
      "launch",
      "process-list",
      "dock-policy",
      "menu-bar",
      "transparent-screenshot",
      "topmost-screenshot",
      "click-through-recovery",
      "close-to-hide",
      "dmg-verify",
      "codesign",
      "spctl",
    ]);
    expect(steps.find((step) => step.name === "transparent-screenshot")?.command).toContain("screencapture");
    expect(steps.find((step) => step.name === "dock-policy")?.command).toContain("lsappinfo");
  });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run scripts/macos/native-evidence.test.ts`

Expected: FAIL because the script does not exist.

- [ ] **Step 3: Implement native evidence script**

Create `scripts/macos/native-evidence.mjs`:

```js
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { platform } from "node:os";

export function createNativeEvidencePlan({ appPath, dmgPath, evidenceDir }) {
  return [
    { name: "environment", command: "sw_vers && uname -a && defaults read NSGlobalDomain AppleInterfaceStyle 2>/dev/null || true" },
    { name: "launch", command: `open -n "${appPath}" && sleep 3` },
    { name: "process-list", command: "pgrep -fl couple-desktop-pet || ps ax | grep '情侣桌宠' | grep -v grep" },
    { name: "dock-policy", command: "lsappinfo visibleProcessList | grep -v '情侣桌宠' || true" },
    { name: "menu-bar", command: "osascript -e 'tell application \"System Events\" to get name of every process'"},
    { name: "transparent-screenshot", command: `screencapture -x "${join(evidenceDir, "transparent-window.png")}"` },
    { name: "topmost-screenshot", command: `screencapture -x "${join(evidenceDir, "topmost-window.png")}"` },
    { name: "click-through-recovery", command: "log show --last 2m --predicate 'process CONTAINS \"couple\"' || true" },
    { name: "close-to-hide", command: "osascript -e 'tell application \"System Events\" to keystroke \"w\" using command down' && sleep 1 && pgrep -fl couple-desktop-pet" },
    { name: "dmg-verify", command: `hdiutil verify "${dmgPath}"` },
    { name: "codesign", command: `codesign --verify --deep --strict --verbose=2 "${appPath}"` },
    { name: "spctl", command: `spctl --assess --type execute --verbose "${appPath}"` },
  ].map((step) => ({ ...step, logPath: join(evidenceDir, `${step.name}.log`) }));
}
```

Add CLI runner that refuses non-macOS and writes each command's output to the step log.

Modify `package.json`:

```json
{
  "macos:native-evidence": "node scripts/macos/native-evidence.mjs"
}
```

- [ ] **Step 4: Add manual verification checklist**

Create `docs/manual-verification/macos-cross-platform.md` with these checked evidence rows:

```markdown
# macOS Cross-Platform Manual Verification

## Native Shell Checks

- [ ] Transparent borderless window over light desktop background; evidence `native/transparent-window.png`.
- [ ] No Dock icon while app is running; evidence `native/dock-policy.log`.
- [ ] Menu bar tray item exposes show, hide, settings, and quit.
- [ ] Window stays above a normal Finder window.
- [ ] Drag updates position and restart restores the saved visible position.
- [ ] Scale setting changes rendered pet size and persists across restart.
- [ ] Auto move runs when enabled and stops when disabled.
- [ ] Click-through can be enabled and recovered through menu bar show/settings.
- [ ] Close hides the window and explicit quit terminates the process.
- [ ] Four-edge interaction preserves the existing package capability behavior.
```

- [ ] **Step 5: Run GREEN**

Run:

```bash
pnpm vitest run scripts/macos/native-evidence.test.ts
git diff --check
```

Expected: test passes and diff check is clean.

- [ ] **Step 6: Commit**

```bash
git add scripts/macos/native-evidence.mjs scripts/macos/native-evidence.test.ts docs/manual-verification/macos-cross-platform.md package.json
git commit -m "test: add macos native evidence checklist"
```

---

### Task 8: Windows-to-macOS Real Client Interop Smoke

**Files:**
- Create: `scripts/interop/cross-platform-smoke.mjs`
- Create: `scripts/interop/cross-platform-smoke.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `pnpm interop:cross-platform`.
- Consumes real clients launched with isolated app-data roots:
  - Windows: set `APPDATA=<runDir>/windows/AppData/Roaming`.
  - macOS: set `HOME=<runDir>/macos/home`.
- Consumes Relay URL `http://159.75.175.47:8787`.
- Produces sanitized event log `.superpowers/sdd/2026-08-07-macos-cross-platform/interop/events.jsonl`.

- [ ] **Step 1: Write RED interop script tests**

Create `scripts/interop/cross-platform-smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createInteropRunPlan,
  redactInteropEvent,
  requiredInteropEvents,
} from "./cross-platform-smoke.mjs";

describe("cross-platform interop smoke", () => {
  it("isolates Windows and macOS app data roots", () => {
    const plan = createInteropRunPlan({
      runDir: "/tmp/couple-pet-interop",
      relayUrl: "http://159.75.175.47:8787",
      windowsExe: "C:/repo/src-tauri/target/debug/couple-desktop-pet.exe",
      macosApp: "/repo/src-tauri/target/universal-apple-darwin/release/bundle/macos/情侣桌宠.app",
    });

    expect(plan.windows.env.APPDATA).toBe("/tmp/couple-pet-interop/windows/AppData/Roaming");
    expect(plan.macos.env.HOME).toBe("/tmp/couple-pet-interop/macos/home");
    expect(plan.relayUrl).toBe("http://159.75.175.47:8787");
  });

  it("defines the real-client interop event matrix", () => {
    expect(requiredInteropEvents).toEqual([
      "pair-code-created",
      "pair-accepted",
      "windows-online",
      "macos-online",
      "windows-status-to-macos",
      "macos-status-to-windows",
      "windows-message-to-macos",
      "macos-message-to-windows",
      "macos-bubble-acknowledged",
      "windows-bubble-acknowledged",
      "unpair-completed",
      "reconnect-shows-unpaired",
    ]);
  });

  it("redacts secrets and message bodies from interop logs", () => {
    expect(
      redactInteropEvent({
        event: "windows-message-to-macos",
        deviceSecret: "secret_a",
        text: "想你啦",
        deviceId: "dev_abcdef",
      }),
    ).toEqual({
      event: "windows-message-to-macos",
      deviceSecret: "<redacted>",
      text: "<redacted>",
      deviceId: "…cdef",
    });
  });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run scripts/interop/cross-platform-smoke.test.ts`

Expected: FAIL because script does not exist.

- [ ] **Step 3: Implement interop runner shell**

Create `scripts/interop/cross-platform-smoke.mjs`:

```js
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const requiredInteropEvents = [
  "pair-code-created",
  "pair-accepted",
  "windows-online",
  "macos-online",
  "windows-status-to-macos",
  "macos-status-to-windows",
  "windows-message-to-macos",
  "macos-message-to-windows",
  "macos-bubble-acknowledged",
  "windows-bubble-acknowledged",
  "unpair-completed",
  "reconnect-shows-unpaired",
];

export function createInteropRunPlan({ runDir, relayUrl, windowsExe, macosApp }) {
  return {
    relayUrl,
    windows: {
      command: windowsExe,
      env: { APPDATA: join(runDir, "windows/AppData/Roaming") },
    },
    macos: {
      command: "open",
      args: ["-n", macosApp],
      env: { HOME: join(runDir, "macos/home") },
    },
    evidenceLog: join(runDir, "events.jsonl"),
  };
}

export function redactInteropEvent(event) {
  return Object.fromEntries(
    Object.entries(event).map(([key, value]) => {
      if (/secret|token|password/i.test(key)) return [key, "<redacted>"];
      if (key === "text") return [key, "<redacted>"];
      if (key.toLowerCase().endsWith("id") && typeof value === "string") {
        return [key, `…${value.slice(-4)}`];
      }
      return [key, value];
    }),
  );
}
```

The runtime flow must use app UI automation and existing Relay HTTP/WS helpers:

1. Launch both clients with isolated app-data roots.
2. Create or reuse device identities through each app's normal settings flow.
3. Generate a binding code on Windows.
4. Accept it on macOS.
5. Observe both clients connected to `http://159.75.175.47:8787`.
6. Set status `slacking`, `dazing`, `overtime`, and `null` both directions.
7. Send Windows-to-macOS and macOS-to-Windows messages through UI.
8. Verify typewriter bubble appears and acknowledgement removes it.
9. Verify message interaction animation starts on receipt.
10. Unpair and restart both clients; verify pair is invalid and reconnect does not restore the old pair.

Modify `package.json`:

```json
{
  "interop:cross-platform": "node scripts/interop/cross-platform-smoke.mjs"
}
```

- [ ] **Step 4: Run GREEN**

Run: `pnpm vitest run scripts/interop/cross-platform-smoke.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/interop/cross-platform-smoke.mjs scripts/interop/cross-platform-smoke.test.ts package.json
git commit -m "test: add cross platform interop smoke plan"
```

---

### Task 9: Real Mac CI And Formal Release Workflows

**Files:**
- Create: `.github/workflows/macos-qa.yml`
- Create: `.github/workflows/macos-release.yml`
- Create: `scripts/macos/release-signing.mjs`
- Create: `scripts/macos/release-signing.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces ad-hoc workflow on self-hosted real Mac runner labels `[self-hosted, macOS]`.
- Produces formal workflow requiring secrets:
  - `APPLE_CERTIFICATE_P12_BASE64`
  - `APPLE_CERTIFICATE_PASSWORD`
  - `APPLE_KEYCHAIN_PASSWORD`
  - `APPLE_DEVELOPER_ID_APPLICATION`
  - `APPLE_ID`
  - `APPLE_TEAM_ID`
  - `APPLE_APP_SPECIFIC_PASSWORD`
- Does not echo secret values.

- [ ] **Step 1: Write RED workflow validation test**

Create `scripts/macos/release-signing.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { requiredAppleSecrets, redactSigningLog } from "./release-signing.mjs";

describe("macOS release signing workflow", () => {
  it("declares all Apple Developer secrets without literal credential values", () => {
    expect(requiredAppleSecrets).toEqual([
      "APPLE_CERTIFICATE_P12_BASE64",
      "APPLE_CERTIFICATE_PASSWORD",
      "APPLE_KEYCHAIN_PASSWORD",
      "APPLE_DEVELOPER_ID_APPLICATION",
      "APPLE_ID",
      "APPLE_TEAM_ID",
      "APPLE_APP_SPECIFIC_PASSWORD",
    ]);

    const releaseWorkflow = readFileSync(".github/workflows/macos-release.yml", "utf8");
    for (const secret of requiredAppleSecrets) {
      expect(releaseWorkflow).toContain(`secrets.${secret}`);
    }
    expect(releaseWorkflow).not.toContain("BEGIN CERTIFICATE");
  });

  it("redacts notary and certificate secrets from logs", () => {
    expect(
      redactSigningLog("APPLE_ID=user@example.com APPLE_CERTIFICATE_PASSWORD=secret"),
    ).toBe("APPLE_ID=<redacted> APPLE_CERTIFICATE_PASSWORD=<redacted>");
  });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run scripts/macos/release-signing.test.ts`

Expected: FAIL because signing script and workflows do not exist.

- [ ] **Step 3: Add signing helper**

Create `scripts/macos/release-signing.mjs`:

```js
export const requiredAppleSecrets = [
  "APPLE_CERTIFICATE_P12_BASE64",
  "APPLE_CERTIFICATE_PASSWORD",
  "APPLE_KEYCHAIN_PASSWORD",
  "APPLE_DEVELOPER_ID_APPLICATION",
  "APPLE_ID",
  "APPLE_TEAM_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
];

export function redactSigningLog(text) {
  return requiredAppleSecrets.reduce(
    (current, secret) => current.replace(new RegExp(`${secret}=\\\\S+`, "g"), `${secret}=<redacted>`),
    text,
  );
}
```

- [ ] **Step 4: Add QA workflow**

Create `.github/workflows/macos-qa.yml`:

```yaml
name: macOS QA

on:
  workflow_dispatch:

jobs:
  universal-adhoc:
    runs-on: [self-hosted, macOS]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: x86_64-apple-darwin,aarch64-apple-darwin
      - run: pnpm install --frozen-lockfile
      - run: pnpm macos:qa-build
      - uses: actions/upload-artifact@v4
        with:
          name: couple-pet-macos-adhoc
          path: |
            src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg
            .superpowers/sdd/2026-08-07-macos-cross-platform/build/**
```

- [ ] **Step 5: Add formal release workflow**

Create `.github/workflows/macos-release.yml`:

```yaml
name: macOS Release

on:
  workflow_dispatch:

jobs:
  developer-id-notarized:
    runs-on: [self-hosted, macOS]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: x86_64-apple-darwin,aarch64-apple-darwin
      - run: pnpm install --frozen-lockfile
      - name: Import Developer ID certificate
        env:
          APPLE_CERTIFICATE_P12_BASE64: ${{ secrets.APPLE_CERTIFICATE_P12_BASE64 }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_KEYCHAIN_PASSWORD: ${{ secrets.APPLE_KEYCHAIN_PASSWORD }}
        run: scripts/macos/import-certificate.sh
      - name: Build signed app and dmg
        env:
          APPLE_DEVELOPER_ID_APPLICATION: ${{ secrets.APPLE_DEVELOPER_ID_APPLICATION }}
        run: pnpm macos:qa-build
      - name: Notarize and staple
        env:
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
        run: scripts/macos/notarize-and-staple.sh
      - uses: actions/upload-artifact@v4
        with:
          name: couple-pet-macos-notarized
          path: |
            src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg
            .superpowers/sdd/2026-08-07-macos-cross-platform/build/**
```

Add comments in the workflow explaining that the current repository needs a remote and real Mac runner registration before execution.

- [ ] **Step 6: Run GREEN**

Run: `pnpm vitest run scripts/macos/release-signing.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/macos-qa.yml .github/workflows/macos-release.yml scripts/macos/release-signing.mjs scripts/macos/release-signing.test.ts package.json
git commit -m "ci: add macos release workflows"
```

---

### Task 10: Evidence Directory Templates And Acceptance Matrix

**Files:**
- Create: `.superpowers/sdd/2026-08-07-macos-cross-platform/README.md`
- Create: `.superpowers/sdd/2026-08-07-macos-cross-platform/final-acceptance-matrix.md`
- Create: `scripts/macos/evidence-manifest.test.ts`

**Interfaces:**
- Produces evidence directory contract consumed by Task 5 through Task 9.
- `.superpowers/sdd` is ignored; final implementation must use `git add -f` for committed evidence templates and final evidence.

- [ ] **Step 1: Write RED evidence manifest test**

Create `scripts/macos/evidence-manifest.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("macOS evidence manifest", () => {
  it("lists every required evidence section", () => {
    const readme = readFileSync(
      ".superpowers/sdd/2026-08-07-macos-cross-platform/README.md",
      "utf8",
    );

    for (const section of [
      "Environment",
      "Raw Logs",
      "Screenshots",
      "Interop",
      "DMG Hashes",
      "Signing And Notarization",
      "Final Matrix",
    ]) {
      expect(readme).toContain(`## ${section}`);
    }
  });

  it("requires direct evidence for every final gate row", () => {
    const matrix = readFileSync(
      ".superpowers/sdd/2026-08-07-macos-cross-platform/final-acceptance-matrix.md",
      "utf8",
    );

    for (const gate of [
      "Windows full regression",
      "macOS full regression",
      "Universal DMG",
      "Codesign",
      "Notarization and stapling",
      "Actual macOS launch",
      "Native shell parity",
      "Windows to macOS interop",
      "Release decision",
    ]) {
      expect(matrix).toContain(gate);
    }
  });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run scripts/macos/evidence-manifest.test.ts`

Expected: FAIL because evidence templates do not exist.

- [ ] **Step 3: Add evidence README**

Create `.superpowers/sdd/2026-08-07-macos-cross-platform/README.md`:

```markdown
# macOS Cross-Platform Evidence

## Environment

Record macOS version, CPU architecture, Xcode version, Rust toolchains, Node version, pnpm version, Tauri CLI version, runner label, and git commit.

## Raw Logs

Store exact command output from Windows tests, macOS tests, macOS build, DMG verification, binary inspection, signing, notarization, and interop.

## Screenshots

Store transparent window, menu bar tray, Dock absence, settings, imported package, message composer, status card, edge interaction, message bubble, and acknowledgement screenshots.

## Interop

Store sanitized Windows-to-macOS event logs with device IDs shortened, no device secrets, and no message bodies.

## DMG Hashes

Store `shasum -a 256` output for the DMG and app binary.

## Signing And Notarization

Store `codesign`, `spctl`, `notarytool`, and `stapler` output. Ad-hoc evidence is marked as QA-only.

## Final Matrix

Use `final-acceptance-matrix.md` as the release gate.
```

- [ ] **Step 4: Add final acceptance matrix**

Create `.superpowers/sdd/2026-08-07-macos-cross-platform/final-acceptance-matrix.md`:

```markdown
# macOS Cross-Platform Final Acceptance Matrix

| Gate | Required Evidence Path | Result |
| --- | --- | --- |
| Windows full regression | `windows/full-regression.log` | Not run |
| macOS full regression | `macos/full-regression.log` | Not run |
| Universal DMG | `build/universal-dmg.log`, `build/file.log`, `build/lipo.log` | Not run |
| Codesign | `build/codesign-verify.log` | Not run |
| Notarization and stapling | `build/notarytool.log`, `build/stapler.log`, `build/spctl-after-staple.log` | Not run |
| Actual macOS launch | `native/launch.log`, `native/process-list.log`, `native/transparent-window.png` | Not run |
| Native shell parity | `native/`, `docs/manual-verification/macos-cross-platform.md` | Not run |
| Windows to macOS interop | `interop/events.jsonl`, `interop/screenshots/` | Not run |
| Release decision | `release-decision.md` | Not run |
```

- [ ] **Step 5: Run GREEN**

Run: `pnpm vitest run scripts/macos/evidence-manifest.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/macos/evidence-manifest.test.ts
git add -f .superpowers/sdd/2026-08-07-macos-cross-platform/README.md .superpowers/sdd/2026-08-07-macos-cross-platform/final-acceptance-matrix.md
git commit -m "docs: add macos release evidence matrix"
```

---

### Task 11: Windows Regression And Final Release Gate

**Files:**
- Create: `scripts/macos/final-release-gate.mjs`
- Create: `scripts/macos/final-release-gate.test.ts`
- Modify: `package.json`
- Modify: `.superpowers/sdd/2026-08-07-macos-cross-platform/final-acceptance-matrix.md`

**Interfaces:**
- Produces: `pnpm macos:final-gate`.
- Consumes final evidence files from Tasks 5 through 10.
- Produces release decision file `.superpowers/sdd/2026-08-07-macos-cross-platform/release-decision.md`.

- [ ] **Step 1: Write RED final gate tests**

Create `scripts/macos/final-release-gate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  evaluateMacosReleaseGate,
  requiredFinalEvidence,
} from "./final-release-gate.mjs";

describe("macOS final release gate", () => {
  it("requires real Mac evidence, interop, and formal signing for complete release", () => {
    expect(requiredFinalEvidence).toContain("build/spctl-after-staple.log");
    expect(requiredFinalEvidence).toContain("interop/events.jsonl");
    expect(requiredFinalEvidence).toContain("native/transparent-window.png");

    expect(
      evaluateMacosReleaseGate({
        presentEvidence: new Set(requiredFinalEvidence),
        formalSigningComplete: true,
        realMacRuntimeComplete: true,
        realInteropComplete: true,
      }),
    ).toEqual({ status: "complete" });
  });

  it("marks ad-hoc builds as QA-only when formal signing evidence is missing", () => {
    expect(
      evaluateMacosReleaseGate({
        presentEvidence: new Set(requiredFinalEvidence.filter((path) => !path.includes("spctl-after-staple"))),
        formalSigningComplete: false,
        realMacRuntimeComplete: true,
        realInteropComplete: true,
      }),
    ).toEqual({
      status: "qa-only",
      reason: "Developer ID signing, notarization, or stapling evidence is missing",
    });
  });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run scripts/macos/final-release-gate.test.ts`

Expected: FAIL because final gate script does not exist.

- [ ] **Step 3: Implement final gate script**

Create `scripts/macos/final-release-gate.mjs`:

```js
export const requiredFinalEvidence = [
  "windows/full-regression.log",
  "macos/full-regression.log",
  "build/universal-dmg.log",
  "build/hdiutil-verify.log",
  "build/file.log",
  "build/lipo.log",
  "build/codesign-verify.log",
  "build/notarytool.log",
  "build/stapler.log",
  "build/spctl-after-staple.log",
  "native/launch.log",
  "native/process-list.log",
  "native/transparent-window.png",
  "native/dock-policy.log",
  "interop/events.jsonl",
  "release-decision.md",
];

export function evaluateMacosReleaseGate({
  presentEvidence,
  formalSigningComplete,
  realMacRuntimeComplete,
  realInteropComplete,
}) {
  const missing = requiredFinalEvidence.filter((path) => !presentEvidence.has(path));
  if (!formalSigningComplete) {
    return {
      status: "qa-only",
      reason: "Developer ID signing, notarization, or stapling evidence is missing",
    };
  }
  if (!realMacRuntimeComplete || !realInteropComplete || missing.length > 0) {
    return { status: "blocked", missing };
  }
  return { status: "complete" };
}
```

Add CLI mode that scans `.superpowers/sdd/2026-08-07-macos-cross-platform/`, writes `release-decision.md`, and exits nonzero unless status is `complete`.

Modify `package.json`:

```json
{
  "macos:final-gate": "node scripts/macos/final-release-gate.mjs"
}
```

- [ ] **Step 4: Run GREEN**

Run: `pnpm vitest run scripts/macos/final-release-gate.test.ts`

Expected: PASS.

- [ ] **Step 5: Run full Windows regression before final release attempt**

Run on Windows:

```bash
pnpm test
pnpm typecheck
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
git diff --check
```

Expected: all commands exit 0. Store raw logs in `.superpowers/sdd/2026-08-07-macos-cross-platform/windows/`.

- [ ] **Step 6: Run macOS final gate after real Mac evidence exists**

Run on macOS:

```bash
pnpm macos:qa-build
pnpm e2e:macos
pnpm macos:native-evidence
pnpm interop:cross-platform
pnpm macos:final-gate
```

Expected: final gate exits 0 only when real Mac runtime, real Windows-to-macOS interop, and formal Developer ID notarization/stapling evidence are present. If Apple Developer credentials are absent, final gate writes `status: qa-only` and exits nonzero.

- [ ] **Step 7: Commit**

```bash
git add scripts/macos/final-release-gate.mjs scripts/macos/final-release-gate.test.ts package.json
git add -f .superpowers/sdd/2026-08-07-macos-cross-platform/final-acceptance-matrix.md
git commit -m "test: add macos final release gate"
```

---

## Final Implementation Verification

After all tasks have landed and before declaring the macOS release complete:

- [ ] Run on Windows:

```bash
pnpm test
pnpm typecheck
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
git diff --check
```

- [ ] Run on a real macOS host:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
pnpm macos:qa-build
pnpm e2e:macos
pnpm macos:native-evidence
pnpm interop:cross-platform
pnpm macos:final-gate
```

- [ ] Confirm `.superpowers/sdd/2026-08-07-macos-cross-platform/final-acceptance-matrix.md` links every gate to direct evidence.
- [ ] Confirm no production build exposes WebDriver-only or QA-only globals.
- [ ] Confirm no device secrets, Apple credentials, certificate contents, pair secrets, or message bodies appear in committed files.
- [ ] Confirm `git status --short` contains no unintended files except explicitly ignored local scratch directories.

## Self-Review Coverage Map

- Spec item 1 is covered by Tasks 1, 5, 9, and 11.
- Spec item 2 is covered by Tasks 3, 4, 6, 7, 8, and 11.
- Spec item 3 is covered by Tasks 2, 6, 8, and the Global Constraints.
- Spec item 4 is covered by Tasks 1, 2, 3, 4, and 7.
- Spec item 5 is covered by Tasks 1, 8, 9, and the Global Constraints.
- Spec item 6 is covered by Tasks 4, 6, 8, and existing settings/package tests.
- Spec item 7 is covered by Tasks 1, 5, 9, and 11.
- Spec item 8 is covered by Tasks 5, 7, 8, 9, and 11.
- Spec item 9 is covered by Tasks 5, 6, 7, 8, 9, and 11.
- Spec item 10 is covered by Tasks 7, 8, 10, and 11.
- Spec item 11 is covered by Tasks 1, 3, 4, 5, 7, 8, 9, and 11.
- Spec item 12 is covered by Tasks 9, 10, and 11.
- Spec item 13 is enforced by Global Constraints and Task 4.
