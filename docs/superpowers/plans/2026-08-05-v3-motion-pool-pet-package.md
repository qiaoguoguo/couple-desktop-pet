# V3 Motion Pool Pet Packages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add v3 `.cdpet` motion-pool packages that can contain a single idle/ambient motion, decouple the six radial buttons from animation names, and reuse the existing `act-typing`/敲电脑 button as the send-message entry.

**Architecture:** Keep the desktop pet state machine as behavior state, but move visual playback to a normalized `motions` model. Tauri import validates v3 packages and returns motion frame paths; the frontend registry converts both v2 fixed-action packages and v3 motion-pool packages into a common runtime package. The app's idle director randomly selects motions from the package pool, while function buttons emit feature commands rather than assuming same-name animation resources exist.

**Tech Stack:** Tauri 2, Rust, React 19, TypeScript, Vitest, Testing Library, PNG frame sequences, `.cdpet` zip packages.

## Global Constraints

- New generated/imported packages use `formatVersion: 3` and `renderer: "motion-pool"`.
- v3 packages must contain `pet.json`, `preview.png`, and at least one `motions/<motionId>/` sequence.
- v3 `defaultMotion` must reference an existing motion.
- v3 motion ids use English letters, numbers, underscores, and hyphens, length 1 to 64.
- v3 motion `frameCount` accepts 1 to 60 frames.
- v3 motion `fps` accepts 1 to 12.
- v3 motion `durationMs` accepts 3000 to 12000.
- v3 motion frame files are named `0001.png` through `frameCount` and stored under `motions/<motionId>/`.
- Existing v2 built-in and imported packages remain usable during this migration by converting fixed actions into runtime motions.
- The single-click radial menu shows only the six original action buttons; there is no separate seventh send-message entry.
- `act-typing`/敲电脑 opens the existing message composer surface.
- Other radial buttons do not require same-name animation resources; they show placeholder feedback or trigger a random motion.
- Remote message rendering must not require `act-wave`.
- Keep existing safety limits for archives: no path traversal, no scripts/web content, file count and size limits remain enforced.
- Do not implement account systems, cloud generation, payments, rankings, Live2D, Spine, or skeleton animation in this batch.
- Use the fixed Codex background development task required by `AGENTS.md` for implementation.

---

## File Structure

- Modify `src/assets/petPackageContract.ts`: add v3 motion-pool types, readers, and helpers while preserving v2 constants needed for compatibility.
- Modify `src/assets/petPackageContract.test.ts`: cover valid/invalid v3 manifests and v2 compatibility behavior.
- Modify `src-tauri/src/pet_packages.rs`: parse and validate v3 packages, return motion summaries, keep v2 compatibility path.
- Modify `src-tauri/src/pet_packages.rs` tests: add one-motion v3, multi-motion v3, invalid default motion, invalid motion path, invalid PNG, and v2 compatibility tests.
- Modify `src/assets/petPackageRegistry.ts`: normalize v2 and v3 packages into `ResolvedPetPackage.motions`.
- Modify `src/assets/petPackageRegistry.test.ts`: verify built-in, v2 imported, and v3 imported packages all expose usable motions.
- Create `src/pet-core/motionPoolDirector.ts`: weighted random motion selection and fallback helpers.
- Create `src/pet-core/motionPoolDirector.test.ts`: deterministic tests for one motion, weighted selection, tag filtering, and empty fallback.
- Modify `src/renderer/FramePetStage.tsx`: render a selected motion instead of indexing directly by `PetActionName`.
- Modify `src/app/App.test.tsx`: assert v3 one-motion package renders through `FramePetStage`.
- Modify `src/assets/builtInPetManifest.ts`: remove `send-message` from `interactionOptions`; keep six original buttons.
- Modify `src/interaction/InteractionMenu.test.tsx`: expect six menu items.
- Modify `src/app/App.tsx`: route `act-typing` to the message composer; route other buttons to placeholder/random motion; feed active motion to renderer.
- Modify `src/app/App.test.tsx`: cover six-button menu, typing button opens message composer, no seventh send-message item, other buttons do not require same-name actions.
- Modify `src/sync/RemoteMessageLayer.tsx`: render `message` tag/default motion fallback instead of `act-wave`.
- Modify `src/sync/RemoteMessageLayer.test.tsx`: cover v3 peer package with only one motion.
- Modify `docs/pet-resource-pack-format.md`: document v3 as the new target format and v2 as compatibility input.

---

### Task 1: Add Frontend v3 Motion-Pool Contract

**Files:**
- Modify: `src/assets/petPackageContract.ts`
- Modify: `src/assets/petPackageContract.test.ts`

**Interfaces:**
- Consumes: existing `PetPackageSize`, `ImportedPetPackageSummary`, v2 action constants.
- Produces:
  - `PetPackageFormatVersion = 2 | 3`
  - `PetMotionManifest`
  - `PetMotionPoolManifest`
  - `ImportedPetMotionSummary`
  - `readPetPackageManifest(input: unknown): PetPackageManifest | null` that accepts v2 and v3.
  - `readPetMotionPoolManifest(input: unknown): PetMotionPoolManifest | null`
  - `isValidPetMotionId(value: string): boolean`

- [ ] **Step 1: Write failing tests for a minimal v3 manifest**

Add this test to `src/assets/petPackageContract.test.ts`:

```ts
it("reads a valid v3 manifest with one motion", () => {
  const manifest = readPetMotionPoolManifest({
    formatVersion: 3,
    renderer: "motion-pool",
    id: "moon-buddy",
    name: "月亮小人",
    baseSize: { width: 256, height: 320 },
    frameSize: { width: 768, height: 960 },
    defaultMotion: "motion-001",
    motions: {
      "motion-001": {
        fps: 5,
        loop: true,
        frameCount: 30,
        durationMs: 6000,
        frames: "motions/motion-001/",
        weight: 2,
        tags: ["idle"],
      },
    },
  });

  expect(manifest?.formatVersion).toBe(3);
  expect(manifest?.renderer).toBe("motion-pool");
  expect(manifest?.defaultMotion).toBe("motion-001");
  expect(manifest?.motions["motion-001"].frameCount).toBe(30);
});
```

- [ ] **Step 2: Write failing tests for invalid v3 manifests**

Add these tests:

