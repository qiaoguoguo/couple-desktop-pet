# macOS Cross-Platform Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, verify, sign, notarize, and deliver a macOS 12+ Universal DMG that has the same user-visible behavior as the current Windows client and interoperates with it through the existing Relay.

**Architecture:** Keep one React/TypeScript/Tauri codebase. Shared React UI, `.cdpet` package handling, `shared/syncProtocol`, Relay HTTP, Relay WebSocket, and account/pair/message semantics remain single-source and unbranched. Platform differences are isolated to Tauri configuration, Rust `cfg(target_os = "macos")` shell behavior, QA automation, and evidence collection.

**Tech Stack:** Tauri 2, Rust 2021, React 19, TypeScript 7, Vite 8, Vitest 4, WebdriverIO `@wdio/tauri-service` with embedded provider, macOS `plutil`/`hdiutil`/`file`/`lipo`/`codesign`/`spctl`/`notarytool`/`stapler`, GitHub Actions macOS hosted runner.

## Global Constraints

- Supported OS: macOS 12 Monterey and later.
- CPU support: Intel x86_64 and Apple Silicon arm64 in one Universal Binary.
- Delivery artifact: off-store `.dmg` containing `.app`.
- Product baseline: strictly equal to the current Windows client.
- Do not add new business features, account features, payment, voice, store, public matching, or animation redesign.
- Continue using `DEFAULT_RELAY_URL` as `http://159.75.175.47:8787`.
- Do not change auth, pair, status, message, capability, unpair, HTTP, or WebSocket protocol payloads.
- Do not branch or copy React UI, `.cdpet` package format, `shared/syncProtocol`, Relay HTTP, or Relay WebSocket code.
- Rust/Tauri code may add `cfg(target_os = "macos")` only for platform shell behavior.
- Do not create a separate macOS application project.
- Do not fix or change the paused behavior where `imported:q-girl-complete-v3` does not receive built-in edge animation.
- Do not commit device secrets, pair secrets, Apple credentials, certificates, provisioning material, or message bodies.
- Use `src-tauri/Info.plist` for Tauri 2 automatic Info.plist merging; do not use a config key for plist injection.
- `src-tauri/tauri.macos.conf.json` is the shared macOS overlay and contains no signing identity.
- `src-tauri/tauri.macos.qa.conf.json` is QA-only and contains `signingIdentity: "-"`.
- Formal Developer ID builds do not load the QA overlay and use `APPLE_SIGNING_IDENTITY`.
- Evidence directory: `.superpowers/sdd/2026-08-07-macos-cross-platform/`.
- GitHub Actions workflows are committed as executable CI entry points; completing release evidence still requires running them on real GitHub-hosted Windows and macOS runners with the required Apple Developer secrets configured.
- Without Apple Developer credentials, an ad-hoc QA DMG may be produced, but the formal release remains incomplete.

---

## File Structure

- `src-tauri/tauri.macos.conf.json` - macOS platform overlay auto-merged by Tauri.
- `src-tauri/tauri.macos.qa.conf.json` - QA-only ad-hoc signing overlay loaded explicitly.
- `src-tauri/Info.plist` - WebView-only ATS compatibility for the cleartext Relay on macOS 12/13 plus the Relay IP exception for macOS 14+, merged automatically into the generated app.
- `src/desktop/tauriMacosConfig.test.ts` - static macOS config and Info.plist contract tests.
- `src-tauri/src/platform.rs` - cross-platform shell policy and adapter entry.
- `src-tauri/src/platform/macos.rs` - macOS activation policy, Dock hiding, and menu bar shell behavior.
- `src-tauri/src/platform/default.rs` - non-macOS no-op shell adapter.
- `src-tauri/src/main.rs` - platform setup hook and E2E plugin registration gate.
- `src-tauri/src/commands.rs` - tray recovery, close-to-hide, geometry policy, and Rust tests.
- `src/desktop/windowCommands.ts` - frontend bridge for click-through recovery event subscription.
- `src/desktop/windowCommands.test.ts` - bridge command and event tests.
- `src/app/App.tsx` - React listener that persists click-through recovery and opens settings when requested.
- `src/app/App.test.tsx` - App-level tray recovery, settings, geometry, and behavior regressions.
- `vitest.config.ts` - includes `scripts/**/*.test.mjs` for Node script contract tests.
- `scripts/macos/qa-build.mjs` - Node build verifier for QA and formal macOS artifacts.
- `scripts/macos/qa-build.test.mjs` - command-plan tests for artifact discovery and shell-free spawning.
- `scripts/macos/native-evidence.mjs` - macOS evidence collector for facts it can prove automatically.
- `scripts/macos/native-evidence.test.mjs` - evidence script command-plan and cleanup tests.
- `scripts/interop/github-rendezvous.mjs` - encrypted GitHub Issue rendezvous helper.
- `scripts/interop/github-rendezvous.d.mts` - TypeScript declarations for E2E imports.
- `scripts/interop/github-rendezvous.test.mjs` - encryption, REST, tamper, and redaction tests.
- `scripts/interop/cross-platform-smoke.mjs` - sanitized interop event validation helper.
- `scripts/interop/cross-platform-smoke.test.mjs` - interop redaction and event matrix tests.
- `scripts/macos/final-release-gate.mjs` - final evidence gate and release-decision writer.
- `scripts/macos/final-release-gate.test.ts` - final gate tests.
- `e2e/macos/wdio.conf.ts` - WebdriverIO Tauri embedded-provider config.
- `e2e/macos/specs/*.e2e.ts` - real macOS DOM workflow specs.
- `src-tauri/tauri.e2e.conf.json` - E2E-only Tauri config with `withGlobalTauri` and an inline E2E capability.
- `.github/workflows/macos-qa.yml` - GitHub-hosted macOS QA workflow.
- `.github/workflows/macos-release.yml` - Developer ID signing, notarization, stapling, and assessment workflow.
- `.github/workflows/cross-platform-interop.yml` - paired Windows and macOS runner interoperability workflow.
- `.superpowers/sdd/2026-08-07-macos-cross-platform/README.md` - evidence manifest.
- `.superpowers/sdd/2026-08-07-macos-cross-platform/final-acceptance-matrix.md` - final matrix template.
- `docs/manual-verification/macos-cross-platform.md` - native manual and semi-automated validation checklist.
- `package.json` - macOS, WDIO, interop, and final-gate scripts and dev dependencies.
- `src-tauri/Cargo.toml` - Tauri dependency features, including a macOS target-specific `macos-private-api` feature to match the macOS private API overlay without enabling that feature on Windows/Linux, plus optional E2E plugin dependencies and feature.

---

### Task 1: macOS Tauri Overlay And Info.plist Contract

**Files:**
- Create: `src-tauri/tauri.macos.conf.json`
- Create: `src-tauri/tauri.macos.qa.conf.json`
- Create: `src-tauri/Info.plist`
- Create: `src/desktop/tauriMacosConfig.test.ts`
- Modify: `package.json`
- Modify: `src-tauri/Cargo.toml`

**Interfaces:**
- Produces package script `tauri:build:mac` with command `tauri build --target universal-apple-darwin --bundles app,dmg`.
- Produces package script `tauri:build:mac:qa` with command `tauri build --target universal-apple-darwin --bundles app,dmg --config src-tauri/tauri.macos.qa.conf.json`.
- Produces `src-tauri/Info.plist`, automatically merged by Tauri into `Contents/Info.plist`.
- Produces macOS general overlay with `app.macOSPrivateApi=true`, bundle target `["app","dmg"]`, icon `icons/icon.icns`, and `minimumSystemVersion="12.0"`.
- The macOS target-specific `tauri` dependency in `src-tauri/Cargo.toml` includes feature `macos-private-api`; this keeps direct `cargo test`/`cargo check` on real macOS aligned with `app.macOSPrivateApi=true` without breaking Windows/Linux direct Cargo checks.

- [ ] **Step 1: Write the failing config contract test**

Create `src/desktop/tauriMacosConfig.test.ts`:

```ts
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
  });

  it("keeps ad hoc signing only in the QA overlay", () => {
    const qaConfig = readJson<{ bundle?: { macOS?: { signingIdentity?: string } } }>(
      "src-tauri/tauri.macos.qa.conf.json",
    );

    expect(qaConfig.bundle?.macOS?.signingIdentity).toBe("-");
  });

  it("uses src-tauri/Info.plist for Relay ATS compatibility on macOS 12", () => {
    const plist = readFileSync(join(repoRoot, "src-tauri/Info.plist"), "utf8");

    expect(plist).toContain("<key>NSAppTransportSecurity</key>");
    expect(plist).toContain("<key>NSAllowsArbitraryLoadsInWebContent</key>");
    expect(plist).toContain("<key>NSExceptionDomains</key>");
    expect(plist).toContain("<key>159.75.175.47</key>");
    expect(plist).toContain("<key>NSExceptionAllowsInsecureHTTPLoads</key>");
    expect(plist).not.toContain("<key>NSAllowsArbitraryLoads</key>");
  });

  it("keeps Cargo tauri features aligned with macOS private API config", () => {
    const config = readJson<{ app?: { macOSPrivateApi?: boolean } }>(
      "src-tauri/tauri.macos.conf.json",
    );
    const cargoToml = readFileSync(join(repoRoot, "src-tauri/Cargo.toml"), "utf8");

    expect(config.app?.macOSPrivateApi).toBe(true);
    expect(cargoToml).toMatch(/\[target\.'cfg\(target_os = "macos"\)'\.dependencies\][\s\S]*tauri\s*=\s*\{[^\n]*"macos-private-api"/);
    expect(cargoToml).not.toMatch(/\[dependencies\][\s\S]*?tauri\s*=\s*\{[^\n]*"macos-private-api"/);
  });

  it("exposes separate formal and QA build scripts", () => {
    const packageJson = readJson<{ scripts?: Record<string, string> }>("package.json");

    expect(packageJson.scripts?.["tauri:build:mac"]).toBe(
      "tauri build --target universal-apple-darwin --bundles app,dmg",
    );
    expect(packageJson.scripts?.["tauri:build:mac:qa"]).toBe(
      "tauri build --target universal-apple-darwin --bundles app,dmg --config src-tauri/tauri.macos.qa.conf.json",
    );
  });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run src/desktop/tauriMacosConfig.test.ts`

