# Importable Pet Resource Packs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first working resource-pack system so users can import `.cdpet` PNG sequence packages, switch the local desktop pet appearance, and keep the selection after restarting the exe.

**Architecture:** Keep the existing pet state machine and fixed 12 action names. Add a package contract and registry on the frontend, Rust-side package import and storage under app data, and a settings UI section for import/switch/delete. The built-in `star-sleeper` package remains the fallback and does not depend on imported packages.

**Tech Stack:** Tauri 2, Rust, TypeScript strict mode, React 19, Vitest, PNG sequence frames, zip-based `.cdpet` archives, app data storage.

## Global Constraints

- First version uses manual package exchange; Relay must not upload, download, store, or forward image resources.
- Support PNG sequence frames only.
- Reuse exactly these 12 action names: `idle-breathe`, `idle-look`, `idle-stretch`, `walk`, `drag`, `sleep`, `act-cute`, `act-typing`, `act-wave`, `act-hug`, `act-pout`, `act-drowsy`.
- Each required action has exactly 18 PNG frames named `<action>-01.png` through `<action>-18.png`.
- Store imported packages under app data, not beside the exe and not inside `src/assets`.
- Reject packages before import when manifest or frames are invalid.
- Imported package runtime IDs use `imported:<manifest-id>`.
- Built-in package runtime ID remains `builtin:star-sleeper`.
- The first implementation does not add Live2D, Spine, GIF, video, 3D, audio, scripts, package signing, marketplace, or automatic peer resource transfer.
- Keep local desktop pet behavior usable when imported package loading fails by falling back to the built-in pet.
- Communicate with the user in Chinese for UI-facing error messages.

---

## File Structure

- Create `src/assets/petPackageContract.ts`: shared frontend contract for package IDs, action names, frame naming, manifest validation, and package summaries.
- Modify `src/assets/builtInPetManifest.ts`: export required actions and built-in package metadata through the new contract without changing existing action names.
- Modify `src/settings/settingsTypes.ts`, `src/settings/defaultSettings.ts`, `src/settings/settingsStore.ts`, and tests: add `appearance.selectedPetPackageId` and `appearance.peerPetPackageByDeviceId`.
- Create `src-tauri/src/pet_packages.rs`: Rust-side package validation, zip extraction, app data storage, package index reading, deleting, and path resolution.
- Modify `src-tauri/src/main.rs`: register pet package commands.
- Modify `src-tauri/Cargo.toml`: add the zip dependency used by the importer.
- Create `src/assets/petPackageCommands.ts`: frontend Tauri command wrapper for package operations.
- Create `src/assets/petPackageRegistry.ts`: merge built-in package and imported summaries into renderable package definitions with frame URLs.
- Modify `src/renderer/frameAtlas.ts` and `src/renderer/FramePetStage.tsx`: render from a selected resolved package instead of always using built-in frames.
- Create `src/settings/AppearancePanel.tsx` and tests: settings UI for current shape, import, switch, delete.
- Modify `src/app/App.tsx` and tests: load package summaries, persist selected package, pass selected package to the renderer, and show package errors.
- Modify `src/assets/README.md` and create `docs/pet-resource-pack-format.md`: user-facing resource package rules.

---

### Task 1: Frontend Package Contract And Settings Schema

**Files:**
- Create: `src/assets/petPackageContract.ts`
- Test: `src/assets/petPackageContract.test.ts`
- Modify: `src/assets/builtInPetManifest.ts`
- Modify: `src/assets/builtInPetManifest.test.ts`
- Modify: `src/settings/settingsTypes.ts`
- Modify: `src/settings/defaultSettings.ts`
- Modify: `src/settings/settingsStore.ts`
- Test: `src/settings/settingsStore.test.ts`

**Interfaces:**
- Produces: `BUILT_IN_PET_PACKAGE_ID: "builtin:star-sleeper"`
- Produces: `REQUIRED_PET_ACTIONS: readonly PetActionName[]`
- Produces: `PET_FRAMES_PER_ACTION: 18`
- Produces: `buildFrameFileName(action: PetActionName, index: number): string`
- Produces: `readPetPackageManifest(input: unknown): PetPackageManifest | null`
- Produces: `AppearanceSettings`
- Consumes: existing `PetActionName`, `PetActionDefinition`, and settings merge flow.

- [ ] **Step 1: Add failing contract tests**

Create `src/assets/petPackageContract.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PET_PACKAGE_ID,
  PET_FRAMES_PER_ACTION,
  REQUIRED_PET_ACTIONS,
  buildFrameFileName,
  readPetPackageManifest,
} from "./petPackageContract";

describe("pet package contract", () => {
  it("defines the built-in package id and the fixed action contract", () => {
    expect(BUILT_IN_PET_PACKAGE_ID).toBe("builtin:star-sleeper");
    expect(PET_FRAMES_PER_ACTION).toBe(18);
    expect(REQUIRED_PET_ACTIONS).toEqual([
      "idle-breathe",
      "idle-look",
      "idle-stretch",
      "walk",
      "drag",
      "sleep",
      "act-cute",
      "act-typing",
      "act-wave",
      "act-hug",
      "act-pout",
      "act-drowsy",
    ]);
  });

  it("builds fixed frame file names", () => {
    expect(buildFrameFileName("act-wave", 1)).toBe("act-wave-01.png");
    expect(buildFrameFileName("act-wave", 18)).toBe("act-wave-18.png");
  });

  it("reads a valid manifest", () => {
    expect(
      readPetPackageManifest({
        formatVersion: 1,
        id: "moon-buddy",
        name: "月亮伙伴",
        baseSize: { width: 256, height: 320 },
        frameSize: { width: 512, height: 512 },
        actions: Object.fromEntries(
          REQUIRED_PET_ACTIONS.map((action) => [action, { fps: 3, loop: action.startsWith("idle") }]),
        ),
      }),
    ).toMatchObject({
      formatVersion: 1,
      id: "moon-buddy",
      name: "月亮伙伴",
    });
  });

  it("rejects invalid ids and missing actions", () => {
    expect(
      readPetPackageManifest({
        formatVersion: 1,
        id: "../bad",
        name: "坏包",
        baseSize: { width: 256, height: 320 },
        frameSize: { width: 512, height: 512 },
        actions: {},
      }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run contract tests to verify they fail**

Run: `pnpm test -- src/assets/petPackageContract.test.ts`

Expected: FAIL because `src/assets/petPackageContract.ts` does not exist.

- [ ] **Step 3: Implement the contract module**

Create `src/assets/petPackageContract.ts`:

```ts
import type { PetActionDefinition, PetActionName } from "./builtInPetManifest";

export const BUILT_IN_PET_PACKAGE_ID = "builtin:star-sleeper" as const;
export const IMPORTED_PET_PACKAGE_PREFIX = "imported:" as const;
export const PET_FRAMES_PER_ACTION = 18;