```ts
it("rejects a v3 manifest without a valid default motion", () => {
  const manifest = validMotionPoolManifest({
    defaultMotion: "missing-motion",
  });

  expect(readPetMotionPoolManifest(manifest)).toBeNull();
});

it("rejects a v3 motion when the frames directory does not match the motion id", () => {
  const manifest = validMotionPoolManifest({
    motions: {
      "motion-001": {
        fps: 5,
        loop: true,
        frameCount: 30,
        durationMs: 6000,
        frames: "motions/other-motion/",
        weight: 1,
        tags: ["idle"],
      },
    },
  });

  expect(readPetMotionPoolManifest(manifest)).toBeNull();
});

it("accepts v3 motion frame counts from 1 to 60", () => {
  expect(
    readPetMotionPoolManifest(
      validMotionPoolManifest({
        motions: {
          "motion-001": {
            fps: 5,
            loop: true,
            frameCount: 1,
            durationMs: 3000,
            frames: "motions/motion-001/",
            weight: 1,
            tags: ["idle"],
          },
        },
      }),
    )?.motions["motion-001"].frameCount,
  ).toBe(1);

  expect(
    readPetMotionPoolManifest(
      validMotionPoolManifest({
        motions: {
          "motion-001": {
            fps: 5,
            loop: true,
            frameCount: 60,
            durationMs: 12000,
            frames: "motions/motion-001/",
            weight: 1,
            tags: ["idle"],
          },
        },
      }),
    )?.motions["motion-001"].frameCount,
  ).toBe(60);
});
```

Add this local test helper:

```ts
function validMotionPoolManifest(overrides: Record<string, unknown> = {}) {
  return {
    formatVersion: 3,
    renderer: "motion-pool",
    id: "moon-buddy",
    name: "月亮小人",
    baseSize: { width: 256, height: 320 },
    frameSize: { width: 768, height: 960 },
    defaultMotion: "motion-001",
    motions: {
      "motion-001": {
        fps: 5,
        loop: true,
        frameCount: 30,
        durationMs: 6000,
        frames: "motions/motion-001/",
        weight: 1,
        tags: ["idle"],
      },
    },
    ...overrides,
  };
}
```

- [ ] **Step 3: Run tests to verify failure**

Run: `pnpm vitest run src/assets/petPackageContract.test.ts`

Expected: FAIL because `readPetMotionPoolManifest` and v3 types do not exist.

- [ ] **Step 4: Implement the v3 contract**

Add these exports in `src/assets/petPackageContract.ts`:

```ts
export type PetPackageFormatVersion = 2 | 3;
export const PET_MOTION_MIN_FRAMES = 1;
export const PET_MOTION_MAX_FRAMES = 60;
export const PET_MOTION_MIN_FPS = 1;
export const PET_MOTION_MAX_FPS = 12;
export const PET_MOTION_MIN_DURATION_MS = 3000;
export const PET_MOTION_MAX_DURATION_MS = 12000;

export interface PetMotionManifest {
  fps: number;
  loop: boolean;
  frameCount: number;
  durationMs: number;
  frames: string;
  weight: number;
  tags: readonly string[];
}

export interface PetMotionPoolManifest {
  formatVersion: 3;
  renderer: "motion-pool";
  id: string;
  name: string;
  baseSize: PetPackageSize;
  frameSize: PetPackageSize;
  defaultMotion: string;
  motions: Record<string, PetMotionManifest>;
}

export type PetPackageManifest =
  | PetFixedActionPackageManifest
  | PetMotionPoolManifest;
```

Rename the existing v2 `PetPackageManifest` interface to `PetFixedActionPackageManifest`, then export a union named `PetPackageManifest`.

Implement:

```ts
export function readPetMotionPoolManifest(
  input: unknown,
): PetMotionPoolManifest | null {
  if (
    !isRecord(input) ||
    input.formatVersion !== 3 ||
    input.renderer !== "motion-pool"
  ) {
    return null;
  }

  const id = readPackageId(input.id);
  const name = readNonEmptyString(input.name);
  const baseSize = readSize(input.baseSize);
  const frameSize = readSize(input.frameSize);
  const defaultMotion =
    typeof input.defaultMotion === "string" ? input.defaultMotion : "";
  const motions = readMotionManifests(input.motions);

  if (
    !id ||
    !name ||
    !baseSize ||
    !frameSize ||
    !isValidPetMotionId(defaultMotion) ||
    !motions ||
    !motions[defaultMotion]
  ) {
    return null;
  }

  return {
    formatVersion: 3,
    renderer: "motion-pool",
    id,
    name,
    baseSize,
    frameSize,
    defaultMotion,
    motions,
  };
}
```

Implement `readMotionManifests` with exact validation:

```ts
function readMotionManifests(
  input: unknown,
): Record<string, PetMotionManifest> | null {
  if (!isRecord(input)) {
    return null;
  }

  const entries = Object.entries(input);
  if (entries.length === 0) {
    return null;
  }

  const motions: Record<string, PetMotionManifest> = {};

  for (const [motionId, value] of entries) {
    if (!isValidPetMotionId(motionId) || !isRecord(value)) {
      return null;
    }

    const fps = value.fps;
    const loop = value.loop;
    const frameCount = value.frameCount;
    const durationMs = value.durationMs;
    const frames = value.frames;
    const weight = typeof value.weight === "number" ? value.weight : 1;
    const tags = Array.isArray(value.tags)
      ? value.tags.filter((tag): tag is string => typeof tag === "string")
      : ["idle"];

    if (
      typeof fps !== "number" ||
      fps < PET_MOTION_MIN_FPS ||
      fps > PET_MOTION_MAX_FPS ||
      typeof loop !== "boolean" ||
      typeof frameCount !== "number" ||
      frameCount < PET_MOTION_MIN_FRAMES ||
      frameCount > PET_MOTION_MAX_FRAMES ||
      typeof durationMs !== "number" ||
      durationMs < PET_MOTION_MIN_DURATION_MS ||
      durationMs > PET_MOTION_MAX_DURATION_MS ||
      frames !== `motions/${motionId}/` ||
      weight <= 0 ||
      tags.length === 0
    ) {
      return null;
    }

    motions[motionId] = { fps, loop, frameCount, durationMs, frames, weight, tags };
  }

  return motions;
}
```

Add:

```ts
export function isValidPetMotionId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(value);
}
```

