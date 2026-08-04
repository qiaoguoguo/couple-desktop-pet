# Q Girl V2 PNG Animation Director Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将客户端默认桌宠切换为 Q 版长发眼镜女生，升级为 `formatVersion: 2` 的 30 帧 PNG 资源包，并用动画导演层提升本地互动和远程消息来访体验。

**Architecture:** 资源包契约先升级为 v2，统一由 `PetPackageManifest` 提供动作、帧路径和场景配置；播放器只读取已解析的 `ResolvedPetPackage`，不再依赖星星人路径或内置 18 帧假设。新增 `motion` 模块负责气泡时机、确认等待和动作回落，`App.tsx` 只编排状态与 UI，不直接硬编码每个互动的播放节奏。

**Tech Stack:** Tauri 2 + Rust command importer, TypeScript + React, Vite asset glob, Vitest, Rust unit tests, PNG 序列帧。

## Global Constraints

- 默认内置形象 ID 必须是 `builtin:q-girl`。
- 默认内置形象必须使用 `docs/assets/references/q-girl-pet-reference.png` 对应的 Q 版长发眼镜女生身份特征。
- `.cdpet` 必须是 zip 文件，`pet.json` 必须为 `formatVersion: 2`。
- `renderer` 必须是 `"frame-sequence"`。
- 必须包含 12 个标准动作：`idle-breathe`、`idle-look`、`idle-stretch`、`walk`、`drag`、`sleep`、`act-cute`、`act-typing`、`act-wave`、`act-hug`、`act-pout`、`act-drowsy`。
- 每个标准动作必须正好 30 帧。
- 每个动作 `fps` 必须是 `5`。
- 每个动作 `durationMs` 必须是 `6000`。
- 每个动作帧路径必须是 `frames/<action>/0001.png` 到 `frames/<action>/0030.png`。
- `preview.png` 必须存在且必须是 PNG。
- 旧版 `formatVersion: 1` 资源包不再兼容，导入时返回：“旧版资源包动作标准过低，请使用新版生成器重新生成。”
- 不引入 Live2D、Spine、DragonBones 或分层骨骼渲染。
- 不修改 `platform-web`、`platform-api`、`server`，本计划只覆盖桌宠客户端动画体验和资源包导入链路。
- 交付前必须运行 `pnpm test`、`pnpm typecheck`、`pnpm build`、`cargo test --manifest-path src-tauri/Cargo.toml`。

---

## File Structure

- Create `src/assets/petActionNames.ts`: 统一导出动作 ID、类型、分类和循环规则，消除 `builtInPetManifest.ts` 与 `petPackageContract.ts` 之间的类型耦合。
- Modify `src/assets/builtInPetManifest.ts`: 改为 Q 版女生内置 manifest，帧路径指向 `pets/q-girl/frames/<action>/0001.png`，并提供内置 `scenes`。
- Modify `src/assets/petPackageContract.ts`: 升级 TypeScript 端 v2 manifest 解析和常量。
- Modify `src/assets/petPackageRegistry.ts`: 用 v2 manifest action 配置构建内置/导入包，不再硬编码 18 帧和 3 fps。
- Modify `src/assets/petPackageContract.test.ts` and `src/assets/petPackageRegistry.test.ts`: 覆盖 v2 合约、默认 ID、帧数量、旧包拒绝和导入包解析。
- Modify `src/renderer/frameAtlas.ts`: Vite glob 指向 `src/assets/pets/q-girl/frames/**/*.png`。
- Create `src/motion/motionSceneTypes.ts`: 定义动画导演层数据结构。
- Create `src/motion/motionScenePlayer.ts`: 提供纯函数判断气泡 cue、完成状态和远程消息确认等待。
- Create `src/motion/motionScenePlayer.test.ts`: 覆盖气泡时机、单次触发、等待确认和完成逻辑。
- Modify `src/pet-core/petScheduler.ts`: 使用当前选中资源包的动作时长，保证交互动作按 6 秒完整播放。
- Modify `src/app/App.tsx`: 接入 `ResolvedPetPackage.scenes`，互动气泡由导演层触发，远程消息展示对方形象动作场景。
- Modify `src/sync/RemoteMessageLayer.tsx`: 用对方资源包 `act-wave` 动作帧而不是静态 preview，消息保持到鼠标滑过确认。
- Modify `src/app/app.css`: 优化来访桌宠、气泡和舞台布局，保持透明窗口内无可见方框。
- Modify `src/settings/defaultSettings.ts` and `src/settings/settingsStore.test.ts`: 默认选中 `builtin:q-girl`，迁移星星人旧设置到新默认。
- Modify `src-tauri/src/pet_packages.rs`: Rust 导入器验证 v2 目录结构、manifest、preview 和 PNG 签名，返回 actions/scenes 到前端。
- Modify `src-tauri/Cargo.toml` only if existing zip/serde dependencies require feature changes; do not add runtime dependencies for animation.
- Create `docs/assets/q-girl-imagegen-prompts.md`: 记录本次内置 Q 版女生资源生成提示词、动作分镜和质量门槛。
- Create `src/assets/pets/q-girl/README.md`: 记录内置资源授权来源和生成参数。
- Create `src/assets/pets/q-girl/preview.png` and `src/assets/pets/q-girl/frames/<action>/0001.png` ... `0030.png`: 新内置 Q 版女生动作资源。
- Leave `src/assets/pets/star-sleeper/` untouched until the Q 版女生资源通过验收；默认 manifest 不再引用它。

---

### Task 1: TypeScript V2 Action Contract

**Files:**
- Create: `src/assets/petActionNames.ts`
- Modify: `src/assets/petPackageContract.ts`
- Modify: `src/assets/builtInPetManifest.ts`
- Test: `src/assets/petPackageContract.test.ts`

**Interfaces:**
- Produces: `requiredPetActions`, `idleActionNames`, `interactionActionNames`, `PetActionName`, `readPetActionCategory(action)`, `isLoopingPetAction(action)`.
- Produces: `BUILT_IN_PET_PACKAGE_ID = "builtin:q-girl"`, `PET_FRAMES_PER_ACTION = 30`, `PET_ACTION_FPS = 5`, `PET_ACTION_DURATION_MS = 6000`.
- Produces: `readPetPackageManifest(input: unknown): PetPackageManifest | null`.
- Consumed by: Tasks 2, 3, 4, 5.

- [ ] **Step 1: Write the failing TypeScript contract tests**

Replace the relevant assertions in `src/assets/petPackageContract.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PET_PACKAGE_ID,
  PET_ACTION_DURATION_MS,
  PET_ACTION_FPS,
  PET_FRAMES_PER_ACTION,
  REQUIRED_PET_ACTIONS,
  readPetPackageManifest,
} from "./petPackageContract";

function validAction(action: string, loop: boolean) {
  return {
    fps: PET_ACTION_FPS,
    loop,
    frameCount: PET_FRAMES_PER_ACTION,
    durationMs: PET_ACTION_DURATION_MS,
    frames: `frames/${action}/`,
  };
}

function validManifest() {
  return {
    formatVersion: 2,
    renderer: "frame-sequence",
    id: "q-girl-custom",
    name: "Q 版小人",
    baseSize: { width: 256, height: 320 },
    frameSize: { width: 768, height: 960 },
    actions: Object.fromEntries(
      REQUIRED_PET_ACTIONS.map((action) => [
        action,
        validAction(
          action,
          action.startsWith("idle") ||
            action === "walk" ||
            action === "drag" ||
            action === "sleep",
        ),
      ]),
    ),
    scenes: {
      "act-cute": {
        action: "act-cute",
        bubbleCues: [{ atMs: 1800, text: "陪我一会儿嘛。" }],
        returnTo: "idle-breathe",
      },
      "remote-message": {
        action: "act-wave",
        bubbleCues: [{ atMs: 1000, source: "remoteMessage" }],
        waitForAcknowledge: true,
        returnTo: "idle-breathe",
      },
    },
  };
}

describe("pet package v2 contract", () => {
  it("uses the q-girl package as the built-in default", () => {
    expect(BUILT_IN_PET_PACKAGE_ID).toBe("builtin:q-girl");
  });

  it("requires 30 frames at 5 fps for each 6 second action", () => {
    expect(PET_FRAMES_PER_ACTION).toBe(30);
    expect(PET_ACTION_FPS).toBe(5);
    expect(PET_ACTION_DURATION_MS).toBe(6000);
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

  it("reads a valid v2 manifest", () => {
    const manifest = readPetPackageManifest(validManifest());
    expect(manifest?.formatVersion).toBe(2);
    expect(manifest?.renderer).toBe("frame-sequence");
    expect(manifest?.actions["act-cute"].frames).toBe("frames/act-cute/");
    expect(manifest?.actions["act-cute"].frameCount).toBe(30);
    expect(manifest?.scenes["remote-message"].waitForAcknowledge).toBe(true);
  });

  it("rejects a v1 manifest", () => {
    expect(
      readPetPackageManifest({
        formatVersion: 1,
        id: "old-star",
        name: "旧版",
        baseSize: { width: 256, height: 320 },
        frameSize: { width: 512, height: 512 },
        actions: {},
      }),
    ).toBeNull();
  });

  it("rejects wrong frame counts and frame directories", () => {
    const wrongCount = validManifest();
    wrongCount.actions["act-cute"] = {
      ...wrongCount.actions["act-cute"],
      frameCount: 18,
    };
    expect(readPetPackageManifest(wrongCount)).toBeNull();

    const wrongDirectory = validManifest();
    wrongDirectory.actions["act-cute"] = {
      ...wrongDirectory.actions["act-cute"],
      frames: "frames/act-cute-",
    };
    expect(readPetPackageManifest(wrongDirectory)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `pnpm test -- src/assets/petPackageContract.test.ts`

Expected: FAIL because `BUILT_IN_PET_PACKAGE_ID` is still `builtin:star-sleeper`, `PET_FRAMES_PER_ACTION` is still `18`, and the parser only accepts `formatVersion: 1`.

- [ ] **Step 3: Create the action-name module**

Create `src/assets/petActionNames.ts`:

```ts
export const idleActionNames = [
  "idle-breathe",
  "idle-look",
  "idle-stretch",
] as const;