export const REQUIRED_PET_ACTIONS = [
  "idle-breathe",
  "idle-look",
  "idle-stretch",
  "walk",
  "drag",
  "sleep",
  "act-cute",
  "act-typing",
  "act-wave",
  "act-hug",
  "act-pout",
  "act-drowsy",
] as const satisfies readonly PetActionName[];

export interface PetPackageManifest {
  formatVersion: 1;
  id: string;
  name: string;
  baseSize: { width: number; height: number };
  frameSize: { width: number; height: number };
  actions: Record<PetActionName, Pick<PetActionDefinition, "fps" | "loop">>;
}

export interface ImportedPetPackageSummary {
  id: string;
  manifestId: string;
  name: string;
  baseSize: { width: number; height: number };
  frameSize: { width: number; height: number };
  previewPath: string | null;
  framePaths: Record<PetActionName, string[]>;
}

export function toImportedPetPackageId(manifestId: string): string {
  return `${IMPORTED_PET_PACKAGE_PREFIX}${manifestId}`;
}

export function isImportedPetPackageId(id: string): boolean {
  return id.startsWith(IMPORTED_PET_PACKAGE_PREFIX);
}

export function stripImportedPetPackagePrefix(id: string): string {
  return isImportedPetPackageId(id) ? id.slice(IMPORTED_PET_PACKAGE_PREFIX.length) : id;
}

export function buildFrameFileName(action: PetActionName, index: number): string {
  return `${action}-${String(index).padStart(2, "0")}.png`;
}

export function readPetPackageManifest(input: unknown): PetPackageManifest | null {
  if (!isRecord(input) || input.formatVersion !== 1) {
    return null;
  }

  const id = readPackageId(input.id);
  const name = readNonEmptyString(input.name);
  const baseSize = readSize(input.baseSize);
  const frameSize = readSize(input.frameSize);
  const actions = readActions(input.actions);

  if (!id || !name || !baseSize || !frameSize || !actions) {
    return null;
  }

  return { formatVersion: 1, id, name, baseSize, frameSize, actions };
}

function readActions(input: unknown): PetPackageManifest["actions"] | null {
  if (!isRecord(input)) {
    return null;
  }

  const entries = REQUIRED_PET_ACTIONS.map((action) => {
    const value = input[action];
    if (!isRecord(value)) {
      return null;
    }

    const fps = typeof value.fps === "number" && value.fps > 0 && value.fps <= 24 ? value.fps : null;
    const loop = typeof value.loop === "boolean" ? value.loop : null;

    return fps && loop !== null ? [action, { fps, loop }] : null;
  });

  if (entries.some((entry) => entry === null)) {
    return null;
  }

  return Object.fromEntries(entries as Array<[PetActionName, Pick<PetActionDefinition, "fps" | "loop">]>) as PetPackageManifest["actions"];
}

function readSize(input: unknown): { width: number; height: number } | null {
  if (!isRecord(input)) {
    return null;
  }

  const width = input.width;
  const height = input.height;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    width < 64 ||
    height < 64 ||
    width > 2048 ||
    height > 2048
  ) {
    return null;
  }

  return { width, height };
}

function readPackageId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const id = value.trim();
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id) ? id : null;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

- [ ] **Step 4: Add failing settings migration tests**

Extend `src/settings/settingsStore.test.ts` with:

```ts
it("defaults appearance settings to the built-in package", () => {
  expect(mergeSettings({}).appearance).toEqual({
    selectedPetPackageId: "builtin:star-sleeper",
    peerPetPackageByDeviceId: {},
  });
});

it("reads valid appearance settings and drops invalid peer mappings", () => {
  expect(
    mergeSettings({
      appearance: {
        selectedPetPackageId: "imported:moon-buddy",
        peerPetPackageByDeviceId: {
          dev_a: "imported:moon-buddy",
          dev_b: 3,
        },
      },
    }),
  ).toMatchObject({
    appearance: {
      selectedPetPackageId: "imported:moon-buddy",
      peerPetPackageByDeviceId: {
        dev_a: "imported:moon-buddy",
      },
    },
  });
});
```

- [ ] **Step 5: Run settings tests to verify they fail**

Run: `pnpm test -- src/settings/settingsStore.test.ts`

Expected: FAIL because `appearance` does not exist in `PetSettings`.

- [ ] **Step 6: Implement settings schema**

Modify `src/settings/settingsTypes.ts`:

```ts
export interface AppearanceSettings {
  selectedPetPackageId: string;
  peerPetPackageByDeviceId: Record<string, string>;
}

export interface PetSettings {
  scale: number;
  autoMoveEnabled: boolean;
  movementRange: MovementRange;
  bubblesEnabled: boolean;
  alwaysOnTop: boolean;
  clickThrough: boolean;
  appearance: AppearanceSettings;
  sync: SyncSettings;
}
```

Modify `src/settings/defaultSettings.ts`:

```ts
import { BUILT_IN_PET_PACKAGE_ID } from "../assets/petPackageContract";

appearance: {
  selectedPetPackageId: BUILT_IN_PET_PACKAGE_ID,
  peerPetPackageByDeviceId: {},
},
```

Modify `src/settings/settingsStore.ts`:

```ts
function readAppearanceSettings(value: unknown): PetSettings["appearance"] {
  if (!isRecord(value)) {
    return defaultSettings.appearance;
  }

  return {
    selectedPetPackageId: readNonEmptyString(
      value.selectedPetPackageId,
      defaultSettings.appearance.selectedPetPackageId,
    ),
    peerPetPackageByDeviceId: readStringRecord(value.peerPetPackageByDeviceId),
  };
}

function readStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, entry]) => typeof key === "string" && typeof entry === "string" && key.trim() && entry.trim(),
    ),
  );
}
```

Include `appearance: readAppearanceSettings(input.appearance)` in `mergeSettings`.

- [ ] **Step 7: Run task tests**

Run: `pnpm test -- src/assets/petPackageContract.test.ts src/settings/settingsStore.test.ts src/assets/builtInPetManifest.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/assets/petPackageContract.ts src/assets/petPackageContract.test.ts src/assets/builtInPetManifest.ts src/assets/builtInPetManifest.test.ts src/settings/settingsTypes.ts src/settings/defaultSettings.ts src/settings/settingsStore.ts src/settings/settingsStore.test.ts
git commit -m "feat: add pet package contract settings"
```

---

### Task 2: Rust Package Import, Validation, And Storage

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/pet_packages.rs`
- Modify: `src-tauri/src/main.rs`

**Interfaces:**
- Produces Tauri commands:
  - `list_pet_packages() -> Result<Vec<ImportedPetPackageSummary>, String>`
  - `import_pet_package(sourcePath: String) -> Result<ImportedPetPackageSummary, String>`
  - `delete_pet_package(packageId: String) -> Result<(), String>`
- Produces Rust pure helpers:
  - `import_pet_package_from_path(source_path: &Path, packages_root: &Path) -> Result<ImportedPetPackageSummary, String>`
  - `list_pet_packages_from_root(packages_root: &Path) -> Result<Vec<ImportedPetPackageSummary>, String>`
  - `delete_pet_package_from_root(packages_root: &Path, package_id: &str) -> Result<(), String>`
- Consumes the package format from `docs/superpowers/specs/2026-08-03-importable-pet-resource-pack-design.md`.

- [ ] **Step 1: Add dependencies**

Modify `src-tauri/Cargo.toml`:

```toml
zip = { version = "2", default-features = false, features = ["deflate"] }
```

- [ ] **Step 2: Add failing Rust importer tests**

Create `src-tauri/src/pet_packages.rs` with tests first. Include these tests inside `#[cfg(test)] mod tests`:

```rust
#[test]
fn imports_valid_package_and_lists_it() {
    let temp = unique_temp_dir("valid-package");
    let source = temp.join("moon.cdpet");
    write_test_package(&source, "moon-buddy", true, false);
    let root = temp.join("packages");

    let imported = import_pet_package_from_path(&source, &root).unwrap();
    assert_eq!(imported.id, "imported:moon-buddy");
    assert_eq!(imported.manifest_id, "moon-buddy");
    assert!(imported.preview_path.as_ref().unwrap().ends_with("preview.png"));
    assert_eq!(imported.frame_paths["idle-breathe"].len(), 18);

    let packages = list_pet_packages_from_root(&root).unwrap();
    assert_eq!(packages.len(), 1);
    assert_eq!(packages[0].id, "imported:moon-buddy");

    let _ = std::fs::remove_dir_all(temp);
}

#[test]
fn rejects_missing_required_frame() {
    let temp = unique_temp_dir("missing-frame");
    let source = temp.join("broken.cdpet");
    write_test_package(&source, "broken", false, false);
    let root = temp.join("packages");

    let error = import_pet_package_from_path(&source, &root).unwrap_err();
    assert!(error.contains("缺少帧文件"));

    let _ = std::fs::remove_dir_all(temp);
}

#[test]
fn rejects_path_traversal_entries() {
    let temp = unique_temp_dir("path-traversal");
    let source = temp.join("bad.cdpet");
    write_test_package(&source, "bad", true, true);
    let root = temp.join("packages");

    let error = import_pet_package_from_path(&source, &root).unwrap_err();
    assert!(error.contains("非法路径"));

    let _ = std::fs::remove_dir_all(temp);
}

#[test]
fn deletes_imported_package() {
    let temp = unique_temp_dir("delete-package");
    let source = temp.join("moon.cdpet");
    write_test_package(&source, "moon-buddy", true, false);
    let root = temp.join("packages");

    import_pet_package_from_path(&source, &root).unwrap();
    delete_pet_package_from_root(&root, "imported:moon-buddy").unwrap();

    assert!(list_pet_packages_from_root(&root).unwrap().is_empty());
    let _ = std::fs::remove_dir_all(temp);
}
```

The helper `write_test_package` should create `pet.json`, `preview.png`, and PNG files with the PNG signature bytes `[137, 80, 78, 71, 13, 10, 26, 10]`.