Update `readPetPackageManifest` to call v2 first, then v3:

```ts
export function readPetPackageManifest(input: unknown): PetPackageManifest | null {
  return readFixedActionPackageManifest(input) ?? readPetMotionPoolManifest(input);
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run src/assets/petPackageContract.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/assets/petPackageContract.ts src/assets/petPackageContract.test.ts
git commit -m "feat: add v3 motion pool package contract"
```

---

### Task 2: Validate and Import v3 Packages in Tauri

**Files:**
- Modify: `src-tauri/src/pet_packages.rs`

**Interfaces:**
- Consumes: v3 contract from Task 1.
- Produces:
  - Rust `PackageMotion`
  - Rust `PetPackageManifest` that can deserialize v2 and v3 fields.
  - `ImportedPetPackageSummary` with `formatVersion`, `renderer`, `defaultMotion`, `motions`, and `motionFramePaths`.
  - v3 import validation accepting one motion.

- [ ] **Step 1: Add failing Rust tests for a one-motion v3 package**

Add this test in `src-tauri/src/pet_packages.rs`:

```rust
#[test]
fn imports_valid_v3_package_with_one_motion() {
    let temp = unique_temp_dir("valid-v3-motion-pool");
    let source = temp.join("moon.cdpet");
    let root = temp.join("packages");

    write_v3_test_package(&source, "moon-buddy", &[("motion-001", 30)]);

    let imported = import_pet_package_from_path(&source, &root).unwrap();

    assert_eq!(imported.manifest_id, "moon-buddy");
    assert_eq!(imported.format_version, 3);
    assert_eq!(imported.renderer, "motion-pool");
    assert_eq!(imported.default_motion.as_deref(), Some("motion-001"));
    assert_eq!(
        imported
            .motion_frame_paths
            .get("motion-001")
            .map(|frames| frames.len()),
        Some(30)
    );

    let _ = fs::remove_dir_all(temp);
}
```

- [ ] **Step 2: Add failing Rust tests for v3 validation failures**

Add tests:

```rust
#[test]
fn rejects_v3_package_when_default_motion_is_missing() {
    let temp = unique_temp_dir("v3-missing-default-motion");
    let source = temp.join("moon.cdpet");
    let root = temp.join("packages");
    let manifest = v3_test_manifest("moon-buddy", "missing-motion", &[("motion-001", 30)]);

    write_test_package_with_manifest_and_motion_frames(
        &source,
        &manifest,
        &[("motion-001", 30)],
    );

    let error = import_pet_package_from_path(&source, &root).unwrap_err();

    assert!(error.contains("defaultMotion 必须指向已存在的 motion"), "{error}");
    let _ = fs::remove_dir_all(temp);
}

#[test]
fn rejects_v3_package_when_motion_frame_is_missing() {
    let temp = unique_temp_dir("v3-missing-frame");
    let source = temp.join("moon.cdpet");
    let root = temp.join("packages");
    let manifest = v3_test_manifest("moon-buddy", "motion-001", &[("motion-001", 2)]);

    write_test_package_with_manifest_and_motion_frames(
        &source,
        &manifest,
        &[("motion-001", 1)],
    );

    let error = import_pet_package_from_path(&source, &root).unwrap_err();

    assert!(error.contains("缺少帧文件: motions/motion-001/0002.png"), "{error}");
    let _ = fs::remove_dir_all(temp);
}
```

- [ ] **Step 3: Run tests to verify failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml pet_packages -- --nocapture`

Expected: FAIL because v3 deserialization and validation are not implemented.

- [ ] **Step 4: Extend Rust manifest structs**

Modify `src-tauri/src/pet_packages.rs`:

```rust
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PackageMotion {
    fps: f64,
    #[serde(rename = "loop")]
    loop_value: bool,
    #[serde(rename = "frameCount")]
    frame_count: usize,
    #[serde(rename = "durationMs")]
    duration_ms: u32,
    frames: String,
    #[serde(default = "default_motion_weight")]
    weight: f64,
    #[serde(default = "default_motion_tags")]
    tags: Vec<String>,
}

fn default_motion_weight() -> f64 {
    1.0
}