Expected: FAIL because the macOS overlay, QA overlay, and Info.plist do not exist.

- [ ] **Step 3: Add the macOS overlays and Info.plist**

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

Create `src-tauri/tauri.macos.qa.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "bundle": {
    "macOS": {
      "signingIdentity": "-"
    }
  }
}
```

Create `src-tauri/Info.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsArbitraryLoadsInWebContent</key>
    <true/>
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

Modify `src-tauri/Cargo.toml` so direct macOS Cargo paths see the same private API requirement as the Tauri overlay, while non-macOS Cargo paths keep the default feature set:

```toml
[dependencies]
tauri = { version = "2", features = ["protocol-asset", "tray-icon", "image-png", "image-ico"] }

[target.'cfg(target_os = "macos")'.dependencies]
tauri = { version = "2", features = ["protocol-asset", "tray-icon", "image-png", "image-ico", "macos-private-api"] }
```

Modify `package.json`:

```json
{
  "scripts": {
    "tauri:build:mac": "tauri build --target universal-apple-darwin --bundles app,dmg",
    "tauri:build:mac:qa": "tauri build --target universal-apple-darwin --bundles app,dmg --config src-tauri/tauri.macos.qa.conf.json"
  }
}
```

- [ ] **Step 4: Run GREEN and plist validation**

Run on any host: `pnpm vitest run src/desktop/tauriMacosConfig.test.ts`

Expected: PASS, 4 tests.

Run on macOS: `plutil -lint src-tauri/Info.plist`

Expected: `src-tauri/Info.plist: OK`.

- [ ] **Step 5: Post-build Info.plist validation on macOS**

Run after a macOS build:

```bash
/usr/libexec/PlistBuddy -c "Print :NSAppTransportSecurity:NSExceptionDomains:159.75.175.47:NSExceptionAllowsInsecureHTTPLoads" "src-tauri/target/universal-apple-darwin/release/bundle/macos/情侣桌宠.app/Contents/Info.plist"
```

Also validate the WebView-only macOS 12/13 compatibility key:

```bash
/usr/libexec/PlistBuddy -c "Print :NSAppTransportSecurity:NSAllowsArbitraryLoadsInWebContent" "src-tauri/target/universal-apple-darwin/release/bundle/macos/情侣桌宠.app/Contents/Info.plist"
```

Expected: both commands print `true`, proving the generated `.app/Contents/Info.plist` contains the WebView-only cleartext compatibility key for macOS 12/13 and the Relay IP exception for macOS 14+. Remove both ATS exceptions after the Relay moves to HTTPS/WSS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/tauri.macos.conf.json src-tauri/tauri.macos.qa.conf.json src-tauri/Info.plist src/desktop/tauriMacosConfig.test.ts package.json
git commit -m "feat: add macos tauri release config"
```

---

### Task 2: Rust macOS Platform Shell Adapter

**Files:**
- Create: `src-tauri/src/platform.rs`
- Create: `src-tauri/src/platform/macos.rs`
- Create: `src-tauri/src/platform/default.rs`
- Modify: `src-tauri/src/main.rs`

**Interfaces:**
- Produces `platform::configure_platform_shell(app: &mut tauri::App) -> tauri::Result<()>`.
- Produces `platform::platform_shell_policy(kind: DesktopPlatform) -> PlatformShellPolicy`.
- macOS runtime calls `app.set_activation_policy(tauri::ActivationPolicy::Accessory)` and `app.set_dock_visibility(false)`.

- [ ] **Step 1: Write RED Rust policy tests**