- [ ] **Step 3: Run Rust tests to verify they fail**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml pet_packages
```

Expected: FAIL because `import_pet_package_from_path`, `write_test_package`, or the module implementation is missing.

- [ ] **Step 4: Implement importer data types and constants**

In `src-tauri/src/pet_packages.rs`:

```rust
use std::{
    collections::BTreeMap,
    fs,
    io::{Cursor, Read},
    path::{Component, Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use zip::ZipArchive;

const PET_PACKAGES_DIR: &str = "pet-packages";
const IMPORTED_PREFIX: &str = "imported:";
const PET_FRAMES_PER_ACTION: usize = 18;
const PNG_SIGNATURE: [u8; 8] = [137, 80, 78, 71, 13, 10, 26, 10];

const REQUIRED_ACTIONS: [&str; 12] = [
    "idle-breathe",
    "idle-look",
    "idle-stretch",
    "walk",
    "drag",
    "sleep",
    "act-cute",
    "act-typing",
    "act-wave",
    "act-hug",
    "act-pout",
    "act-drowsy",
];

#[derive(Debug, Deserialize)]
struct PetPackageManifest {
    #[serde(rename = "formatVersion")]
    format_version: u8,
    id: String,
    name: String,
    #[serde(rename = "baseSize")]
    base_size: PackageSize,
    #[serde(rename = "frameSize")]
    frame_size: PackageSize,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PackageSize {
    width: u32,
    height: u32,
}

#[derive(Clone, Debug, Serialize)]
pub struct ImportedPetPackageSummary {
    id: String,
    #[serde(rename = "manifestId")]
    manifest_id: String,
    name: String,
    #[serde(rename = "baseSize")]
    base_size: PackageSize,
    #[serde(rename = "frameSize")]
    frame_size: PackageSize,
    #[serde(rename = "previewPath")]
    preview_path: Option<String>,
    #[serde(rename = "framePaths")]
    frame_paths: BTreeMap<String, Vec<String>>,
}
```

- [ ] **Step 5: Implement validation and extraction**

Add functions:

```rust
pub fn import_pet_package_from_path(
    source_path: &Path,
    packages_root: &Path,
) -> Result<ImportedPetPackageSummary, String> {
    let bytes = fs::read(source_path)
        .map_err(|error| format!("无法读取资源包: {error}"))?;
    let mut archive = ZipArchive::new(Cursor::new(bytes))
        .map_err(|error| format!("资源包不是有效的 cdpet/zip 文件: {error}"))?;

    validate_archive_paths(&mut archive)?;
    let manifest = read_manifest(&mut archive)?;
    validate_manifest(&manifest)?;
    validate_required_frames(&mut archive)?;

    let package_dir = packages_root.join(&manifest.id);
    let staging_dir = packages_root.join(format!(".importing-{}", manifest.id));
    if staging_dir.exists() {
        fs::remove_dir_all(&staging_dir)
            .map_err(|error| format!("无法清理临时导入目录: {error}"))?;
    }
    fs::create_dir_all(&staging_dir)
        .map_err(|error| format!("无法创建导入目录: {error}"))?;

    extract_archive(&mut archive, &staging_dir)?;

    if package_dir.exists() {
        fs::remove_dir_all(&package_dir)
            .map_err(|error| format!("无法替换旧资源包: {error}"))?;
    }
    fs::rename(&staging_dir, &package_dir)
        .map_err(|error| format!("无法保存资源包: {error}"))?;

    read_package_summary(&package_dir)
}
```

Use these exact validation helpers:

```rust
fn validate_manifest(manifest: &PetPackageManifest) -> Result<(), String> {
    if manifest.format_version != 1 {
        return Err("资源包版本不支持".to_string());
    }
    if !is_valid_manifest_id(&manifest.id) {
        return Err("资源包 id 只能包含英文、数字、下划线和短横线".to_string());
    }
    if manifest.name.trim().is_empty() {
        return Err("资源包名称不能为空".to_string());
    }
    if manifest.base_size.width < 64 || manifest.base_size.height < 64 {
        return Err("baseSize 太小".to_string());
    }
    if manifest.frame_size.width < 64 || manifest.frame_size.height < 64 {
        return Err("frameSize 太小".to_string());
    }
    Ok(())
}

fn is_valid_manifest_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

fn expected_frame_path(action: &str, frame_index: usize) -> String {
    format!("frames/{action}-{frame_index:02}.png")
}
```

Ensure `validate_archive_paths` rejects absolute paths, `..`, Windows prefixes, and backslashes:

```rust
fn validate_relative_archive_path(name: &str) -> Result<(), String> {
    if name.contains('\\') || name.starts_with('/') {
        return Err(format!("非法路径: {name}"));
    }
    let path = Path::new(name);
    for component in path.components() {
        match component {
            Component::Normal(_) => {}
            _ => return Err(format!("非法路径: {name}")),
        }
    }
    Ok(())
}
```

- [ ] **Step 6: Implement list/delete commands**

Add:

```rust
#[tauri::command]
pub fn list_pet_packages(app: AppHandle) -> Result<Vec<ImportedPetPackageSummary>, String> {
    let root = packages_root(&app)?;
    list_pet_packages_from_root(&root)
}

#[tauri::command]
pub fn import_pet_package(
    app: AppHandle,
    #[serde(rename = "sourcePath")] source_path: String,
) -> Result<ImportedPetPackageSummary, String> {
    let root = packages_root(&app)?;
    import_pet_package_from_path(Path::new(&source_path), &root)
}

#[tauri::command]
pub fn delete_pet_package(app: AppHandle, #[serde(rename = "packageId")] package_id: String) -> Result<(), String> {
    let root = packages_root(&app)?;
    delete_pet_package_from_root(&root, &package_id)
}

fn packages_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(PET_PACKAGES_DIR))
        .map_err(|error| format!("<app_data_dir>/{PET_PACKAGES_DIR}: {error}"))
}
```

Register commands in `src-tauri/src/main.rs`:

```rust
mod pet_packages;

.invoke_handler(tauri::generate_handler![
    commands::ping,
    commands::read_settings,
    commands::write_settings,
    commands::set_always_on_top,
    commands::set_click_through,
    commands::reset_window_position,
    commands::move_window_for_auto_step,
    commands::show_window,
    commands::hide_window,
    commands::quit_app,
    pet_packages::list_pet_packages,
    pet_packages::import_pet_package,
    pet_packages::delete_pet_package,
])
```

- [ ] **Step 7: Run Rust verification**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml pet_packages
pnpm tauri build --debug
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/main.rs src-tauri/src/pet_packages.rs
git commit -m "feat: add pet package import commands"
```

---

### Task 3: Frontend Package Commands And Registry

**Files:**
- Create: `src/assets/petPackageCommands.ts`
- Test: `src/assets/petPackageCommands.test.ts`
- Create: `src/assets/petPackageRegistry.ts`
- Test: `src/assets/petPackageRegistry.test.ts`
- Modify: `src/desktop/desktopApi.ts` only if the existing invoke wrapper needs exported types.

**Interfaces:**
- Consumes Tauri commands from Task 2.
- Produces `PetPackageApi`.
- Produces `ResolvedPetPackage`.
- Produces `loadPetPackages(api): Promise<ResolvedPetPackage[]>`.
- Produces `resolveSelectedPetPackage(packages, selectedId): ResolvedPetPackage`.

- [ ] **Step 1: Add failing command wrapper tests**

Create `src/assets/petPackageCommands.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createPetPackageCommands } from "./petPackageCommands";

describe("pet package commands", () => {
  it("calls Tauri import_pet_package with sourcePath", async () => {
    const invoke = vi.fn(async () => ({
      id: "imported:moon-buddy",
      manifestId: "moon-buddy",
      name: "月亮伙伴",
      baseSize: { width: 256, height: 320 },
      frameSize: { width: 512, height: 512 },
      previewPath: "C:/app/pet-packages/moon-buddy/preview.png",
      framePaths: { "idle-breathe": [] },
    }));
    const api = createPetPackageCommands(invoke);

    await api.importPetPackage("C:/Users/me/moon.cdpet");

    expect(invoke).toHaveBeenCalledWith("import_pet_package", {
      sourcePath: "C:/Users/me/moon.cdpet",
    });
  });
});
```

- [ ] **Step 2: Implement command wrapper**

Create `src/assets/petPackageCommands.ts`:

```ts
import { convertFileSrc } from "@tauri-apps/api/core";
import { invokeCommand } from "../desktop/desktopApi";
import type { ImportedPetPackageSummary } from "./petPackageContract";

export interface PetPackageApi {
  listPetPackages(): Promise<ImportedPetPackageSummary[]>;
  importPetPackage(sourcePath: string): Promise<ImportedPetPackageSummary>;
  deletePetPackage(packageId: string): Promise<void>;
  convertFileSrc(path: string): string;
}

type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export function createPetPackageCommands(invoke: InvokeFn = invokeCommand): PetPackageApi {
  return {
    listPetPackages: () => invoke<ImportedPetPackageSummary[]>("list_pet_packages"),
    importPetPackage: (sourcePath) =>
      invoke<ImportedPetPackageSummary>("import_pet_package", { sourcePath }),
    deletePetPackage: (packageId) => invoke<void>("delete_pet_package", { packageId }),
    convertFileSrc,
  };
}
```

- [ ] **Step 3: Add failing registry tests**

Create `src/assets/petPackageRegistry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PET_PACKAGE_ID,
  REQUIRED_PET_ACTIONS,
  type ImportedPetPackageSummary,
} from "./petPackageContract";
import { buildPetPackageRegistry, resolveSelectedPetPackage } from "./petPackageRegistry";

describe("pet package registry", () => {
  const imported: ImportedPetPackageSummary = {
    id: "imported:moon-buddy",
    manifestId: "moon-buddy",
    name: "月亮伙伴",
    baseSize: { width: 256, height: 320 },
    frameSize: { width: 512, height: 512 },
    previewPath: "C:/app/pet-packages/moon-buddy/preview.png",
    framePaths: Object.fromEntries(
      REQUIRED_PET_ACTIONS.map((action) => [
        action,
        Array.from({ length: 18 }, (_, index) => `C:/app/pet-packages/moon-buddy/frames/${action}-${String(index + 1).padStart(2, "0")}.png`),
      ]),
    ) as ImportedPetPackageSummary["framePaths"],
  };

  it("combines the built-in package with imported packages", () => {
    const packages = buildPetPackageRegistry([imported], (path) => `asset://${path}`);

    expect(packages.map((pkg) => pkg.id)).toEqual([
      BUILT_IN_PET_PACKAGE_ID,
      "imported:moon-buddy",
    ]);
    expect(packages[1].actions["idle-breathe"].frames[0]).toBe(
      "asset://C:/app/pet-packages/moon-buddy/frames/idle-breathe-01.png",
    );
  });

  it("falls back to built-in when selected package is missing", () => {
    const packages = buildPetPackageRegistry([], (path) => `asset://${path}`);

    expect(resolveSelectedPetPackage(packages, "imported:missing").id).toBe(
      BUILT_IN_PET_PACKAGE_ID,
    );
  });
});
```

- [ ] **Step 4: Implement registry**

Create `src/assets/petPackageRegistry.ts`:

```ts
import {
  builtInPetManifest,
  getActionDefinition,
  type PetActionDefinition,
  type PetActionName,
} from "./builtInPetManifest";
import {
  BUILT_IN_PET_PACKAGE_ID,
  REQUIRED_PET_ACTIONS,
  type ImportedPetPackageSummary,
} from "./petPackageContract";
import { getBuiltInFrameAssetUrl } from "../renderer/frameAtlas";