fn default_motion_tags() -> Vec<String> {
    vec!["idle".to_string()]
}
```

Add fields to `PetPackageManifest`:

```rust
#[serde(rename = "defaultMotion")]
default_motion: Option<String>,
#[serde(default)]
motions: BTreeMap<String, PackageMotion>,
```

Add fields to `ImportedPetPackageSummary`:

```rust
#[serde(rename = "formatVersion")]
pub format_version: u8,
pub renderer: String,
#[serde(rename = "defaultMotion")]
pub default_motion: Option<String>,
pub motions: BTreeMap<String, PackageMotion>,
#[serde(rename = "motionFramePaths")]
pub motion_frame_paths: BTreeMap<String, Vec<String>>,
```

- [ ] **Step 5: Implement v3 validation**

In `validate_manifest`, branch by version:

```rust
if manifest.format_version == 3 {
    return validate_v3_manifest(manifest);
}
```

Implement:

```rust
fn validate_v3_manifest(manifest: &PetPackageManifest) -> Result<(), String> {
    if manifest.renderer.as_deref() != Some("motion-pool") {
        return Err("资源包 renderer 必须是 motion-pool".to_string());
    }
    if !is_valid_manifest_id(&manifest.id) {
        return Err("资源包 id 只能包含英文、数字、下划线和短横线".to_string());
    }
    if manifest.name.trim().is_empty() {
        return Err("资源包名称不能为空".to_string());
    }
    validate_manifest_sizes(manifest)?;
    if manifest.motions.is_empty() {
        return Err("v3 资源包至少需要一个 motion".to_string());
    }
    let default_motion = manifest
        .default_motion
        .as_deref()
        .ok_or_else(|| "缺少 defaultMotion".to_string())?;
    if !manifest.motions.contains_key(default_motion) {
        return Err("defaultMotion 必须指向已存在的 motion".to_string());
    }
    for (motion_id, motion) in &manifest.motions {
        validate_motion_manifest(motion_id, motion)?;
    }
    Ok(())
}
```

Move the base/frame size checks into:

```rust
fn validate_manifest_sizes(manifest: &PetPackageManifest) -> Result<(), String> {
    if manifest.base_size.width < MIN_MANIFEST_DIMENSION
        || manifest.base_size.height < MIN_MANIFEST_DIMENSION
    {
        return Err("baseSize 太小".to_string());
    }
    if manifest.base_size.width > MAX_MANIFEST_DIMENSION
        || manifest.base_size.height > MAX_MANIFEST_DIMENSION
    {
        return Err("baseSize 太大".to_string());
    }
    if manifest.frame_size.width < MIN_MANIFEST_DIMENSION
        || manifest.frame_size.height < MIN_MANIFEST_DIMENSION
    {
        return Err("frameSize 太小".to_string());
    }
    if manifest.frame_size.width > MAX_MANIFEST_DIMENSION
        || manifest.frame_size.height > MAX_MANIFEST_DIMENSION
    {
        return Err("frameSize 太大".to_string());
    }
    Ok(())
}
```

Implement:

```rust
fn validate_motion_manifest(motion_id: &str, motion: &PackageMotion) -> Result<(), String> {
    if !is_valid_manifest_id(motion_id) {
        return Err(format!("motion id 非法: {motion_id}"));
    }
    if !(1.0..=12.0).contains(&motion.fps) {
        return Err(format!("motion 帧率必须在 1 到 12 fps: {motion_id}"));
    }
    if motion.frame_count < 1 || motion.frame_count > 60 {
        return Err(format!("motion 帧数量必须在 1 到 60: {motion_id}"));
    }
    if motion.duration_ms < 3000 || motion.duration_ms > 12000 {
        return Err(format!("motion 时长必须在 3000 到 12000ms: {motion_id}"));
    }
    if motion.frames != format!("motions/{motion_id}/") {
        return Err(format!("motion 帧目录无效: {motion_id}"));
    }
    if motion.weight <= 0.0 {
        return Err(format!("motion 权重必须大于 0: {motion_id}"));
    }
    if motion.tags.iter().all(|tag| tag.trim().is_empty()) {
        return Err(format!("motion 至少需要一个有效标签: {motion_id}"));
    }
    let _ = motion.loop_value;
    Ok(())
}
```

- [ ] **Step 6: Validate v3 frames**

Change `validate_required_frames`:

```rust
fn validate_required_frames<R: Read + std::io::Seek>(
    archive: &mut ZipArchive<R>,
    manifest: &PetPackageManifest,
) -> Result<(), String> {
    validate_preview_png(archive)?;
    if manifest.format_version == 3 {
        return validate_v3_motion_frames(archive, manifest);
    }
    validate_v2_action_frames(archive)
}
```

Update caller:

```rust
validate_required_frames(&mut archive, &manifest)?;
```

Implement:

```rust
fn validate_v3_motion_frames<R: Read + std::io::Seek>(
    archive: &mut ZipArchive<R>,
    manifest: &PetPackageManifest,
) -> Result<(), String> {
    for (motion_id, motion) in &manifest.motions {
        for frame_index in 1..=motion.frame_count {
            let frame_path = format!("motions/{motion_id}/{frame_index:04}.png");
            let mut file = archive
                .by_name(&frame_path)
                .map_err(|_| format!("缺少帧文件: {frame_path}"))?;
            validate_png_file(&mut file, &frame_path)?;
        }
    }
    Ok(())
}
```

Update allowed archive paths so `motions/<motionId>/<frame>.png` is allowed for v3. Keep v2 `frames/<action>/<frame>.png` allowed for compatibility.

- [ ] **Step 7: Populate motion summaries**

In `read_package_summary`, build `motion_frame_paths`:

```rust
let motion_frame_paths = if manifest.format_version == 3 {
    read_motion_frame_paths(package_dir, &manifest)
} else {
    build_motion_frame_paths_from_v2_actions(package_dir)
};
```

For v2 compatibility, convert each required action to a motion with the same id.

For v3:

```rust
fn read_motion_frame_paths(
    package_dir: &Path,
    manifest: &PetPackageManifest,
) -> BTreeMap<String, Vec<String>> {
    let mut paths = BTreeMap::new();
    for (motion_id, motion) in &manifest.motions {
        let frames = (1..=motion.frame_count)
            .map(|index| {
                package_dir
                    .join(format!("motions/{motion_id}/{index:04}.png"))
                    .to_string_lossy()
                    .to_string()
            })
            .collect();
        paths.insert(motion_id.clone(), frames);
    }
    paths
}
```

- [ ] **Step 8: Run Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml pet_packages -- --nocapture`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/pet_packages.rs
git commit -m "feat: import v3 motion pool pet packages"
```

---

### Task 3: Normalize v2 and v3 Packages into Runtime Motions

**Files:**
- Modify: `src/assets/petPackageRegistry.ts`
- Modify: `src/assets/petPackageRegistry.test.ts`
- Modify: `src/assets/builtInPetManifest.ts` only if type exports need to move.

**Interfaces:**
- Consumes: `ImportedPetPackageSummary.motionFramePaths`, `motions`, `defaultMotion`.
- Produces:
  - `ResolvedPetMotion`
  - `ResolvedPetPackage.motions`
  - `ResolvedPetPackage.defaultMotionId`
  - `getDefaultPetMotion(package): ResolvedPetMotion`
  - v2 actions converted into runtime motions.

- [ ] **Step 1: Write failing registry tests for v3 imported packages**

Add this test to `src/assets/petPackageRegistry.test.ts`:

```ts
it("builds a v3 imported motion-pool package with one motion", () => {
  const packages = buildPetPackageRegistry(
    [
      {
        id: "imported:moon-buddy",
        manifestId: "moon-buddy",
        name: "月亮小人",
        formatVersion: 3,
        renderer: "motion-pool",
        baseSize: { width: 256, height: 320 },
        frameSize: { width: 768, height: 960 },
        previewPath: "C:/pets/moon/preview.png",
        defaultMotion: "motion-001",
        motions: {
          "motion-001": {
            fps: 5,
            loop: true,
            frameCount: 2,
            durationMs: 6000,
            frames: "motions/motion-001/",
            weight: 1,
            tags: ["idle"],
          },
        },
        motionFramePaths: {
          "motion-001": [
            "C:/pets/moon/motions/motion-001/0001.png",
            "C:/pets/moon/motions/motion-001/0002.png",
          ],
        },
        actions: {} as ImportedPetPackageSummary["actions"],
        scenes: {},
        framePaths: {} as ImportedPetPackageSummary["framePaths"],
      },
    ],
    (path) => `asset://${path}`,
  );

  const resolved = packages.find((pkg) => pkg.id === "imported:moon-buddy");

  expect(resolved?.defaultMotionId).toBe("motion-001");
  expect(resolved?.motions["motion-001"].frames).toEqual([
    "asset://C:/pets/moon/motions/motion-001/0001.png",
    "asset://C:/pets/moon/motions/motion-001/0002.png",
  ]);
});
```

- [ ] **Step 2: Write failing registry tests for v2 compatibility**

Add:

```ts
it("exposes built-in v2 actions as runtime motions", () => {
  const packages = buildPetPackageRegistry([], (path) => `asset://${path}`);
  const builtIn = packages[0];

  expect(builtIn.defaultMotionId).toBe("idle-breathe");
  expect(builtIn.motions["idle-breathe"].frames.length).toBeGreaterThan(0);
  expect(builtIn.motions["act-typing"].tags).toContain("legacy-action");
});
```

- [ ] **Step 3: Run tests to verify failure**

Run: `pnpm vitest run src/assets/petPackageRegistry.test.ts`

Expected: FAIL because runtime motion fields are missing.

- [ ] **Step 4: Add runtime motion types**

In `src/assets/petPackageRegistry.ts`:

```ts
export interface ResolvedPetMotion {
  id: string;
  fps: number;
  loop: boolean;
  frameCount: number;
  durationMs: number;
  frames: string[];
  weight: number;
  tags: readonly string[];
}
```

Extend `ResolvedPetPackage`:

```ts
defaultMotionId: string;
motions: Record<string, ResolvedPetMotion>;
```

Keep `actions` and `scenes` during this transition so existing code compiles while later tasks move rendering off fixed actions.

- [ ] **Step 5: Convert v2 built-in actions to motions**

Add:

```ts
function buildMotionsFromActions(
  actions: Record<PetActionName, PetActionDefinition>,
): Record<string, ResolvedPetMotion> {
  return Object.fromEntries(
    Object.entries(actions).map(([actionId, action]) => [
      actionId,
      {
        id: actionId,
        fps: action.fps,
        loop: action.loop,
        frameCount: action.frameCount,
        durationMs: action.durationMs,
        frames: action.frames,
        weight: actionId.startsWith("idle-") ? 2 : 1,
        tags: ["idle", "legacy-action", actionId],
      },
    ]),
  );
}
```

In `buildBuiltInPackage`, create `actions` first, then derive `motions`:

```ts
const actions = buildActionRecord((action) => {
  const actionDefinition = getActionDefinition(action);

  return {
    ...actionDefinition,
    frames: actionDefinition.frames.flatMap((framePath) => {
      const url = getBuiltInFrameAssetUrl(framePath);

      return url ? [url] : [];
    }),
  };
});

