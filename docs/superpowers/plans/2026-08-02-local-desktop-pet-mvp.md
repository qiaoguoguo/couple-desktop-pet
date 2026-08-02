# Local Desktop Pet MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first local desktop pet MVP: a Windows-first Tauri desktop app with React, TypeScript, PixiJS, a testable pet state machine, lightweight settings, transparent desktop window behavior, tray controls, and built-in star-sleeper animation assets.

**Architecture:** The app separates desktop system capabilities from pet behavior and rendering. Tauri/Rust owns window, tray, persistence, and OS commands; React/TypeScript owns app state, settings UI, bubbles, PixiJS rendering, and the pure pet state machine.

**Tech Stack:** Tauri 2, React 19, TypeScript 7, Vite 8, PixiJS 8, Vitest, pnpm.

## Global Constraints

- Communicate with the user in Chinese throughout the project.
- First-party code comments should be concise and only used when the logic is not self-explanatory.
- Main implementation must be self-developed; do not fork or copy code from BongoCat, OpenPets, VPet, GPL, or AGPL projects.
- Do not add networking, accounts, matching, chat, voice, AI, Live2D, resource import, packaging, signing, or auto-update features in this MVP.
- Windows is the primary validation platform; macOS/Linux behavior must be isolated behind desktop abstractions and degrade harmlessly.
- The fixed development Codex thread performs coding; the main agent owns scope, task dispatch, review, and acceptance.
- Generated art must follow the user-provided star-sleeper reference image without copying exact pixels.
- Do not commit copyrighted or unclear third-party art, models, icons, sounds, or fonts.
- Use built-in/generated assets only; if imagegen/gpt-image-2 is unavailable, report the limitation instead of using web-sourced assets.
- The current main machine has Node `v22.17.0` and pnpm `11.9.0`; `cargo` and `rustc` are not currently on PATH, so Rust/Tauri validation may be blocked until Rust is installed.

---

## Planned File Structure

```text
.
├── package.json
├── pnpm-lock.yaml
├── index.html
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── vitest.config.ts
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   └── app.css
│   ├── assets/
│   │   ├── README.md
│   │   ├── builtInPetManifest.ts
│   │   └── pets/star-sleeper/
│   ├── bubble/
│   │   ├── BubbleLayer.tsx
│   │   └── bubbleStore.ts
│   ├── desktop/
│   │   ├── desktopApi.ts
│   │   └── windowCommands.ts
│   ├── pet-core/
│   │   ├── petScheduler.ts
│   │   ├── petStateMachine.test.ts
│   │   ├── petStateMachine.ts
│   │   └── petTypes.ts
│   ├── renderer/
│   │   ├── PixiPetStage.tsx
│   │   ├── animationPlayer.ts
│   │   └── frameAtlas.ts
│   ├── settings/
│   │   ├── SettingsPanel.tsx
│   │   ├── defaultSettings.ts
│   │   ├── settingsStore.test.ts
│   │   ├── settingsStore.ts
│   │   └── settingsTypes.ts
│   ├── main.tsx
│   └── vite-env.d.ts
└── src-tauri/
    ├── Cargo.toml
    ├── build.rs
    ├── tauri.conf.json
    └── src/
        ├── commands.rs
        └── main.rs
```

`pet-core` remains pure TypeScript with no React, PixiJS, or Tauri imports. `desktop` is the only frontend layer that invokes Tauri APIs. `src-tauri` must not contain pet business rules beyond persistence and desktop window commands.

---

