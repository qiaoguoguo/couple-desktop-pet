# Two Built-In Pet Packages And Initial Installers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the existing girl and boy characters as the only two built-in pet packages, remove confirmed unused runtime assets, and produce a clean Windows NSIS EXE plus a macOS Universal DMG from one verified commit.

**Architecture:** Keep `builtin:q-girl` as the stable default package and add `builtin:q-boy` as a first-class built-in v3 motion-pool package. Generalize the frontend registry and asset atlas to an explicit two-package allowlist, normalize historical imported IDs during settings load, suppress only duplicate historical imports, and preserve arbitrary user-imported `.cdpet` packages. Remove only assets proven unused by the current static edge renderer or superseded UI.

**Tech Stack:** React 19, TypeScript 7 strict mode, Vite 8, Vitest 4, Tauri 2, Rust, pnpm 11, PowerShell, GitHub Actions macOS runners.

**Spec:** `docs/superpowers/specs/2026-08-20-two-built-in-pet-packages-release-design.md`

## Global Constraints

- Built-in display names are exactly `桃桃` for `builtin:q-girl` and `青禾` for `builtin:q-boy`.
- `builtin:q-girl` remains the default and fallback package ID.
- Qinghe's `preview.png`, 20-frame `motion-001`, and 48-frame `motion-message-pair` must be copied byte-for-byte from `C:\Users\14567\AppData\Roaming\com.couple.desktoppet\pet-packages\q-boy-complete-v3`.
- Do not redraw, regenerate, resize, or recompress either character.
- Keep `.cdpet` import and imported-package deletion behavior.
- Suppress historical `q-girl-complete-v3` and `q-boy-complete-v3` imports in the runtime list without deleting their AppData directories.
- Migrate `builtin:star-sleeper`, `imported:q-girl-complete-v3`, and `imported:q-boy-complete-v3` in both local and peer appearance settings.
- Delete only the runtime assets named in the confirmed spec. Do not delete historical docs, user AppData, unrelated untracked files, or existing build evidence.
- Edge-hidden production rendering remains static; message and surprise edge cards remain clickable.
- The Windows deliverable is a Release NSIS installer EXE, not a debug binary.
- The macOS deliverable is a Universal DMG. Without Apple credentials it must be reported as ad-hoc signed and not notarized.
- Do not commit generated installers, downloaded workflow artifacts, `.tmp`, `.superpowers` QA output, or target directories.

---

## File Map

- `src/assets/petPackageContract.ts`: stable IDs, historical alias normalization, and duplicate-import manifest IDs.
- `src/assets/builtInPetManifest.ts`: Taotao fixed-action manifest and shared built-in motion types.
- `src/assets/builtInBoyManifest.ts`: Qinghe built-in motion-pool manifest.
- `src/assets/pets/q-boy/`: byte-identical Qinghe source package and provenance note.
- `src/renderer/frameAtlas.ts`: explicit Q-girl and Q-boy Vite asset allowlist.
- `src/assets/petPackageRegistry.ts`: constructs two built-ins, then non-shadowed imports.
- `src/settings/settingsStore.ts`: migrates historical local and peer package IDs and persists migrations.
- `src/settings/AppearancePanel.tsx`: Taotao fallback copy; imported-package controls remain.
- `src/app/App.test.tsx`, `src/settings/AppearancePanel.test.tsx`, `e2e/macos/specs/native-parity.e2e.ts`: current display-name and role-switching expectations.
- `src/assets/builtInEdgeCompanion.ts`, `src/pet/edgeInteraction.ts`, `src/renderer/edgeCompanionLayout.ts`: remove obsolete blink fields while preserving static layout.
- `src/assets/builtInEdgeInteraction.ts`: point all dormant phase fields at the one retained static top frame; side and bottom continue to render their idle companion assets.
- `src/assets/runtimeAssetInventory.test.ts`: enforce the two runtime role directories and exact static/obsolete asset inventory.
- `src/assets/README.md`, `src/assets/pets/q-girl/README.md`, `src/assets/pets/q-boy/README.md`: document first-party package provenance and retained assets.

---

### Task 1: Add Qinghe As A True Built-In Motion-Pool Package