export const movementActionNames = ["walk", "drag", "sleep"] as const;

export const interactionActionNames = [
  "act-cute",
  "act-typing",
  "act-wave",
  "act-hug",
  "act-pout",
  "act-drowsy",
] as const;

export const requiredPetActions = [
  ...idleActionNames,
  ...movementActionNames,
  ...interactionActionNames,
] as const;

export type IdleActionName = (typeof idleActionNames)[number];
export type MovementActionName = (typeof movementActionNames)[number];
export type InteractionActionName = (typeof interactionActionNames)[number];
export type PetActionName = (typeof requiredPetActions)[number];
export type PetActionCategory = "idle" | "movement" | "interaction";

export function readPetActionCategory(action: PetActionName): PetActionCategory {
  if ((idleActionNames as readonly string[]).includes(action)) {
    return "idle";
  }

  if ((interactionActionNames as readonly string[]).includes(action)) {
    return "interaction";
  }

  return "movement";
}

export function isLoopingPetAction(action: PetActionName): boolean {
  return (
    readPetActionCategory(action) === "idle" ||
    action === "walk" ||
    action === "drag" ||
    action === "sleep"
  );
}

export function isPetActionName(value: string): value is PetActionName {
  return (requiredPetActions as readonly string[]).includes(value);
}
```

- [ ] **Step 4: Upgrade `petPackageContract.ts` to v2**

Modify `src/assets/petPackageContract.ts` so the exported contract includes:

```ts
import {
  requiredPetActions,
  type IdleActionName,
  type PetActionName,
} from "./petActionNames";

export const BUILT_IN_PET_PACKAGE_ID = "builtin:q-girl" as const;
export const IMPORTED_PET_PACKAGE_PREFIX = "imported:" as const;
export const PET_FRAMES_PER_ACTION = 30;
export const PET_ACTION_FPS = 5;
export const PET_ACTION_DURATION_MS = 6000;
export const REQUIRED_PET_ACTIONS = requiredPetActions;
export const UNSUPPORTED_LEGACY_PACKAGE_MESSAGE =
  "旧版资源包动作标准过低，请使用新版生成器重新生成。";

export interface PetPackageSize {
  width: number;
  height: number;
}

export interface PetPackageActionManifest {
  fps: number;
  loop: boolean;
  frameCount: number;
  durationMs: number;
  frames: string;
}

export interface PetPackageBubbleCue {
  atMs: number;
  text?: string;
  source?: "remoteMessage";
}

export interface PetPackageSceneManifest {
  action: PetActionName;
  bubbleCues: readonly PetPackageBubbleCue[];
  returnTo: IdleActionName;
  waitForAcknowledge?: boolean;
}

export interface PetPackageManifest {
  formatVersion: 2;
  renderer: "frame-sequence";
  id: string;
  name: string;
  baseSize: PetPackageSize;
  frameSize: PetPackageSize;
  actions: Record<PetActionName, PetPackageActionManifest>;
  scenes: Record<string, PetPackageSceneManifest>;
}

export interface ImportedPetPackageSummary {
  id: string;
  manifestId: string;
  name: string;
  baseSize: PetPackageSize;
  frameSize: PetPackageSize;
  previewPath: string;
  actions: Record<PetActionName, PetPackageActionManifest>;
  scenes: Record<string, PetPackageSceneManifest>;
  framePaths: Record<PetActionName, string[]>;
}
```

Implement `readPetPackageManifest(input)` so it returns `null` unless:

```ts
input.formatVersion === 2
input.renderer === "frame-sequence"
action.fps === PET_ACTION_FPS
action.frameCount === PET_FRAMES_PER_ACTION
action.durationMs === PET_ACTION_DURATION_MS
action.frames === `frames/${action}/`
```

Use the existing `isRecord`, `readSize`, `readString` style helpers in this file. Keep `toImportedPetPackageId`, `isImportedPetPackageId`, and `stripImportedPetPackagePrefix` unchanged except for updated types.

- [ ] **Step 5: Update imports in `builtInPetManifest.ts`**

Modify `src/assets/builtInPetManifest.ts` so it imports action types from `petActionNames.ts`:

```ts
import {
  idleActionNames,
  interactionActionNames,
  isLoopingPetAction,
  readPetActionCategory,
  requiredPetActions,
  type IdleActionName,
  type InteractionActionName,
  type PetActionName,
} from "./petActionNames";
```

Keep `PetActionDefinition` in this file for now, but add `frameCount`:

```ts
export interface PetActionDefinition {
  fps: number;
  loop: boolean;
  frameCount: number;
  durationMs: number;
  category: "idle" | "movement" | "interaction";
  frames: readonly string[];
}
```

- [ ] **Step 6: Run the focused tests**

Run: `pnpm test -- src/assets/petPackageContract.test.ts`

Expected: PASS.

- [ ] **Step 7: Run typecheck**

Run: `pnpm typecheck`

Expected: FAIL only where existing imports still read action types from `builtInPetManifest.ts`; those imports are addressed in later tasks.

- [ ] **Step 8: Commit Task 1**

```bash
git add src/assets/petActionNames.ts src/assets/petPackageContract.ts src/assets/builtInPetManifest.ts src/assets/petPackageContract.test.ts
git commit -m "feat: upgrade pet package contract to v2"
```

---

### Task 2: Rust Importer V2 Validation

**Files:**
- Modify: `src-tauri/src/pet_packages.rs`
- Test: Rust unit tests inside `src-tauri/src/pet_packages.rs`

**Interfaces:**
- Consumes: TypeScript v2 rules from Task 1 and `docs/pet-resource-pack-format.md`.
- Produces: Tauri command `import_pet_package` returns `ImportedPetPackageSummary` with `actions`, `scenes`, `framePaths`, and required `previewPath`.
- Produces: v1 import error message exactly “旧版资源包动作标准过低，请使用新版生成器重新生成。”
- Consumed by: Tasks 4, 5, 6.

- [ ] **Step 1: Update Rust tests for v2 packages**

Change the assertions in `imports_valid_package_and_lists_it`:

```rust
assert_eq!(imported.id, "imported:moon-buddy");
assert_eq!(imported.manifest_id, "moon-buddy");
assert!(imported.preview_path.ends_with("preview.png"));
assert_eq!(imported.frame_paths["idle-breathe"].len(), 30);
assert_eq!(imported.actions["idle-breathe"].fps, 5.0);
assert_eq!(imported.actions["idle-breathe"].frame_count, 30);
assert_eq!(imported.actions["idle-breathe"].duration_ms, 6000);
assert_eq!(imported.scenes["act-cute"].action, "act-cute");
assert_eq!(imported.scenes["remote-message"].wait_for_acknowledge, Some(true));
```

Add this test:

```rust
#[test]
fn rejects_legacy_v1_package_with_upgrade_message() {
    let temp = unique_temp_dir("legacy-v1");
    let source = temp.join("legacy.cdpet");
    write_legacy_v1_package(&source, "old-star");
    let root = temp.join("packages");

    let error = import_pet_package_from_path(&source, &root).unwrap_err();
    assert_eq!(
        error,
        "旧版资源包动作标准过低，请使用新版生成器重新生成。"
    );

    let _ = fs::remove_dir_all(temp);
}
```

- [ ] **Step 2: Run the failing Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml pet_packages -- --nocapture`

Expected: FAIL because importer still expects v1, `frames/<action>-NN.png`, optional preview, and 18 frames.

- [ ] **Step 3: Upgrade Rust constants and structs**