### Task 1: Project Scaffold And Toolchain Baseline

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `src/main.tsx`
- Create: `src/vite-env.d.ts`
- Create: `src/app/App.tsx`
- Create: `src/app/app.css`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/commands.rs`
- Modify: `.gitignore`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `typecheck`, `test`, `tauri`.
- Produces: a React root component `App(): JSX.Element`.
- Produces: Tauri command `ping() -> String` for confirming frontend/backend wiring later.
- Consumes: repository docs `AGENTS.md` and `docs/superpowers/specs/2026-08-02-local-desktop-pet-mvp-design.md`.

- [ ] **Step 1: Sync the fixed development worktree to latest `master`**

Run in the fixed development worktree:

```powershell
git status --short --branch
git rev-parse master
git switch -c codex/local-pet-mvp-scaffold master
git log -1 --oneline
```

Expected: a new branch `codex/local-pet-mvp-scaffold` based on latest `master`. If branch already exists, run `git switch codex/local-pet-mvp-scaffold` and `git merge master`.

- [ ] **Step 2: Confirm toolchain availability**

Run:

```powershell
node --version
pnpm --version
cargo --version
rustc --version
```

Expected: Node and pnpm print versions. If `cargo` or `rustc` is missing, continue with frontend scaffold and record that Tauri/Rust checks are blocked by missing Rust.

- [ ] **Step 3: Create package and config files**

Create `package.json` with these scripts and dependencies:

```json
{
  "name": "couple-desktop-pet",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc -b --pretty false",
    "test": "vitest run",
    "test:watch": "vitest",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.11.1",
    "pixi.js": "^8.19.0",
    "react": "^19.2.8",
    "react-dom": "^19.2.8"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.11.4",
    "@testing-library/react": "^16.3.2",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.4",
    "@vitejs/plugin-react": "^6.0.5",
    "jsdom": "^30.0.1",
    "typescript": "^7.0.2",
    "vite": "^8.2.0",
    "vitest": "^4.1.10"
  }
}
```

Create `index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>情侣桌宠</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.node.json" }],
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts"]
}
```

Create `tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

Create `vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    strictPort: true,
    port: 1420,
  },
});
```

Create `vitest.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
```

- [ ] **Step 4: Create the minimal React app**

Create `src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./app/app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Create `src/app/App.tsx`:

```tsx
export function App() {
  return (
    <main className="app-shell">
      <div className="pet-dev-card">
        <div className="pet-dev-face" aria-label="星星睡衣小星人开发占位">
          <span>星</span>
        </div>
        <p>情侣桌宠 MVP</p>
      </div>
    </main>
  );
}
```

Create `src/app/app.css`:

```css
:root {
  color: #2c1f18;
  background: transparent;
  font-family: Inter, "Microsoft YaHei", system-ui, sans-serif;
}

body {
  margin: 0;
  overflow: hidden;
  background: transparent;
}

.app-shell {
  width: 100vw;
  height: 100vh;
  display: grid;
  place-items: center;
  background: transparent;
}

.pet-dev-card {
  display: grid;
  justify-items: center;
  gap: 8px;
  user-select: none;
}

.pet-dev-face {
  width: 132px;
  height: 132px;
  display: grid;
  place-items: center;
  border: 4px solid #4b2b1a;
  border-radius: 42% 48% 44% 46%;
  background: #f6a15f;
  box-shadow: inset 18px -16px 0 rgb(217 89 54 / 0.32);
  color: #ffc83d;
  font-size: 48px;
  font-weight: 700;
}

.pet-dev-card p {
  margin: 0;
  padding: 4px 8px;
  border-radius: 8px;
  background: rgb(255 255 255 / 0.78);
  font-size: 14px;
}
```

Create `src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 5: Create minimal Tauri files**

Create `src-tauri/Cargo.toml`:

```toml
[package]
name = "couple-desktop-pet"
version = "0.1.0"
description = "A local-first cross-platform desktop pet."
authors = ["情侣桌宠 contributors"]
edition = "2021"

[lib]
name = "couple_desktop_pet_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tauri = { version = "2", features = ["tray-icon"] }
```

Create `src-tauri/build.rs`:

```rust
fn main() {
    tauri_build::build();
}
```

Create `src-tauri/src/main.rs`:

```rust
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![commands::ping])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}
```

Create `src-tauri/src/commands.rs`:

```rust
#[tauri::command]
pub fn ping() -> String {
    "pong".to_string()
}
```

