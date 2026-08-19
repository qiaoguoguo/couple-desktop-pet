# Local Focus Countdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, local-only focus countdown with a compact running control and an independent completion reminder.

**Architecture:** Keep countdown correctness in a pure `focus-timer` domain module and persist the active session through dedicated Tauri commands in a separate JSON file. React owns setup, running, completion, and edge-hidden presentation, while the existing desktop bridge owns composer geometry and per-element interactive regions. Realtime sync and pet action/resource-pack state remain unchanged.

**Tech Stack:** TypeScript 7, React 19, Vitest, Tauri 2, Rust, CSS, WebdriverIO visual evidence.

**Spec:** `docs/superpowers/specs/2026-08-18-local-focus-countdown-design.md`

## Global Constraints

- The feature is local-only and must not change `shared/syncProtocol.ts` or realtime client/server code.
- Do not add a pet action, pet motion, pet scene, or resource-pack contract field.
- Use an absolute `endsAt` timestamp; interval ticks only refresh presentation.
- Support one timer with `idle`, `running`, `paused`, and `completed-unacknowledged` states.
- Duration is an integer from 1 through 180 minutes and defaults to 25.
- Visual reminder only; no sound dependency or audio asset.
- Preserve click-through and edge-hidden behavior by registering only visible timer controls as interactive regions.
- Keep existing user changes in the dirty worktree. Do not revert or reformat unrelated files.
- Do not commit from the worker task; the coordinating agent will review the shared dirty worktree.

---

### Task 1: Pure Countdown Domain

**Files:**
- Create: `src/focus-timer/focusTimer.ts`
- Create: `src/focus-timer/focusTimer.test.ts`

**Interfaces:**
- Produces `FocusTimerState`, `PersistedFocusTimer`, `startFocusTimer`, `pauseFocusTimer`, `resumeFocusTimer`, `completeFocusTimerIfDue`, `acknowledgeFocusTimer`, `repeatFocusTimer`, `getRemainingMs`, and `restoreFocusTimer`.
- All state transitions accept an explicit `now` number so tests do not depend on the wall clock.

- [ ] **Step 1: Write failing domain tests**

Cover duration clamping, absolute deadlines, pause/resume, due completion, repeat, acknowledgement, corrupt persisted input, and startup recovery. A representative assertion is:

```ts
const running = startFocusTimer(25, 1_000);
expect(running).toMatchObject({
  status: "running",
  durationMinutes: 25,
  startedAt: 1_000,
  endsAt: 1_501_000,
});
expect(getRemainingMs(running, 2_000)).toBe(1_499_000);
```

- [ ] **Step 2: Verify the tests fail because the module does not exist**

Run: `pnpm test -- src/focus-timer/focusTimer.test.ts`

- [ ] **Step 3: Implement the minimal discriminated-union state machine**

Use serializable state shapes:

```ts
export type FocusTimerState =
  | { status: "idle"; lastDurationMinutes: number }
  | { status: "running"; durationMinutes: number; startedAt: number; endsAt: number }
  | { status: "paused"; durationMinutes: number; remainingMs: number }
  | { status: "completed-unacknowledged"; durationMinutes: number; completedAt: number; collapsed: boolean };
```

`restoreFocusTimer(input, now)` must validate finite numbers, enforce the duration range, and immediately project expired running state to `completed-unacknowledged`.

- [ ] **Step 4: Run the focused tests green**

Run: `pnpm test -- src/focus-timer/focusTimer.test.ts`

---