Modify the top of `src-tauri/src/pet_packages.rs`:

```rust
const PET_FRAMES_PER_ACTION: usize = 30;
const REQUIRED_RENDERER: &str = "frame-sequence";
const UNSUPPORTED_LEGACY_PACKAGE_MESSAGE: &str =
    "旧版资源包动作标准过低，请使用新版生成器重新生成。";
```

Add fields to `PetPackageManifest`:

```rust
#[derive(Debug, Deserialize)]
struct PetPackageManifest {
    #[serde(rename = "formatVersion")]
    format_version: u8,
    renderer: String,
    id: String,
    name: String,
    #[serde(rename = "baseSize")]
    base_size: PackageSize,
    #[serde(rename = "frameSize")]
    frame_size: PackageSize,
    actions: BTreeMap<String, PackageAction>,
    scenes: BTreeMap<String, PackageScene>,
}
```

Use serializable action and scene structs:

```rust
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PackageAction {
    fps: f64,
    #[serde(rename = "loop")]
    loop_value: bool,
    #[serde(rename = "frameCount")]
    frame_count: usize,
    #[serde(rename = "durationMs")]
    duration_ms: u32,
    frames: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PackageBubbleCue {
    #[serde(rename = "atMs")]
    at_ms: u32,
    text: Option<String>,
    source: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PackageScene {
    action: String,
    #[serde(rename = "bubbleCues")]
    bubble_cues: Vec<PackageBubbleCue>,
    #[serde(rename = "returnTo")]
    return_to: String,
    #[serde(rename = "waitForAcknowledge")]
    wait_for_acknowledge: Option<bool>,
}
```

Update `ImportedPetPackageSummary`:

```rust
#[derive(Clone, Debug, Serialize)]
pub struct ImportedPetPackageSummary {
    pub id: String,
    #[serde(rename = "manifestId")]
    pub manifest_id: String,
    pub name: String,
    #[serde(rename = "baseSize")]
    pub base_size: PackageSize,
    #[serde(rename = "frameSize")]
    pub frame_size: PackageSize,
    #[serde(rename = "previewPath")]
    pub preview_path: String,
    pub actions: BTreeMap<String, PackageAction>,
    pub scenes: BTreeMap<String, PackageScene>,
    #[serde(rename = "framePaths")]
    pub frame_paths: BTreeMap<String, Vec<String>>,
}
```

- [ ] **Step 4: Upgrade manifest validation**

Modify `validate_manifest` so it enforces:

```rust
if manifest.format_version == 1 {
    return Err(UNSUPPORTED_LEGACY_PACKAGE_MESSAGE.to_string());
}

if manifest.format_version != 2 {
    return Err("资源包版本不支持".to_string());
}

if manifest.renderer != REQUIRED_RENDERER {
    return Err("资源包 renderer 必须是 frame-sequence".to_string());
}
```

Inside the required action loop, enforce:

```rust
if action_config.fps != 5.0 {
    return Err(format!("动作帧率必须是 5 fps: {action}"));
}

if action_config.frame_count != PET_FRAMES_PER_ACTION {
    return Err(format!("动作帧数量必须是 30: {action}"));
}

if action_config.duration_ms != 6000 {
    return Err(format!("动作时长必须是 6000ms: {action}"));
}

if action_config.frames != format!("frames/{action}/") {
    return Err(format!("动作帧目录无效: {action}"));
}
```

Require these scenes:

```rust
for scene_id in [
    "act-cute",
    "act-typing",
    "act-wave",
    "act-hug",
    "act-pout",
    "act-drowsy",
    "remote-message",
] {
    let scene = manifest
        .scenes
        .get(scene_id)
        .ok_or_else(|| format!("缺少场景配置: {scene_id}"))?;

    if scene.bubble_cues.is_empty() {
        return Err(format!("场景缺少气泡时机: {scene_id}"));
    }
}
```

- [ ] **Step 5: Upgrade expected frame paths and require preview**

Change `expected_frame_path`:

```rust
fn expected_frame_path(action: &str, frame_index: usize) -> String {
    format!("frames/{action}/{frame_index:04}.png")
}
```

Change `validate_required_frames` so `preview.png` is mandatory:

```rust
let mut preview = archive
    .by_name("preview.png")
    .map_err(|_| "缺少 preview.png".to_string())?;
validate_png_file(&mut preview, "preview.png")?;
```

- [ ] **Step 6: Update Rust test package writer**

In `write_test_package`, create frames with:

```rust
for action in REQUIRED_ACTIONS {
    for index in 1..=30 {
        if !include_all_frames && action == "act-drowsy" && index == 30 {
            continue;
        }

        zip.start_file(format!("frames/{action}/{index:04}.png"), options)
            .unwrap();
        zip.write_all(&PNG_SIGNATURE).unwrap();
    }
}
```

Change `test_manifest` to:

```rust
format!(
    r#"{{
  "formatVersion": 2,
  "renderer": "frame-sequence",
  "id": "{manifest_id}",
  "name": "测试形象",
  "baseSize": {{ "width": 256, "height": 320 }},
  "frameSize": {{ "width": 768, "height": 960 }},
  "actions": {{ {actions} }},
  "scenes": {{
    "act-cute": {{
      "action": "act-cute",
      "bubbleCues": [{{ "atMs": 1800, "text": "陪我一会儿嘛。" }}],
      "returnTo": "idle-breathe"
    }},
    "act-typing": {{
      "action": "act-typing",
      "bubbleCues": [{{ "atMs": 1800, "text": "我也在努力敲代码。" }}],
      "returnTo": "idle-breathe"
    }},
    "act-wave": {{
      "action": "act-wave",
      "bubbleCues": [{{ "atMs": 1200, "text": "嗨，我在这里！" }}],
      "returnTo": "idle-breathe"
    }},
    "act-hug": {{
      "action": "act-hug",
      "bubbleCues": [{{ "atMs": 2000, "text": "可以抱一下吗？" }}],
      "returnTo": "idle-breathe"
    }},
    "act-pout": {{
      "action": "act-pout",
      "bubbleCues": [{{ "atMs": 1800, "text": "哼，快哄我。" }}],
      "returnTo": "idle-breathe"
    }},
    "act-drowsy": {{
      "action": "act-drowsy",
      "bubbleCues": [{{ "atMs": 2200, "text": "有点困啦。" }}],
      "returnTo": "idle-breathe"
    }},
    "remote-message": {{
      "action": "act-wave",
      "bubbleCues": [{{ "atMs": 1000, "source": "remoteMessage" }}],
      "waitForAcknowledge": true,
      "returnTo": "idle-breathe"
    }}
  }}
}}"#
)
```

Add `write_legacy_v1_package` that writes a minimal v1 `pet.json` and one PNG preview:

```rust
fn write_legacy_v1_package(source: &Path, manifest_id: &str) {
    let file = fs::File::create(source).unwrap();
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default();

    zip.start_file("pet.json", options).unwrap();
    zip.write_all(
        format!(
            r#"{{
  "formatVersion": 1,
  "id": "{manifest_id}",
  "name": "旧版",
  "baseSize": {{ "width": 256, "height": 320 }},
  "frameSize": {{ "width": 512, "height": 512 }},
  "actions": {{}}
}}"#
        )
        .as_bytes(),
    )
    .unwrap();

    zip.start_file("preview.png", options).unwrap();
    zip.write_all(&PNG_SIGNATURE).unwrap();
    zip.finish().unwrap();
}
```

- [ ] **Step 7: Run Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml pet_packages -- --nocapture`

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add src-tauri/src/pet_packages.rs
git commit -m "feat: validate v2 pet packages in tauri"
```

---

### Task 3: Built-In Q Girl Manifest And Asset Atlas

**Files:**
- Modify: `src/assets/builtInPetManifest.ts`
- Modify: `src/renderer/frameAtlas.ts`
- Modify: `src/assets/petPackageRegistry.ts`
- Test: `src/assets/petPackageRegistry.test.ts`
- Create: `docs/assets/q-girl-imagegen-prompts.md`
- Create: `src/assets/pets/q-girl/README.md`
- Create: `src/assets/pets/q-girl/preview.png`
- Create: `src/assets/pets/q-girl/frames/<action>/0001.png` ... `0030.png`

**Interfaces:**
- Consumes: `requiredPetActions`, `PET_FRAMES_PER_ACTION`, `PET_ACTION_FPS`, `PET_ACTION_DURATION_MS` from Task 1.
- Produces: `builtInPetManifest` with id `builtin:q-girl`, name `Q 版小人`, `frameSize: { width: 768, height: 960 }`, and `scenes`.
- Produces: `getBuiltInFrameAssetUrl(framePath: string): string | null` that resolves q-girl nested frame paths.
- Consumed by: Tasks 4, 5, 6.

- [ ] **Step 1: Write failing registry tests for the q-girl built-in package**