export interface ResolvedPetPackage {
  id: string;
  name: string;
  baseSize: { width: number; height: number };
  previewUrl: string | null;
  source: "built-in" | "imported";
  actions: Record<PetActionName, PetActionDefinition>;
}

export function buildPetPackageRegistry(
  importedPackages: ImportedPetPackageSummary[],
  convertFileSrc: (path: string) => string,
): ResolvedPetPackage[] {
  return [
    {
      id: BUILT_IN_PET_PACKAGE_ID,
      name: builtInPetManifest.name,
      baseSize: builtInPetManifest.baseSize,
      previewUrl: null,
      source: "built-in",
      actions: Object.fromEntries(
        REQUIRED_PET_ACTIONS.map((action) => [
          action,
          {
            ...getActionDefinition(action),
            frames: getActionDefinition(action).frames.map((framePath) => getBuiltInFrameAssetUrl(framePath)).filter(Boolean),
          },
        ]),
      ) as Record<PetActionName, PetActionDefinition>,
    },
    ...importedPackages.map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      baseSize: pkg.baseSize,
      previewUrl: pkg.previewPath ? convertFileSrc(pkg.previewPath) : null,
      source: "imported" as const,
      actions: Object.fromEntries(
        REQUIRED_PET_ACTIONS.map((action) => [
          action,
          {
            fps: 3,
            loop: action.startsWith("idle") || ["walk", "drag", "sleep"].includes(action),
            durationMs: 6000,
            category: readActionCategory(action),
            frames: pkg.framePaths[action].map(convertFileSrc),
          },
        ]),
      ) as Record<PetActionName, PetActionDefinition>,
    })),
  ];
}

export function resolveSelectedPetPackage(
  packages: readonly ResolvedPetPackage[],
  selectedPackageId: string,
): ResolvedPetPackage {
  return (
    packages.find((pkg) => pkg.id === selectedPackageId) ??
    packages.find((pkg) => pkg.id === BUILT_IN_PET_PACKAGE_ID) ??
    packages[0]
  );
}

function readActionCategory(action: PetActionName): PetActionDefinition["category"] {
  if (action.startsWith("idle")) {
    return "idle";
  }
  if (action.startsWith("act-")) {
    return "interaction";
  }
  return "movement";
}
```

If TypeScript rejects `filter(Boolean)` for `readonly string[]`, replace it with:

```ts
frames: getActionDefinition(action).frames.flatMap((framePath) => {
  const url = getBuiltInFrameAssetUrl(framePath);
  return url ? [url] : [];
}),
```

- [ ] **Step 5: Adjust `frameAtlas` exports without changing behavior**

Modify `src/renderer/frameAtlas.ts`:

```ts
export function getBuiltInActionDefinition(action: PetActionName) {
  return getBuiltInActionDefinitionFromManifest(action);
}

export function getBuiltInFrameAssetUrl(framePath: string): string | null {
  return petFrameUrls[`../assets/${framePath}`] ?? null;
}

export function getActionDefinition(action: PetActionName) {
  return getBuiltInActionDefinitionFromManifest(action);
}

export function getFrameAssetUrl(framePath: string): string | null {
  return getBuiltInFrameAssetUrl(framePath);
}
```

Keep existing callers working until Task 4 changes the renderer.

- [ ] **Step 6: Run task tests**

Run: `pnpm test -- src/assets/petPackageCommands.test.ts src/assets/petPackageRegistry.test.ts src/renderer/FramePetStage.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/assets/petPackageCommands.ts src/assets/petPackageCommands.test.ts src/assets/petPackageRegistry.ts src/assets/petPackageRegistry.test.ts src/renderer/frameAtlas.ts
git commit -m "feat: add pet package frontend registry"
```

---

### Task 4: Renderer Uses Selected Package

**Files:**
- Modify: `src/renderer/FramePetStage.tsx`
- Test: `src/renderer/FramePetStage.test.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/app/App.test.tsx`

**Interfaces:**
- Consumes `ResolvedPetPackage` from Task 3.
- Produces `FramePetStage` prop `petPackage: ResolvedPetPackage`.
- Keeps `action: PetActionName` unchanged.

- [ ] **Step 1: Add failing renderer test**

Extend `src/renderer/FramePetStage.test.tsx`:

```tsx
import type { ResolvedPetPackage } from "../assets/petPackageRegistry";

const testPackage: ResolvedPetPackage = {
  id: "imported:moon-buddy",
  name: "月亮伙伴",
  source: "imported",
  baseSize: { width: 256, height: 320 },
  previewUrl: null,
  actions: {
    "idle-breathe": {
      fps: 3,
      loop: true,
      durationMs: 6000,
      category: "idle",
      frames: ["asset://moon/idle-breathe-01.png"],
    },
    "idle-look": { fps: 3, loop: true, durationMs: 6000, category: "idle", frames: ["asset://moon/idle-look-01.png"] },
    "idle-stretch": { fps: 3, loop: true, durationMs: 6000, category: "idle", frames: ["asset://moon/idle-stretch-01.png"] },
    walk: { fps: 3, loop: true, durationMs: 6000, category: "movement", frames: ["asset://moon/walk-01.png"] },
    drag: { fps: 3, loop: true, durationMs: 6000, category: "movement", frames: ["asset://moon/drag-01.png"] },
    sleep: { fps: 3, loop: true, durationMs: 6000, category: "movement", frames: ["asset://moon/sleep-01.png"] },
    "act-cute": { fps: 3, loop: false, durationMs: 6000, category: "interaction", frames: ["asset://moon/act-cute-01.png"] },
    "act-typing": { fps: 3, loop: false, durationMs: 6000, category: "interaction", frames: ["asset://moon/act-typing-01.png"] },
    "act-wave": { fps: 3, loop: false, durationMs: 6000, category: "interaction", frames: ["asset://moon/act-wave-01.png"] },
    "act-hug": { fps: 3, loop: false, durationMs: 6000, category: "interaction", frames: ["asset://moon/act-hug-01.png"] },
    "act-pout": { fps: 3, loop: false, durationMs: 6000, category: "interaction", frames: ["asset://moon/act-pout-01.png"] },
    "act-drowsy": { fps: 3, loop: false, durationMs: 6000, category: "interaction", frames: ["asset://moon/act-drowsy-01.png"] },
  },
};