### Task 2: Dedicated Local Persistence Bridge

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src/desktop/windowCommands.ts`
- Modify: `src/desktop/windowCommands.test.ts`
- Create: `src/focus-timer/focusTimerStore.ts`
- Create: `src/focus-timer/focusTimerStore.test.ts`

**Interfaces:**
- Tauri commands: `read_focus_timer() -> serde_json::Value` and `write_focus_timer(timer: serde_json::Value) -> Result<(), String>`.
- TypeScript bridge: `readFocusTimer(): Promise<unknown>` and `writeFocusTimer(timer: PersistedFocusTimer): Promise<void>`.
- Store API: `loadFocusTimer(api, now)` and `saveFocusTimer(api, state)`.

- [ ] **Step 1: Add failing Rust file persistence tests**

Use a `focus-timer.json` sibling of `settings.json`. Test invalid JSON fallback and parent-directory creation using the existing temp-path pattern.

- [ ] **Step 2: Run the Rust tests and verify RED**

Run: `cargo test --manifest-path src-tauri/Cargo.toml focus_timer -- --nocapture`

- [ ] **Step 3: Implement and register the two Tauri commands**

Reuse small generic JSON path helpers where doing so does not alter existing settings behavior. Never write countdown runtime into `PetSettings`.

- [ ] **Step 4: Add failing TypeScript bridge and store tests**

Assert exact command names and payload keys, and assert that load converts elapsed running state to one pending completion.

- [ ] **Step 5: Implement the TypeScript bridge/store and run both suites green**

Run:

```powershell
pnpm test -- src/desktop/windowCommands.test.ts src/focus-timer/focusTimerStore.test.ts
cargo test --manifest-path src-tauri/Cargo.toml focus_timer -- --nocapture
```

---

### Task 3: Interaction Entry, Asset, And Timer Composer Geometry

**Files:**
- Create: `src/assets/ui/interaction-buttons/new-tea-focus.png`
- Modify: `src/assets/README.md`
- Modify: `src/assets/builtInPetManifest.ts`
- Modify: `src/assets/builtInPetManifest.test.ts`
- Modify: `src/interaction/InteractionMenu.tsx`
- Modify: `src/interaction/InteractionMenu.test.tsx`
- Modify: `src/desktop/windowCommands.ts`
- Modify: `src/desktop/windowCommands.test.ts`
- Modify: `src-tauri/src/commands.rs`

**Interfaces:**
- Adds interaction function id `open-focus-timer` and icon name `focus`.
- Extends `ComposerSurface` with `focus`, logical size `440 x 320`.

- [ ] **Step 1: Add failing menu and geometry tests**

The approved menu order is:

```ts
[
  "撒娇卖萌",
  "发消息",
  "专注一下",
  "求抱抱",
  "外卖到啦",
  "我的状态",
]
```

Assert that the third menu item selects `open-focus-timer`, loads a PNG asset, and that Rust centers a `440 x 320` focus surface at 1.0, 1.25, and 1.5 scale factors.

- [ ] **Step 2: Verify focused TypeScript and Rust tests fail**

Run:

```powershell
pnpm test -- src/assets/builtInPetManifest.test.ts src/interaction/InteractionMenu.test.tsx src/desktop/windowCommands.test.ts
cargo test --manifest-path src-tauri/Cargo.toml composer -- --nocapture
```

- [ ] **Step 3: Add the approved asset and minimal enum/manifest/geometry changes**

The asset must be a transparent PNG with a black-and-white timer illustration and restrained `#f6534d` accent. Document it as project-generated in `src/assets/README.md`.

- [ ] **Step 4: Run the focused suites green**

Use the commands from Step 2.

---

### Task 4: Setup Panel And Running Controller

**Files:**
- Create: `src/focus-timer/FocusTimerPanel.tsx`
- Create: `src/focus-timer/FocusTimerPanel.test.tsx`
- Create: `src/focus-timer/FocusTimerPill.tsx`
- Create: `src/focus-timer/FocusTimerPill.test.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
- `FocusTimerPanel({ initialMinutes, onStart, onClose })`
- `FocusTimerPill({ state, now, open, onToggleOpen, onPause, onResume, onEnd })`

- [ ] **Step 1: Write failing setup-panel tests**

Assert default 25 minutes, preset selection, 1/180 bounds, minute stepper, start submission, and Escape/cancel behavior.

- [ ] **Step 2: Write failing running-pill tests**

Assert `MM:SS` projection, accessible icon controls, pause/resume branching, end command, and `data-desktop-interactive-region` on the visible control root.

- [ ] **Step 3: Verify RED**

Run: `pnpm test -- src/focus-timer/FocusTimerPanel.test.tsx src/focus-timer/FocusTimerPill.test.tsx`

- [ ] **Step 4: Implement both components with the existing composer primitives**

Use `.composer-card-shell`, `.composer-choice`, `.composer-action`, and `.composer-field-control`. Add only focus-specific layout classes; do not duplicate the message/surprise shell.

- [ ] **Step 5: Run focused tests and typecheck green**

Run:

```powershell
pnpm test -- src/focus-timer/FocusTimerPanel.test.tsx src/focus-timer/FocusTimerPill.test.tsx
pnpm typecheck
```

---

### Task 5: Completion Overlay And Surface Arbitration

**Files:**
- Create: `src/focus-timer/FocusTimerCompletion.tsx`
- Create: `src/focus-timer/FocusTimerCompletion.test.tsx`
- Create: `src/focus-timer/focusTimerPresentation.ts`
- Create: `src/focus-timer/focusTimerPresentation.test.ts`
- Modify: `src/app/app.css`

**Interfaces:**
- `FocusTimerCompletion({ state, presentation, onAcknowledge, onRepeat, onExpand })`
- Presentation states: `queued`, `animating`, `expanded`, `collapsed`, `hidden`.
- `projectFocusTimerPresentation(timer, surfaceOwner, now)` decides whether the completion UI is visible without mutating timer correctness state.

- [ ] **Step 1: Write failing presentation tests**

Cover the 2.4-second entrance, 12-second expanded interval, collapse-to-unread behavior, re-expansion, and queuing behind composer/remote-notice ownership.

- [ ] **Step 2: Write failing component tests**

Assert approved copy, `知道啦`, `再来一次`, collapsed unread icon, no pet action callback, interactive-region markup, and reduced-motion class/state.

- [ ] **Step 3: Verify RED, then implement the minimal overlay and CSS keyframes**

Run: `pnpm test -- src/focus-timer/FocusTimerCompletion.test.tsx src/focus-timer/focusTimerPresentation.test.ts`

- [ ] **Step 4: Run focused tests green**

Use the command from Step 3.

---

### Task 6: Application Integration And Recovery

**Files:**
- Create: `src/focus-timer/useFocusTimer.ts`
- Create: `src/focus-timer/useFocusTimer.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