Update `src/assets/petPackageRegistry.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PET_PACKAGE_ID,
  PET_ACTION_DURATION_MS,
  PET_ACTION_FPS,
  PET_FRAMES_PER_ACTION,
  REQUIRED_PET_ACTIONS,
  type ImportedPetPackageSummary,
} from "./petPackageContract";
import {
  buildPetPackageRegistry,
  resolveSelectedPetPackage,
} from "./petPackageRegistry";

describe("pet package registry", () => {
  it("builds the q-girl built-in package from v2 frames", () => {
    const packages = buildPetPackageRegistry([], (path) => `asset://${path}`);
    const builtIn = packages[0];

    expect(builtIn.id).toBe(BUILT_IN_PET_PACKAGE_ID);
    expect(builtIn.name).toBe("Q 版小人");
    expect(builtIn.frameSize).toEqual({ width: 768, height: 960 });
    expect(builtIn.actions["act-cute"].fps).toBe(PET_ACTION_FPS);
    expect(builtIn.actions["act-cute"].frameCount).toBe(PET_FRAMES_PER_ACTION);
    expect(builtIn.actions["act-cute"].durationMs).toBe(PET_ACTION_DURATION_MS);
    expect(builtIn.actions["act-cute"].frames).toHaveLength(PET_FRAMES_PER_ACTION);
    expect(builtIn.actions["act-cute"].frames[0]).toContain(
      "pets/q-girl/frames/act-cute/0001.png",
    );
    expect(builtIn.scenes["remote-message"].waitForAcknowledge).toBe(true);
  });

  it("builds imported packages from v2 action manifests", () => {
    const imported = importedPackageSummary();
    const packages = buildPetPackageRegistry([imported], (path) => `asset://${path}`);
    const resolved = packages.find((pkg) => pkg.id === "imported:moon-buddy");

    expect(resolved?.actions["idle-breathe"].fps).toBe(5);
    expect(resolved?.actions["idle-breathe"].frames[0]).toBe(
      "asset://C:/pets/moon/frames/idle-breathe/0001.png",
    );
    expect(resolved?.previewUrl).toBe("asset://C:/pets/moon/preview.png");
    expect(resolved?.scenes["act-hug"].bubbleCues[0].text).toBe("可以抱一下吗？");
  });

  it("falls back to the q-girl built-in package when a saved package is missing", () => {
    const packages = buildPetPackageRegistry([], (path) => `asset://${path}`);
    expect(resolveSelectedPetPackage(packages, "imported:missing").id).toBe(
      BUILT_IN_PET_PACKAGE_ID,
    );
  });
});
```

Add this helper to the same test file:

```ts
function importedPackageSummary(): ImportedPetPackageSummary {
  return {
    id: "imported:moon-buddy",
    manifestId: "moon-buddy",
    name: "Moon Buddy",
    baseSize: { width: 256, height: 320 },
    frameSize: { width: 768, height: 960 },
    previewPath: "C:/pets/moon/preview.png",
    actions: Object.fromEntries(
      REQUIRED_PET_ACTIONS.map((action) => [
        action,
        {
          fps: 5,
          loop:
            action.startsWith("idle") ||
            action === "walk" ||
            action === "drag" ||
            action === "sleep",
          frameCount: 30,
          durationMs: 6000,
          frames: `frames/${action}/`,
        },
      ]),
    ) as ImportedPetPackageSummary["actions"],
    scenes: {
      "act-hug": {
        action: "act-hug",
        bubbleCues: [{ atMs: 2000, text: "可以抱一下吗？" }],
        returnTo: "idle-breathe",
      },
      "remote-message": {
        action: "act-wave",
        bubbleCues: [{ atMs: 1000, source: "remoteMessage" }],
        waitForAcknowledge: true,
        returnTo: "idle-breathe",
      },
    },
    framePaths: Object.fromEntries(
      REQUIRED_PET_ACTIONS.map((action) => [
        action,
        Array.from(
          { length: PET_FRAMES_PER_ACTION },
          (_, index) =>
            `C:/pets/moon/frames/${action}/${String(index + 1).padStart(4, "0")}.png`,
        ),
      ]),
    ) as ImportedPetPackageSummary["framePaths"],
  };
}
```

- [ ] **Step 2: Run the failing registry tests**

Run: `pnpm test -- src/assets/petPackageRegistry.test.ts`

Expected: FAIL because the built-in package still references star sleeper and imported packages still hardcode 3 fps.

- [ ] **Step 3: Update the built-in manifest**

Modify `src/assets/builtInPetManifest.ts`:

```ts
import { BUILT_IN_PET_PACKAGE_ID, PET_ACTION_DURATION_MS, PET_ACTION_FPS, PET_FRAMES_PER_ACTION } from "./petPackageContract";
import {
  idleActionNames,
  interactionActionNames,
  isLoopingPetAction,
  readPetActionCategory,
  requiredPetActions,
  type IdleActionName,
  type InteractionActionName,
  type PetActionName,
} from "./petActionNames";

export const interactionOptions = [
  { id: "act-cute", label: "撒娇卖萌", bubble: "陪我一会儿嘛。" },
  { id: "act-typing", label: "敲电脑", bubble: "我也在努力敲代码。" },
  { id: "act-wave", label: "打招呼", bubble: "嗨，我在这里！" },
  { id: "act-hug", label: "求抱抱", bubble: "可以抱一下吗？" },
  { id: "act-pout", label: "生气鼓脸", bubble: "哼，快哄我。" },
  { id: "act-drowsy", label: "困困打盹", bubble: "有点困啦。" },
] as const;

const frameSequence = (action: PetActionName) =>
  Array.from(
    { length: PET_FRAMES_PER_ACTION },
    (_, index) =>
      `pets/q-girl/frames/${action}/${String(index + 1).padStart(4, "0")}.png`,
  );

const actionDefinition = (action: PetActionName): PetActionDefinition => ({
  fps: PET_ACTION_FPS,
  loop: isLoopingPetAction(action),
  frameCount: PET_FRAMES_PER_ACTION,
  durationMs: PET_ACTION_DURATION_MS,
  category: readPetActionCategory(action),
  frames: frameSequence(action),
});

export const builtInPetManifest = {
  id: BUILT_IN_PET_PACKAGE_ID,
  name: "Q 版小人",
  baseSize: { width: 256, height: 320 },
  frameSize: { width: 768, height: 960 },
  actions: Object.fromEntries(
    requiredPetActions.map((action) => [action, actionDefinition(action)]),
  ) as Record<PetActionName, PetActionDefinition>,
  scenes: {
    "act-cute": {
      action: "act-cute",
      bubbleCues: [{ atMs: 1800, text: "陪我一会儿嘛。" }],
      returnTo: "idle-breathe",
    },
    "act-typing": {
      action: "act-typing",
      bubbleCues: [{ atMs: 1800, text: "我也在努力敲代码。" }],
      returnTo: "idle-breathe",
    },
    "act-wave": {
      action: "act-wave",
      bubbleCues: [{ atMs: 1200, text: "嗨，我在这里！" }],
      returnTo: "idle-breathe",
    },
    "act-hug": {
      action: "act-hug",
      bubbleCues: [{ atMs: 2000, text: "可以抱一下吗？" }],
      returnTo: "idle-breathe",
    },
    "act-pout": {
      action: "act-pout",
      bubbleCues: [{ atMs: 1800, text: "哼，快哄我。" }],
      returnTo: "idle-breathe",
    },
    "act-drowsy": {
      action: "act-drowsy",
      bubbleCues: [{ atMs: 2200, text: "有点困啦。" }],
      returnTo: "idle-breathe",
    },
    "remote-message": {
      action: "act-wave",
      bubbleCues: [{ atMs: 1000, source: "remoteMessage" }],
      waitForAcknowledge: true,
      returnTo: "idle-breathe",
    },
  },
} as const satisfies BuiltInPetManifest;
```

- [ ] **Step 4: Update the Vite frame atlas**

Modify `src/renderer/frameAtlas.ts`:

```ts
const petFrameUrls = import.meta.glob<string>(
  "../assets/pets/q-girl/frames/**/*.png",
  {
    eager: true,
    import: "default",
    query: "?url",
  },
);
```

Keep `getBuiltInFrameAssetUrl(framePath)` as:

```ts
export function getBuiltInFrameAssetUrl(framePath: string): string | null {
  return petFrameUrls[`../assets/${framePath}`] ?? null;
}
```

- [ ] **Step 5: Update registry resolution**

Modify `ResolvedPetPackage` in `src/assets/petPackageRegistry.ts`:

```ts
export interface ResolvedPetPackage {
  id: string;
  name: string;
  baseSize: { width: number; height: number };
  frameSize: { width: number; height: number };
  previewUrl: string | null;
  source: "built-in" | "imported";
  actions: Record<PetActionName, PetActionDefinition>;
  scenes: Record<string, PetPackageSceneManifest>;
}
```

Use imported manifest action values instead of hardcoded fps:

```ts
const actionManifest = pkg.actions[action];
actions[action] = {
  fps: actionManifest.fps,
  loop: actionManifest.loop,
  frameCount: actionManifest.frameCount,
  durationMs: actionManifest.durationMs,
  category: readPetActionCategory(action),
  frames: frames.map((framePath) =>
    convertFileSrc(normalizeImportedAssetPath(framePath)),
  ),
};
```

- [ ] **Step 6: Add q-girl asset directory metadata**

Create `src/assets/pets/q-girl/README.md`:

```md
# Q Girl Built-In Pet Assets

