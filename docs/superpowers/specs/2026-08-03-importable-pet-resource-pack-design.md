# Importable Pet Resource Pack Design

## Status

Approved direction for the first importable pet resource MVP.

Date: 2026-08-03

## Scope

This design adds user-importable 2D desktop pet resource packs. A downloaded exe should be able to import a locally prepared pet package and render it without rebuilding the app.

The first version uses manual package exchange. The relay will not upload, download, store, or forward image resources. If two paired users want to see each other's custom character, they exchange the package file themselves and import it locally.

## Decisions

- Use a local resource package format named `.cdpet`.
- Treat `.cdpet` as a zip archive with a JSON manifest and PNG frame files.
- Support PNG sequence frames only in the first version.
- Reuse the current 12 action names so the existing pet state machine can remain stable.
- Store imported packages under the app data directory, not beside the exe and not inside the source tree.
- Import validates the package before it becomes selectable.
- Cross-screen interaction events should reference package ids and action names, not transfer image bytes.
- Manual package exchange is required for this MVP.

## Goals

- Users can create a resource package according to documented rules.
- Users can import a `.cdpet` package from the settings panel.
- Users can switch the local desktop pet from the built-in character to an imported package.
- Users can delete imported packages that are not currently selected.
- Paired users can assign an imported package as the peer's visual identity.
- Future peer-visit events can display the peer's imported package if it exists locally.
- The built-in `star-sleeper` package remains the fallback if an imported package is missing or invalid.

## Non-Goals

- No automatic relay transfer of package files.
- No public package marketplace.
- No package signing, creator accounts, payments, or moderation.
- No Live2D, Spine, GIF, video, 3D model, audio, or script support.
- No arbitrary custom action names in the first version.
- No remote computer control.

## Package Format

The recommended file extension is `.cdpet`. The archive layout is:

```text
my-pet.cdpet
├─ pet.json
├─ preview.png
└─ frames/
   ├─ idle-breathe-01.png ... idle-breathe-18.png
   ├─ idle-look-01.png ... idle-look-18.png
   ├─ idle-stretch-01.png ... idle-stretch-18.png
   ├─ walk-01.png ... walk-18.png
   ├─ drag-01.png ... drag-18.png
   ├─ sleep-01.png ... sleep-18.png
   ├─ act-cute-01.png ... act-cute-18.png
   ├─ act-typing-01.png ... act-typing-18.png
   ├─ act-wave-01.png ... act-wave-18.png
   ├─ act-hug-01.png ... act-hug-18.png
   ├─ act-pout-01.png ... act-pout-18.png
   └─ act-drowsy-01.png ... act-drowsy-18.png
```

`pet.json`:

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

The first implementation can infer frame paths from the fixed naming convention. A later version can allow explicit frame arrays in `pet.json`.

## Validation Rules

Import must reject a package when:

- `pet.json` is missing or invalid JSON.
- `formatVersion` is not `1`.
- `id` is empty or contains path separators.
- `name` is empty.
- required actions are missing.
- required frame files are missing.
- frame files are not PNG files.
- archive entries attempt path traversal, absolute paths, or nested unexpected locations.
- package size or file count exceeds a conservative local limit.

Recommended first limits:

- max archive size: 80 MB.
- max extracted size: 160 MB.
- max files: 240.
- PNG frames: exactly 18 per required action.

## Storage

Imported packages are copied into the app data directory:

```text
<appData>/pet-packages/
├─ my-custom-pet/
│  ├─ pet.json
│  ├─ preview.png
│  └─ frames/
└─ package-index.json
```

If an imported package id already exists, the importer should either replace it after confirmation or create a deterministic suffix. The first version should prefer explicit replacement confirmation in the UI.

The source `.cdpet` path is not stored as the runtime dependency. After import, the app reads from app data.

## Settings Model

Extend settings with an appearance section:

```ts
interface AppearanceSettings {
  selectedPetPackageId: string;
  peerPetPackageByDeviceId: Record<string, string>;
}
```

Default:

```json
{
  "appearance": {
    "selectedPetPackageId": "builtin:star-sleeper",
    "peerPetPackageByDeviceId": {}
  }
}
```

Existing settings must migrate safely by falling back to the built-in package when the new section is missing.

## Runtime Rendering

The renderer should stop depending directly on `import.meta.glob("../assets/pets/star-sleeper/*.png")` as the only source of frames.

Introduce a pet package registry:

- built-in package provider: current bundled `star-sleeper` frames.
- imported package provider: app data package manifests and file URLs.
- selected package resolver: picks the selected package, validates availability, and falls back to built-in.

`FramePetStage` should receive a resolved package or resolver result instead of hardcoding built-in frame paths. The pet state machine can continue to use the current action names.

## UI

Add a shape management area in settings:

- current package name.
- preview image.
- import `.cdpet`.
- switch package.
- delete imported package.
- assign imported package as the paired peer's appearance.

For the first version, this can live below local settings and above remote interaction. It should reuse the existing scrollable settings dock and avoid making the dock taller than the window.

## Realtime And Cross-Screen Interaction

The relay must not transfer package files.

When cross-screen interaction is added, messages should carry:

- `fromDeviceId`.
- `packageId` or `appearanceId`.
- `action`.
- event metadata such as position, direction, and timestamp.

Receiver behavior:

- If the receiver has mapped `fromDeviceId` to a local package, render that package.
- If only `packageId` matches an imported package, render that package.
- Otherwise render a built-in fallback and show a non-blocking hint that the peer package is missing.

This keeps bandwidth low and avoids storing copyrighted or user-generated image files on the relay.

## Tauri Commands

The first implementation should use Rust-side commands rather than broad filesystem access from the webview:

- `list_pet_packages()`
- `import_pet_package(path)`
- `delete_pet_package(package_id)`
- `read_pet_package_index()`
- `get_pet_frame_asset_url(package_id, action, frame_index)` or an equivalent safe asset URL strategy

The importer should perform extraction, path validation, and file copying on the Rust side.

## Security And Safety

- Never execute package content.
- Do not allow HTML, JS, SVG scripts, or remote URLs inside packages.
- Prevent zip-slip/path traversal.
- Keep package files under app data.
- Do not expose arbitrary filesystem paths to the frontend.
- Show import errors in Chinese with concrete reasons.
- Keep the relay image-free in this MVP.

## Testing

Unit and integration coverage should include:

- manifest validation success and failure cases.
- missing required frame rejection.
- path traversal archive rejection.
- imported package index read/write.
- settings migration for `appearance`.
- renderer fallback to built-in when imported package is unavailable.
- settings UI import/switch/delete callbacks.
- peer package mapping by `peerDeviceId`.

Manual verification:

1. Start the app with no imported packages; built-in pet renders.
2. Import a valid `.cdpet`; it appears in shape management.
3. Switch to the imported pet; the desktop pet renders imported frames.
4. Restart the exe; imported pet remains selected.
5. Delete a non-selected imported package; it disappears.
6. Try importing an invalid package; app rejects it with a clear message.
7. Pair two devices; assign an imported package as peer appearance.

## Phased Implementation

Phase 1:

- Document `.cdpet` format.
- Add settings schema for selected local package.
- Add package registry and renderer support for built-in plus imported packages.
- Add import/switch/delete UI.

Phase 2:

- Add peer package mapping UI after pairing.
- Prepare remote pet render slot for peer visits.
- Add realtime event types for peer action playback without transferring assets.

Phase 3:

- Improve package tooling: sample template, package validator CLI, and image generation prompt guide.