**Files:**
- Create: `src/assets/builtInBoyManifest.ts`
- Create: `src/assets/builtInBoyManifest.test.ts`
- Create: `src/assets/pets/q-boy/README.md`
- Create: `src/assets/pets/q-boy/pet.json`
- Create: `src/assets/pets/q-boy/preview.png`
- Create: `src/assets/pets/q-boy/motions/motion-001/0001.png` through `0020.png`
- Create: `src/assets/pets/q-boy/motions/motion-message-pair/0001.png` through `0048.png`
- Modify: `src/assets/petPackageContract.ts`
- Modify: `src/assets/builtInPetManifest.ts`
- Modify: `src/assets/builtInPetManifest.test.ts`
- Modify: `src/renderer/frameAtlas.ts`
- Modify: `src/assets/petPackageRegistry.ts`
- Modify: `src/assets/petPackageRegistry.test.ts`

**Interfaces:**
- Produces: `Q_GIRL_BUILT_IN_PET_PACKAGE_ID = "builtin:q-girl"`.
- Produces: `Q_BOY_BUILT_IN_PET_PACKAGE_ID = "builtin:q-boy"`.
- Preserves: `BUILT_IN_PET_PACKAGE_ID` as an alias of the Q-girl default ID.
- Produces: `BUILT_IN_PET_PACKAGE_IDS` ordered as Q-girl then Q-boy.
- Produces: `builtInBoyManifest` with `defaultMotionId: "motion-001"` and resolved frame arrays.
- Produces: `buildPetPackageRegistry()` whose first two entries are Taotao and Qinghe.
- Consumes: existing `buildActionFallbackFromDefaultMotion()` for Qinghe's legacy action-facing renderer contract.

- [ ] **Step 1: Add failing ID, manifest, and registry tests**

In `src/assets/builtInBoyManifest.test.ts`, assert the exact Qinghe contract and bundled files:

```ts
expect(builtInBoyManifest).toMatchObject({
  id: "builtin:q-boy",
  name: "青禾",
  defaultMotionId: "motion-001",
  baseSize: { width: 256, height: 320 },
  frameSize: { width: 512, height: 640 },
});
expect(builtInBoyManifest.motions["motion-001"].frames).toHaveLength(20);
expect(builtInBoyManifest.motions["motion-message-pair"].frames).toHaveLength(48);
```

Update `src/assets/petPackageRegistry.test.ts` so an empty imported list must begin with:

```ts
expect(packages.slice(0, 2).map(({ id, name }) => ({ id, name }))).toEqual([
  { id: "builtin:q-girl", name: "桃桃" },
  { id: "builtin:q-boy", name: "青禾" },
]);
expect(packages[1].motions["motion-001"].frames).toHaveLength(20);
expect(packages[1].motions["motion-message-pair"].frames).toHaveLength(48);
expect(packages[1].actions["act-cute"].frames).toEqual(
  packages[1].motions["motion-001"].frames,
);
```

- [ ] **Step 2: Run focused tests and verify the new contract fails**

Run:

```powershell
pnpm vitest run src/assets/builtInBoyManifest.test.ts src/assets/builtInPetManifest.test.ts src/assets/petPackageRegistry.test.ts
```

Expected: FAIL because `builtInBoyManifest`, Q-boy constants, Qinghe assets, and the second built-in registry entry do not exist; the Taotao name assertion also still reads `Q 版小人`.

- [ ] **Step 3: Add stable built-in IDs without changing the default**

In `src/assets/petPackageContract.ts`, implement:

```ts
export const Q_GIRL_BUILT_IN_PET_PACKAGE_ID = "builtin:q-girl" as const;
export const Q_BOY_BUILT_IN_PET_PACKAGE_ID = "builtin:q-boy" as const;
export const BUILT_IN_PET_PACKAGE_ID = Q_GIRL_BUILT_IN_PET_PACKAGE_ID;
export const BUILT_IN_PET_PACKAGE_IDS = [
  Q_GIRL_BUILT_IN_PET_PACKAGE_ID,
  Q_BOY_BUILT_IN_PET_PACKAGE_ID,
] as const;
```

Change only `builtInPetManifest.name` to `桃桃`; keep all Q-girl paths, actions, scenes, sizes, and package ID unchanged.

- [ ] **Step 4: Copy Qinghe's package byte-for-byte and verify every copied hash**

Create `src/assets/pets/q-boy`, copy `pet.json`, `preview.png`, and both motion directories from the fixed source. Use one PowerShell filesystem implementation end-to-end:

```powershell
$source = 'C:\Users\14567\AppData\Roaming\com.couple.desktoppet\pet-packages\q-boy-complete-v3'
$target = (Join-Path (Resolve-Path 'src/assets/pets').Path 'q-boy')
New-Item -ItemType Directory -Path $target -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $source 'pet.json') -Destination $target
Copy-Item -LiteralPath (Join-Path $source 'preview.png') -Destination $target
Copy-Item -LiteralPath (Join-Path $source 'motions') -Destination $target -Recurse
```