This directory contains generated, project-owned PNG sequence frames for the built-in Q 版长发眼镜女生 desktop pet.

Reference identity image:

`docs/assets/references/q-girl-pet-reference.png`

Runtime contract:

- `formatVersion: 2`
- `renderer: frame-sequence`
- 12 actions
- 30 PNG frames per action
- 5 fps
- 6000 ms per action
- frame path pattern: `frames/<action>/0001.png` to `0030.png`

The assets are generated for this project and must not contain third-party logos, readable clothing text, watermarks, or unrelated props.
```

- [ ] **Step 7: Generate final q-girl PNGs before wiring the default package**

Create `docs/assets/q-girl-imagegen-prompts.md` with the reference path, global prompt, and action prompts listed in Task 7 Step 1. Then use the built-in image generation tool with `docs/assets/references/q-girl-pet-reference.png` to generate every required action frame before running the registry tests.

Required paths:

```text
src/assets/pets/q-girl/preview.png
src/assets/pets/q-girl/frames/idle-breathe/0001.png
src/assets/pets/q-girl/frames/idle-breathe/0030.png
src/assets/pets/q-girl/frames/idle-look/0001.png
src/assets/pets/q-girl/frames/idle-look/0030.png
src/assets/pets/q-girl/frames/idle-stretch/0001.png
src/assets/pets/q-girl/frames/idle-stretch/0030.png
src/assets/pets/q-girl/frames/walk/0001.png
src/assets/pets/q-girl/frames/walk/0030.png
src/assets/pets/q-girl/frames/drag/0001.png
src/assets/pets/q-girl/frames/drag/0030.png
src/assets/pets/q-girl/frames/sleep/0001.png
src/assets/pets/q-girl/frames/sleep/0030.png
src/assets/pets/q-girl/frames/act-cute/0001.png
src/assets/pets/q-girl/frames/act-cute/0030.png
src/assets/pets/q-girl/frames/act-typing/0001.png
src/assets/pets/q-girl/frames/act-typing/0030.png
src/assets/pets/q-girl/frames/act-wave/0001.png
src/assets/pets/q-girl/frames/act-wave/0030.png
src/assets/pets/q-girl/frames/act-hug/0001.png
src/assets/pets/q-girl/frames/act-hug/0030.png
src/assets/pets/q-girl/frames/act-pout/0001.png
src/assets/pets/q-girl/frames/act-pout/0030.png
src/assets/pets/q-girl/frames/act-drowsy/0001.png
src/assets/pets/q-girl/frames/act-drowsy/0030.png
```

The actual directory must contain every numbered file from `0001.png` through `0030.png` for each action.

Quality gates before Step 8:

```text
No frame may be half-body split, blank, cropped, missing glasses, missing feet, wrong outfit, or a different character.
At 128px height, idle breathing, act-cute, act-typing, act-wave, act-hug, act-pout, and act-drowsy must be visibly different actions.
Looping actions must align closely between 0001.png and 0030.png.
Interaction actions must include a start pose, a main pose, an emotional pause, and a return pose.
```

- [ ] **Step 8: Run registry and build verification**

Run:

```bash
pnpm test -- src/assets/petPackageRegistry.test.ts src/renderer/FramePetStage.test.tsx
pnpm typecheck
pnpm build
```

Expected: registry tests PASS; typecheck/build may still fail if later App imports are not updated, and those failures should point to files listed in Tasks 4-6.

- [ ] **Step 9: Commit Task 3**

```bash
git add src/assets/builtInPetManifest.ts src/renderer/frameAtlas.ts src/assets/petPackageRegistry.ts src/assets/petPackageRegistry.test.ts src/assets/pets/q-girl
git commit -m "feat: switch built-in pet to q girl v2 assets"
```

---

### Task 4: Motion Scene Director

**Files:**
- Create: `src/motion/motionSceneTypes.ts`
- Create: `src/motion/motionScenePlayer.ts`
- Test: `src/motion/motionScenePlayer.test.ts`

**Interfaces:**
- Consumes: `PetPackageSceneManifest` from `src/assets/petPackageContract.ts`.
- Produces: `createMotionSceneRuntime(scene, startedAt, remoteMessageText?)`.
- Produces: `readDueBubbleCues(runtime, now)`.
- Produces: `isMotionSceneComplete(runtime, now, acknowledged)`.
- Consumed by: Tasks 5 and 6.

- [ ] **Step 1: Write failing motion director tests**

Create `src/motion/motionScenePlayer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createMotionSceneRuntime,
  isMotionSceneComplete,
  readDueBubbleCues,
} from "./motionScenePlayer";
import type { MotionScene } from "./motionSceneTypes";

const cuteScene: MotionScene = {
  id: "act-cute",
  action: "act-cute",
  durationMs: 6000,
  bubbleCues: [{ atMs: 1800, text: "陪我一会儿嘛。" }],
  returnTo: "idle-breathe",
};

const remoteScene: MotionScene = {
  id: "remote-message",
  action: "act-wave",
  durationMs: 6000,
  bubbleCues: [{ atMs: 1000, source: "remoteMessage" }],
  waitForAcknowledge: true,
  returnTo: "idle-breathe",
};