return {
  id: BUILT_IN_PET_PACKAGE_ID,
  name: builtInPetManifest.name,
  baseSize: builtInPetManifest.baseSize,
  frameSize: builtInPetManifest.frameSize,
  previewUrl: null,
  source: "built-in",
  scenes: builtInPetManifest.scenes,
  defaultMotionId: "idle-breathe",
  motions: buildMotionsFromActions(actions),
  actions,
};
```

- [ ] **Step 6: Build v3 imported motions**

In `buildImportedPackage`, branch:

```ts
if (pkg.formatVersion === 3 && pkg.renderer === "motion-pool") {
  return buildImportedMotionPoolPackage(pkg, convertFileSrc);
}
```

Implement:

```ts
function buildImportedMotionPoolPackage(
  pkg: ImportedPetPackageSummary,
  convertFileSrc: (path: string) => string,
): ResolvedPetPackage | null {
  if (!pkg.defaultMotion || !pkg.motions || !pkg.motionFramePaths) {
    return null;
  }

  const motions: Record<string, ResolvedPetMotion> = {};

  for (const [motionId, motion] of Object.entries(pkg.motions)) {
    const frames = pkg.motionFramePaths[motionId];
    if (!frames || frames.length !== motion.frameCount) {
      return null;
    }
    motions[motionId] = {
      id: motionId,
      fps: motion.fps,
      loop: motion.loop,
      frameCount: motion.frameCount,
      durationMs: motion.durationMs,
      frames: frames.map((framePath) =>
        convertFileSrc(normalizeImportedAssetPath(framePath)),
      ),
      weight: motion.weight,
      tags: motion.tags,
    };
  }

  if (!motions[pkg.defaultMotion]) {
    return null;
  }

  return {
    id: pkg.id,
    name: pkg.name,
    baseSize: pkg.baseSize,
    frameSize: pkg.frameSize,
    previewUrl: convertFileSrc(normalizeImportedAssetPath(pkg.previewPath)),
    source: "imported",
    defaultMotionId: pkg.defaultMotion,
    motions,
    actions: buildActionFallbackFromDefaultMotion(motions[pkg.defaultMotion]),
    scenes: {},
  };
}
```

Implement `buildActionFallbackFromDefaultMotion` by mapping all `REQUIRED_PET_ACTIONS` to an action definition built from the default motion. This keeps older components safe until Task 4 removes render dependence on `actions`.

- [ ] **Step 7: Run tests**

Run: `pnpm vitest run src/assets/petPackageRegistry.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/assets/petPackageRegistry.ts src/assets/petPackageRegistry.test.ts
git commit -m "feat: normalize pet packages into motion pools"
```

---

### Task 4: Render Motion Pools and Add Idle Motion Director

**Files:**
- Create: `src/pet-core/motionPoolDirector.ts`
- Create: `src/pet-core/motionPoolDirector.test.ts`
- Modify: `src/renderer/FramePetStage.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

**Interfaces:**
- Consumes: `ResolvedPetPackage.motions`, `defaultMotionId`.
- Produces:
  - `selectNextPetMotion(options): string`
  - `selectMotionForTag(options): string | null`
  - `FramePetStage` prop `motion`.

- [ ] **Step 1: Write failing director tests**