Create `src-tauri/src/platform.rs` with tests:

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
    fn macos_shell_policy_uses_accessory_and_hides_dock() {
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
    fn other_platforms_keep_default_activation() {
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

Expected: FAIL because `platform_shell_policy` and module wiring do not exist.

- [ ] **Step 3: Implement the adapter**

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
    app.set_dock_visibility(false);
    Ok(())
}
```

Modify `src-tauri/src/main.rs`:

```rust
mod platform;
```

Inside `.setup(...)`, call before tray setup:

```rust
platform::configure_platform_shell(app)?;
setup_tray(app)?;
```

- [ ] **Step 4: Run GREEN**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml platform_shell_policy -- --nocapture
cargo fmt --check --manifest-path src-tauri/Cargo.toml
```

Expected: policy tests pass and formatting is clean.

- [ ] **Step 5: Real Mac Dock and menu bar evidence**

Run on macOS after launching the app:

```bash
osascript -e 'tell application "System Events" to get name of every process whose bundle identifier is "com.couple.desktoppet"'
screencapture -x ".superpowers/sdd/2026-08-07-macos-cross-platform/native/menu-bar-tray.png"
```

Expected: the app is running, the tray item is visible in the menu bar screenshot, and the app does not appear as a Dock icon. Dock absence is confirmed by the manual checklist in Task 7 with before/after screenshots because AppleScript cannot reliably prove Dock icon absence alone.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/main.rs src-tauri/src/platform.rs src-tauri/src/platform/macos.rs src-tauri/src/platform/default.rs
git commit -m "feat: add macos platform shell adapter"
```

---

### Task 3: Tray Recovery, Click-Through State Sync, And Close-To-Hide

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src/desktop/windowCommands.ts`
- Modify: `src/desktop/windowCommands.test.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

**Interfaces:**
- Produces Tauri event `click-through-recovered` with payload `{ reason: "show" | "settings" }`.
- Produces `listenForClickThroughRecovered(handler: (event: { reason: "show" | "settings" }) => void): Promise<UnlistenFn>`.
- React listener persists `settings.clickThrough=false` when the event arrives.
- Settings tray path clears click-through, emits `click-through-recovered`, then emits existing `open-settings`.

- [ ] **Step 1: Write RED Rust recovery tests**

Add tests in `src-tauri/src/commands.rs`:

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ClickThroughRecoveryReason {
    Show,
    Settings,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct ClickThroughRecoveryPlan {
    clear_click_through: bool,
    show_window: bool,
    focus_window: bool,
    emit_recovered_event: bool,
    reason: ClickThroughRecoveryReason,
    emit_open_settings: bool,
}

#[test]
fn tray_show_recovers_click_through_and_reports_persistent_setting_change() {
    assert_eq!(
        click_through_recovery_plan(true, ClickThroughRecoveryReason::Show),
        ClickThroughRecoveryPlan {
            clear_click_through: true,
            show_window: true,
            focus_window: true,
            emit_recovered_event: true,
            reason: ClickThroughRecoveryReason::Show,
            emit_open_settings: false,
        },
    );
}

#[test]
fn tray_settings_recovers_click_through_and_still_opens_settings() {
    assert_eq!(
        click_through_recovery_plan(true, ClickThroughRecoveryReason::Settings),
        ClickThroughRecoveryPlan {
            clear_click_through: true,
            show_window: true,
            focus_window: true,
            emit_recovered_event: true,
            reason: ClickThroughRecoveryReason::Settings,
            emit_open_settings: true,
        },
    );
}
```

- [ ] **Step 2: Write RED frontend event tests**

Extend `src/desktop/windowCommands.test.ts`:

```ts
import { listenForClickThroughRecovered } from "./windowCommands";

it("subscribes to click-through recovered event", async () => {
  const handler = vi.fn();
  const unlisten = vi.fn();
  desktopApiMock.listenEvent.mockResolvedValueOnce(unlisten);

  await listenForClickThroughRecovered(handler);

  expect(desktopApiMock.listenEvent).toHaveBeenCalledWith(
    "click-through-recovered",
    expect.any(Function),
  );
});
```

Extend `src/app/App.test.tsx`:

```ts
it("persists click-through disabled when tray show recovers input", async () => {
  const settings = createSettings({ clickThrough: true });
  renderAppWithSettings(settings);

  emitTauriEvent("click-through-recovered", { reason: "show" });

  await waitFor(() => {
    expect(settingsStoreMock.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ clickThrough: false }),
    );
  });
});

it("opens settings after click-through recovery from tray settings", async () => {
  const settings = createSettings({ clickThrough: true });
  renderAppWithSettings(settings);

  emitTauriEvent("click-through-recovered", { reason: "settings" });
  emitTauriEvent("open-settings");

  expect(await screen.findByRole("dialog", { name: /settings/i })).toBeVisible();
});
```

- [ ] **Step 3: Run RED**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml click_through_recovery -- --nocapture
pnpm vitest run src/desktop/windowCommands.test.ts src/app/App.test.tsx
```

Expected: Rust helper and frontend listener tests fail until the event bridge and persistence path exist.

- [ ] **Step 4: Implement Rust recovery**

In `src-tauri/src/commands.rs`, add the policy helper and use it from `show_main_window` and `emit_open_settings`:

```rust
const CLICK_THROUGH_RECOVERED_EVENT: &str = "click-through-recovered";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ClickThroughRecoveryReason {
    Show,
    Settings,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct ClickThroughRecoveryPlan {
    clear_click_through: bool,
    show_window: bool,
    focus_window: bool,
    emit_recovered_event: bool,
    reason: ClickThroughRecoveryReason,
    emit_open_settings: bool,
}

fn click_through_recovery_plan(
    click_through_enabled: bool,
    reason: ClickThroughRecoveryReason,
) -> ClickThroughRecoveryPlan {
    ClickThroughRecoveryPlan {
        clear_click_through: click_through_enabled,
        show_window: true,
        focus_window: true,
        emit_recovered_event: click_through_enabled,
        reason,
        emit_open_settings: matches!(reason, ClickThroughRecoveryReason::Settings),
    }
}
```

Runtime behavior:

```rust
fn recover_click_through_and_show<R: Runtime>(
    app: &AppHandle<R>,
    reason: ClickThroughRecoveryReason,
) -> Result<(), String> {
    let window = main_window(app)?;
    set_window_click_through(&window, false)?;
    window.show().map_err(|error| format!("failed to show main window: {error}"))?;
    window.set_focus().map_err(|error| format!("failed to focus main window: {error}"))?;
    let reason_text = match reason {
        ClickThroughRecoveryReason::Show => "show",
        ClickThroughRecoveryReason::Settings => "settings",
    };
    window
        .emit(CLICK_THROUGH_RECOVERED_EVENT, serde_json::json!({ "reason": reason_text }))
        .map_err(|error| format!("failed to emit click-through recovery: {error}"))?;
    Ok(())
}
```

`emit_open_settings` must call recovery first, then emit existing `open-settings`.

- [ ] **Step 5: Implement frontend sync**

In `src/desktop/windowCommands.ts`:

```ts
export type ClickThroughRecoveryReason = "show" | "settings";

export function listenForClickThroughRecovered(
  handler: (event: { reason: ClickThroughRecoveryReason }) => void,
) {
  return listenEvent<{ reason: ClickThroughRecoveryReason }>("click-through-recovered", (event) => {
    handler(event.payload);
  });
}
```

In `src/app/App.tsx`, register the listener during setup:

```ts
useEffect(() => {
  let disposed = false;
  let unlisten: (() => void) | undefined;

  listenForClickThroughRecovered(async () => {
    const nextSettings = { ...settingsRef.current, clickThrough: false };
    setSettings(nextSettings);
    await saveSettings(nextSettings);
  }).then((cleanup) => {
    if (disposed) cleanup();
    else unlisten = cleanup;
  });

  return () => {
    disposed = true;
    unlisten?.();
  };
}, []);
```

Keep the existing `open-settings` listener so the settings tray path still opens the settings dialog.

- [ ] **Step 6: Run GREEN**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml click_through_recovery main_window_close -- --nocapture
pnpm vitest run src/desktop/windowCommands.test.ts src/app/App.test.tsx
```

Expected: recovery tests pass, close-to-hide still hides ordinary close, explicit quit still exits.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands.rs src/desktop/windowCommands.ts src/desktop/windowCommands.test.ts src/app/App.tsx src/app/App.test.tsx
git commit -m "fix: sync click through recovery from tray"
```

---

### Task 4: Cross-Platform Geometry Characterization Tests

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src/app/App.test.tsx`

**Interfaces:**
- Consumes existing pure helpers for saved position, message composer geometry, edge peek placement, and App edge behavior.
- Produces characterization and regression tests only.
- Production changes are outside this task. A real Mac discrepancy found later becomes a separate reviewed fix task.

- [ ] **Step 1: Add RED geometry characterization tests**

Add to `src-tauri/src/commands.rs` tests:

```rust
#[test]
fn saved_position_clamps_inside_macos_menu_bar_work_area_with_negative_origin() {
    let work_area = TestWorkArea { x: -1512, y: 25, width: 1512, height: 919 };
    let window = TestWindowGeometry { x: -1900, y: -40, width: 480, height: 540 };
    let saved = SavedWindowPosition { x: -1900, y: -40 };

    let position = clamp_saved_window_position(saved, work_area, window);

    assert_eq!(position, PhysicalPosition::new(-1488, 49));
}

#[test]
fn message_composer_uses_macos_work_area_not_full_display() {
    let work_area = TestWorkArea { x: 0, y: 25, width: 1440, height: 875 };
    let pet_window = TestWindowGeometry { x: 1080, y: 520, width: 320, height: 360 };

    let geometry = calculate_message_composer_surface_geometry(work_area, pet_window);

    assert!(geometry.y >= 25);
    assert!(geometry.x + geometry.width <= 1440);
    assert!(geometry.y + geometry.height <= 900);
}

#[test]
fn hidpi_edge_snap_uses_physical_window_size_and_normalized_anchor() {
    let work_area = TestWorkArea { x: 0, y: 0, width: 2560, height: 1440 };
    let window = TestWindowGeometry { x: 1200, y: 700, width: 480, height: 540 };

    let left = calculate_edge_peek_snap(EdgeSide::Left, work_area, window, NormalizedAnchor { x: 0.275, y: 0.5 });
    let right = calculate_edge_peek_snap(EdgeSide::Right, work_area, window, NormalizedAnchor { x: 0.725, y: 0.5 });
    let top = calculate_edge_peek_snap(EdgeSide::Top, work_area, window, NormalizedAnchor { x: 0.5, y: 0.05 });
    let bottom = calculate_edge_peek_snap(EdgeSide::Bottom, work_area, window, NormalizedAnchor { x: 0.5, y: 0.367 });

    assert_eq!(left.x, -132);
    assert_eq!(right.x, 2212);
    assert_eq!(top.y, -27);
    assert_eq!(bottom.y, 1242);
}
```

- [ ] **Step 2: Add RED App regression for paused imported edge behavior**

Add to `src/app/App.test.tsx`:

```ts
it("does not snap edge interaction for imported q girl package while behavior is paused", async () => {
  renderAppWithSettings(
    createSettings({
      appearance: { selectedPetPackageId: "imported:q-girl-complete-v3" },
    }),
  );

  await dragPetToEdge({ side: "left" });

  expect(windowCommandMocks.snapEdgePeek).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run RED**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml saved_position_clamps_inside_macos message_composer_uses_macos hidpi_edge_snap -- --nocapture
pnpm vitest run src/app/App.test.tsx
```

Expected: tests fail only where current contracts are not covered or helpers are not exported to tests.

- [ ] **Step 4: Add test-only access and keep production behavior unchanged**

Expose existing pure helpers to the Rust test module using `pub(crate)` where needed. Do not change runtime geometry code in this task. Keep the imported Q-girl App test as a regression for the paused behavior.

- [ ] **Step 5: Run GREEN**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml saved_position_clamps_inside_macos message_composer_uses_macos hidpi_edge_snap -- --nocapture
pnpm vitest run src/app/App.test.tsx
```

Expected: characterization tests pass. Runtime behavior remains unchanged.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands.rs src/app/App.test.tsx
git commit -m "test: characterize macos window geometry"
```

---

### Task 5: macOS QA And Formal Build Script

**Files:**
- Create: `scripts/macos/qa-build.mjs`
- Create: `scripts/macos/qa-build.test.ts`
- Modify: `vitest.config.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `pnpm macos:qa-build`, which runs `node scripts/macos/qa-build.mjs --mode qa`.
- Produces `pnpm macos:formal-build`, which runs `node scripts/macos/qa-build.mjs --mode formal`.
- QA mode uses `tauri:build:mac:qa` and `signingIdentity:"-"`.
- Formal mode uses `tauri:build:mac` and environment-provided `APPLE_SIGNING_IDENTITY`.
- All child processes use `spawn(command, args, { shell: false })`.

- [ ] **Step 1: Write RED script tests**

Create `scripts/macos/qa-build.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createMacosBuildPlan,
  findMacosArtifacts,
  redactBuildLog,
} from "./qa-build.mjs";

describe("macOS QA build plan", () => {
  it("uses QA overlay only for ad hoc mode", () => {
    expect(createMacosBuildPlan({ mode: "qa" }).buildStep).toEqual({
      command: "pnpm",
      args: ["tauri:build:mac:qa"],
      shell: false,
    });
    expect(createMacosBuildPlan({ mode: "formal" }).buildStep).toEqual({
      command: "pnpm",
      args: ["tauri:build:mac"],
      shell: false,
    });
  });

  it("checks plist, dmg attach and detach, slices, signing, and hashes", () => {
    const names = createMacosBuildPlan({ mode: "qa" }).verificationSteps.map((step) => step.name);

    expect(names).toEqual([
      "plutil-source-info-plist",
      "hdiutil-verify-dmg",
      "hdiutil-attach-dmg",
      "plutil-generated-info-plist",
      "file-app-binary",
      "lipo-verify-universal",
      "codesign-verify-app",
      "codesign-describe-app",
      "sha256-dmg",
      "hdiutil-detach-dmg",
    ]);
  });

  it("enumerates concrete app and dmg paths instead of using shell expansion", () => {
    const artifacts = findMacosArtifacts([
      "src-tauri/target/universal-apple-darwin/release/bundle/macos/情侣桌宠.app",
      "src-tauri/target/universal-apple-darwin/release/bundle/dmg/情侣桌宠_0.1.0_universal.dmg",
    ]);

    expect(artifacts.appPath.endsWith(".app")).toBe(true);
    expect(artifacts.dmgPath.endsWith(".dmg")).toBe(true);
  });

  it("redacts Apple signing environment values from logs", () => {
    expect(redactBuildLog("APPLE_SIGNING_IDENTITY=Developer ID Application: Example")).toBe(
      "APPLE_SIGNING_IDENTITY=<redacted>",
    );
  });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run scripts/macos/qa-build.test.ts`

Expected: FAIL because the script test include and script do not exist.

- [ ] **Step 3: Include script tests in Vitest**

Modify `vitest.config.ts`:

```ts
include: [
  "src/**/*.test.ts",
  "src/**/*.test.tsx",
  "shared/**/*.test.ts",
  "deploy/**/*.test.ts",
  "scripts/**/*.test.ts",
],
```

- [ ] **Step 4: Implement shell-free build script**

Create `scripts/macos/qa-build.mjs`:

```js
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const artifactRoot = "src-tauri/target/universal-apple-darwin/release/bundle";

export function createMacosBuildPlan({ mode }) {
  const buildScript = mode === "qa" ? "tauri:build:mac:qa" : "tauri:build:mac";
  return {
    buildStep: { command: "pnpm", args: [buildScript], shell: false },
    verificationSteps: [
      { name: "plutil-source-info-plist", command: "plutil", args: ["-lint", "src-tauri/Info.plist"] },
      { name: "hdiutil-verify-dmg", command: "hdiutil", args: ["verify", "$DMG"] },
      { name: "hdiutil-attach-dmg", command: "hdiutil", args: ["attach", "$DMG", "-nobrowse", "-readonly"] },
      { name: "plutil-generated-info-plist", command: "plutil", args: ["-lint", "$APP/Contents/Info.plist"] },
      { name: "file-app-binary", command: "file", args: ["$APP/Contents/MacOS/couple-desktop-pet"] },
      { name: "lipo-verify-universal", command: "lipo", args: ["-archs", "$APP/Contents/MacOS/couple-desktop-pet"] },
      { name: "codesign-verify-app", command: "codesign", args: ["--verify", "--deep", "--strict", "--verbose=2", "$APP"] },
      { name: "codesign-describe-app", command: "codesign", args: ["-dv", "$APP"] },
      { name: "sha256-dmg", command: "shasum", args: ["-a", "256", "$DMG"] },
      { name: "hdiutil-detach-dmg", command: "hdiutil", args: ["detach", "$MOUNT"] },
    ],
  };
}

export function findMacosArtifacts(paths) {
  const appPath = paths.find((path) => path.endsWith(".app"));
  const dmgPath = paths.find((path) => path.endsWith(".dmg"));
  if (!appPath || !dmgPath) {
    throw new Error("macOS .app and .dmg artifacts were not found");
  }
  return { appPath, dmgPath };
}

export function listArtifactPaths(root = artifactRoot) {
  const paths = [];
  for (const dir of ["macos", "dmg"]) {
    const absoluteDir = join(root, dir);
    if (!existsSync(absoluteDir)) continue;
    for (const entry of readdirSync(absoluteDir)) {
      paths.push(join(absoluteDir, entry));
    }
  }
  return paths.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}

export function redactBuildLog(text) {
  return text
    .replace(/APPLE_SIGNING_IDENTITY=[^\r\n]+/g, "APPLE_SIGNING_IDENTITY=<redacted>")
    .replace(/APPLE_CERTIFICATE_PASSWORD=[^\r\n]+/g, "APPLE_CERTIFICATE_PASSWORD=<redacted>")
    .replace(/KEYCHAIN_PASSWORD=[^\r\n]+/g, "KEYCHAIN_PASSWORD=<redacted>");
}

export function runStep(step, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, { shell: false, env });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ code, output: redactBuildLog(output) });
      else reject(new Error(`${step.name ?? step.command} exited ${code}\n${redactBuildLog(output)}`));
    });
  });
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex").toUpperCase();
}
```

The CLI path must:

1. Parse `--mode qa` or `--mode formal`.
2. Run the build step.
3. Enumerate concrete `.app` and `.dmg` artifacts.
4. Run the verification steps with `$APP`, `$DMG`, and `$MOUNT` replaced by actual paths.
5. Parse `hdiutil attach` output to capture mount path.
6. Always run `hdiutil detach` after attach succeeds.
7. Verify `lipo -archs` output contains both `x86_64` and `arm64`.
8. Write raw logs under `.superpowers/sdd/2026-08-07-macos-cross-platform/build/`.

Modify `package.json`:

```json
{
  "scripts": {
    "macos:qa-build": "node scripts/macos/qa-build.mjs --mode qa",
    "macos:formal-build": "node scripts/macos/qa-build.mjs --mode formal"
  }
}
```

- [ ] **Step 5: Run GREEN**

Run: `pnpm vitest run scripts/macos/qa-build.test.ts`

Expected: PASS, 4 tests.

- [ ] **Step 6: Run real macOS QA build**

Run on macOS:

```bash
pnpm install --frozen-lockfile
pnpm macos:qa-build
```

Expected:

- `plutil -lint src-tauri/Info.plist` exits 0.
- `hdiutil verify` exits 0.
- `hdiutil attach` exits 0 and `hdiutil detach` exits 0.
- `file` shows a Mach-O universal binary.
- `lipo -archs` prints both `x86_64` and `arm64`.
- `codesign --verify --deep --strict --verbose=2` exits 0 for the ad-hoc app.
- `codesign -dv` output is stored.
- DMG SHA256 is stored.

- [ ] **Step 7: Commit**

```bash
git add scripts/macos/qa-build.mjs scripts/macos/qa-build.test.ts vitest.config.ts package.json
git commit -m "test: add macos build verification script"
```

---

### Task 6: macOS WebdriverIO Embedded Provider E2E

**Files:**
- Modify: `package.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/main.rs`
- Modify: `src/main.tsx`
- Create: `src-tauri/tauri.e2e.conf.json`
- Create: `e2e/macos/wdio.conf.ts`
- Create: `e2e/macos/specs/app-flows.e2e.ts`
- Create: `src/desktop/tauriE2eConfig.test.ts`

**Interfaces:**
- Adds npm dev dependencies: `@wdio/tauri-service`, `@wdio/tauri-plugin`, `@wdio/cli`, `@wdio/local-runner`, `@wdio/mocha-framework`, `@wdio/spec-reporter`, `@wdio/globals`.
- Adds Cargo optional dependencies: `tauri-plugin-wdio = "1"` and `tauri-plugin-wdio-webdriver = "1"`.
- Adds Cargo feature `e2e = ["dep:tauri-plugin-wdio", "dep:tauri-plugin-wdio-webdriver"]`.
- Registers WDIO plugins only under `#[cfg(feature = "e2e")]`.
- Loads frontend `@wdio/tauri-plugin` only when `import.meta.env.VITE_TAURI_E2E === "1"`.
- Uses `@wdio/tauri-service` with `driverProvider: "embedded"`.
- Defines the E2E capability inline in `src-tauri/tauri.e2e.conf.json`; production `src-tauri/capabilities/default.json` remains unchanged.