Compare relative path, byte count, and SHA-256 for all 70 source files. Expected result: `Missing=0`, `Extra=0`, `HashMismatch=0`.

- [ ] **Step 5: Define the Qinghe built-in manifest**

In `src/assets/builtInBoyManifest.ts`, define a focused built-in motion-pool type using `PetMotionDefinition`, then construct paths with four-digit filenames:

```ts
const motionFrames = (motionId: string, frameCount: number) =>
  Array.from({ length: frameCount }, (_, index) =>
    `pets/q-boy/motions/${motionId}/${String(index + 1).padStart(4, "0")}.png`,
  );

export const builtInBoyManifest = {
  id: Q_BOY_BUILT_IN_PET_PACKAGE_ID,
  name: "青禾",
  preview: "pets/q-boy/preview.png",
  portrait: "pets/q-boy/preview.png",
  offlinePortrait: "pets/q-boy/preview.png",
  baseSize: { width: 256, height: 320 },
  frameSize: { width: 512, height: 640 },
  defaultMotionId: "motion-001",
  motions: {
    "motion-001": {
      fps: 5,
      loop: true,
      frameCount: 20,
      durationMs: 6000,
      frames: motionFrames("motion-001", 20),
      weight: 2,
      tags: ["idle", "ambient"],
    },
    "motion-message-pair": {
      fps: 8,
      loop: true,
      frameCount: 48,
      durationMs: 6000,
      frames: motionFrames("motion-message-pair", 48),
      weight: 1,
      tags: ["message", "pair", "interaction"],
    },
  },
  scenes: {},
} as const satisfies BuiltInMotionPoolManifest;
```

- [ ] **Step 6: Generalize the atlas and registry**

Change `src/renderer/frameAtlas.ts` to one explicit Vite glob array for `q-girl/**/*.png` and `q-boy/**/*.png`; do not glob `pets/**/*.png`. Both `getBuiltInPetAssetUrl()` and `getBuiltInFrameAssetUrl()` must resolve from that allowlisted map.

In `src/assets/petPackageRegistry.ts`, rename the existing builder to `buildBuiltInGirlPackage()`, add `buildBuiltInBoyPackage()`, and return both before imports. Qinghe's builder resolves each manifest frame through `getBuiltInFrameAssetUrl`, rejects no declared frame silently in tests, creates fallback actions from its default motion, and uses empty scenes.

- [ ] **Step 7: Document Qinghe provenance**

In `src/assets/pets/q-boy/README.md`, record that the files are first-party project assets copied byte-for-byte from manifest `q-boy-complete-v3` on 2026-08-20, list the two retained motions and frame counts, and state that no third-party character or brand asset is included.

- [ ] **Step 8: Run focused tests until green**

```powershell
pnpm vitest run src/assets/builtInBoyManifest.test.ts src/assets/builtInPetManifest.test.ts src/assets/petPackageRegistry.test.ts src/renderer/frameAtlas.test.ts
```

If `src/renderer/frameAtlas.test.ts` does not exist, omit only that path and rely on both manifest tests' `import.meta.glob` assertions. Expected: PASS; both built-ins resolve real PNG URLs.

- [ ] **Step 9: Commit Task 1**

```powershell
git add -- src/assets/petPackageContract.ts src/assets/builtInPetManifest.ts src/assets/builtInPetManifest.test.ts src/assets/builtInBoyManifest.ts src/assets/builtInBoyManifest.test.ts src/assets/pets/q-boy src/renderer/frameAtlas.ts src/assets/petPackageRegistry.ts src/assets/petPackageRegistry.test.ts
git commit -m "feat: add Taotao and Qinghe built-in pets"
```

---

### Task 2: Migrate Historical IDs And Suppress Duplicate Imports

**Files:**
- Modify: `src/assets/petPackageContract.ts`
- Modify: `src/assets/petPackageContract.test.ts`
- Modify: `src/assets/petPackageRegistry.ts`
- Modify: `src/assets/petPackageRegistry.test.ts`
- Modify: `src/settings/settingsStore.ts`
- Modify: `src/settings/settingsStore.test.ts`

**Interfaces:**
- Produces: `normalizeBuiltInPetPackageId(id: string): string`.
- Produces: `isShadowedBuiltInImportManifestId(manifestId: string): boolean`.
- Consumes: those functions from settings and registry; no AppData deletion command is introduced.
- Preserves: unknown imported IDs and arbitrary custom manifests unchanged.

- [ ] **Step 1: Add failing alias and persistence tests**

In `src/assets/petPackageContract.test.ts`, assert:

```ts
expect(normalizeBuiltInPetPackageId("builtin:star-sleeper")).toBe("builtin:q-girl");
expect(normalizeBuiltInPetPackageId("imported:q-girl-complete-v3")).toBe("builtin:q-girl");
expect(normalizeBuiltInPetPackageId("imported:q-boy-complete-v3")).toBe("builtin:q-boy");
expect(normalizeBuiltInPetPackageId("imported:q-photo-chibi")).toBe("imported:q-photo-chibi");
```

In `src/settings/settingsStore.test.ts`, cover both selected and peer IDs in one persisted input, spy on `writeSettings`, and require exactly one normalized write after `loadSettings()`.

In `src/assets/petPackageRegistry.test.ts`, pass summaries for `q-girl-complete-v3`, `q-boy-complete-v3`, and `q-photo-chibi`; require only the custom package to remain after the two built-ins.

- [ ] **Step 2: Run tests and verify failures**

```powershell
pnpm vitest run src/assets/petPackageContract.test.ts src/assets/petPackageRegistry.test.ts src/settings/settingsStore.test.ts
```

Expected: FAIL because the two normalization helpers do not exist, historical imported IDs remain unchanged, duplicate imports remain visible, and appearance-only migration is not persisted.

- [ ] **Step 3: Implement one alias source of truth**

In `src/assets/petPackageContract.ts`, define:

```ts
const BUILT_IN_PET_PACKAGE_ID_ALIASES: Readonly<Record<string, string>> = {
  "builtin:star-sleeper": Q_GIRL_BUILT_IN_PET_PACKAGE_ID,
  "imported:q-girl-complete-v3": Q_GIRL_BUILT_IN_PET_PACKAGE_ID,
  "imported:q-boy-complete-v3": Q_BOY_BUILT_IN_PET_PACKAGE_ID,
};

export const SHADOWED_BUILT_IN_IMPORT_MANIFEST_IDS = [
  "q-girl-complete-v3",
  "q-boy-complete-v3",
] as const;

export function normalizeBuiltInPetPackageId(id: string): string {
  return BUILT_IN_PET_PACKAGE_ID_ALIASES[id] ?? id;
}
```

Implement `isShadowedBuiltInImportManifestId()` with an exact equality check against the two constants, not substring matching.

- [ ] **Step 4: Apply normalization to settings and persist it**

Replace the private star-sleeper-only logic in `settingsStore.ts` with `normalizeBuiltInPetPackageId()` for the selected package and every valid peer mapping value.

Add `hasAppearancePetPackageMigration(storedSettings)` that returns true only when a stored string package ID differs from its normalized value. Change the existing persistence gate to:

```ts
if (
  shouldPersistRelayMigration(storedSettings) ||
  hasAppearancePetPackageMigration(storedSettings)
) {
  await api.writeSettings(settings).catch(() => undefined);
}
```

The migrated in-memory settings must still be returned when the write rejects.

- [ ] **Step 5: Filter duplicate historical imports in the registry**

Before `flatMap(buildImportedPackage)`, filter imported summaries with `!isShadowedBuiltInImportManifestId(pkg.manifestId)`. Do not filter `q-photo-chibi` or any other custom manifest.

- [ ] **Step 6: Run focused tests until green**

```powershell
pnpm vitest run src/assets/petPackageContract.test.ts src/assets/petPackageRegistry.test.ts src/settings/settingsStore.test.ts
```

Expected: PASS, including a rejected migration write returning normalized in-memory settings.

- [ ] **Step 7: Commit Task 2**

```powershell
git add -- src/assets/petPackageContract.ts src/assets/petPackageContract.test.ts src/assets/petPackageRegistry.ts src/assets/petPackageRegistry.test.ts src/settings/settingsStore.ts src/settings/settingsStore.test.ts
git commit -m "fix: migrate historical pet package ids"
```

---

### Task 3: Verify Role Names, Selection, And Existing Interactions

**Files:**
- Modify: `src/settings/AppearancePanel.tsx`
- Modify: `src/settings/AppearancePanel.test.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/renderer/FramePetStage.test.tsx`
- Modify: `e2e/macos/specs/native-parity.e2e.ts`
- Modify only where current product assertions require it: additional `src/**/*.test.tsx` files containing the old `Q 版小人` accessible name

**Interfaces:**
- Consumes: ordered two-built-in registry from Task 1.
- Produces: settings UI that renders `桃桃` and `青禾` and keeps import/delete controls.
- Preserves: current-package selection, peer-package selection, remote message motion selection, and fallback rendering.