describe("motion scene player", () => {
  it("fires bubble cues once when their time is reached", () => {
    const runtime = createMotionSceneRuntime(cuteScene, 10_000);

    expect(readDueBubbleCues(runtime, 11_000)).toEqual([]);
    expect(readDueBubbleCues(runtime, 11_900)).toEqual([
      { atMs: 1800, text: "陪我一会儿嘛。" },
    ]);
    expect(readDueBubbleCues(runtime, 12_500)).toEqual([]);
  });

  it("resolves remote message text from the active message", () => {
    const runtime = createMotionSceneRuntime(remoteScene, 20_000, "早点休息");

    expect(readDueBubbleCues(runtime, 21_000)).toEqual([
      { atMs: 1000, text: "早点休息", source: "remoteMessage" },
    ]);
  });

  it("keeps a remote scene visible until acknowledged", () => {
    const runtime = createMotionSceneRuntime(remoteScene, 20_000, "早点休息");

    expect(isMotionSceneComplete(runtime, 27_000, false)).toBe(false);
    expect(isMotionSceneComplete(runtime, 27_000, true)).toBe(true);
  });

  it("completes normal interaction scenes after their duration", () => {
    const runtime = createMotionSceneRuntime(cuteScene, 10_000);

    expect(isMotionSceneComplete(runtime, 15_999, false)).toBe(false);
    expect(isMotionSceneComplete(runtime, 16_000, false)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the failing motion tests**

Run: `pnpm test -- src/motion/motionScenePlayer.test.ts`

Expected: FAIL because `src/motion` does not exist.

- [ ] **Step 3: Create motion scene types**

Create `src/motion/motionSceneTypes.ts`:

```ts
import type { IdleActionName, PetActionName } from "../assets/petActionNames";

export type MotionSceneId = PetActionName | "remote-message";

export interface MotionBubbleCue {
  atMs: number;
  text?: string;
  source?: "remoteMessage";
}

export interface MotionScene {
  id: MotionSceneId;
  action: PetActionName;
  durationMs: number;
  bubbleCues: readonly MotionBubbleCue[];
  returnTo: IdleActionName;
  waitForAcknowledge?: boolean;
}

export interface MotionSceneRuntime {
  scene: MotionScene;
  startedAt: number;
  remoteMessageText: string | null;
  firedCueIndexes: Set<number>;
}
```

- [ ] **Step 4: Create motion scene player**

Create `src/motion/motionScenePlayer.ts`:

```ts
import type {
  MotionBubbleCue,
  MotionScene,
  MotionSceneRuntime,
} from "./motionSceneTypes";

export function createMotionSceneRuntime(
  scene: MotionScene,
  startedAt: number,
  remoteMessageText: string | null = null,
): MotionSceneRuntime {
  return {
    scene,
    startedAt,
    remoteMessageText,
    firedCueIndexes: new Set<number>(),
  };
}

export function readDueBubbleCues(
  runtime: MotionSceneRuntime,
  now: number,
): MotionBubbleCue[] {
  const elapsedMs = now - runtime.startedAt;
  const cues: MotionBubbleCue[] = [];

  runtime.scene.bubbleCues.forEach((cue, index) => {
    if (runtime.firedCueIndexes.has(index) || elapsedMs < cue.atMs) {
      return;
    }

    runtime.firedCueIndexes.add(index);
    cues.push(resolveBubbleCue(cue, runtime.remoteMessageText));
  });

  return cues;
}

export function isMotionSceneComplete(
  runtime: MotionSceneRuntime,
  now: number,
  acknowledged: boolean,
): boolean {
  if (now - runtime.startedAt < runtime.scene.durationMs) {
    return false;
  }

  if (runtime.scene.waitForAcknowledge) {
    return acknowledged;
  }

  return true;
}

function resolveBubbleCue(
  cue: MotionBubbleCue,
  remoteMessageText: string | null,
): MotionBubbleCue {
  if (cue.source !== "remoteMessage") {
    return cue;
  }

  return {
    ...cue,
    text: remoteMessageText ?? "",
  };
}
```

- [ ] **Step 5: Run motion tests**

Run: `pnpm test -- src/motion/motionScenePlayer.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/motion/motionSceneTypes.ts src/motion/motionScenePlayer.ts src/motion/motionScenePlayer.test.ts
git commit -m "feat: add pet motion scene director"
```

---

### Task 5: App Integration For Local Interaction Scenes

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/pet-core/petScheduler.ts`
- Modify: `src/pet-core/petTypes.ts`
- Modify: `src/pet-core/petStateMachine.ts`
- Test: `src/app/App.test.tsx`
- Test: `src/pet-core/petScheduler.test.ts`

**Interfaces:**
- Consumes: `ResolvedPetPackage.actions[action].durationMs` and `ResolvedPetPackage.scenes`.
- Consumes: `createMotionSceneRuntime`, `readDueBubbleCues`, `isMotionSceneComplete`.
- Produces: local interaction starts scene runtime on menu select, shows bubble at scene cue time, and returns to idle after at least 6000ms.
- Consumed by: Task 6.

- [ ] **Step 1: Add scheduler tests for selected package duration**

Create or update `src/pet-core/petScheduler.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getNextScheduledEvent } from "./petScheduler";
import type { PetState } from "./petTypes";

const interactingState: PetState = {
  name: "interacting",
  action: "act-cute",
  enteredAt: 1_000,
  lastInteractionAt: 1_000,
  direction: "right",
  idleHistory: [],
};

describe("pet scheduler", () => {
  it("keeps interaction scenes alive until the selected action duration elapses", () => {
    expect(getNextScheduledEvent(interactingState, 6_999, false, 6000)).toBeNull();
    expect(getNextScheduledEvent(interactingState, 7_000, false, 6000)).toEqual({
      type: "ANIMATION_FINISHED",
      at: 7_000,
    });
  });
});
```

- [ ] **Step 2: Add App test for delayed local interaction bubble**

Add a test in `src/app/App.test.tsx`:

```ts
it("shows an interaction bubble from the motion scene cue instead of immediately", async () => {
  vi.useFakeTimers();
  render(<App />);

  await waitFor(() => expect(screen.getByLabelText("情侣桌宠 MVP")).toBeInTheDocument());
  fireEvent.click(screen.getByLabelText("Q 版小人"));
  fireEvent.click(screen.getByRole("menuitem", { name: "撒娇卖萌" }));

  expect(screen.queryByText("陪我一会儿嘛。")).not.toBeInTheDocument();

  act(() => {
    vi.advanceTimersByTime(1800);
  });

  expect(screen.getByText("陪我一会儿嘛。")).toBeInTheDocument();

  act(() => {
    vi.advanceTimersByTime(4200);
  });

  await waitFor(() =>
    expect(screen.getByLabelText("Q 版小人").closest("[data-action]")).toHaveAttribute(
      "data-action",
      "idle-breathe",
    ),
  );
});
```

Adjust the label selector only if `FramePetStage` uses a more specific accessible name after Task 3; keep the behavioral assertions unchanged.

- [ ] **Step 3: Run the failing focused tests**

Run:

```bash
pnpm test -- src/pet-core/petScheduler.test.ts src/app/App.test.tsx
```

Expected: scheduler test may PASS already; App test FAIL because interaction bubbles are shown immediately and there is no scene runtime.

- [ ] **Step 4: Update App imports**

In `src/app/App.tsx`, import action names from the new module and motion helpers:

```ts
import { idleActionNames, type InteractionActionName } from "../assets/petActionNames";
import {
  createMotionSceneRuntime,
  isMotionSceneComplete,
  readDueBubbleCues,
} from "../motion/motionScenePlayer";
import type { MotionSceneRuntime } from "../motion/motionSceneTypes";
```

Remove imports of `getActionDefinition` from `builtInPetManifest` for scheduling.

- [ ] **Step 5: Add local motion scene runtime state**

Inside `App`, add:

```ts
const [activeMotionScene, setActiveMotionScene] =
  useState<MotionSceneRuntime | null>(null);
```

When resolving the current action duration, use:

```ts
const currentActionDurationMs =
  selectedPetPackage.actions[petState.action]?.durationMs ?? 6000;
```

Pass `currentActionDurationMs` into `getNextScheduledEvent`.

- [ ] **Step 6: Start motion scenes on local interaction select**

In `handleInteractionSelect`, replace immediate bubble display with:

```ts
const scene = selectedPetPackage.scenes[action];

if (scene) {
  setActiveMotionScene(
    createMotionSceneRuntime(
      {
        id: action,
        action: scene.action,
        durationMs:
          selectedPetPackage.actions[scene.action]?.durationMs ?? 6000,
        bubbleCues: scene.bubbleCues,
        returnTo: scene.returnTo,
        waitForAcknowledge: scene.waitForAcknowledge,
      },
      Date.now(),
    ),
  );
}

setPetState((currentState) =>
  transitionPetState(currentState, {
    type: "INTERACTION_SELECTED",
    action,
    at: Date.now(),
  }),
);
```

Do not call `showBubble` directly in this handler.

- [ ] **Step 7: Add interval to fire local scene bubble cues**

Add an effect:

```ts
useEffect(() => {
  if (!activeMotionScene || activeMotionScene.scene.id === "remote-message") {
    return;
  }

  const timer = window.setInterval(() => {
    const now = Date.now();

    for (const cue of readDueBubbleCues(activeMotionScene, now)) {
      if (cue.text) {
        showBubble(cue.text);
      }
    }

    if (isMotionSceneComplete(activeMotionScene, now, false)) {
      setActiveMotionScene(null);
    }
  }, 100);

  return () => window.clearInterval(timer);
}, [activeMotionScene, showBubble]);
```

- [ ] **Step 8: Ensure state machine uses selected interaction action**

If `transitionPetState` currently trusts `INTERACTION_SELECTED.action`, keep it. If it resets to a fixed action, update it so `state.action` equals the selected interaction action:

```ts
case "INTERACTION_SELECTED":
  return {
    ...state,
    name: "interacting",
    action: event.action,
    enteredAt: event.at,
    lastInteractionAt: event.at,
  };
```

- [ ] **Step 9: Run focused tests**

Run:

```bash
pnpm test -- src/pet-core/petScheduler.test.ts src/app/App.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS or failures only in `RemoteMessageLayer` addressed by Task 6.

- [ ] **Step 11: Commit Task 5**

```bash
git add src/app/App.tsx src/pet-core/petScheduler.ts src/pet-core/petTypes.ts src/pet-core/petStateMachine.ts src/app/App.test.tsx src/pet-core/petScheduler.test.ts
git commit -m "feat: drive local pet interactions with motion scenes"
```

---

### Task 6: Remote Message Visitor Scene

**Files:**
- Modify: `src/sync/RemoteMessageLayer.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/app.css`
- Test: `src/sync/RemoteMessageLayer.test.tsx`
- Test: `src/app/App.test.tsx`

**Interfaces:**
- Consumes: `peerPackage.actions["act-wave"].frames`, `MotionSceneRuntime`, and `remote-message` scene.
- Produces: remote message layer animates the peer package frame sequence and keeps the message visible until pointer hover acknowledgement.
- Produces: CSS classes `.remote-message-layer.is-entering`, `.remote-message-layer.is-waiting`, `.remote-message-layer.is-leaving`.

- [ ] **Step 1: Write RemoteMessageLayer animation tests**

Create or update `src/sync/RemoteMessageLayer.test.tsx`:

```ts
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RemoteMessageLayer } from "./RemoteMessageLayer";
import type { ResolvedPetPackage } from "../assets/petPackageRegistry";

const peerPackage = {
  id: "imported:q-girl-peer",
  name: "对方小人",
  baseSize: { width: 256, height: 320 },
  frameSize: { width: 768, height: 960 },
  previewUrl: "asset://preview.png",
  source: "imported",
  scenes: {},
  actions: {
    "act-wave": {
      fps: 5,
      loop: false,
      frameCount: 30,
      durationMs: 6000,
      category: "interaction",
      frames: ["asset://wave-0001.png", "asset://wave-0002.png"],
    },
    "idle-breathe": {
      fps: 5,
      loop: true,
      frameCount: 30,
      durationMs: 6000,
      category: "idle",
      frames: ["asset://idle-0001.png"],
    },
  },
} as ResolvedPetPackage;

describe("RemoteMessageLayer", () => {
  it("renders peer act-wave frames for the remote visitor", () => {
    render(
      <RemoteMessageLayer
        message={{ id: "m1", text: "早点休息", stage: "visible" }}
        peerPackage={peerPackage}
        onAcknowledge={vi.fn()}
      />,
    );

    expect(screen.getByAltText("对方小人来访")).toHaveAttribute(
      "src",
      "asset://wave-0001.png",
    );
  });

  it("advances visitor frames with the package fps", () => {
    vi.useFakeTimers();
    render(
      <RemoteMessageLayer
        message={{ id: "m1", text: "早点休息", stage: "visible" }}
        peerPackage={peerPackage}
        onAcknowledge={vi.fn()}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByAltText("对方小人来访")).toHaveAttribute(
      "src",
      "asset://wave-0002.png",
    );
  });

  it("acknowledges only on pointer enter", () => {
    const onAcknowledge = vi.fn();
    render(
      <RemoteMessageLayer
        message={{ id: "m1", text: "早点休息", stage: "visible" }}
        peerPackage={peerPackage}
        onAcknowledge={onAcknowledge}
      />,
    );

    expect(onAcknowledge).not.toHaveBeenCalled();
    fireEvent.pointerEnter(screen.getByLabelText("对方桌宠消息"));
    expect(onAcknowledge).toHaveBeenCalledWith("m1");
  });
});
```

- [ ] **Step 2: Run failing RemoteMessageLayer tests**

Run: `pnpm test -- src/sync/RemoteMessageLayer.test.tsx`

Expected: FAIL because the component uses preview or idle frame and has no frame advancement.

- [ ] **Step 3: Update RemoteMessageLayer frame playback**

Modify `src/sync/RemoteMessageLayer.tsx`:

```ts
import { useEffect, useMemo, useState } from "react";
import { getFrameIndex } from "../renderer/animationPlayer";

const visitorAction = peerPackage?.actions["act-wave"] ?? null;
const [elapsedMs, setElapsedMs] = useState(0);

useEffect(() => {
  setElapsedMs(0);
}, [message?.id, peerPackage?.id]);

useEffect(() => {
  if (!message || !visitorAction) {
    return;
  }

  const timer = window.setInterval(() => {
    setElapsedMs((current) => current + 100);
  }, 100);

  return () => window.clearInterval(timer);
}, [message, visitorAction]);

const imageUrl = useMemo(() => {
  if (visitorAction?.frames.length) {
    return visitorAction.frames[
      getFrameIndex(
        elapsedMs,
        visitorAction.frames.length,
        visitorAction.fps,
        visitorAction.loop,
      )
    ];
  }

  return peerPackage?.previewUrl ?? peerPackage?.actions["idle-breathe"].frames[0] ?? null;
}, [elapsedMs, peerPackage, visitorAction]);
```

- [ ] **Step 4: Update remote message queue App test**

In `src/app/App.test.tsx`, add or update a test:

```ts
it("keeps incoming remote messages visible until pointer acknowledgement", async () => {
  render(<App />);

  await act(async () => {
    realtimeMock.emit({
      type: "message",
      message: {
        id: "remote-1",
        text: "早点休息",
        senderDeviceId: "dev_b",
        createdAt: Date.now(),
      },
    });
  });

  expect(screen.getByText("早点休息")).toBeInTheDocument();

  act(() => {
    vi.advanceTimersByTime(10_000);
  });

  expect(screen.getByText("早点休息")).toBeInTheDocument();

  fireEvent.pointerEnter(screen.getByLabelText("对方桌宠消息"));
  await waitFor(() => expect(screen.queryByText("早点休息")).not.toBeInTheDocument());
});
```

Use the existing realtime mock names from `src/app/App.test.tsx`; keep the behavior exactly as above.

- [ ] **Step 5: Ensure App no longer auto-dismisses active remote messages**

Remove the effect in `src/app/App.tsx` that dismisses `remoteMessages.active` via timeout. Keep acknowledgement via:

```ts
const handleRemoteMessageAcknowledge = useCallback((messageId: string) => {
  setRemoteMessages((queue) => acknowledgeRemoteMessage(queue, messageId));
}, []);
```

- [ ] **Step 6: Update CSS for visitor stage**

In `src/app/app.css`, make sure remote visitor appears as a desktop-pet visit, not a plain card:

```css
.remote-message-layer {
  position: absolute;
  left: 12px;
  bottom: 22px;
  display: grid;
  grid-template-columns: auto minmax(120px, 220px);
  align-items: end;
  gap: 8px;
  pointer-events: auto;
  animation: remote-visitor-enter 220ms ease-out both;
}

.remote-visitor {
  margin: 0;
  display: grid;
  justify-items: center;
  gap: 2px;
}

.remote-visitor-image {
  width: 96px;
  height: 120px;
  object-fit: contain;
  image-rendering: auto;
}

.remote-message-bubble {
  max-width: 220px;
  padding: 10px 12px;
  border-radius: 16px;
  background: rgba(255, 248, 238, 0.96);
  border: 1px solid rgba(96, 58, 32, 0.18);
  color: #3f2415;
  box-shadow: 0 8px 22px rgba(72, 42, 22, 0.14);
}

@keyframes remote-visitor-enter {
  from {
    opacity: 0;
    transform: translateX(-18px) translateY(8px) scale(0.94);
  }
  to {
    opacity: 1;
    transform: translateX(0) translateY(0) scale(1);
  }
}
```

Do not add a visible rectangular pet-stage border.

- [ ] **Step 7: Run focused remote tests**

Run:

```bash
pnpm test -- src/sync/RemoteMessageLayer.test.tsx src/app/App.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit Task 6**

```bash
git add src/sync/RemoteMessageLayer.tsx src/sync/RemoteMessageLayer.test.tsx src/app/App.tsx src/app/App.test.tsx src/app/app.css
git commit -m "feat: animate remote pet message visits"
```

---

### Task 7: Generate Final Q Girl V2 PNG Resources

**Files:**
- Create: `docs/assets/q-girl-imagegen-prompts.md`
- Replace generated files under: `src/assets/pets/q-girl/preview.png`
- Replace generated files under: `src/assets/pets/q-girl/frames/<action>/0001.png` ... `0030.png`

**Interfaces:**
- Consumes: reference image `docs/assets/references/q-girl-pet-reference.png`.
- Produces: final project-owned Q 版女生 PNG action frames matching v2 layout.
- Consumed by: Task 8 verification and manual experience testing.

- [ ] **Step 1: Create prompt documentation**

Create `docs/assets/q-girl-imagegen-prompts.md` with this content:

```md
# Q Girl Built-In Pet ImageGen Prompts

Reference image:

`docs/assets/references/q-girl-pet-reference.png`

Global prompt shared by every frame:

Use case: illustration-story
Asset type: desktop pet 2D animation frame

Generate one transparent-ready animation frame for a cute Q version long-haired girl desktop pet based on the provided reference image. The reference image is a style and character identity reference only. Do not copy exact pixels. Keep the same character concept: chibi young woman, very large head and small body, long dark brown hair, round glasses, large warm brown eyes, gentle slightly shy expression, pale gray-purple plaid layered top or dress, loose white pants, white shoes.

Style: polished cute anime chibi desktop mascot, soft hand-painted edges, clean readable silhouette, warm emotional expression, high consistency across frames.

Composition: full body centered, generous transparent padding, same camera angle, same approximate body size, same foot baseline, readable at 128px desktop height.

Background: perfectly flat solid #00ff00 chroma-key background for removal, no floor plane, no shadow.

Constraints: no watermark, no text, no extra characters, no unrelated props except the tiny laptop/keyboard only for act-typing. Keep the whole character inside frame. Preserve long hair, round glasses, gray-purple plaid clothing, white pants, white shoes.

Avoid: photorealism, realistic adult proportions, cropped head, cropped feet, missing glasses, wrong outfit, visible text, hard shadow, white background, checkerboard background, extra decorative icons everywhere.

Frame size target after processing: 768x960 PNG.

Action prompts:

idle-breathe: calm standing idle, tiny breathing motion, shoulders and chest rise gently, blink at the middle frames, hair tips sway subtly, return to the same pose for a seamless loop.
idle-look: quietly glances toward the user, head turns slightly, eyes look sideways then back, one hand gently adjusts round glasses, hair follows the head motion.
idle-stretch: sleepy little stretch, both arms lift and stretch, body rises, eyes close briefly, layered clothes and long hair settle back down.
walk: tiny chibi steps, left foot and right foot alternate, body weight shifts left and right, hair bounces softly, loop starts and ends at matching neutral pose.
drag: as if picked up and dragged, body hangs with feet slightly off baseline, arms and hair sway left then right, expression surprised but cute.
sleep: drowsy standing nap, eyes closed, body sinks slightly, head nods, hair droops softly, peaceful loop.
act-cute: acting cute and clingy, hands near cheeks, head tilts, cheeks blush more, tiny bounce forward, smile becomes sweeter, return to soft smile.
act-typing: tiny laptop or keyboard appears in front, both hands tap quickly, eyes focus on screen, then she looks up proudly with a small smile.
act-wave: friendly greeting, one hand waves clearly side to side, body leans forward slightly, long hair swings with the wave, warm smile.
act-hug: asking for a hug, arms open wide, small hop forward, expectant pause with bright eyes, then arms relax.
act-pout: cute angry pout, arms cross, cheeks puff, eyes glance aside, foot taps once, expression softens near the end.
act-drowsy: sleepy yawn, one hand rubs eye, head nods down, almost falls asleep, then wakes a little with embarrassed smile.
```

- [ ] **Step 2: Generate the first two action groups before batch generation**

Use the built-in image generation tool with the reference image and prompt from Step 1. Generate:

```text
src/assets/pets/q-girl/frames/idle-breathe/0001.png ... 0030.png
src/assets/pets/q-girl/frames/act-cute/0001.png ... 0030.png
```

Quality gate:

```text
No frame may be half-body split, blank, cropped, missing glasses, missing feet, wrong outfit, or a different character.
At 128px height, idle breathing and act-cute must be visibly different.
Frame 0001 and 0030 for idle-breathe must align closely enough to loop.
```

- [ ] **Step 3: Generate the remaining ten action groups**

Generate and replace:

```text
idle-look
idle-stretch
walk
drag
sleep
act-typing
act-wave
act-hug
act-pout
act-drowsy
```

Each directory must contain exactly 30 files named `0001.png` through `0030.png`.

- [ ] **Step 4: Set preview image**

Set `src/assets/pets/q-girl/preview.png` to a clean 768x960 PNG based on `idle-breathe/0001.png`, with the same transparent-ready background processing used for frames.

- [ ] **Step 5: Run asset path verification**

Run:

```bash
$missing = @()
$actions = @("idle-breathe","idle-look","idle-stretch","walk","drag","sleep","act-cute","act-typing","act-wave","act-hug","act-pout","act-drowsy")
foreach ($action in $actions) {
  foreach ($i in 1..30) {
    $path = "src/assets/pets/q-girl/frames/$action/$($i.ToString('0000')).png"
    if (!(Test-Path -LiteralPath $path)) { $missing += $path }
  }
}
if (!(Test-Path -LiteralPath "src/assets/pets/q-girl/preview.png")) { $missing += "src/assets/pets/q-girl/preview.png" }
if ($missing.Count -gt 0) { $missing; exit 1 }
```

Expected: no output and exit code 0.

- [ ] **Step 6: Run rendering tests and build**

Run:

```bash
pnpm test -- src/assets/petPackageRegistry.test.ts src/renderer/FramePetStage.test.tsx src/sync/RemoteMessageLayer.test.tsx
pnpm build
```

Expected: PASS.

- [ ] **Step 7: Commit Task 7**

```bash
git add docs/assets/q-girl-imagegen-prompts.md src/assets/pets/q-girl
git commit -m "feat: add q girl v2 animation frames"
```

---

### Task 8: Settings Migration And Final Verification

**Files:**
- Modify: `src/settings/defaultSettings.ts`
- Modify: `src/settings/settingsStore.ts`
- Modify: `src/settings/settingsStore.test.ts`
- Modify: `src/settings/AppearancePanel.test.tsx`
- Modify: `src/renderer/FramePetStage.test.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `docs/pet-resource-pack-format.md` only if implementation details differ from the existing v2 document.

**Interfaces:**
- Consumes: `BUILT_IN_PET_PACKAGE_ID = "builtin:q-girl"`.
- Produces: existing saved settings that point to `builtin:star-sleeper` migrate to `builtin:q-girl`.
- Produces: final verification evidence.

- [ ] **Step 1: Write settings migration tests**

In `src/settings/settingsStore.test.ts`, add:

```ts
it("migrates the old built-in star sleeper package to q-girl", () => {
  expect(
    mergeSettings({
      appearance: {
        selectedPetPackageId: "builtin:star-sleeper",
        peerPetPackageByDeviceId: {
          dev_b: "builtin:star-sleeper",
        },
      },
    }).appearance,
  ).toEqual({
    selectedPetPackageId: "builtin:q-girl",
    peerPetPackageByDeviceId: {
      dev_b: "builtin:q-girl",
    },
  });
});
```

- [ ] **Step 2: Run failing settings tests**

Run: `pnpm test -- src/settings/settingsStore.test.ts`

Expected: FAIL because the old built-in ID is still preserved as a string.

- [ ] **Step 3: Implement built-in ID migration**

In `src/settings/settingsStore.ts`, add:

```ts
const LEGACY_BUILT_IN_PET_PACKAGE_ID = "builtin:star-sleeper";

function normalizePetPackageId(packageId: string): string {
  return packageId === LEGACY_BUILT_IN_PET_PACKAGE_ID
    ? defaultSettings.appearance.selectedPetPackageId
    : packageId;
}
```

Use `normalizePetPackageId` when reading `selectedPetPackageId` and each value inside `peerPetPackageByDeviceId`.

- [ ] **Step 4: Update tests that still expect star sleeper**

Replace expected default IDs in:

```text
src/settings/settingsStore.test.ts
src/settings/AppearancePanel.test.tsx
src/renderer/FramePetStage.test.tsx
src/app/App.test.tsx
```

Use `BUILT_IN_PET_PACKAGE_ID` in tests where practical:

```ts
expect(settings.appearance.selectedPetPackageId).toBe(BUILT_IN_PET_PACKAGE_ID);
```

- [ ] **Step 5: Run full frontend verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: PASS.

- [ ] **Step 6: Run full Rust verification**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 7: Manual desktop smoke test**

Run the app:

```bash
pnpm tauri dev
```

Manual checks:

```text
Initial pet is Q 版长发眼镜女生, not star sleeper.
No visible square border around the transparent pet area.
Single-click opens interaction options.
撒娇卖萌 bubble appears after the action begins, not immediately.
敲电脑 shows a visible keyboard or laptop prop.
Remote incoming message remains until pointer hover acknowledgement.
Settings can close after click-through has been enabled.
Imported v1 .cdpet returns the Chinese upgrade message.
```

- [ ] **Step 8: Commit Task 8**

```bash
git add src/settings/defaultSettings.ts src/settings/settingsStore.ts src/settings/settingsStore.test.ts src/settings/AppearancePanel.test.tsx src/renderer/FramePetStage.test.tsx src/app/App.test.tsx docs/pet-resource-pack-format.md
git commit -m "fix: migrate settings to q girl pet package"
```

- [ ] **Step 9: Final review summary for main agent**

Provide this handoff summary:

```text
Implemented:
- v2 resource package contract and Rust importer
- builtin:q-girl manifest and asset atlas
- motion scene director for local interactions
- animated remote visitor message layer
- settings migration away from builtin:star-sleeper

Verification:
- pnpm test
- pnpm typecheck
- pnpm build
- cargo test --manifest-path src-tauri/Cargo.toml
- manual pnpm tauri dev smoke test

Known remaining risk:
- AI-generated PNG consistency still requires visual review before a packaged release.
```

---

## Self-Review

Spec coverage:

- Default built-in image changes from star sleeper to Q 版长发眼镜女生 in Tasks 3 and 8.
- v2 `.cdpet` contract, 30 frames, 5 fps, 6000ms duration, nested frame paths, preview requirement, and v1 rejection are covered in Tasks 1 and 2.
- Animation director for delayed bubbles, action duration, return-to-idle, and remote acknowledgement is covered in Tasks 4, 5, and 6.
- Asset generation with the stored Q-girl reference and 12 actions is covered in Task 7.
- No Live2D, Spine, DragonBones, platform web/api/server changes, or legacy import compatibility are included.

Plan completeness scan:

- The plan contains concrete file paths, command lines, tests, interface names, and implementation snippets.
- Q-girl frames are generated as action-specific motion resources before the built-in package is considered ready for user testing.

Type consistency:

- `PetActionName` and related unions come from `src/assets/petActionNames.ts`.
- `ResolvedPetPackage.scenes` consumes `PetPackageSceneManifest` from `src/assets/petPackageContract.ts`.
- Motion runtime consumes a normalized `MotionScene`, so imported and built-in packages share one playback path.