- [ ] **Step 1: Write RED static E2E config tests**

Create `src/desktop/tauriE2eConfig.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function readJson<T>(path: string): T {
  return JSON.parse(read(path)) as T;
}

describe("macOS WDIO E2E gating", () => {
  it("keeps WDIO permissions out of the default capability", () => {
    const defaultCapability = readJson<{ permissions?: string[] }>("src-tauri/capabilities/default.json");

    expect(defaultCapability.permissions).not.toContain("wdio:default");
    expect(defaultCapability.permissions).not.toContain("wdio-webdriver:default");
  });

  it("adds WDIO permissions only to the inline e2e capability with existing defaults", () => {
    const config = readJson<{
      app?: {
        security?: {
          capabilities?: Array<{ identifier?: string; permissions?: string[] }>;
        };
      };
    }>("src-tauri/tauri.e2e.conf.json");
    const capability = config.app?.security?.capabilities?.find(
      (entry) => entry.identifier === "e2e",
    );

    expect(capability?.permissions).toEqual([
      "core:window:allow-start-dragging",
      "core:window:allow-close",
      "core:event:allow-emit",
      "core:event:allow-listen",
      "core:event:allow-unlisten",
      "dialog:allow-open",
      "wdio:default",
      "wdio-webdriver:default",
    ]);
  });

  it("uses embedded provider for macOS control", () => {
    const config = read("e2e/macos/wdio.conf.ts");

    expect(config).toContain('driverProvider: "embedded"');
    expect(config).toContain("@wdio/tauri-service");
  });

  it("gates frontend WDIO plugin behind VITE_TAURI_E2E", () => {
    const entry = read("src/main.tsx");

    expect(entry).toContain("VITE_TAURI_E2E");
    expect(entry).toContain("@wdio/tauri-plugin");
  });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run src/desktop/tauriE2eConfig.test.ts`

Expected: FAIL because the E2E config, capability, dependencies, and entry gate do not exist.

- [ ] **Step 3: Add npm dependencies and scripts**

Modify `package.json`:

```json
{
  "scripts": {
    "e2e:macos:build": "cross-env VITE_TAURI_E2E=1 tauri build --target universal-apple-darwin --bundles app --features e2e --config src-tauri/tauri.e2e.conf.json",
    "e2e:macos": "wdio run e2e/macos/wdio.conf.ts"
  },
  "devDependencies": {
    "@wdio/tauri-service": "^1.0.0",
    "@wdio/tauri-plugin": "^1.0.0",
    "@wdio/cli": "^9.0.0",
    "@wdio/local-runner": "^9.0.0",
    "@wdio/mocha-framework": "^9.0.0",
    "@wdio/spec-reporter": "^9.0.0",
    "@wdio/globals": "^9.0.0",
    "cross-env": "^7.0.3"
  }
}
```

- [ ] **Step 4: Add Cargo feature gate**

Modify `src-tauri/Cargo.toml`:

```toml
[features]
default = []
e2e = ["dep:tauri-plugin-wdio", "dep:tauri-plugin-wdio-webdriver"]

[dependencies]
tauri-plugin-wdio = { version = "1", optional = true }
tauri-plugin-wdio-webdriver = { version = "1", optional = true }
```

Modify `src-tauri/src/main.rs` inside builder creation:

```rust
#[cfg(feature = "e2e")]
let builder = builder
    .plugin(tauri_plugin_wdio::init())
    .plugin(tauri_plugin_wdio_webdriver::init());
```

The formal and QA release builds do not pass `--features e2e`, so these plugins are not linked.

- [ ] **Step 5: Add E2E-only Tauri config with inline capability**

Create `src-tauri/tauri.e2e.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "app": {
    "withGlobalTauri": true,
    "security": {
      "capabilities": [
        {
          "identifier": "e2e",
          "description": "E2E-only permissions for macOS WebdriverIO embedded provider.",
          "windows": ["main"],
          "permissions": [
            "core:window:allow-start-dragging",
            "core:window:allow-close",
            "core:event:allow-emit",
            "core:event:allow-listen",
            "core:event:allow-unlisten",
            "dialog:allow-open",
            "wdio:default",
            "wdio-webdriver:default"
          ]
        }
      ]
    }
  },
  "bundle": {
    "active": true
  }
}
```

- [ ] **Step 6: Gate frontend WDIO plugin**

Modify `src/main.tsx`:

```ts
if (import.meta.env.VITE_TAURI_E2E === "1") {
  void import("@wdio/tauri-plugin");
}
```

Add a production negative verification in the same task:

```bash
pnpm build
rg -n "@wdio/tauri-plugin|wdio-webdriver|wdio:default" dist src-tauri/target/release
```

Expected: `rg` returns no matches for the production bundle and release artifacts.

- [ ] **Step 7: Add WDIO config and specs**

Create `e2e/macos/wdio.conf.ts`:

```ts
export const config = {
  runner: "local",
  specs: ["./specs/*.e2e.ts"],
  framework: "mocha",
  reporters: ["spec"],
  services: [
    [
      "tauri",
      {
        appBinaryPath:
          "src-tauri/target/universal-apple-darwin/release/bundle/macos/情侣桌宠.app/Contents/MacOS/couple-desktop-pet",
        driverProvider: "embedded",
      },
    ],
  ],
  mochaOpts: {
    timeout: 120000,
  },
};
```

Create `e2e/macos/specs/app-flows.e2e.ts`:

```ts
import { $, expect } from "@wdio/globals";

describe("macOS app flows", () => {
  it("opens settings, composer, status card, and package management surfaces", async () => {
    await expect($("[data-testid='pet-stage']")).toBeDisplayed();
    await $("[data-testid='interaction-open-settings']").click();
    await expect($("[role='dialog'][data-testid='settings-dialog']")).toBeDisplayed();
    await $("[data-testid='settings-close']").click();

    await $("[data-testid='interaction-send-message']").click();
    await expect($("[data-testid='message-composer']")).toBeDisplayed();

    await browser.keys(["Escape"]);
    await expect($("[data-testid='message-composer']")).not.toBeDisplayed();
  });
});
```

- [ ] **Step 8: Run GREEN**

Run:

```bash
pnpm vitest run src/desktop/tauriE2eConfig.test.ts
pnpm typecheck
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: static E2E tests pass, typecheck passes, Rust tests pass.

- [ ] **Step 9: Run real macOS E2E**

Run on macOS:

```bash
pnpm e2e:macos:build
pnpm e2e:macos
```

Expected: WDIO controls the real Tauri app through embedded provider and all specs pass.

- [ ] **Step 10: Commit**

```bash
git add package.json pnpm-lock.yaml src-tauri/Cargo.toml src-tauri/src/main.rs src/main.tsx src-tauri/tauri.e2e.conf.json e2e/macos/wdio.conf.ts e2e/macos/specs/app-flows.e2e.ts src/desktop/tauriE2eConfig.test.ts
git commit -m "test: add macos tauri embedded e2e"
```

---

### Task 7: Native macOS Evidence Script And Startup Dock Suppression

**Files:**
- Create: `scripts/macos/native-evidence.mjs`
- Create: `scripts/macos/native-evidence.test.mjs`
- Create: `docs/manual-verification/macos-cross-platform.md`
- Modify: `src-tauri/Info.plist`
- Modify: `src/desktop/tauriMacosConfig.test.ts`
- Modify: `package.json`
- Modify: `docs/superpowers/specs/2026-08-07-macos-cross-platform-release-design.md`
- Modify: `docs/superpowers/plans/2026-08-07-macos-cross-platform-release.md`

**Interfaces:**
- `src-tauri/Info.plist` sets `LSUIElement=true` so the app is an agent app and has no Dock icon from startup.
- Runtime `ActivationPolicy::Accessory` and `set_dock_visibility(false)` remain defensive safeguards after Tauri setup begins.
- `pnpm macos:native-evidence -- --mode qa|formal --app <absolute .app> --output <absolute dir>` records only directly provable native facts.
- Automatic evidence covers `sw_vers`, `uname -m`, `system_profiler`, source and generated plist content, `codesign -dv`, `codesign --verify`, `spctl --assess`, app launch, process existence, and `screencapture`.
- Every subprocess uses `spawn(command, args, { shell: false })`; every successful or failed step writes a redacted log.
- If app launch has happened, any later failure runs the quit cleanup step in `finally`.
- QA ad-hoc `spctl` failure is recorded as `qa-only`; formal mode requires `spctl` success.
- Dock visible absence, menu bar tray, transparency, topmost behavior, drag, position memory, click-through recovery, close-to-hide, scaling, auto movement, and four-edge behavior remain manual or semi-automatic evidence with screenshots and state logs.

- [ ] **Step 1: Write RED LSUIElement and native evidence tests**

Add `src/desktop/tauriMacosConfig.test.ts` coverage requiring `<key>LSUIElement</key><true/>` in `src-tauri/Info.plist`.

Create `scripts/macos/native-evidence.test.mjs` with tests for:
- CLI argument parsing and absolute `.app` / output paths.
- Shell-free plan steps in the exact order listed in the interface.
- QA `spctl` failure continuing with a `qa-only` log.
- Formal `spctl` failure stopping with the rejected output recorded.
- Cleanup after post-launch failure.
- Apple and GitHub secret redaction.

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm vitest run src/desktop/tauriMacosConfig.test.ts scripts/macos/native-evidence.test.mjs
```

Expected: FAIL because `LSUIElement` and `scripts/macos/native-evidence.mjs` do not exist yet.

- [ ] **Step 3: Implement LSUIElement and evidence collector**

Implement:
- `src-tauri/Info.plist`: add only top-level `LSUIElement=true`; keep ATS WebView-only exception and scoped Relay IP exception.
- `scripts/macos/native-evidence.mjs`: CLI, plan builder, shell-free recorded runner, QA/formal `spctl` behavior, cleanup in `finally`, redaction.
- `package.json`: `macos:native-evidence`.
- Manual verification document with the native checks that cannot be proven by static config or process logs.
- Design and plan document updates explaining startup Dock suppression and the native evidence boundary.

- [ ] **Step 4: Run GREEN**

Run:

```bash
pnpm vitest run src/desktop/tauriMacosConfig.test.ts scripts/macos/native-evidence.test.mjs
```

Expected: PASS, including the LSUIElement assertion and native evidence collector tests.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Info.plist src/desktop/tauriMacosConfig.test.ts scripts/macos/native-evidence.mjs scripts/macos/native-evidence.test.mjs docs/manual-verification/macos-cross-platform.md package.json docs/superpowers/specs/2026-08-07-macos-cross-platform-release-design.md docs/superpowers/plans/2026-08-07-macos-cross-platform-release.md
git commit -m "test: add macos native evidence collection"
```

---

### Task 8: Encrypted GitHub Rendezvous Interop Harness

**Files:**
- Create: `scripts/interop/github-rendezvous.mjs`
- Create: `scripts/interop/github-rendezvous.d.mts`
- Create: `scripts/interop/github-rendezvous.test.mjs`
- Create: `scripts/interop/cross-platform-smoke.mjs`
- Create: `scripts/interop/cross-platform-smoke.test.mjs`
- Create: `src/desktop/interopE2eConfig.test.ts`
- Create: `e2e/interop/wdio.windows.conf.ts`
- Create: `e2e/interop/wdio.macos.conf.ts`
- Create: `e2e/interop/support/env.ts`
- Create: `e2e/interop/support/rendezvous.ts`
- Create: `e2e/interop/support/rendezvous.test.ts`
- Create: `e2e/interop/support/ui.ts`
- Create: `e2e/interop/specs/cross-platform.e2e.ts`
- Create: `e2e/interop/specs/restart-unpaired.e2e.ts`
- Modify: `src/sync/SyncPanel.tsx`
- Modify: `src/sync/SyncPanel.test.tsx`
- Modify: `vitest.config.ts`
- Modify: `package.json`
- Modify: `docs/superpowers/plans/2026-08-07-macos-cross-platform-release.md`

**Interfaces:**
- A private GitHub Issue is the rendezvous point for two real GitHub-hosted runners.
- Cleartext Issue comments are limited to non-sensitive hello payloads: role plus X25519 public key.
- Pair code, message text, device secret, and runner tokens are never written as cleartext Issue comments, stdout, or evidence logs.
- X25519 derives a shared secret; HKDF derives the AES-256-GCM key; encrypted comments carry non-sensitive event names plus ciphertext payload.
- `scripts/interop/github-rendezvous.mjs create|cleanup` creates the temporary Issue and deletes comments before closing it.
- Rendezvous waits use `INTEROP_RENDEZVOUS_TIMEOUT_MS` when it is a strict positive integer; otherwise they default to 120 seconds locally and 20 minutes when `CI=true`, covering hosted runner cold build skew.
- Interop WDIO Mocha suite timeouts use `INTEROP_MOCHA_TIMEOUT_MS` when it is a strict positive integer; otherwise they default to 5 minutes locally and 30 minutes when `CI=true`, so the suite budget is longer than the rendezvous window.
- `scripts/interop/cross-platform-smoke.mjs validate` merges sanitized JSONL and verifies the required event matrix.
- Windows WDIO and macOS WDIO configs use `@wdio/tauri-service` embedded provider with `browserName: "tauri"` and `tauri:options.application`.
- Child app environments use isolated app data and mask `GITHUB_TOKEN`, `INTEROP_GITHUB_TOKEN`, `ACTIONS_ID_TOKEN_REQUEST_TOKEN`, and `APPLE_*` to empty strings so `@wdio/tauri-service` cannot reintroduce parent secrets during its environment merge; the WDIO runner process keeps the token for rendezvous.
- The real role spec drives the UI: Windows creates a binding code, sends it encrypted, macOS accepts it, both wait online, both sync `slacking/dazing/overtime/null`, both exchange messages, both acknowledge bubbles and observe message animation, then unpair.
- The restart spec uses the same isolated directory and verifies both sides restart unpaired.
- Both role specs create the sanitized evidence recorder before opening the encrypted rendezvous session and wrap the connection phase in `try/catch`; if the peer runner has not started, they still write a redacted `failure` JSONL event and attempt only safe element screenshots.
- `SyncPanel` exposes `aria-label="输入绑定码"` as the minimal stable selector needed for the real macOS role.

Required event names:

```js
[
  "windows-pair-code-created",
  "macos-pair-accepted",
  "windows-peer-online",
  "macos-peer-online",
  "windows-observed-macos-status-slacking",
  "windows-observed-macos-status-dazing",
  "windows-observed-macos-status-overtime",
  "windows-observed-macos-status-null",
  "macos-observed-windows-status-slacking",
  "macos-observed-windows-status-dazing",
  "macos-observed-windows-status-overtime",
  "macos-observed-windows-status-null",
  "windows-message-sent",
  "macos-message-received",
  "macos-message-sent",
  "windows-message-received",
  "windows-bubble-acknowledged",
  "macos-bubble-acknowledged",
  "windows-message-animation-observed",
  "macos-message-animation-observed",
  "windows-unpair-completed",
  "macos-unpair-completed",
  "windows-restart-shows-unpaired",
  "macos-restart-shows-unpaired",
]
```

- [ ] **Step 1: Write RED tests**

Add tests for:
- X25519 shared key agreement, AES-256-GCM round trip, tamper failure, GitHub REST request bodies not containing pair code or message text, and log redaction.
- Cross-platform event matrix, isolated `APPDATA` / `LOCALAPPDATA` / `USERPROFILE` and `HOME`, child app env filtering, JSONL sensitive plaintext rejection, and event validation.
- Rendezvous timeout defaults and overrides: local 120 seconds, CI 20 minutes, explicit valid `INTEROP_RENDEZVOUS_TIMEOUT_MS`, and invalid timeout rejection.
- WDIO config scripts, embedded-provider capabilities, and shared Mocha timeout resolution for both platforms.
- Connection-before-peer failure evidence structure: specs must create evidence before `createRendezvousSession()` and record redacted `failure` events in catch blocks.
- `SyncPanel` binding input accessible by `aria-label="输入绑定码"`.

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm vitest run e2e/interop/support/rendezvous.test.ts scripts/interop/github-rendezvous.test.mjs scripts/interop/cross-platform-smoke.test.mjs src/desktop/interopE2eConfig.test.ts src/sync/SyncPanel.test.tsx
```