Create `src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "情侣桌宠",
  "version": "0.1.0",
  "identifier": "com.couple-desktop-pet.app",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build",
    "devUrl": "http://localhost:1420",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "情侣桌宠",
        "width": 320,
        "height": 360,
        "transparent": true,
        "decorations": false,
        "alwaysOnTop": true,
        "resizable": false
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": false,
    "targets": "all"
  }
}
```

- [ ] **Step 6: Extend `.gitignore` for generated desktop artifacts**

Ensure `.gitignore` contains:

```gitignore
# Tauri generated icons and temporary bundles
src-tauri/icons/icon.ico
src-tauri/icons/icon.icns
src-tauri/icons/*.png

# Local app data created while testing
.local-data/
```

- [ ] **Step 7: Install dependencies and generate lockfile**

Run:

```powershell
pnpm install
```

Expected: `pnpm-lock.yaml` is created and installation exits 0.

- [ ] **Step 8: Verify frontend baseline**

Run:

```powershell
pnpm typecheck
pnpm test
pnpm build
```

Expected: all three exit 0. If `pnpm test` reports no tests, add a tiny smoke test `src/app/App.test.tsx` that renders `<App />` and expects `情侣桌宠 MVP` to be present.

Smoke test content if needed:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the MVP shell", () => {
    render(<App />);
    expect(screen.getByText("情侣桌宠 MVP")).toBeTruthy();
  });
});
```

- [ ] **Step 9: Verify Tauri baseline when Rust is available**

Run:

```powershell
pnpm tauri --version
pnpm tauri dev
```

Expected: `pnpm tauri --version` exits 0. `pnpm tauri dev` opens a transparent undecorated window. If Rust is unavailable, record the exact `cargo`/`rustc` missing error in the task summary.

- [ ] **Step 10: Commit Task 1**

Run:

```powershell
git status --short
git add .gitignore package.json pnpm-lock.yaml index.html tsconfig.json tsconfig.node.json vite.config.ts vitest.config.ts src src-tauri
git commit -m "feat: scaffold Tauri desktop pet app"
```

Expected: one commit containing only the scaffold and baseline verification files.

---

### Task 2: Pure Pet State Machine And Scheduler

**Files:**
- Create: `src/pet-core/petTypes.ts`
- Create: `src/pet-core/petStateMachine.ts`
- Create: `src/pet-core/petStateMachine.test.ts`
- Create: `src/pet-core/petScheduler.ts`

**Interfaces:**
- Produces type `PetStateName = "idle" | "walking" | "dragging" | "happy" | "sleeping"`.
- Produces type `PetEventType = "APP_READY" | "PET_CLICKED" | "DRAG_STARTED" | "DRAG_ENDED" | "AUTO_MOVE_TICK" | "IDLE_TIMEOUT" | "SETTINGS_CHANGED" | "ANIMATION_FINISHED"`.
- Produces function `createInitialPetState(now: number): PetState`.
- Produces function `transitionPetState(state: PetState, event: PetEvent): PetState`.
- Produces function `getNextScheduledEvent(state: PetState, now: number, autoMoveEnabled: boolean): PetEvent | null`.
- Consumes no React, PixiJS, DOM, or Tauri APIs.

- [ ] **Step 1: Write failing state machine tests**

Create tests that assert:

```ts
expect(createInitialPetState(1000).name).toBe("idle");
expect(transitionPetState(idle, { type: "PET_CLICKED", at: 1100 }).name).toBe("happy");
expect(transitionPetState(happy, { type: "ANIMATION_FINISHED", at: 1400 }).name).toBe("idle");
expect(transitionPetState(idle, { type: "DRAG_STARTED", at: 1500 }).name).toBe("dragging");
expect(transitionPetState(dragging, { type: "AUTO_MOVE_TICK", at: 1600 }).name).toBe("dragging");
expect(transitionPetState(dragging, { type: "DRAG_ENDED", at: 1700 }).name).toBe("idle");
expect(transitionPetState(idle, { type: "AUTO_MOVE_TICK", at: 2400 }).name).toBe("walking");
expect(transitionPetState(walking, { type: "IDLE_TIMEOUT", at: 9000 }).name).toBe("sleeping");
expect(transitionPetState(sleeping, { type: "PET_CLICKED", at: 9100 }).name).toBe("happy");
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
pnpm test -- src/pet-core/petStateMachine.test.ts
```

Expected: FAIL because `petStateMachine` files do not exist yet.

- [ ] **Step 3: Implement the minimal pure state machine**

Implement these exact signatures:

```ts
export type PetStateName = "idle" | "walking" | "dragging" | "happy" | "sleeping";