it("renders the frame URL from the selected package", () => {
  render(
    <FramePetStage
      action="idle-breathe"
      scale={1}
      petPackage={testPackage}
      onPetClick={vi.fn()}
      onDragStart={vi.fn()}
      onDragEnd={vi.fn()}
    />,
  );

  expect(screen.getByRole("img", { name: "月亮伙伴" }).getAttribute("src")).toBe(
    "asset://moon/idle-breathe-01.png",
  );
});
```

- [ ] **Step 2: Run renderer test to verify it fails**

Run: `pnpm test -- src/renderer/FramePetStage.test.tsx`

Expected: FAIL because `petPackage` is not a `FramePetStage` prop.

- [ ] **Step 3: Implement renderer prop**

Modify `src/renderer/FramePetStage.tsx`:

```tsx
import type { ResolvedPetPackage } from "../assets/petPackageRegistry";

interface FramePetStageProps {
  action: PetActionName;
  scale: number;
  petPackage: ResolvedPetPackage;
  onPetClick(): void;
  onDragStart(): void;
  onDragEnd(): void;
}

export function FramePetStage({ action, scale, petPackage, onPetClick, onDragStart, onDragEnd }: FramePetStageProps) {
  const actionDefinition = petPackage.actions[action];
  const currentFrameUrl = useMemo(() => {
    const frameIndex = getFrameIndex(
      elapsedMs,
      actionDefinition.frames.length,
      actionDefinition.fps,
      actionDefinition.loop,
    );

    return actionDefinition.frames[frameIndex] ?? null;
  }, [actionDefinition, elapsedMs]);

  return (
    <div className="pet-frame-stage" data-action={action} data-pet-package-id={petPackage.id}>
      {currentFrameUrl && !imageFailed ? (
        <img
          className="pet-frame-image"
          src={currentFrameUrl}
          alt={petPackage.name}
          draggable={false}
          onError={() => setImageFailed(true)}
        />
      ) : null}
    </div>
  );
}
```

Keep the existing pointer handlers and fallback markup. Change fallback `aria-label` to include `petPackage.name`.

- [ ] **Step 4: Add App fallback test**

Extend `src/app/App.test.tsx` with a test that mocks package commands as empty and verifies the built-in pet still renders:

```tsx
it("falls back to the built-in pet package when selected imported package is missing", async () => {
  windowCommandsMock.readSettings.mockResolvedValueOnce({
    appearance: {
      selectedPetPackageId: "imported:missing",
      peerPetPackageByDeviceId: {},
    },
  });
  render(<App />);

  expect(await screen.findByRole("img", { name: "星星睡衣小星人" })).toBeTruthy();
});
```

- [ ] **Step 5: Wire App package registry**

Modify `src/app/App.tsx`:

```tsx
const petPackageApi = useMemo(() => createPetPackageCommands(), []);
const [importedPetPackages, setImportedPetPackages] = useState<ImportedPetPackageSummary[]>([]);
const petPackages = useMemo(
  () => buildPetPackageRegistry(importedPetPackages, petPackageApi.convertFileSrc),
  [importedPetPackages, petPackageApi],
);
const selectedPetPackage = useMemo(
  () => resolveSelectedPetPackage(petPackages, settings.appearance.selectedPetPackageId),
  [petPackages, settings.appearance.selectedPetPackageId],
);

useEffect(() => {
  let disposed = false;
  void petPackageApi.listPetPackages()
    .then((packages) => {
      if (!disposed) {
        setImportedPetPackages(packages);
      }
    })
    .catch(() => {
      if (!disposed) {
        setImportedPetPackages([]);
      }
    });
  return () => {
    disposed = true;
  };
}, [petPackageApi]);
```

Pass `petPackage={selectedPetPackage}` to `FramePetStage`.

- [ ] **Step 6: Run task tests**

Run: `pnpm test -- src/renderer/FramePetStage.test.tsx src/app/App.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/FramePetStage.tsx src/renderer/FramePetStage.test.tsx src/app/App.tsx src/app/App.test.tsx
git commit -m "feat: render selected pet package"
```

---

### Task 5: Appearance Management UI

**Files:**
- Create: `src/settings/AppearancePanel.tsx`
- Test: `src/settings/AppearancePanel.test.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/app/App.test.tsx`
- Modify: `src/app/app.css`
- Modify: `package.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/capabilities/default.json`

**Interfaces:**
- Consumes `PetPackageApi`, `ResolvedPetPackage`, and appearance settings from earlier tasks.
- Produces UI callbacks:
  - `onImportPackage(): void`
  - `onSelectPackage(packageId: string): void`
  - `onDeletePackage(packageId: string): void`

- [ ] **Step 1: Add dialog dependencies**

Modify `package.json` dependencies:

```json
"@tauri-apps/plugin-dialog": "^2.4.0"
```

Modify `src-tauri/Cargo.toml` dependencies:

```toml
tauri-plugin-dialog = "2"
```

Register the plugin in `src-tauri/src/main.rs`:

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
```

Modify `src-tauri/capabilities/default.json` permissions:

```json
"dialog:allow-open"
```

- [ ] **Step 2: Add failing AppearancePanel tests**

Create `src/settings/AppearancePanel.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppearancePanel } from "./AppearancePanel";
import type { ResolvedPetPackage } from "../assets/petPackageRegistry";

const packages: ResolvedPetPackage[] = [
  {
    id: "builtin:star-sleeper",
    name: "星星睡衣小星人",
    source: "built-in",
    baseSize: { width: 256, height: 320 },
    previewUrl: null,
    actions: {} as ResolvedPetPackage["actions"],
  },
  {
    id: "imported:moon-buddy",
    name: "月亮伙伴",
    source: "imported",
    baseSize: { width: 256, height: 320 },
    previewUrl: "asset://moon/preview.png",
    actions: {} as ResolvedPetPackage["actions"],
  },
];

describe("AppearancePanel", () => {
  it("imports and switches pet packages", () => {
    const onImportPackage = vi.fn();
    const onSelectPackage = vi.fn();

    render(
      <AppearancePanel
        packages={packages}
        selectedPackageId="builtin:star-sleeper"
        error={null}
        onImportPackage={onImportPackage}
        onSelectPackage={onSelectPackage}
        onDeletePackage={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "导入形象资源包" }));
    fireEvent.change(screen.getByLabelText("当前形象"), {
      target: { value: "imported:moon-buddy" },
    });

    expect(onImportPackage).toHaveBeenCalledTimes(1);
    expect(onSelectPackage).toHaveBeenCalledWith("imported:moon-buddy");
  });

  it("does not allow deleting the built-in package or selected package", () => {
    render(
      <AppearancePanel
        packages={packages}
        selectedPackageId="imported:moon-buddy"
        error={null}
        onImportPackage={vi.fn()}
        onSelectPackage={vi.fn()}
        onDeletePackage={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "删除当前导入形象" })).toBeDisabled();
  });
});
```

- [ ] **Step 3: Implement AppearancePanel**