- [ ] **Step 1: Add failing appearance and App integration tests**

Update `AppearancePanel.test.tsx` with two built-in fixtures and one custom imported fixture. Assert both selectors contain Taotao and Qinghe, the custom package remains visible, and only the imported package is deletable.

Add or update an App test that starts with no imported packages, opens settings, selects `builtin:q-boy`, and asserts:

```ts
expect(screen.getByRole("img", { name: "青禾" })).toBeTruthy();
expect(screen.getByRole("option", { name: "桃桃" })).toBeTruthy();
expect(screen.getByRole("option", { name: "青禾" })).toBeTruthy();
```

With Qinghe selected as the current pet, project an existing remote-message event and assert the current pet resolves `motion-message-pair` with a frame URL containing `pets/q-boy/motions/motion-message-pair/`. Separately keep Taotao as the current pet, select Qinghe for the peer, and assert the peer mapping persists as `builtin:q-boy` and the peer status identity uses Qinghe's q-boy preview; peer selection must not drive the current pet's message motion.

- [ ] **Step 2: Run focused UI tests and confirm stale names fail**

```powershell
pnpm vitest run src/settings/AppearancePanel.test.tsx src/renderer/FramePetStage.test.tsx src/app/App.test.tsx
```

Expected: FAIL where current fallbacks and accessible-name expectations still use `Q 版小人`, and where tests assume a single built-in package.

- [ ] **Step 3: Update current product copy and test helpers**

Change the `AppearancePanel` fallback from `Q 版小人` to `桃桃`. Update current runtime test fixtures, image accessible names, and macOS E2E's `builtInPackageName` to `桃桃`. Do not rewrite historical specifications, handoff records, or past implementation plans.

Where `App.test.tsx` repeats the old name, define one local `const taotaoName = "桃桃"` and use it in active-product helpers rather than introducing a global production constant solely for tests.

- [ ] **Step 4: Run focused UI tests until green**

```powershell
pnpm vitest run src/settings/AppearancePanel.test.tsx src/renderer/FramePetStage.test.tsx src/app/App.test.tsx
```

Expected: PASS with package switching, custom import controls, and Qinghe message motion intact.

- [ ] **Step 5: Commit Task 3**

```powershell
git add -- src/settings/AppearancePanel.tsx src/settings/AppearancePanel.test.tsx src/app/App.test.tsx src/renderer/FramePetStage.test.tsx e2e/macos/specs/native-parity.e2e.ts
git add -- $(rg -l 'Q 版小人' src --glob '**/*.test.tsx')
git commit -m "test: cover built-in pet selection"
```

Before committing, inspect the staged list and unstage any historical documentation or unrelated file. If PowerShell expands no `rg` result, omit the second `git add` command.

---

### Task 4: Remove Obsolete Runtime Assets And Blink Contracts

**Files:**
- Create: `src/assets/runtimeAssetInventory.test.ts`
- Modify: `src/assets/builtInEdgeCompanion.ts`
- Modify: `src/assets/builtInEdgeCompanion.test.ts`
- Modify: `src/assets/builtInEdgeInteraction.ts`
- Modify: `src/assets/builtInEdgeInteraction.test.ts`
- Modify: `src/pet/edgeInteraction.ts`
- Modify: `src/renderer/edgeCompanionLayout.ts`
- Modify: `src/renderer/edgeCompanionLayout.test.ts`
- Modify: `src/assets/README.md`
- Modify: `src/assets/pets/q-girl/README.md`
- Delete: `src/assets/pets/star-sleeper/**`
- Delete: every `src/assets/pets/q-girl/edge-interaction/**` file except `top/idle/0001.png`
- Delete: `src/assets/pets/q-girl/edge-companion/side/blink.png`
- Delete: `src/assets/pets/q-girl/edge-companion/bottom/blink.png`
- Delete: the ten obsolete `src/assets/ui/interaction-buttons/*.png` files listed in the spec

**Interfaces:**
- Produces: `EdgeCompanionVisualProfile` with only `idleUrl`; no `blinkUrl`.
- Produces: `EdgeCompanionFixedBox` with only `idleFrame`; no `blinkFrame`.
- Produces: `getEdgeCompanionLayout(profile, scale, alphaBounds)` with no frame-kind argument.
- Preserves: Q-girl static side/bottom companions, static top hanging frame, edge message card, edge surprise card, and drag recovery.

- [ ] **Step 1: Write the failing runtime inventory test**

Create `runtimeAssetInventory.test.ts` using `node:fs` and `node:path`. Assert:

```ts
expect(petDirectories).toEqual(["q-boy", "q-girl"]);
expect(edgeInteractionPngs).toEqual(["top/idle/0001.png"]);
expect(edgeCompanionPngs).toEqual([
  "bottom/idle.png",
  "side/idle.png",
]);
expect(obsoleteButtonPaths.every((path) => !existsSync(path))).toBe(true);
```

Add edge contract assertions that returned profiles contain no `blinkUrl` or `blinkFrame`, and that every dormant phase frame URL resolves to the retained top static file rather than deleted phase paths.

- [ ] **Step 2: Run inventory and edge tests and verify failures**

```powershell
pnpm vitest run src/assets/runtimeAssetInventory.test.ts src/assets/builtInEdgeCompanion.test.ts src/assets/builtInEdgeInteraction.test.ts src/renderer/edgeCompanionLayout.test.ts src/renderer/EdgeCompanionStage.test.tsx src/app/App.test.tsx
```

Expected: FAIL because star-sleeper, 136 edge interaction files, blink fields/assets, and obsolete buttons still exist.

- [ ] **Step 3: Simplify the static edge contracts**

Remove `blinkUrl` and `blinkFrame` from `edgeInteraction.ts`. Remove the `frameKind` parameter and blink branch from `getEdgeCompanionLayout()`. Update test fixtures to contain only `idleUrl` and `idleFrame`.

In `builtInEdgeCompanion.ts`, remove both blink URL imports and blink placements while preserving current box dimensions, idle offsets, anchors, mirror behavior, and visible-height limits.

- [ ] **Step 4: Make edge interaction reference one retained static frame**

Replace the broad `import.meta.glob("./pets/q-girl/edge-interaction/*/*/*.png")` with one explicit URL for `top/idle/0001.png`. Build a one-frame non-animated `EdgePhaseMotion` with `fps: 1`, `loop: false`, `durationMs: 1000`, and each side's current contact anchor. Use that same valid motion object for dormant `enter`, `idle`, and `react` fields; the active side/bottom renderer continues using companion `idleUrl`, and the active top renderer remains frozen on the one frame.

Trim the old 136-frame geometry tests to cover only:

- all four Q-girl profiles still exist;
- left/right/bottom companions retain placements and mirrors;
- top has no companion and its only idle frame is `top/idle/0001.png`;
- the retained top and companion PNGs are transparent RGBA assets;
- unknown or imported package IDs still have no Q-girl edge profile.

- [ ] **Step 5: Delete only the confirmed obsolete files**

Use PowerShell `Remove-Item -LiteralPath` from the workspace root. Resolve every recursive target first and verify it remains under the workspace `src/assets` directory before deletion. Delete:

```text
src/assets/pets/star-sleeper/
src/assets/pets/q-girl/edge-interaction/bottom/
src/assets/pets/q-girl/edge-interaction/left/
src/assets/pets/q-girl/edge-interaction/right/
src/assets/pets/q-girl/edge-interaction/top/enter/
src/assets/pets/q-girl/edge-interaction/top/react/
src/assets/pets/q-girl/edge-interaction/top/idle/0002.png through 0022.png
src/assets/pets/q-girl/edge-companion/side/blink.png
src/assets/pets/q-girl/edge-companion/bottom/blink.png
```

Delete exactly these old button files:

```text
act-cute.png
act-drowsy.png
act-hug.png
act-pout.png
act-typing.png
act-wave.png
new-tea-cute.png
new-tea-hug.png
new-tea-wave.png
send-message.png
```

Do not delete any `new-tea-focus`, `new-tea-message`, `new-tea-status`, `new-tea-weather`, surprise, spark, or status asset.

- [ ] **Step 6: Update asset documentation**

Document that runtime pet roots are `q-girl` and `q-boy`; side/bottom edge companions and the top hanging sprite are static; obsolete animated phases and blink resources are intentionally absent. Remove README claims that the deleted UI files are current assets.

- [ ] **Step 7: Run focused tests and stale-reference scans**

```powershell
pnpm vitest run src/assets/runtimeAssetInventory.test.ts src/assets/builtInEdgeCompanion.test.ts src/assets/builtInEdgeInteraction.test.ts src/renderer/edgeCompanionLayout.test.ts src/renderer/EdgeCompanionStage.test.tsx src/app/App.test.tsx
rg -n 'star-sleeper|blink\.png|edge-interaction/(left|right|bottom)|edge-interaction/top/(enter|react)|interaction-buttons/(act-|new-tea-(cute|hug|wave)|send-message)' src
```

Expected: tests PASS. The scan may return only the intentional `builtin:star-sleeper` migration string and inventory-test deletion assertions; it must return no production resource import.