export interface PetState {
  name: PetStateName;
  enteredAt: number;
  lastInteractionAt: number;
  direction: -1 | 1;
}

export interface PetEvent {
  type:
    | "APP_READY"
    | "PET_CLICKED"
    | "DRAG_STARTED"
    | "DRAG_ENDED"
    | "AUTO_MOVE_TICK"
    | "IDLE_TIMEOUT"
    | "SETTINGS_CHANGED"
    | "ANIMATION_FINISHED";
  at: number;
}
```

Rules:

- `dragging` ignores `AUTO_MOVE_TICK`.
- `PET_CLICKED` always transitions to `happy`.
- `DRAG_STARTED` always transitions to `dragging`.
- `DRAG_ENDED` transitions to `idle`.
- `ANIMATION_FINISHED` transitions `happy` to `idle` and `walking` to `idle`.
- `IDLE_TIMEOUT` transitions non-dragging states to `sleeping`.
- `AUTO_MOVE_TICK` transitions `idle` to `walking`.

- [ ] **Step 4: Add scheduler helper**

Implement `getNextScheduledEvent(state, now, autoMoveEnabled)`:

- returns `ANIMATION_FINISHED` when `happy` has lasted at least 900 ms.
- returns `ANIMATION_FINISHED` when `walking` has lasted at least 1600 ms.
- returns `IDLE_TIMEOUT` when non-sleeping and idle for at least 120000 ms.
- returns `AUTO_MOVE_TICK` when `autoMoveEnabled` and `idle` has lasted at least 8000 ms.
- returns `null` otherwise.

- [ ] **Step 5: Run state machine tests**

Run:

```powershell
pnpm test -- src/pet-core/petStateMachine.test.ts
pnpm typecheck
```

Expected: both exit 0.

- [ ] **Step 6: Commit Task 2**

```powershell
git add src/pet-core
git commit -m "feat: add pet state machine"
```

---

### Task 3: Settings Model, Persistence Contract, And Desktop API Facade

**Files:**
- Create: `src/settings/settingsTypes.ts`
- Create: `src/settings/defaultSettings.ts`
- Create: `src/settings/settingsStore.ts`
- Create: `src/settings/settingsStore.test.ts`
- Create: `src/desktop/desktopApi.ts`
- Create: `src/desktop/windowCommands.ts`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/main.rs`

**Interfaces:**
- Produces `PetSettings`.
- Produces `defaultSettings`.
- Produces `mergeSettings(input: Partial<PetSettings>): PetSettings`.
- Produces `loadSettings(api: SettingsPersistenceApi): Promise<PetSettings>`.
- Produces `saveSettings(api: SettingsPersistenceApi, settings: PetSettings): Promise<void>`.
- Produces frontend desktop functions `setAlwaysOnTop`, `setClickThrough`, `resetWindowPosition`, `showWindow`, `hideWindow`, `quitApp`.

- [ ] **Step 1: Write failing settings tests**

Test cases:

```ts
expect(defaultSettings.scale).toBe(1);
expect(defaultSettings.autoMoveEnabled).toBe(true);
expect(defaultSettings.bubblesEnabled).toBe(true);
expect(mergeSettings({ scale: 3 }).scale).toBe(2);
expect(mergeSettings({ scale: 0.2 }).scale).toBe(0.5);
expect(mergeSettings({ movementRange: "invalid" as never }).movementRange).toBe("bottom");
```

- [ ] **Step 2: Implement settings types and validation**

Use:

```ts
export type MovementRange = "bottom" | "active-screen" | "free";

export interface PetSettings {
  scale: number;
  autoMoveEnabled: boolean;
  movementRange: MovementRange;
  bubblesEnabled: boolean;
  alwaysOnTop: boolean;
  clickThrough: boolean;
}
```

Clamp `scale` to `[0.5, 2]`. Default:

```ts
export const defaultSettings: PetSettings = {
  scale: 1,
  autoMoveEnabled: true,
  movementRange: "bottom",
  bubblesEnabled: true,
  alwaysOnTop: true,
  clickThrough: false,
};
```

- [ ] **Step 3: Implement async persistence contract**

Define:

```ts
export interface SettingsPersistenceApi {
  readSettings(): Promise<unknown>;
  writeSettings(settings: PetSettings): Promise<void>;
}
```

`loadSettings` must catch read failures and return `defaultSettings`. `saveSettings` must write the already-validated settings.

- [ ] **Step 4: Add desktop facade**

`desktopApi.ts` wraps Tauri `invoke`. `windowCommands.ts` exposes typed functions and contains all direct frontend calls to Tauri commands.

Command names:

- `read_settings`
- `write_settings`
- `set_always_on_top`
- `set_click_through`
- `reset_window_position`
- `show_window`
- `hide_window`
- `quit_app`

- [ ] **Step 5: Add Rust command stubs**

Rust commands may return static/default values until full desktop behavior in Task 6:

```rust
#[tauri::command]
pub fn read_settings() -> serde_json::Value {
    serde_json::json!({})
}
```

`write_settings` accepts `serde_json::Value` and returns `Result<(), String>`. Window commands return `Result<(), String>`.

- [ ] **Step 6: Run verification**

```powershell
pnpm test -- src/settings/settingsStore.test.ts
pnpm typecheck
pnpm build
```

Expected: all exit 0.

- [ ] **Step 7: Commit Task 3**

```powershell
git add src/settings src/desktop src-tauri/src
git commit -m "feat: add settings and desktop command facade"
```

---

### Task 4: PixiJS Renderer, Bubble Layer, App Shell, And Settings Panel