**Interfaces:**
- `useFocusTimer({ readTimer, writeTimer, now? })` owns one-second display ticks, transition persistence, startup restore, and command callbacks.
- App adds composer mode `focus`, handles `open-focus-timer`, and renders the pill/completion layer outside `FramePetStage` without dispatching pet actions.

- [ ] **Step 1: Write failing hook tests**

Use fake timers to assert startup restore, exact deadline completion, pause/resume persistence, repeat, acknowledgement, and one completion after an elapsed restart.

- [ ] **Step 2: Write failing App integration tests**

Assert the local feature opens while unpaired, restores the pet window after start/cancel, does not call realtime APIs, hides the running pill behind message/surprise surfaces, queues completion behind transient owners, and preserves click-through settings.

- [ ] **Step 3: Verify RED**

Run: `pnpm test -- src/focus-timer/useFocusTimer.test.tsx src/app/App.test.tsx`

- [ ] **Step 4: Implement hook and minimal App wiring**

Keep lifecycle logic in the hook. `App.tsx` should only map menu selection and surface ownership to the focused components.

- [ ] **Step 5: Run focused tests and typecheck green**

Run:

```powershell
pnpm test -- src/focus-timer/useFocusTimer.test.tsx src/app/App.test.tsx
pnpm typecheck
```

---

### Task 7: Static Edge-Hidden Projection

**Files:**
- Modify: `src/pet/edgeNotice.ts`
- Modify: `src/pet/edgeNotice.test.ts`
- Modify: `src/app/edgeNoticeProjection.ts`
- Modify: `src/app/edgeNoticeProjection.test.ts`
- Modify: `src/renderer/EdgeNoticeCard.tsx`
- Modify: `src/renderer/EdgeNoticeCard.test.tsx`
- Modify: `src/renderer/EdgePetStage.tsx`
- Modify: `src/renderer/EdgePetStage.test.tsx`

**Interfaces:**
- Extend edge notice kind with local `timer` data or add a parallel typed projection if extending the remote notice union would blur ownership.
- Remote message/surprise notice remains higher priority than local running presentation.
- Completed timer notice projects inward and exposes acknowledge/repeat behavior without animating the micro mascot.

- [ ] **Step 1: Write failing edge projection and renderer tests**

Assert static running time, inward completion card on all four sides, remote-notice priority, click targets, and absence of mascot animation classes.

- [ ] **Step 2: Verify RED**

Run:

```powershell
pnpm test -- src/pet/edgeNotice.test.ts src/app/edgeNoticeProjection.test.ts src/renderer/EdgeNoticeCard.test.tsx src/renderer/EdgePetStage.test.tsx
```

- [ ] **Step 3: Implement the smallest typed projection compatible with current static edge mode**

Do not restore hover expansion, blinking, or prior edge interaction animations.

- [ ] **Step 4: Run focused tests green**

Use the command from Step 2.

---

### Task 8: Regression, Visual QA, And Debug Build

**Files:**
- Modify: `e2e/macos/specs/app-shell.e2e.ts` only if the established app-shell evidence flow can cover focus surfaces without platform-specific behavior.
- Modify: `docs/manual-verification/windows-mvp.md`
- Modify: `design-qa.md`
- Create: `.superpowers/visual-qa/focus-countdown/` screenshots and report artifacts.

**Interfaces:**
- No new product interface; this task validates the completed feature.

- [ ] **Step 1: Run focused and full automated verification**

```powershell
pnpm test -- src/focus-timer src/interaction/InteractionMenu.test.tsx src/app/App.test.tsx src/renderer/EdgePetStage.test.tsx
pnpm test
pnpm typecheck
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
```

- [ ] **Step 2: Start the local app/debug client and capture deterministic states**

Capture at least setup `25:00`, running `24:59`, paused, completion expanded, completion collapsed, left/right/top/bottom edge completion, and click-through region evidence. Test at Windows display scale 100% and 150% where available.

- [ ] **Step 3: Inspect screenshots for visual collisions and compare against the approved spec**

Reject clipped text, square opaque backgrounds, timer overlap with peer status, remote message, or surprise cards, and any mascot animation in edge-hidden mode.

- [ ] **Step 4: Build the Windows debug executable**

Run the repository's established Tauri debug build path and report the exact `.exe` path. Do not overwrite or delete previous target directories.

- [ ] **Step 5: Update manual verification and QA evidence**

Document timer recovery, tray hiding, click-through behavior, and the visual evidence paths.

## Self-Review

- Spec coverage: menu entry, asset, setup, running, paused, completion, collapse/reopen, repeat, edge-hidden, click-through, restart, sleep/deadline recovery, reduced motion, and visual QA are each assigned to a task.
- Placeholder scan: no deferred production behavior or unspecified error-handling steps remain.
- Type consistency: `FocusTimerState`, persisted bridge names, `open-focus-timer`, and `focus` composer surface are defined once and reused across tasks.