Create `src/pet-core/motionPoolDirector.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  selectMotionForTag,
  selectNextPetMotion,
} from "./motionPoolDirector";
import type { ResolvedPetMotion } from "../assets/petPackageRegistry";

const motions: Record<string, ResolvedPetMotion> = {
  calm: motion("calm", 1, ["idle"]),
  wave: motion("wave", 4, ["idle", "message"]),
};

describe("motionPoolDirector", () => {
  it("returns the default motion when it is the only available motion", () => {
    expect(
      selectNextPetMotion({
        motions: { calm: motions.calm },
        defaultMotionId: "calm",
        history: [],
        random: () => 0.99,
      }),
    ).toBe("calm");
  });

  it("avoids repeating the immediately previous motion when alternatives exist", () => {
    expect(
      selectNextPetMotion({
        motions,
        defaultMotionId: "calm",
        history: ["calm"],
        random: () => 0,
      }),
    ).toBe("wave");
  });

  it("selects a motion by tag and falls back to null when no tag matches", () => {
    expect(selectMotionForTag(motions, "message", () => 0)).toBe("wave");
    expect(selectMotionForTag(motions, "comfort", () => 0)).toBeNull();
  });
});

function motion(
  id: string,
  weight: number,
  tags: string[],
): ResolvedPetMotion {
  return {
    id,
    fps: 5,
    loop: true,
    frameCount: 2,
    durationMs: 6000,
    frames: [`${id}-1.png`, `${id}-2.png`],
    weight,
    tags,
  };
}
```

- [ ] **Step 2: Run director tests to verify failure**

Run: `pnpm vitest run src/pet-core/motionPoolDirector.test.ts`

Expected: FAIL because the file does not exist.

- [ ] **Step 3: Implement director helpers**

Create `src/pet-core/motionPoolDirector.ts`:

```ts
import type { ResolvedPetMotion } from "../assets/petPackageRegistry";

interface SelectNextPetMotionOptions {
  motions: Record<string, ResolvedPetMotion>;
  defaultMotionId: string;
  history: readonly string[];
  random?: () => number;
}

export function selectNextPetMotion({
  motions,
  defaultMotionId,
  history,
  random = Math.random,
}: SelectNextPetMotionOptions): string {
  const entries = Object.values(motions).filter((motion) => motion.frames.length > 0);
  if (entries.length === 0) {
    return defaultMotionId;
  }
  const lastMotion = history.at(-1);
  const candidates =
    entries.length > 1
      ? entries.filter((motion) => motion.id !== lastMotion)
      : entries;
  return selectWeightedMotion(candidates, random)?.id ?? defaultMotionId;
}

export function selectMotionForTag(
  motions: Record<string, ResolvedPetMotion>,
  tag: string,
  random: () => number = Math.random,
): string | null {
  const candidates = Object.values(motions).filter(
    (motion) => motion.tags.includes(tag) && motion.frames.length > 0,
  );
  return selectWeightedMotion(candidates, random)?.id ?? null;
}

function selectWeightedMotion(
  motions: readonly ResolvedPetMotion[],
  random: () => number,
): ResolvedPetMotion | null {
  if (motions.length === 0) {
    return null;
  }
  const totalWeight = motions.reduce(
    (sum, motion) => sum + Math.max(0, motion.weight),
    0,
  );
  if (totalWeight <= 0) {
    return motions[0];
  }
  let cursor = random() * totalWeight;
  for (const motion of motions) {
    cursor -= Math.max(0, motion.weight);
    if (cursor <= 0) {
      return motion;
    }
  }
  return motions[motions.length - 1];
}
```

- [ ] **Step 4: Run director tests**

Run: `pnpm vitest run src/pet-core/motionPoolDirector.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing renderer/App tests for a one-motion package**

In `src/app/App.test.tsx`, add a package summary with `formatVersion: 3`, one motion, and no fixed action frames. Test:

```ts
it("renders an imported v3 package that only has one motion", async () => {
  windowCommandsMock.readSettings.mockResolvedValueOnce({
    appearance: {
      selectedPetPackageId: "imported:moon-buddy",
      peerPetPackageByDeviceId: {},
    },
  });
  petPackageCommandsMock.listPetPackages.mockResolvedValueOnce([
    importedV3MotionPoolPackage(),
  ]);

  render(<App />);

  const petImage = await screen.findByRole("img", { name: "月亮小人" });
  expect(petImage).toHaveAttribute(
    "src",
    expect.stringContaining("motions/motion-001/0001.png"),
  );
});
```

Add helper `importedV3MotionPoolPackage()` near existing package helpers.

- [ ] **Step 6: Run App test to verify failure**

Run: `pnpm vitest run src/app/App.test.tsx --testNamePattern "renders an imported v3 package"`

Expected: FAIL because `FramePetStage` still renders by fixed `PetActionName`.

- [ ] **Step 7: Update FramePetStage to render a motion**

Change props:

```ts
import type { ResolvedPetMotion, ResolvedPetPackage } from "../assets/petPackageRegistry";

interface FramePetStageProps {
  motion: ResolvedPetMotion;
  scale: number;
  petPackage: ResolvedPetPackage;
  edgePeekSide?: EdgePeekSide | null;
  edgePeekImageUrl?: string | null;
  onPetClick(): void;
  onDragStart(): void;
  onDragEnd(): void;
}
```

Replace:

```ts
const actionDefinition = petPackage.actions[action];
```

with:

```ts
const actionDefinition = motion;
```

Change reset effect:

```ts
useEffect(() => {
  setElapsedMs(0);
}, [motion.id, petPackage.id]);
```

Set data attribute:

```tsx
data-motion-id={motion.id}
```

Use fallback label:

```tsx
<p>{motion.id}</p>
```

- [ ] **Step 8: Add active motion state to App**

In `App.tsx`, add:

```ts
const [activeMotionId, setActiveMotionId] = useState<string | null>(null);
const [motionHistory, setMotionHistory] = useState<string[]>([]);
const activeMotion =
  selectedPetPackage.motions[
    activeMotionId ?? selectedPetPackage.defaultMotionId
  ] ??
  selectedPetPackage.motions[selectedPetPackage.defaultMotionId] ??
  Object.values(selectedPetPackage.motions)[0];