**Files:**
- Create: `src/assets/builtInPetManifest.ts`
- Create: `src/renderer/animationPlayer.ts`
- Create: `src/renderer/frameAtlas.ts`
- Create: `src/renderer/PixiPetStage.tsx`
- Create: `src/bubble/bubbleStore.ts`
- Create: `src/bubble/BubbleLayer.tsx`
- Create: `src/settings/SettingsPanel.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
- Consumes `PetState`, `transitionPetState`, `getNextScheduledEvent`, and `PetSettings`.
- Produces `BuiltInPetManifest` with actions `idle`, `walk`, `drag`, `happy`, `sleep`.
- Produces `PixiPetStage({ action, scale, onPetClick, onDragStart, onDragEnd })`.
- Produces `BubbleLayer({ message, visible })`.
- Produces `SettingsPanel({ settings, onChange, onResetPosition })`.

- [ ] **Step 1: Create manifest with deterministic temporary frame references**

Use final filenames from Task 5 now, even before image files exist:

```ts
export const builtInPetManifest = {
  id: "star-sleeper",
  name: "星星睡衣小星人",
  baseSize: { width: 256, height: 320 },
  actions: {
    idle: { fps: 6, loop: true, frames: ["pets/star-sleeper/idle-01.png", "pets/star-sleeper/idle-02.png", "pets/star-sleeper/idle-03.png", "pets/star-sleeper/idle-04.png"] },
    walk: { fps: 8, loop: true, frames: ["pets/star-sleeper/walk-01.png", "pets/star-sleeper/walk-02.png", "pets/star-sleeper/walk-03.png", "pets/star-sleeper/walk-04.png", "pets/star-sleeper/walk-05.png", "pets/star-sleeper/walk-06.png"] },
    drag: { fps: 4, loop: true, frames: ["pets/star-sleeper/drag-01.png", "pets/star-sleeper/drag-02.png"] },
    happy: { fps: 8, loop: false, frames: ["pets/star-sleeper/happy-01.png", "pets/star-sleeper/happy-02.png", "pets/star-sleeper/happy-03.png", "pets/star-sleeper/happy-04.png"] },
    sleep: { fps: 3, loop: true, frames: ["pets/star-sleeper/sleep-01.png", "pets/star-sleeper/sleep-02.png", "pets/star-sleeper/sleep-03.png", "pets/star-sleeper/sleep-04.png"] }
  }
} as const;
```

- [ ] **Step 2: Implement animation frame selection**

`animationPlayer.ts` exports:

```ts
export function getFrameIndex(elapsedMs: number, frameCount: number, fps: number, loop: boolean): number;
```

Rules: negative elapsed returns `0`; non-looping clamps to last frame; looping wraps.

- [ ] **Step 3: Implement Pixi stage with graceful fallback**

`PixiPetStage` initializes PixiJS and loads the current frame. If an image fails to load, render the CSS fallback already in `App` and do not crash.

- [ ] **Step 4: Implement bubbles and settings panel**

Bubble message on click: `我在这里。`

Settings panel controls:

- range input for `scale` from `0.5` to `2` step `0.1`.
- checkbox for `autoMoveEnabled`.
- select for `movementRange`.
- checkbox for `bubblesEnabled`.
- checkbox for `alwaysOnTop`.
- checkbox for `clickThrough`.
- button for reset position.

- [ ] **Step 5: Wire app shell**

`App.tsx` owns current `PetState`, `PetSettings`, bubble message, and scheduling timer. It must call desktop facade functions only through `windowCommands.ts`.

- [ ] **Step 6: Run verification**

```powershell
pnpm test
pnpm typecheck
pnpm build
```

Expected: all exit 0.

- [ ] **Step 7: Commit Task 4**

```powershell
git add src
git commit -m "feat: add desktop pet renderer and settings UI"
```

---

### Task 5: Generate And Install Built-In Star Sleeper Assets

**Files:**
- Create: `src/assets/README.md`
- Create: `src/assets/pets/star-sleeper/idle-01.png`
- Create: `src/assets/pets/star-sleeper/idle-02.png`
- Create: `src/assets/pets/star-sleeper/idle-03.png`
- Create: `src/assets/pets/star-sleeper/idle-04.png`
- Create: `src/assets/pets/star-sleeper/walk-01.png`
- Create: `src/assets/pets/star-sleeper/walk-02.png`
- Create: `src/assets/pets/star-sleeper/walk-03.png`
- Create: `src/assets/pets/star-sleeper/walk-04.png`
- Create: `src/assets/pets/star-sleeper/walk-05.png`
- Create: `src/assets/pets/star-sleeper/walk-06.png`
- Create: `src/assets/pets/star-sleeper/drag-01.png`
- Create: `src/assets/pets/star-sleeper/drag-02.png`
- Create: `src/assets/pets/star-sleeper/happy-01.png`
- Create: `src/assets/pets/star-sleeper/happy-02.png`
- Create: `src/assets/pets/star-sleeper/happy-03.png`
- Create: `src/assets/pets/star-sleeper/happy-04.png`
- Create: `src/assets/pets/star-sleeper/sleep-01.png`
- Create: `src/assets/pets/star-sleeper/sleep-02.png`
- Create: `src/assets/pets/star-sleeper/sleep-03.png`
- Create: `src/assets/pets/star-sleeper/sleep-04.png`

**Interfaces:**
- Consumes user reference image `C:\Users\14567\AppData\Local\Temp\codex-clipboard-9e68269f-b795-4fc4-9583-1843e627219f.png`.
- Produces transparent PNG frames referenced by `builtInPetManifest`.
- Produces `src/assets/README.md` with generation notes and licensing boundary.

- [ ] **Step 1: Use imagegen/gpt-image-2 if available**

Prompt template for each action:

```text
Use case: illustration-story
Asset type: desktop pet 2D animation frame
Primary request: Generate one transparent-ready animation frame for a cute "star sleeper little person" desktop pet based on the provided reference image.
Input images: Image 1 is a style and character reference only; do not copy exact pixels.
Subject: yellow star-shaped pajama/hat silhouette, orange round face, large oval eyes with tiny star highlights, red round cheeks, gentle small smile, tiny star ornament on the hat tip.
Style/medium: hand-drawn crayon children's illustration, soft uneven pencil outline, warm playful texture.
Composition/framing: full body centered, generous padding, character readable at 128px desktop size.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for background removal.
Constraints: no watermark, no unrelated props, no extra characters, no readable text on clothing, keep consistent proportions and colors across all frames.
Avoid: photorealism, vector-clean flat icon style, hard shadows, background texture, floor plane.
Action frame: <replace with idle-01, walk-01, drag-01, happy-01, or sleep-01 pose description>.
```

Use chroma-key removal helper after generation:

```powershell
python "$env:USERPROFILE\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py" --input generated.png --out final.png --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill
```

- [ ] **Step 2: Pose descriptions**

Use these action descriptions:

- `idle-01` neutral standing, slight smile.
- `idle-02` body squashes down very slightly, hat tip bends left.
- `idle-03` body rises slightly, cheeks lift.
- `idle-04` returns toward neutral, hat tip bends right.
- `walk-01` left lean, left foot/body base forward.
- `walk-02` center low step, face looking forward.
- `walk-03` right lean, right foot/body base forward.
- `walk-04` center high step, hat trailing.
- `walk-05` left lean with small bounce.
- `walk-06` right lean with small bounce.
- `drag-01` body tilted left as if being picked up.
- `drag-02` body tilted right as if dangling.
- `happy-01` smile widens, eyes bright.
- `happy-02` cheeks larger and redder, small sparkle near face.
- `happy-03` body bounces up, hat star lively.
- `happy-04` returns to normal happy smile.
- `sleep-01` eyes closed, relaxed.
- `sleep-02` eyes closed, slight breathing squash.
- `sleep-03` small sleepy expression, hat droops.
- `sleep-04` calm sleeping pose with tiny star accent.

- [ ] **Step 3: Validate generated assets**

For every PNG:

- corners must be transparent.
- image must have alpha channel.
- visible subject must not include green chroma-key fringe.
- character must stay within 256x320 canvas.
- character must be readable when downscaled to 128px height.

Use a local image check script or manual inspection with `view_image`.

- [ ] **Step 4: Document asset provenance**

Create `src/assets/README.md`:

```markdown
# Built-In Pet Assets