Create `src/settings/AppearancePanel.tsx`:

```tsx
import type { ResolvedPetPackage } from "../assets/petPackageRegistry";

interface AppearancePanelProps {
  packages: readonly ResolvedPetPackage[];
  selectedPackageId: string;
  error: string | null;
  onImportPackage(): void;
  onSelectPackage(packageId: string): void;
  onDeletePackage(packageId: string): void;
}

export function AppearancePanel({
  packages,
  selectedPackageId,
  error,
  onImportPackage,
  onSelectPackage,
  onDeletePackage,
}: AppearancePanelProps) {
  const selectedPackage = packages.find((pkg) => pkg.id === selectedPackageId) ?? packages[0];
  const canDeleteSelected = selectedPackage?.source === "imported";

  return (
    <section className="appearance-panel" aria-label="形象管理">
      <div className="appearance-panel-header">
        <h2>形象管理</h2>
        {selectedPackage?.previewUrl ? (
          <img src={selectedPackage.previewUrl} alt={`${selectedPackage.name}预览`} />
        ) : null}
      </div>

      <label className="sync-field">
        <span>当前形象</span>
        <select
          value={selectedPackage?.id ?? "builtin:star-sleeper"}
          onChange={(event) => onSelectPackage(event.currentTarget.value)}
        >
          {packages.map((pkg) => (
            <option key={pkg.id} value={pkg.id}>
              {pkg.name}
            </option>
          ))}
        </select>
      </label>

      <div className="appearance-actions">
        <button type="button" onClick={onImportPackage}>
          导入形象资源包
        </button>
        <button
          type="button"
          disabled={!canDeleteSelected}
          onClick={() => selectedPackage && onDeletePackage(selectedPackage.id)}
        >
          删除当前导入形象
        </button>
      </div>

      {error ? <p className="sync-error">{error}</p> : null}
    </section>
  );
}
```

- [ ] **Step 4: Implement App import/select/delete callbacks**

Use the dialog plugin in `src/app/App.tsx`:

```ts
import { open } from "@tauri-apps/plugin-dialog";

const [petPackageError, setPetPackageError] = useState<string | null>(null);

const refreshPetPackages = useCallback(async () => {
  const packages = await petPackageApi.listPetPackages();
  setImportedPetPackages(packages);
  return packages;
}, [petPackageApi]);

const handleImportPetPackage = useCallback(async () => {
  setPetPackageError(null);
  const selectedPath = await open({
    multiple: false,
    filters: [{ name: "桌宠资源包", extensions: ["cdpet", "zip"] }],
  });
  if (typeof selectedPath !== "string") {
    return;
  }

  try {
    const imported = await petPackageApi.importPetPackage(selectedPath);
    await refreshPetPackages();
    handleSettingsChange({
      appearance: {
        ...settingsRef.current.appearance,
        selectedPetPackageId: imported.id,
      },
    });
  } catch (error) {
    setPetPackageError(error instanceof Error ? error.message : "导入形象资源包失败");
  }
}, [handleSettingsChange, petPackageApi, refreshPetPackages]);

const handleSelectPetPackage = useCallback(
  (packageId: string) => {
    handleSettingsChange({
      appearance: {
        ...settingsRef.current.appearance,
        selectedPetPackageId: packageId,
      },
    });
  },
  [handleSettingsChange],
);

const handleDeletePetPackage = useCallback(
  async (packageId: string) => {
    try {
      await petPackageApi.deletePetPackage(packageId);
      await refreshPetPackages();
      if (settingsRef.current.appearance.selectedPetPackageId === packageId) {
        handleSelectPetPackage(BUILT_IN_PET_PACKAGE_ID);
      }
    } catch (error) {
      setPetPackageError(error instanceof Error ? error.message : "删除形象资源包失败");
    }
  },
  [handleSelectPetPackage, petPackageApi, refreshPetPackages],
);
```

Render `AppearancePanel` in the settings dock body above `SettingsPanel`.

- [ ] **Step 5: Add App UI tests**

Extend `src/app/App.test.tsx` mocks for dialog open and pet package commands. Add:

```tsx
it("imports a pet package and selects it", async () => {
  petPackageCommandsMock.importPetPackage.mockResolvedValueOnce({
    id: "imported:moon-buddy",
    manifestId: "moon-buddy",
    name: "月亮伙伴",
    baseSize: { width: 256, height: 320 },
    frameSize: { width: 512, height: 512 },
    previewPath: null,
    framePaths: importedFramePaths("moon-buddy"),
  });
  dialogOpenMock.mockResolvedValueOnce("C:/Users/me/moon.cdpet");

  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "设置" }));
  fireEvent.click(screen.getByRole("button", { name: "导入形象资源包" }));

  await waitFor(() =>
    expect(windowCommandsMock.writeSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        appearance: expect.objectContaining({
          selectedPetPackageId: "imported:moon-buddy",
        }),
      }),
    ),
  );
});
```

- [ ] **Step 6: Style the panel**

Add to `src/app/app.css`:

```css
.appearance-panel {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-bottom: 1px solid rgb(75 43 26 / 0.14);
  font-size: 13px;
}

.appearance-panel-header,
.appearance-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.appearance-panel h2 {
  margin: 0;
  font-size: 14px;
}

.appearance-panel img {
  width: 36px;
  height: 36px;
  object-fit: contain;
}

.appearance-panel select {
  width: 100%;
  box-sizing: border-box;
}

.appearance-actions button {
  min-height: 30px;
  border: 1px solid rgb(75 43 26 / 0.24);
  border-radius: 6px;
  background: #fff7ed;
  color: #2c1f18;
  font: inherit;
}
```

- [ ] **Step 7: Run task tests**

Run: `pnpm test -- src/settings/AppearancePanel.test.tsx src/app/App.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/main.rs src-tauri/capabilities/default.json src/settings/AppearancePanel.tsx src/settings/AppearancePanel.test.tsx src/app/App.tsx src/app/App.test.tsx src/app/app.css
git commit -m "feat: add pet appearance management"
```

---

### Task 6: Resource Package Documentation And Sample Fixture

**Files:**
- Create: `docs/pet-resource-pack-format.md`
- Modify: `src/assets/README.md`

**Interfaces:**
- Consumes `.cdpet` format from the design and Rust importer.
- Produces user-facing documentation for creating a valid package with any zip tool.

- [ ] **Step 1: Add format documentation**

Create `docs/pet-resource-pack-format.md`:

```markdown
# 桌宠形象资源包格式

第一版资源包使用 `.cdpet` 扩展名，本质是 zip 文件。资源包只包含 JSON 和 PNG，不包含脚本、网页、音频、视频或远程链接。

## 目录结构

```text
my-pet.cdpet
├─ pet.json
├─ preview.png
└─ frames/
   ├─ idle-breathe-01.png
   ├─ idle-breathe-02.png
   └─ act-drowsy-18.png