- [ ] **Step 8: Record the actual resource delta and commit Task 4**

```powershell
git diff --stat
git diff --numstat -- src/assets
git add -- src/assets src/pet/edgeInteraction.ts src/renderer/edgeCompanionLayout.ts src/renderer/edgeCompanionLayout.test.ts
git commit -m "chore: prune obsolete pet assets"
```

Expected: only the two character roots remain; deleted bytes exceed added Qinghe bytes by approximately 52 MiB.

---

### Task 5: Full Verification, Clean Windows QA, And NSIS EXE

**Files:**
- Do not modify product files unless a failing gate exposes a requirement regression.
- Create outside Git: `.superpowers/sdd/2026-08-20-two-built-in-pets/implementation-report.md`
- Create outside Git: `.superpowers/sdd/2026-08-20-two-built-in-pets/windows/screenshots/*.png`
- Create outside Git: `artifacts/two-built-in-pets/windows/`

**Interfaces:**
- Consumes: Tasks 1-4 committed product tree.
- Produces: verified Release NSIS installer and Windows evidence with a clean virtual user profile.
- Preserves: developer's real `%APPDATA%\com.couple.desktoppet` and `%LOCALAPPDATA%\com.couple.desktoppet`.

- [ ] **Step 1: Run all automated quality gates**