```

When `selectedPetPackage.id` changes:

```ts
useEffect(() => {
  setActiveMotionId(selectedPetPackage.defaultMotionId);
  setMotionHistory([selectedPetPackage.defaultMotionId]);
}, [selectedPetPackage.id, selectedPetPackage.defaultMotionId]);
```

When idle animation completes, select next motion:

```ts
const nextMotionId = selectNextPetMotion({
  motions: selectedPetPackage.motions,
  defaultMotionId: selectedPetPackage.defaultMotionId,
  history: motionHistory,
});
setActiveMotionId(nextMotionId);
setMotionHistory((current) => [...current.slice(-5), nextMotionId]);
```

Keep existing `petState.action` transitions for behavior and auto-move timing, but pass `activeMotion` into `FramePetStage`.

- [ ] **Step 9: Run App and renderer tests**

Run: `pnpm vitest run src/app/App.test.tsx src/pet-core/motionPoolDirector.test.ts`

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/pet-core/motionPoolDirector.ts src/pet-core/motionPoolDirector.test.ts src/renderer/FramePetStage.tsx src/app/App.tsx src/app/App.test.tsx
git commit -m "feat: render desktop pet motions from motion pools"
```

---

### Task 5: Convert the Radial Menu to Six Function Buttons and Reuse Typing for Messages