The `star-sleeper` frames are project-generated raster assets based on the user-provided reference image direction. The reference is used for character/style guidance only; frames should not be copied from third-party art or downloaded from the web.

Generation requirements:
- imagegen/gpt-image-2 workflow
- flat chroma-key background
- local chroma-key removal to transparent PNG
- no watermark
- no readable text on clothing
```

- [ ] **Step 5: Run verification**

```powershell
pnpm typecheck
pnpm build
```

Expected: both exit 0 and the rendered pet uses generated PNG frames.

- [ ] **Step 6: Commit Task 5**

```powershell
git add src/assets
git commit -m "feat: add built-in star sleeper pet assets"
```

---

### Task 6: Desktop Window Behavior, Persistence, Tray, And Final MVP Verification

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src/desktop/windowCommands.ts`
- Modify: `src/settings/settingsStore.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/app.css`
- Create: `docs/manual-verification/windows-mvp.md`

**Interfaces:**
- Consumes frontend commands from Task 3.
- Produces working Tauri commands for settings JSON, always-on-top, click-through, reset position, show, hide, and quit.
- Produces tray menu entries: 显示, 隐藏, 设置, 退出.

- [ ] **Step 1: Implement local JSON persistence**

Use Tauri app data directory. Store settings at:

```text
<app_data_dir>/settings.json
```

If read fails or JSON is invalid, return `{}` to frontend so `mergeSettings` applies defaults. If write fails, return `Err(String)` with the path and error message.

- [ ] **Step 2: Implement window commands**

Command behavior:

- `set_always_on_top(enabled: bool)` calls Tauri window always-on-top API.
- `set_click_through(enabled: bool)` attempts platform click-through. On unsupported platforms, return `Ok(())` after logging the unsupported status.
- `reset_window_position()` moves the window to a safe lower-right or lower-center visible area on the primary monitor.
- `show_window()` shows and focuses the main window.
- `hide_window()` hides the main window.
- `quit_app()` exits the application.

- [ ] **Step 3: Implement tray menu**

Tray menu:

- `显示` calls show main window.
- `隐藏` hides main window.
- `设置` shows main window and emits a frontend event `open-settings`.
- `退出` exits the app.

Frontend listens for `open-settings` and opens the lightweight settings panel.

- [ ] **Step 4: Wire setting side effects**

When settings change:

- `alwaysOnTop` calls `setAlwaysOnTop`.
- `clickThrough` calls `setClickThrough`.
- `scale` updates render size immediately.
- `autoMoveEnabled`, `movementRange`, and `bubblesEnabled` update frontend behavior without restarting.

- [ ] **Step 5: Add manual verification document**

Create `docs/manual-verification/windows-mvp.md`:

```markdown
# Windows MVP Manual Verification

- [ ] `pnpm install` exits 0.
- [ ] `pnpm typecheck` exits 0.
- [ ] `pnpm test` exits 0.
- [ ] `pnpm build` exits 0.
- [ ] `pnpm tauri dev` opens a transparent undecorated desktop pet window.
- [ ] Desktop pet is always on top by default.
- [ ] Desktop pet can be dragged and keeps a safe visible position.
- [ ] Clicking the pet shows a happy action and bubble.
- [ ] Pet performs simple automatic movement when enabled.
- [ ] Settings panel changes scale, auto move, movement range, bubbles, always-on-top, and click-through.
- [ ] Settings persist after closing and reopening.
- [ ] Tray menu can show, hide, open settings, and exit.
- [ ] No networking, account, AI, voice, resource import, packaging, signing, or auto-update UI exists.
```

- [ ] **Step 6: Run automated verification**

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm tauri --version
```

Expected: all exit 0 when Rust is installed. If Rust is still missing, record that `pnpm tauri --version` is blocked by missing Rust and include exact error output.

- [ ] **Step 7: Run manual Windows verification**

Run:

```powershell
pnpm tauri dev
```

Record pass/fail notes in `docs/manual-verification/windows-mvp.md`. Do not mark unchecked items as passed.

- [ ] **Step 8: Commit Task 6**

```powershell
git add src src-tauri docs/manual-verification/windows-mvp.md
git commit -m "feat: add desktop window behavior and MVP verification"
```

---

## Acceptance Checklist

- [ ] The development app can be started.
- [ ] Transparent undecorated pet window appears on Windows when Rust/Tauri prerequisites are installed.
- [ ] The pet uses 2D sequence-frame animation.
- [ ] Dragging, clicking, happy bubble, sleep, and simple movement work.
- [ ] Settings panel persists and applies scale, movement, bubbles, always-on-top, and click-through.
- [ ] Tray menu supports show, hide, settings, and quit.
- [ ] `pet-core` and settings have automated tests.
- [ ] No non-MVP features are present.
- [ ] No unclear third-party assets are committed.
- [ ] Missing Rust, if still missing, is reported explicitly as a blocked verification item.

## Self-Review Notes

- Spec coverage: Tasks 1-6 cover scaffold, state machine, settings, renderer, bubbles, generated assets, desktop window behavior, tray, tests, and manual Windows verification.
- Scope control: networking, matching, chat, voice, AI, Live2D, resource import, packaging, signing, and auto-update are explicitly excluded.
- Type consistency: state names use `idle`, `walking`, `dragging`, `happy`, `sleeping`; asset actions use `idle`, `walk`, `drag`, `happy`, `sleep` as animation names.
- Known blocker: Rust is missing on the current main machine PATH. Tauri validation can be scaffolded but cannot fully run until `cargo` and `rustc` are installed.