```powershell
pnpm typecheck
pnpm test
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: every command exits `0`. Record exact frontend and Rust test counts. Fix only regressions introduced by this plan, rerun the focused test first, then rerun the full gate.

- [ ] **Step 2: Verify the production bundle contains only allowlisted role assets**

After `pnpm build`, enumerate `dist/assets`. Confirm Taotao and Qinghe preview/motion images exist, no star-sleeper filename or deleted edge/button resource appears, and the production bundle contains no AppData path or `q-photo-chibi` asset.

- [ ] **Step 3: Build the isolated Release NSIS installer**

```powershell
$env:CARGO_TARGET_DIR = (Join-Path (Resolve-Path 'src-tauri').Path 'target-two-built-in-release')
pnpm tauri build --bundles nsis --ci
$installer = Get-ChildItem -LiteralPath (Join-Path $env:CARGO_TARGET_DIR 'release\bundle\nsis') -Filter '*.exe' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $installer) { throw 'NSIS installer was not generated' }
```

Expected: one current `.exe` installer under the isolated target. If `bundle.active: false` prevents bundling despite `--bundles nsis`, pass a temporary CLI config file outside Git that sets only `bundle.active` to `true`; do not change product packaging metadata merely to satisfy the local command.

- [ ] **Step 4: Run the release binary with an isolated user profile**

Create `.tmp/two-built-in-pets/windows-profile/{Roaming,Local}`. Launch only the new release binary with child-process environment variables `APPDATA`, `LOCALAPPDATA`, and `USERPROFILE` pointing beneath that QA root. Do not rename, delete, or modify the developer's real AppData.

Open settings and verify:

- current role options are exactly `桃桃` and `青禾`;
- peer role options are exactly those two once a QA peer ID is present;
- Taotao and Qinghe previews and normal frames render without a fallback card;
- Qinghe's idle animation advances and a message scenario uses its pair motion;
- import controls remain present.

- [ ] **Step 5: Verify custom import compatibility in the isolated profile**

Import a known valid test `.cdpet` package through the existing UI. Confirm it appears after the two built-ins, can be selected, and can be deleted. Confirm the list returns to exactly Taotao and Qinghe. Do not import the historical Q-girl or Q-boy duplicate packages for this clean-install check.

- [ ] **Step 6: Capture Windows visual evidence**

Capture and inspect at least:

- settings with Taotao selected and both built-ins visible;
- settings with Qinghe selected;
- Taotao normal desktop rendering;
- Qinghe normal desktop rendering;
- Qinghe pair-message interaction;
- Q-girl left/right/bottom static edge companion and top static hanging frame;
- message and surprise edge cards opening their full content.

Reject any screenshot with a missing image, square window outline, opaque background, wrong role name, duplicate historical role, stretched frame, clipped controls, or deleted yellow/old icon.

- [ ] **Step 7: Smoke-test the NSIS installer in a temporary install directory**

Run the generated installer silently into a dedicated QA install root when supported by the generated NSIS command line, start its installed executable with the same isolated profile, then run the generated uninstaller. Verify installer, installed app, and uninstaller exit successfully and the real user profile remains unchanged.

- [ ] **Step 8: Copy and hash the Windows deliverable**

```powershell
$out = 'artifacts/two-built-in-pets/windows'
New-Item -ItemType Directory -Path $out -Force | Out-Null
Copy-Item -LiteralPath $installer.FullName -Destination $out
Get-Item -LiteralPath (Join-Path $out $installer.Name) | Select-Object FullName,Length,LastWriteTime
Get-FileHash -LiteralPath (Join-Path $out $installer.Name) -Algorithm SHA256
```

Record the source commit, filename, bytes, timestamp, SHA-256, gate results, and screenshot paths in the implementation report.

---

### Task 6: Build And Verify The macOS Universal DMG

**Files:**
- Do not modify product files unless macOS exposes a real cross-platform regression.
- Create outside Git: `artifacts/two-built-in-pets/macos/`
- Extend outside Git: `.superpowers/sdd/2026-08-20-two-built-in-pets/implementation-report.md`

**Interfaces:**
- Consumes: the exact commit that produced the Windows installer.
- Produces: ad-hoc-signed, non-notarized Universal DMG plus workflow evidence and SHA-256.

- [ ] **Step 1: Confirm a clean tracked tree and publish the exact build commit**

```powershell
git status --short
git rev-parse HEAD
git push origin HEAD
```

Expected: no tracked modifications. Existing unrelated untracked directories may remain but must not be staged or uploaded as source artifacts.

- [ ] **Step 2: Run the macOS workflow from the exact commit**

Dispatch `.github/workflows/macos-qa.yml` for the current branch using GitHub CLI. Record the run ID and verify the run's `headSha` equals `git rev-parse HEAD`. Wait for completion rather than starting a second run.

- [ ] **Step 3: Require all macOS build and QA jobs to pass**

The workflow must complete its existing typecheck, frontend tests, Rust checks/tests, Universal application build, native E2E, DMG verification, mount verification, and evidence upload. If a product regression fails, return to the responsible task, fix with a focused test, rerun all Task 5 gates, rebuild Windows, and then rerun macOS from the new common commit.

- [ ] **Step 4: Download the DMG and build evidence**

Use `gh run download <run-id>` into a fresh `.tmp/two-built-in-pets/macos-run-<run-id>` directory. Copy the DMG and its evidence bundle to `artifacts/two-built-in-pets/macos/`. Do not copy the E2E application as the user-facing deliverable.

- [ ] **Step 5: Verify architecture, signing mode, and DMG integrity from evidence**

Require evidence showing:

- `lipo -archs` contains both `x86_64` and `arm64`;
- `codesign --verify --deep --strict` succeeds with signing identity `-`;
- `hdiutil verify` and mounted-app verification succeed;
- no E2E-only command or symbol is present in the production app;
- clean-profile settings show Taotao and Qinghe with no historical duplicate imports.

Do not run or claim formal notarization gates. Label the DMG `ad-hoc signed, not notarized` in the report.

- [ ] **Step 6: Hash the macOS deliverable and reconcile the two platforms**

```powershell
$dmg = Get-ChildItem -LiteralPath 'artifacts/two-built-in-pets/macos' -Filter '*.dmg' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $dmg) { throw 'DMG artifact was not downloaded' }
Get-Item -LiteralPath $dmg.FullName | Select-Object FullName,Length,LastWriteTime
Get-FileHash -LiteralPath $dmg.FullName -Algorithm SHA256
```

Record both artifact hashes under the same source commit. Reconfirm the install artifacts contain no settings, device secret, pair ID, weather API Key, or imported AppData package.

- [ ] **Step 7: Final review**

Inspect the complete Git diff from spec commit `7932b50` to the release commit. Verify module boundaries, no accidental user-data deletion, no third-party asset addition, stable default/fallback behavior, cross-platform path handling, test coverage, and artifact provenance. Do not mark the work complete until every release-blocking condition in the spec is satisfied.

---

## Plan Self-Review

- Spec coverage: role naming, two built-in IDs, exact Qinghe source, import retention, duplicate suppression, local/peer migration, resource deletion, static edge behavior, clean-install semantics, Windows NSIS, macOS Universal DMG, checksums, and signing disclosure map to Tasks 1-6.
- Scope: registry, migration, asset cleanup, and two-platform packaging form one release deliverable; no server or product-feature subsystem is changed.
- Type consistency: Task 1 defines both ID constants and `builtInBoyManifest`; Task 2 defines normalization helpers; Tasks 3-6 consume those exact names.
- Data safety: no task deletes AppData or unrelated untracked paths; clean QA uses redirected profile directories.
- Placeholder scan: all code-facing steps contain exact files, functions, assertions, commands, and expected outcomes.