**Files:**
- Modify: `src/assets/builtInPetManifest.ts`
- Modify: `src/assets/builtInPetManifest.test.ts`
- Modify: `src/interaction/InteractionMenu.tsx`
- Modify: `src/interaction/InteractionMenu.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

**Interfaces:**
- Consumes: existing six action ids.
- Produces:
  - `interactionOptions` contains exactly six entries.
  - `act-typing` opens message composer.
  - No `SEND_MESSAGE_INTERACTION_ID` menu entry.

- [ ] **Step 1: Write failing tests for six menu items**

Update `src/assets/builtInPetManifest.test.ts`:

```ts
it("defines exactly six radial function buttons", () => {
  expect(interactionOptions.map((option) => option.id)).toEqual([
    "act-cute",
    "act-typing",
    "act-wave",
    "act-hug",
    "act-pout",
    "act-drowsy",
  ]);
});
```

Remove tests that expect `SEND_MESSAGE_INTERACTION_ID` inside `interactionOptions`.

Update `src/interaction/InteractionMenu.test.tsx`:

```ts
it("renders six function buttons without a separate send-message item", () => {
  render(
    <InteractionMenu
      open
      x={160}
      y={180}
      options={interactionOptions}
      onSelect={vi.fn()}
    />,
  );

  expect(screen.getAllByRole("menuitem")).toHaveLength(6);
  expect(screen.queryByRole("menuitem", { name: "发消息" })).toBeNull();
  expect(screen.getByRole("menuitem", { name: "敲电脑" })).toBeTruthy();
});
```

- [ ] **Step 2: Write failing App test for typing button opening composer**

In `src/app/App.test.tsx`, update the existing message composer test:

```ts
it("opens the message composer from the typing button when the peer is online", async () => {
  realtimeSyncMock.state.status = "connected";
  realtimeSyncMock.state.peerPresence = "online";
  windowCommandsMock.readSettings.mockResolvedValueOnce({
    sync: {
      enabled: true,
      relayUrl: "http://159.75.175.47:8787",
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId: "pair_1",
      peerDeviceId: "dev_b",
    },
  });
  render(<App />);

  fireEvent.click(await screen.findByRole("img", { name: "Q 版小人" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "敲电脑" }));

  expect(windowCommandsMock.openMessageComposerSurface).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("region", { name: "发送消息" })).toBeTruthy();
});
```

Add:

```ts
it("does not render a separate send message menu item", async () => {
  render(<App />);

  fireEvent.click(await screen.findByRole("img", { name: "Q 版小人" }));

  expect(screen.queryByRole("menuitem", { name: "发消息" })).toBeNull();
  expect(screen.getAllByRole("menuitem")).toHaveLength(6);
});
```

- [ ] **Step 3: Run focused tests to verify failure**

Run:

```bash
pnpm vitest run src/assets/builtInPetManifest.test.ts src/interaction/InteractionMenu.test.tsx src/app/App.test.tsx
```

Expected: FAIL because the seventh send-message item still exists and `act-typing` still triggers animation.

- [ ] **Step 4: Remove the seventh menu item**

In `src/assets/builtInPetManifest.ts`, remove:

```ts
export const SEND_MESSAGE_INTERACTION_ID = "send-message" as const;
export type InteractionCommandName = typeof SEND_MESSAGE_INTERACTION_ID;
```

Remove the `send-message` object from `interactionOptions`.

Change `PetInteractionOption` so `id` is only the six original `InteractionActionName` values. Keep labels unchanged.

- [ ] **Step 5: Update InteractionMenu types and icons**

In `src/interaction/InteractionMenu.tsx`, remove `SEND_MESSAGE_INTERACTION_ID` imports and option icon mapping for send-message.

Keep the `act-typing` icon as the visible entry that users click to send a message.

- [ ] **Step 6: Route act-typing to message composer in App**

In `App.tsx`, change `handleInteractionSelect`:

```ts
if (selection === "act-typing") {
  const sendable =
    settingsRef.current.sync.enabled &&
    Boolean(settingsRef.current.sync.pairId) &&
    realtime.state.status === "connected" &&
    realtime.state.peerPresence === "online";

  if (!sendable) {
    setBubble(showBubble("对方在线后再发消息吧。", { durationMs: 5000 }));
    return;
  }

  runDesktopCommand(openMessageComposerSurface);
  setBubble(hideBubble(bubble));
  setMessageComposerOpen(true);
  return;
}
```

For other buttons:

```ts
setBubble(showBubble("功能开发中，先陪你待一会儿。", { durationMs: 4000 }));
const nextMotionId = selectNextPetMotion({
  motions: selectedPetPackage.motions,
  defaultMotionId: selectedPetPackage.defaultMotionId,
  history: motionHistory,
});
setActiveMotionId(nextMotionId);
setMotionHistory((current) => [...current.slice(-5), nextMotionId]);
```

Do not call `resolveMotionScene(selectedPetPackage.scenes[selection], ...)` for non-message buttons in this task.

- [ ] **Step 7: Run focused tests**

Run:

```bash
pnpm vitest run src/assets/builtInPetManifest.test.ts src/interaction/InteractionMenu.test.tsx src/app/App.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/assets/builtInPetManifest.ts src/assets/builtInPetManifest.test.ts src/interaction/InteractionMenu.tsx src/interaction/InteractionMenu.test.tsx src/app/App.tsx src/app/App.test.tsx
git commit -m "feat: reuse typing radial button for messages"
```

---

### Task 6: Make Remote Message Rendering Independent of act-wave

**Files:**
- Modify: `src/sync/RemoteMessageLayer.tsx`
- Modify: `src/sync/RemoteMessageLayer.test.tsx`

**Interfaces:**
- Consumes: `ResolvedPetPackage.motions`, `defaultMotionId`.
- Produces: remote visitor image chooses `message` tag motion, then default motion, then preview.

- [ ] **Step 1: Write failing remote message test for a v3 one-motion peer package**

Add to `src/sync/RemoteMessageLayer.test.tsx`:

```ts
it("renders a peer v3 default motion when act-wave is unavailable", () => {
  render(
    <RemoteMessageLayer
      message={{
        id: "msg_1",
        fromDeviceId: "dev_b",
        text: "想你啦",
        at: "2026-08-05T10:00:00.000Z",
        stage: "visible",
        acknowledged: false,
      }}
      peerPackage={{
        id: "imported:moon-buddy",
        name: "月亮小人",
        source: "imported",
        baseSize: { width: 256, height: 320 },
        frameSize: { width: 768, height: 960 },
        previewUrl: "asset://preview.png",
        defaultMotionId: "motion-001",
        motions: {
          "motion-001": {
            id: "motion-001",
            fps: 5,
            loop: true,
            frameCount: 1,
            durationMs: 6000,
            frames: ["asset://motions/motion-001/0001.png"],
            weight: 1,
            tags: ["idle"],
          },
        },
        actions: {} as ResolvedPetPackage["actions"],
        scenes: {},
      }}
      onAcknowledge={vi.fn()}
    />,
  );

  expect(screen.getByAltText("月亮小人来访")).toHaveAttribute(
    "src",
    "asset://motions/motion-001/0001.png",
  );
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm vitest run src/sync/RemoteMessageLayer.test.tsx`

Expected: FAIL because the component still expects `actions["act-wave"]`.

- [ ] **Step 3: Update RemoteMessageLayer motion selection**

Replace action lookup with:

```ts
const visitorMotion =
  resolveRemoteVisitorMotion(peerPackage);
```

Implement local helper:

```ts
function resolveRemoteVisitorMotion(peerPackage: ResolvedPetPackage | null) {
  if (!peerPackage) {
    return null;
  }

  return (
    Object.values(peerPackage.motions).find((motion) =>
      motion.tags.includes("message"),
    ) ??
    peerPackage.motions[peerPackage.defaultMotionId] ??
    Object.values(peerPackage.motions)[0] ??
    null
  );
}
```

Use `visitorMotion.frames`, `visitorMotion.fps`, and `visitorMotion.loop` in frame selection. Fallback image becomes:

```ts
return peerPackage?.previewUrl ?? visitorMotion?.frames[0] ?? null;
```

- [ ] **Step 4: Run remote message tests**

Run: `pnpm vitest run src/sync/RemoteMessageLayer.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sync/RemoteMessageLayer.tsx src/sync/RemoteMessageLayer.test.tsx
git commit -m "feat: render remote messages from motion pools"
```

---

### Task 7: Update Format Documentation and Run Full Verification

**Files:**
- Modify: `docs/pet-resource-pack-format.md`

**Interfaces:**
- Consumes: completed v3 implementation.
- Produces: user-facing v3 resource package instructions.

- [ ] **Step 1: Update resource package docs**

In `docs/pet-resource-pack-format.md`, replace the current v2-first language with:

```md
当前新生成目标为 `formatVersion: 3`。v3 资源包使用 `renderer: "motion-pool"`，最少只需要一个 motion。旧 v2 固定动作资源包在当前客户端中作为过渡兼容输入保留，但不再建议新生成。
```

Add a v3 directory example:

```text
my-pet.cdpet
├─ pet.json
├─ preview.png
└─ motions/
   └─ motion-001/
      ├─ 0001.png
      └─ 0030.png
```

Add the v3 `pet.json` sample from the spec. State that all generated motions are treated as idle/ambient motions and are randomly selected by the client.

- [ ] **Step 2: Run full frontend tests**

Run: `pnpm test`

Expected: PASS with all Vitest files passing.

- [ ] **Step 3: Run frontend typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 4: Run frontend production build**

Run: `pnpm build`

Expected: PASS.

- [ ] **Step 5: Run Rust formatting check**

Run: `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`

Expected: PASS.

- [ ] **Step 6: Run Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: PASS.

- [ ] **Step 7: Build debug exe**

Run: `pnpm tauri build --debug`

Expected: PASS and prints:

```text
Built application at: C:\Users\14567\.codex\worktrees\6515\情侣桌宠\src-tauri\target\debug\couple-desktop-pet.exe
```

- [ ] **Step 8: Confirm no old send-message menu ID remains**

Run:

```bash
rg -n "send-message|SEND_MESSAGE_INTERACTION_ID|发消息" src
```

Expected: no menu option or `SEND_MESSAGE_INTERACTION_ID` references remain. The Chinese text `发送消息` may remain in the composer panel title and tests.

- [ ] **Step 9: Commit**

```bash
git add docs/pet-resource-pack-format.md
git commit -m "docs: document v3 motion pool resource packages"
```

---

## Final Review Checklist

- [ ] The app imports a v3 `.cdpet` with only one motion.
- [ ] The imported v3 package can be selected as the local pet.
- [ ] The pet renders motion frames without fixed action resources.
- [ ] Multiple motions are randomly selected during idle playback.
- [ ] The radial menu has exactly six visible entries.
- [ ] The `act-typing`/敲电脑 entry opens the message composer.
- [ ] No separate send-message radial entry remains.
- [ ] Other radial entries do not require same-name animation resources.
- [ ] Remote messages render a peer package default motion without `act-wave`.
- [ ] v2 built-in and v2 imported packages remain usable through conversion.
- [ ] Invalid v3 packages show clear import errors.
- [ ] `pnpm test` passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm build` passes.
- [ ] `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passes.
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` passes.
- [ ] `pnpm tauri build --debug` passes.

## Execution Notes

Per `AGENTS.md`, implementation should be assigned to the fixed background development task:

```text
019fc0d5-21c1-7a52-b8c5-897829450edb
```

Use model `gpt-5.5` with `xhigh` thinking. The main agent reviews every task commit before continuing.