Expected: FAIL because the rendezvous scripts, interop WDIO config, specs, and binding input label are absent.

- [ ] **Step 3: Implement encrypted rendezvous and interop harness**

Implement:
- `scripts/interop/github-rendezvous.mjs` with injectable `fetch`, X25519, HKDF, AES-256-GCM, create/cleanup CLI, comment deletion, issue close, and redaction.
- `scripts/interop/github-rendezvous.d.mts` so E2E TypeScript can import the `.mjs` module without `any`.
- `scripts/interop/cross-platform-smoke.mjs` with the required event list, isolated env helpers, child env filter, JSONL sanitizer, redactor, and `validate` CLI.
- `e2e/interop/wdio.windows.conf.ts` and `e2e/interop/wdio.macos.conf.ts` with embedded provider and real app binary path from `INTEROP_APP_BINARY`.
- `e2e/interop/support/rendezvous.ts` timeout helpers used by the rendezvous client and both WDIO configs.
- `e2e/interop/specs/cross-platform.e2e.ts` and `restart-unpaired.e2e.ts`, using stable ARIA/role selectors only and creating evidence before connection waits.
- `vitest.config.ts` include for `e2e/**/*.test.ts` support-unit coverage.
- `src/sync/SyncPanel.tsx` aria label and its component test.
- Package scripts: `e2e:windows:build`, `e2e:interop:windows`, `e2e:interop:windows:restart`, `e2e:interop:macos`, `e2e:interop:macos:restart`, `interop:validate`.

- [ ] **Step 4: Run GREEN**

Run:

```bash
pnpm vitest run e2e/interop/support/rendezvous.test.ts scripts/interop/github-rendezvous.test.mjs scripts/interop/cross-platform-smoke.test.mjs src/desktop/interopE2eConfig.test.ts src/sync/SyncPanel.test.tsx
pnpm typecheck
```

Expected: PASS locally. This proves harness correctness and TypeScript coverage; it is not Windows-to-macOS interoperability proof.

- [ ] **Step 5: Real two-runner smoke contract**

Run only when a private GitHub repository and simultaneous Windows/macOS runners are available:

```bash
INTEROP_GITHUB_TOKEN="$INTEROP_GITHUB_TOKEN" node scripts/interop/github-rendezvous.mjs create --repo owner/repo --title "couple-pet interop"
pnpm e2e:windows:build
pnpm e2e:interop:windows
pnpm e2e:interop:windows:restart
pnpm e2e:interop:macos
pnpm e2e:interop:macos:restart
pnpm interop:validate -- --log .superpowers/sdd/2026-08-07-macos-cross-platform/interop/windows.jsonl --log .superpowers/sdd/2026-08-07-macos-cross-platform/interop/macos.jsonl
INTEROP_GITHUB_TOKEN="$INTEROP_GITHUB_TOKEN" node scripts/interop/github-rendezvous.mjs cleanup --repo owner/repo --issue "$INTEROP_ISSUE_NUMBER"
```

Expected: all required event names appear in sanitized JSONL, no forbidden plaintext appears, and cleanup removes temporary comments before closing the Issue. Local unit tests do not count as this proof.

- [ ] **Step 6: Commit**

```bash
git add scripts/interop e2e/interop src/desktop/interopE2eConfig.test.ts src/sync/SyncPanel.tsx src/sync/SyncPanel.test.tsx package.json docs/superpowers/plans/2026-08-07-macos-cross-platform-release.md
git commit -m "test: add encrypted cross platform interop harness"
```

---

### Task 9: GitHub Actions macOS QA, Formal Release, And Cross-Platform Interop Workflows

**Files:**
- Create: `.github/workflows/macos-qa.yml`
- Create: `.github/workflows/macos-release.yml`
- Create: `.github/workflows/cross-platform-interop.yml`
- Create: `scripts/macos/workflow-contract.test.mjs`
- Modify: `package.json`

**Interfaces:**
- All workflows use only `workflow_dispatch`.
- `package.json` declares `packageManager: "pnpm@11.16.0"`.
- All workflow jobs use Node 22 through a SHA-pinned `actions/setup-node` step.
- Third-party actions are pinned exactly:
  - `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`
  - `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0`
  - `pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86 # v6.0.10`
  - `actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1`
  - `actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1`
  - `dtolnay/rust-toolchain@4360b52568e2003a75bf9bc1d59f33a8e3fc893c # stable`
- Every `actions/checkout` step sets `persist-credentials: false`.
- macOS runner shell steps use quoted glob selection plus `test`/`break` for `.app`, executable, and `.dmg` paths; workflow examples must not use GNU-only `find` depth or early-exit options.
- Every `actions/upload-artifact` step whose `path` includes `.superpowers/**` sets `include-hidden-files: true`; the separate non-hidden notarized DMG artifact does not need this setting.
- QA workflow uses GitHub-hosted `macos-15`, installs `x86_64-apple-darwin,aarch64-apple-darwin`, runs full regression plus production WDIO negative scan, builds and verifies an ad-hoc Universal `.app/.dmg`, builds E2E in an isolated `CARGO_TARGET_DIR`, runs macOS embedded E2E, collects native evidence, and uploads evidence on failure.
- Cross-platform workflow creates a temporary encrypted GitHub Issue rendezvous, runs Windows `windows-2025` and macOS `macos-15` jobs concurrently, uses `INTEROP_SESSION_ID=main` for the main suite and `restart` for restart, downloads the two role artifacts by explicit name into deterministic validator directories, validates both JSONL logs at fixed paths, and always cleans up the temporary Issue.
- Formal workflow uses GitHub-hosted `macos-15`, preflights Apple Developer ID secrets, runs full regression, runs `pnpm macos:formal-build`, records post-build signing/notarization/Gatekeeper evidence, uploads evidence on failure, and uploads the notarized DMG on success. Apple Developer credentials are not set on the job or workflow environment; they are scoped only to the preflight step, formal build step, and the post-build evidence step that needs notary credentials.
- Formal secrets:
  - `APPLE_CERTIFICATE`
  - `APPLE_CERTIFICATE_PASSWORD`
  - `KEYCHAIN_PASSWORD`
  - `APPLE_SIGNING_IDENTITY`
  - `APPLE_ID`
  - `APPLE_PASSWORD`
  - `APPLE_TEAM_ID`
- Tauri performs Developer ID signing and notarization only when these formal environment variables are present.

- [ ] **Step 1: Write RED workflow contract test**

Create `scripts/macos/workflow-contract.test.mjs`:

```js
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readWorkflow(path) {
  const source = readFileSync(join(repoRoot, path), "utf8");
  return { source, workflow: parse(source) };
}

describe("macOS and cross-platform GitHub Actions workflows", () => {
  it("uses workflow_dispatch only and SHA-pinned actions", () => {
    const qa = readWorkflow(".github/workflows/macos-qa.yml");
    const release = readWorkflow(".github/workflows/macos-release.yml");
    const interop = readWorkflow(".github/workflows/cross-platform-interop.yml");

    for (const item of [qa, release, interop]) {
      expect(Object.keys(item.workflow.on)).toEqual(["workflow_dispatch"]);
      expect(item.source).toContain("actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1");
    }
  });

  it("keeps Windows and macOS interop jobs concurrent and cleanup unconditional", () => {
    const { workflow } = readWorkflow(".github/workflows/cross-platform-interop.yml");

    expect(workflow.jobs.windows.needs).toBe("coordinator");
    expect(workflow.jobs.macos.needs).toBe("coordinator");
    expect(workflow.jobs.cleanup.if).toBe("always()");
    expect(workflow.jobs.cleanup.needs).toEqual(["coordinator", "windows", "macos", "validator"]);
  });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run scripts/macos/workflow-contract.test.mjs`

Expected: FAIL because workflow files do not exist.

- [ ] **Step 3: Add package manager and QA workflow**

Modify `package.json`:

```json
{
  "packageManager": "pnpm@11.16.0"
}
```

Create `.github/workflows/macos-qa.yml`:

```yaml
name: macOS QA

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  macos-qa:
    runs-on: macos-15
    timeout-minutes: 90
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86 # v6.0.10
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 22
          cache: pnpm
      - uses: dtolnay/rust-toolchain@4360b52568e2003a75bf9bc1d59f33a8e3fc893c # stable
        with:
          targets: x86_64-apple-darwin,aarch64-apple-darwin
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
      - run: pnpm typecheck
      - run: pnpm build
      - run: cargo test --manifest-path src-tauri/Cargo.toml
      - run: cargo check --manifest-path src-tauri/Cargo.toml
      - run: cargo fmt --check --manifest-path src-tauri/Cargo.toml
      - run: node scripts/macos/final-release-gate.mjs --scan-production
      - run: pnpm macos:qa-build
      - run: CARGO_TARGET_DIR="${{ runner.temp }}/macos-e2e-target" pnpm e2e:macos:build
      - run: pnpm e2e:macos
      - run: pnpm macos:native-evidence -- --mode qa --app "$APP_PATH" --output "$PWD/.superpowers/sdd/2026-08-07-macos-cross-platform/native"
      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        if: always()
        with:
          name: macos-qa-evidence
          if-no-files-found: warn
          include-hidden-files: true
          path: |
            src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg
            .superpowers/sdd/2026-08-07-macos-cross-platform/build/**
            .superpowers/sdd/2026-08-07-macos-cross-platform/macos/**
            .superpowers/sdd/2026-08-07-macos-cross-platform/native/**
```

- [ ] **Step 4: Add cross-platform interop workflow**

Create `.github/workflows/cross-platform-interop.yml`:

```yaml
name: Windows macOS Interop

on:
  workflow_dispatch:

permissions:
  contents: read
  issues: write
  actions: read

jobs:
  coordinator:
    runs-on: ubuntu-24.04
    outputs:
      issue_number: ${{ steps.create.outputs.issue_number }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86 # v6.0.10
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - id: create
        env:
          INTEROP_GITHUB_TOKEN: ${{ github.token }}
        run: pnpm interop:rendezvous:create -- --repo "${{ github.repository }}" --title "couple-pet interop"

  windows:
    runs-on: windows-2025
    timeout-minutes: 60
    needs: coordinator
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86 # v6.0.10
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 22
          cache: pnpm
      - uses: dtolnay/rust-toolchain@4360b52568e2003a75bf9bc1d59f33a8e3fc893c # stable
      - run: pnpm install --frozen-lockfile
      - run: pnpm e2e:windows:build
      - env:
          INTEROP_GITHUB_TOKEN: ${{ github.token }}
          INTEROP_SESSION_ID: main
          INTEROP_APP_DATA_ROOT: ${{ runner.temp }}/couple-pet-interop-windows
        run: pnpm e2e:interop:windows
      - env:
          INTEROP_GITHUB_TOKEN: ${{ github.token }}
          INTEROP_SESSION_ID: restart
          INTEROP_APP_DATA_ROOT: ${{ runner.temp }}/couple-pet-interop-windows
        run: pnpm e2e:interop:windows:restart

  macos:
    runs-on: macos-15
    timeout-minutes: 60
    needs: coordinator
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86 # v6.0.10
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 22
          cache: pnpm
      - uses: dtolnay/rust-toolchain@4360b52568e2003a75bf9bc1d59f33a8e3fc893c # stable
        with:
          targets: x86_64-apple-darwin,aarch64-apple-darwin
      - run: pnpm install --frozen-lockfile
      - run: pnpm e2e:macos:build
      - env:
          INTEROP_GITHUB_TOKEN: ${{ github.token }}
          INTEROP_SESSION_ID: main
          INTEROP_APP_DATA_ROOT: ${{ runner.temp }}/couple-pet-interop-macos
        run: pnpm e2e:interop:macos
      - env:
          INTEROP_GITHUB_TOKEN: ${{ github.token }}
          INTEROP_SESSION_ID: restart
          INTEROP_APP_DATA_ROOT: ${{ runner.temp }}/couple-pet-interop-macos
        run: pnpm e2e:interop:macos:restart

  validator:
    if: always()
    needs: [windows, macos]
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1
        continue-on-error: true
        with:
          name: interop-windows-evidence
          path: .superpowers/sdd/2026-08-07-macos-cross-platform/interop/validator/artifacts/windows
      - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1
        continue-on-error: true
        with:
          name: interop-macos-evidence
          path: .superpowers/sdd/2026-08-07-macos-cross-platform/interop/validator/artifacts/macos
      - run: |
          VALIDATOR_DIR=.superpowers/sdd/2026-08-07-macos-cross-platform/interop/validator
          WINDOWS_LOG="$VALIDATOR_DIR/artifacts/windows/events.jsonl"
          MACOS_LOG="$VALIDATOR_DIR/artifacts/macos/events.jsonl"
          test -f "$WINDOWS_LOG"
          test -f "$MACOS_LOG"
          pnpm interop:validate -- --log "$WINDOWS_LOG" --log "$MACOS_LOG"

  cleanup:
    if: always()
    needs: [coordinator, windows, macos, validator]
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - env:
          INTEROP_GITHUB_TOKEN: ${{ github.token }}
        run: pnpm interop:rendezvous:cleanup -- --repo "${{ github.repository }}" --issue "${{ needs.coordinator.outputs.issue_number }}"
```

- [ ] **Step 5: Add formal release workflow**

Create `.github/workflows/macos-release.yml`:

```yaml
name: macOS Release

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  developer-id-release:
    runs-on: macos-15
    timeout-minutes: 90
    env:
      RELEASE_EVIDENCE_DIR: .superpowers/sdd/2026-08-07-macos-cross-platform/build
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86 # v6.0.10
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 22
          cache: pnpm
      - uses: dtolnay/rust-toolchain@4360b52568e2003a75bf9bc1d59f33a8e3fc893c # stable
        with:
          targets: x86_64-apple-darwin,aarch64-apple-darwin
      - name: Preflight Apple Developer ID secrets
        env:
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          KEYCHAIN_PASSWORD: ${{ secrets.KEYCHAIN_PASSWORD }}
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        run: |
          for name in APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD KEYCHAIN_PASSWORD APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID; do
            if [ -z "${!name:-}" ]; then
              echo "::error::Missing required Apple signing secret: $name"
              exit 1
            fi
          done
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
      - run: pnpm typecheck
      - run: pnpm build
      - run: cargo test --manifest-path src-tauri/Cargo.toml
      - run: cargo check --manifest-path src-tauri/Cargo.toml
      - run: cargo fmt --check --manifest-path src-tauri/Cargo.toml
      - name: Build Developer ID Universal DMG
        env:
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          KEYCHAIN_PASSWORD: ${{ secrets.KEYCHAIN_PASSWORD }}
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        run: pnpm macos:formal-build
      - name: Validate stapling and Gatekeeper assessment
        env:
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        run: |
          APP_PATH=""
          for candidate in src-tauri/target/universal-apple-darwin/release/bundle/macos/*.app; do
            [ -d "$candidate" ] || continue
            APP_PATH="$candidate"
            break
          done
          DMG_PATH=""
          for candidate in src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg; do
            [ -f "$candidate" ] || continue
            DMG_PATH="$candidate"
            break
          done
          test -n "$APP_PATH"
          test -n "$DMG_PATH"
          xcrun notarytool history --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" | tee .superpowers/sdd/2026-08-07-macos-cross-platform/build/notarytool.log
          xcrun stapler validate "$APP_PATH" | tee .superpowers/sdd/2026-08-07-macos-cross-platform/build/stapler-validate-app.log
          xcrun stapler validate "$DMG_PATH" | tee .superpowers/sdd/2026-08-07-macos-cross-platform/build/stapler-validate-dmg.log
          spctl --assess --type execute --verbose=4 "$APP_PATH" | tee .superpowers/sdd/2026-08-07-macos-cross-platform/build/spctl-assess-app.log
          spctl --assess --type open --context context:primary-signature --verbose=4 "$DMG_PATH" | tee .superpowers/sdd/2026-08-07-macos-cross-platform/build/spctl-assess-dmg.log
          hdiutil verify "$DMG_PATH" | tee .superpowers/sdd/2026-08-07-macos-cross-platform/build/hdiutil-verify-final.log
          shasum -a 256 "$DMG_PATH" | tee .superpowers/sdd/2026-08-07-macos-cross-platform/build/sha256-dmg-final.log
      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        if: always()
        with:
          name: macos-release-evidence
          if-no-files-found: warn
          include-hidden-files: true
          path: |
            src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg
            .superpowers/sdd/2026-08-07-macos-cross-platform/build/**
      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        if: success()
        with:
          name: couple-pet-macos-notarized-dmg
          if-no-files-found: warn
          path: src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg
```

- [ ] **Step 6: Run GREEN and YAML parse**

Run:

```bash
pnpm vitest run scripts/macos/workflow-contract.test.mjs
node -e "import {readFileSync} from 'node:fs'; import {parse} from 'yaml'; for (const f of ['.github/workflows/macos-qa.yml','.github/workflows/macos-release.yml','.github/workflows/cross-platform-interop.yml']) parse(readFileSync(f,'utf8'));"
```

Expected: PASS, all three workflow YAML files parse.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/macos-qa.yml .github/workflows/macos-release.yml .github/workflows/cross-platform-interop.yml scripts/macos/workflow-contract.test.mjs package.json docs/superpowers/plans/2026-08-07-macos-cross-platform-release.md
git commit -m "ci: add macos and cross platform workflows"
```

---

### Task 10: Evidence Manifest And Final Matrix Templates

**Files:**
- Create: `.superpowers/sdd/2026-08-07-macos-cross-platform/README.md`
- Create: `.superpowers/sdd/2026-08-07-macos-cross-platform/final-acceptance-matrix.md`
- Create: `scripts/macos/evidence-manifest.test.ts`

**Interfaces:**
- Defines committed evidence structure.
- `.superpowers/sdd` is ignored locally; implementation must force-add only these final evidence templates and approved evidence artifacts.

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

  it("requires external evidence before release decision is written", () => {
    const matrix = readFileSync(
      ".superpowers/sdd/2026-08-07-macos-cross-platform/final-acceptance-matrix.md",
      "utf8",
    );

    expect(matrix).toContain("Generated Info.plist ATS content");
    expect(matrix).toContain("macOS HTTP and WebSocket Relay connection");
    expect(matrix).toContain("Production build excludes E2E plugins and permissions");
    expect(matrix).not.toContain("release-decision.md");
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

Store exact command output from Windows tests, macOS tests, macOS build, DMG verification, binary inspection, signing, notarization, stapling, Gatekeeper assessment, HTTP/WS Relay smoke, and interop.

## Screenshots

Store transparent window, menu bar tray, Dock before/after, settings, imported package, message composer, status card, edge interaction, message bubble, and acknowledgement screenshots.

## Interop

Store sanitized Windows-to-macOS JSONL logs with device IDs shortened, no device secrets, and no message bodies.

## DMG Hashes

Store `shasum -a 256` output for the DMG and the app binary.

## Signing And Notarization

Store `codesign`, `spctl`, `notarytool`, and `stapler` output. Ad-hoc evidence is QA-only.

## Final Matrix

Use `final-acceptance-matrix.md` as the external evidence checklist. Generate `release-decision.md` only after the gate validates the external evidence.
```

- [ ] **Step 4: Add final matrix**

Create `.superpowers/sdd/2026-08-07-macos-cross-platform/final-acceptance-matrix.md`:

```markdown
# macOS Cross-Platform Final Acceptance Matrix

| Gate | Required Evidence Path | Result |
| --- | --- | --- |
| Windows full regression | `windows/full-regression.log` | Not run |
| macOS full regression | `macos/full-regression.log` | Not run |
| Universal DMG with two slices | `build/file-app-binary.log`, `build/lipo-verify-universal.log` | Not run |
| Generated Info.plist ATS content | `build/generated-info-plist-ats.log` | Not run |
| macOS HTTP and WebSocket Relay connection | `network/macos-http-ws.log` | Not run |
| hdiutil verify attach detach | `build/hdiutil-verify-dmg.log`, `build/hdiutil-attach-dmg.log`, `build/hdiutil-detach-dmg.log` | Not run |
| Codesign | `build/codesign-verify-app.log`, `build/codesign-describe-app.log` | Not run |
| Notarytool | `build/notarytool.log` | Not run |
| Stapler validate | `build/stapler-validate.log` | Not run |
| spctl before and after staple | `build/spctl-before-staple.log`, `build/spctl-after-staple.log` | Not run |
| Production build excludes E2E plugins and permissions | `build/cargo-tree-production.log`, `build/production-permission-scan.log` | Not run |
| Actual macOS launch | `native/launch.log`, `native/transparent-window.png` | Not run |
| Native shell parity | `native/`, `docs/manual-verification/macos-cross-platform.md` | Not run |
| Windows to macOS interop | `interop/events.jsonl`, `interop/screenshots/` | Not run |
```

- [ ] **Step 5: Run GREEN**

Run: `pnpm vitest run scripts/macos/evidence-manifest.test.ts`

Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add scripts/macos/evidence-manifest.test.ts
git add -f .superpowers/sdd/2026-08-07-macos-cross-platform/README.md .superpowers/sdd/2026-08-07-macos-cross-platform/final-acceptance-matrix.md
git commit -m "docs: add macos release evidence matrix"
```

---

### Task 11: Final Release Gate And Windows Regression

**Files:**
- Create: `scripts/macos/final-release-gate.mjs`
- Create: `scripts/macos/final-release-gate.test.ts`
- Modify: `package.json`
- Modify: `.superpowers/sdd/2026-08-07-macos-cross-platform/final-acceptance-matrix.md`

**Interfaces:**
- Produces `pnpm macos:final-gate`.
- Consumes external evidence files from Tasks 5 through 10.
- Generates `.superpowers/sdd/2026-08-07-macos-cross-platform/release-decision.md` after validating external evidence.
- `requiredFinalEvidence` does not include `release-decision.md`.

- [ ] **Step 1: Write RED final gate tests**

Create `scripts/macos/final-release-gate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  evaluateMacosReleaseGate,
  requiredFinalEvidence,
} from "./final-release-gate.mjs";

describe("macOS final release gate", () => {
  it("requires external evidence before generating a decision", () => {
    expect(requiredFinalEvidence).toContain("build/generated-info-plist-ats.log");
    expect(requiredFinalEvidence).toContain("network/macos-http-ws.log");
    expect(requiredFinalEvidence).toContain("build/cargo-tree-production.log");
    expect(requiredFinalEvidence).toContain("build/lipo-verify-universal.log");
    expect(requiredFinalEvidence).not.toContain("release-decision.md");

    expect(
      evaluateMacosReleaseGate({
        presentEvidence: new Set(requiredFinalEvidence),
        formalSigningComplete: true,
        realMacRuntimeComplete: true,
        realInteropComplete: true,
      }),
    ).toEqual({ status: "complete" });
  });

  it("marks ad hoc builds as QA-only without formal signing evidence", () => {
    expect(
      evaluateMacosReleaseGate({
        presentEvidence: new Set(requiredFinalEvidence),
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
  "build/file-app-binary.log",
  "build/lipo-verify-universal.log",
  "build/generated-info-plist-ats.log",
  "network/macos-http-ws.log",
  "build/hdiutil-verify-dmg.log",
  "build/hdiutil-attach-dmg.log",
  "build/hdiutil-detach-dmg.log",
  "build/codesign-verify-app.log",
  "build/codesign-describe-app.log",
  "build/notarytool.log",
  "build/stapler-validate.log",
  "build/spctl-before-staple.log",
  "build/spctl-after-staple.log",
  "build/cargo-tree-production.log",
  "build/production-permission-scan.log",
  "native/launch.log",
  "native/transparent-window.png",
  "native/menu-bar-tray.png",
  "native/dock-before.png",
  "native/dock-after.png",
  "interop/events.jsonl",
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

Add production scan mode in the same file:

```js
export function scanProductionArtifacts(textByPath) {
  const forbidden = [
    "tauri-plugin-wdio",
    "wdio:default",
    "wdio-webdriver:default",
    "@wdio/tauri-plugin",
  ];
  return Object.entries(textByPath).flatMap(([path, text]) =>
    forbidden
      .filter((needle) => text.includes(needle))
      .map((needle) => ({ path, needle })),
  );
}
```

The CLI supports:

- `node scripts/macos/final-release-gate.mjs --scan-production`: scans production `dist` and macOS release bundle files, prints `no production e2e symbols found` when clean, and exits nonzero when a forbidden symbol is found.
- `node scripts/macos/final-release-gate.mjs`: scans `.superpowers/sdd/2026-08-07-macos-cross-platform/`, evaluates the gate, writes `release-decision.md`, and exits 0 only for `status: "complete"`.

Modify `package.json`:

```json
{
  "scripts": {
    "macos:final-gate": "node scripts/macos/final-release-gate.mjs"
  }
}
```

- [ ] **Step 4: Run GREEN**

Run: `pnpm vitest run scripts/macos/final-release-gate.test.ts`

Expected: PASS, 2 tests.

- [ ] **Step 5: Run Windows regression**

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

- [ ] **Step 6: Run macOS final evidence commands**

Run on a real macOS 12+ host:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
pnpm macos:formal-build
plutil -p "src-tauri/target/universal-apple-darwin/release/bundle/macos/情侣桌宠.app/Contents/Info.plist" > ".superpowers/sdd/2026-08-07-macos-cross-platform/build/generated-info-plist-ats.log"
INTEROP_GITHUB_TOKEN="$INTEROP_GITHUB_TOKEN" node scripts/interop/github-rendezvous.mjs create --repo owner/repo --title "couple-pet interop"
cargo tree --manifest-path src-tauri/Cargo.toml --no-default-features > ".superpowers/sdd/2026-08-07-macos-cross-platform/build/cargo-tree-production.log"
node scripts/macos/final-release-gate.mjs --scan-production > ".superpowers/sdd/2026-08-07-macos-cross-platform/build/production-permission-scan.log"
pnpm macos:native-evidence
pnpm e2e:macos
pnpm e2e:interop:windows
pnpm e2e:interop:windows:restart
pnpm e2e:interop:macos
pnpm e2e:interop:macos:restart
pnpm interop:validate -- --log .superpowers/sdd/2026-08-07-macos-cross-platform/interop/windows.jsonl --log .superpowers/sdd/2026-08-07-macos-cross-platform/interop/macos.jsonl
INTEROP_GITHUB_TOKEN="$INTEROP_GITHUB_TOKEN" node scripts/interop/github-rendezvous.mjs cleanup --repo owner/repo --issue "$INTEROP_ISSUE_NUMBER"
pnpm macos:final-gate
```

Expected:

- `Info.plist` evidence shows the scoped ATS exception.
- macOS HTTP health and WebSocket smoke reach `http://159.75.175.47:8787`.
- Production cargo tree and artifact scan show no WDIO plugins or WDIO permissions.
- `lipo -archs` evidence shows `x86_64 arm64`.
- `hdiutil attach` and `hdiutil detach` evidence both exist.
- `notarytool`, `stapler validate`, `spctl` before/after evidence exist for formal builds.
- Final gate completes only when real Mac runtime, real Windows-to-macOS interop, and formal Developer ID signing/notarization/stapling evidence are all present.
- Without Apple Developer credentials, final gate writes `qa-only` and exits nonzero.

- [ ] **Step 7: Commit**

```bash
git add scripts/macos/final-release-gate.mjs scripts/macos/final-release-gate.test.ts package.json
git add -f .superpowers/sdd/2026-08-07-macos-cross-platform/final-acceptance-matrix.md
git commit -m "test: add macos final release gate"
```

---

## Final Implementation Verification

Run before claiming the macOS release complete:

```bash
pnpm test
pnpm typecheck
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
git diff --check
```

Run on a real macOS 12+ host:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
pnpm macos:qa-build
pnpm e2e:macos:build
pnpm e2e:macos
pnpm macos:native-evidence
pnpm e2e:interop:windows
pnpm e2e:interop:windows:restart
pnpm e2e:interop:macos
pnpm e2e:interop:macos:restart
pnpm interop:validate -- --log .superpowers/sdd/2026-08-07-macos-cross-platform/interop/windows.jsonl --log .superpowers/sdd/2026-08-07-macos-cross-platform/interop/macos.jsonl
pnpm macos:formal-build
pnpm macos:final-gate
```

Completion requires direct evidence for every matrix row:

- Universal `.app` and `.dmg` exist.
- `file` and `lipo` prove both `x86_64` and `arm64` slices.
- Generated `.app/Contents/Info.plist` contains the scoped ATS exception.
- macOS 12+ host reaches Relay HTTP and WebSocket endpoints.
- Production cargo tree and artifact scan exclude WDIO plugins and permissions.
- `codesign`, `notarytool`, `stapler validate`, and `spctl --assess` evidence pass for a formal build.
- Real macOS launch and native shell behavior have screenshots or state logs.
- Windows and macOS real clients complete binding, online state, status sync both directions, messages both directions, bubble acknowledgement, animation observation, unbind, and restart.
- `release-decision.md` is generated after the final gate validates external evidence.

## Self-Review Coverage Map

- Spec item 1 is covered by Tasks 1, 5, 9, and 11.
- Spec item 2 is covered by Tasks 3, 4, 6, 7, 8, and 11.
- Spec item 3 is covered by Global Constraints, Tasks 2, 6, and 8.
- Spec item 4 is covered by Tasks 1, 2, 3, 4, and 7.
- Spec item 5 is covered by Tasks 1, 8, 10, and 11.
- Spec item 6 is covered by Tasks 4, 6, 8, and existing settings/package tests.
- Spec item 7 is covered by Tasks 1, 5, 9, and 11.
- Spec item 8 is covered by Global Constraints, Tasks 5, 7, 8, 9, and 11.
- Spec item 9 is covered by Tasks 5, 6, 7, 8, 9, 10, and 11.
- Spec item 10 is covered by Tasks 7, 8, 10, and 11.
- Spec item 11 is covered by Tasks 1, 3, 4, 5, 7, 8, 9, and 11.
- Spec item 12 is covered by Tasks 9, 10, and 11.
- Spec item 13 is enforced by Global Constraints and Task 4.