```

必须包含 12 个动作，每个动作 18 帧：

- `idle-breathe`
- `idle-look`
- `idle-stretch`
- `walk`
- `drag`
- `sleep`
- `act-cute`
- `act-typing`
- `act-wave`
- `act-hug`
- `act-pout`
- `act-drowsy`

## pet.json

```json
{
  "formatVersion": 1,
  "id": "my-custom-pet",
  "name": "我的桌宠",
  "baseSize": { "width": 256, "height": 320 },
  "frameSize": { "width": 512, "height": 512 },
  "actions": {
    "idle-breathe": { "fps": 3, "loop": true },
    "idle-look": { "fps": 3, "loop": true },
    "idle-stretch": { "fps": 3, "loop": true },
    "walk": { "fps": 3, "loop": true },
    "drag": { "fps": 3, "loop": true },
    "sleep": { "fps": 3, "loop": true },
    "act-cute": { "fps": 3, "loop": false },
    "act-typing": { "fps": 3, "loop": false },
    "act-wave": { "fps": 3, "loop": false },
    "act-hug": { "fps": 3, "loop": false },
    "act-pout": { "fps": 3, "loop": false },
    "act-drowsy": { "fps": 3, "loop": false }
  }
}
```

## 生成建议

- 每张 PNG 建议 512x512，透明背景。
- 角色在所有帧中保持相同大小和位置。
- 文件名必须完全匹配动作名和两位序号。
- 不要在资源包里放入版权不明的素材。
```

- [ ] **Step 2: Update built-in asset README**

Append to `src/assets/README.md`:

```markdown
## External Resource Packages

External pet packages are documented in `docs/pet-resource-pack-format.md`.
The app imports `.cdpet` files into the app data directory and never reads them from `src/assets`.
The relay does not transfer package files in the first version.
```

- [ ] **Step 3: Run docs-adjacent verification**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/pet-resource-pack-format.md src/assets/README.md
git commit -m "docs: add pet resource package guide"
```

---

### Task 7: Full Verification And Runtime Smoke Test

**Files:**
- Modify only files required to fix failures found by verification.

**Interfaces:**
- Consumes all earlier tasks.
- Produces a rebuilt debug exe.

- [ ] **Step 1: Run full frontend tests**

Run: `pnpm test`

Expected: PASS with all test files passing.

- [ ] **Step 2: Run frontend typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 3: Run server typecheck**

Run: `pnpm server:typecheck`

Expected: PASS.

- [ ] **Step 4: Run Rust package tests**

Run:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml pet_packages
```

Expected: PASS.

- [ ] **Step 5: Run Tauri debug build**

Run: `pnpm tauri build --debug`

Expected: PASS and output includes:

```text
Built application at: C:\Users\14567\.codex\worktrees\6515\情侣桌宠\src-tauri\target\debug\couple-desktop-pet.exe
```

If Windows file locking fails because `couple-desktop-pet.exe` is running, stop only that process and rerun the same command:

```powershell
Get-Process -Name couple-desktop-pet -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.Id -Force }
pnpm tauri build --debug
```

- [ ] **Step 6: Create a manual import smoke package**

Create a temporary package directory from the built-in frames:

```powershell
$repo = 'C:\Users\14567\.codex\worktrees\6515\情侣桌宠'
$temp = Join-Path $env:TEMP 'cdpet-smoke'
Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path (Join-Path $temp 'frames') | Out-Null
Copy-Item -LiteralPath (Join-Path $repo 'src\assets\pets\star-sleeper\idle-breathe-01.png') -Destination (Join-Path $temp 'preview.png')
Get-ChildItem -LiteralPath (Join-Path $repo 'src\assets\pets\star-sleeper') -Filter '*.png' | Copy-Item -Destination (Join-Path $temp 'frames')
@'
{
  "formatVersion": 1,
  "id": "smoke-star",
  "name": "导入测试星星",
  "baseSize": { "width": 256, "height": 320 },
  "frameSize": { "width": 512, "height": 512 },
  "actions": {
    "idle-breathe": { "fps": 3, "loop": true },
    "idle-look": { "fps": 3, "loop": true },
    "idle-stretch": { "fps": 3, "loop": true },
    "walk": { "fps": 3, "loop": true },
    "drag": { "fps": 3, "loop": true },
    "sleep": { "fps": 3, "loop": true },
    "act-cute": { "fps": 3, "loop": false },
    "act-typing": { "fps": 3, "loop": false },
    "act-wave": { "fps": 3, "loop": false },
    "act-hug": { "fps": 3, "loop": false },
    "act-pout": { "fps": 3, "loop": false },
    "act-drowsy": { "fps": 3, "loop": false }
  }
}
'@ | Set-Content -LiteralPath (Join-Path $temp 'pet.json') -Encoding UTF8
Compress-Archive -Path (Join-Path $temp '*') -DestinationPath (Join-Path $env:TEMP 'smoke-star.zip') -Force
Move-Item -LiteralPath (Join-Path $env:TEMP 'smoke-star.zip') -Destination (Join-Path $env:TEMP 'smoke-star.cdpet') -Force
```

- [ ] **Step 7: Launch debug exe**

Run:

```powershell
Start-Process -FilePath 'C:\Users\14567\.codex\worktrees\6515\情侣桌宠\src-tauri\target\debug\couple-desktop-pet.exe' -WindowStyle Normal
```

Expected: app opens and built-in pet renders.

- [ ] **Step 8: Manual UI verification**

Use the app UI:

1. Open settings.
2. Click `导入形象资源包`.
3. Select `%TEMP%\smoke-star.cdpet`.
4. Confirm `导入测试星星` appears as selectable.
5. Select it.
6. Confirm the desktop pet still renders frames.
7. Close and reopen the exe.
8. Confirm `导入测试星星` remains selected.

- [ ] **Step 9: Inspect final git status**

Run:

```powershell
git status --short
```

Expected: no unstaged changes after all task commits and verification repairs are complete. If this command prints file paths, inspect them and either commit the intentional resource-pack changes with a specific message or remove generated smoke-test files from the repository.

---

## Plan Self-Review

Spec coverage:

- `.cdpet` local zip package: Task 2 and Task 6.
- Manual exchange and no Relay image transfer: Global Constraints and no server tasks.
- Fixed 12 action names: Task 1, Task 2, Task 3, Task 6.
- App data storage: Task 2.
- Import validation: Task 2.
- Settings migration and fallback: Task 1, Task 4.
- Import/switch/delete UI: Task 5.
- Built-in fallback: Task 3 and Task 4.
- Cross-screen package mapping: settings field is added in Task 1; realtime visit events are intentionally outside this first implementation plan and remain Phase 2 from the design.

Placeholder scan:

- The plan uses concrete file paths, function names, commands, and expected results.
- No task asks for unspecified validation or unspecified tests.

Type consistency:

- Runtime package IDs use `builtin:star-sleeper` and `imported:<manifest-id>` consistently.
- Rust summaries use camelCase serde names consumed by TypeScript.
- `FramePetStage` consumes `ResolvedPetPackage`, produced by `petPackageRegistry`.
