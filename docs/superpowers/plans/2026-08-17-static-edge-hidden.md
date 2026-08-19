# Static Edge Hidden Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the animated edge companion with a static docked mascot while retaining persistent, clickable message and surprise notification cards.

**Architecture:** Keep the existing native edge docking, work-area geometry, precise interactive regions, and remote-message FIFO. Simplify the React edge controller to one stable `idle` rendering state, restore the native window directly when dragging or opening a notification, and project only the current message or surprise into a permanently expanded edge card.

**Tech Stack:** React 19, TypeScript 7 strict mode, Vitest, Testing Library, Tauri 2, Rust.

## Global Constraints

- Left, right, and bottom use the existing generated Q-girl `idle` PNG only; top uses one existing hanging idle frame.
- No blink, hover response, click-to-wake, enter animation, react animation, exit animation, marker collapse, presence dot, status card, or automatic return.
- The static mascot remains draggable; its alpha hit region and the active notification card are the only edge interactive regions.
- A normal message and a surprise each produce a persistent expanded card and open the existing full content after native restore.
- Closing full content leaves the pet in normal mode.
- Do not alter Relay payloads, pairing, remote-message FIFO, full message/surprise UI, or native docking geometry.
- Do not commit or stage files in the current mixed dirty worktree.

---

## File Map

- `src/pet/edgeInteraction.ts`: reduce the production edge state transition to direct static idle and cancellation.
- `src/pet/useEdgeInteraction.ts`: preload only static assets, dock directly into idle, and restore directly without animation or return intent.
- `src/app/edgeNoticeProjection.ts`: produce a static expanded notice state from the active remote item only.
- `src/app/App.tsx`: remove presence/timer/auto-return wiring and open full content after direct edge restore.
- `src/renderer/EdgeCompanionStage.tsx`: render one static micro-mascot frame and the optional expanded notification.
- `src/renderer/EdgePetStage.tsx`: support freezing the top hanging stage on one idle frame.
- `src/renderer/FramePetStage.tsx`: pass the static notice and frozen rendering mode; remove edge hover/click/phase callbacks.
- `src/app/app.css`: remove the obsolete micro-mascot hover transition and offset selectors.
- `src/pet/*.test.*`, `src/app/*.test.*`, `src/renderer/*.test.*`: replace animated behavior expectations with static behavior and preserve drag/card hit-region coverage.
- `docs/manual-verification/edge-interaction-v2.md`: replace obsolete animation/marker checks with the new static acceptance matrix.

---

### Task 1: Direct Static Docking And Restore

**Files:**
- Modify: `src/pet/edgeInteraction.ts`
- Modify: `src/pet/edgeInteraction.test.ts`
- Modify: `src/pet/useEdgeInteraction.ts`
- Modify: `src/pet/useEdgeInteraction.test.tsx`

**Interfaces:**
- Produces: `EdgeInteractionState` whose active production state is `{ side: EdgeSide; phase: "idle" }`.
- Produces: `snapAfterDrag(): Promise<void>` that docks and enters `idle` without a phase-complete callback.
- Produces: `requestExitThen(callback: () => void): void` that restores the native window, clears edge state, then calls the callback once.
- Produces: `handleLoadError(): Promise<void>` for the existing safe recovery path.
- Removes from the hook return contract: `requestExitForNotice`, `completeNoticeFlow`, `cancelNoticeReturn`, `handlePhaseComplete`, and `handlePointerEnter`.

- [ ] **Step 1: Replace state-machine tests with the static contract**

Write failing assertions in `src/pet/edgeInteraction.test.ts`:

```ts
expect(transitionEdgeInteraction(null, { type: "SNAPPED", side: "left" }))
  .toEqual({ side: "left", phase: "idle" });
expect(transitionEdgeInteraction({ side: "left", phase: "idle" }, { type: "CANCEL" }))
  .toBeNull();
```

Delete expectations for `enter -> idle -> react -> idle -> exit`. Retain contact-anchor and normalized-profile tests that still protect native geometry.

- [ ] **Step 2: Add hook tests for direct entry and direct restore**

In `src/pet/useEdgeInteraction.test.tsx`, assert all of the following:

```ts
await act(async () => result.current.snapAfterDrag());
expect(result.current.state).toEqual({ side: "left", phase: "idle" });
expect(result.current.renderState?.phase).toBe("idle");

act(() => result.current.requestExitThen(afterRestore));
expect(afterRestore).not.toHaveBeenCalled();
await waitFor(() => expect(afterRestore).toHaveBeenCalledTimes(1));
expect(result.current.state).toBeNull();
```

Also assert `preloadFrames` receives only the selected static top idle frame or micro-companion idle URL, never `enter`, `react`, or `blink` URLs. Keep package-switch, preload failure, docking failure, unmount, and image-load recovery races covered.

- [ ] **Step 3: Run the focused tests and confirm they fail**

```powershell
pnpm vitest run src/pet/edgeInteraction.test.ts src/pet/useEdgeInteraction.test.tsx
```

Expected: failures reference the current `enter`, `react`, delayed `exit`, and notice-return behavior.

- [ ] **Step 4: Implement the single-state controller**

Change `transitionEdgeInteraction` so `SNAPPED` creates `idle`, `CANCEL` clears state, and obsolete animation events cannot create another phase. In `useEdgeInteraction`:

```ts
function getRequiredStaticEdgeFrames(profile: EdgeInteractionProfile): readonly string[] {
  return profile.companion
    ? [profile.companion.idleUrl]
    : profile.idle.frames.slice(0, 1);
}
```

Use this helper before docking. Rework `requestExitThen` to guard concurrent restore, call `restoreWindowFromEdgePeek(current.side)`, clear `state/profile`, and invoke the callback only after successful restore. On failure, run the existing safe reset and do not invoke notification-open callbacks. Remove notice-return refs and phase/hover handlers.

- [ ] **Step 5: Run focused tests until green**

```powershell
pnpm vitest run src/pet/edgeInteraction.test.ts src/pet/useEdgeInteraction.test.tsx
```

Expected: PASS with direct static entry, direct restore, and all retained race/recovery cases.

---

### Task 2: Static Edge Rendering And Precise Input

**Files:**
- Modify: `src/renderer/EdgeCompanionStage.tsx`
- Modify: `src/renderer/EdgeCompanionStage.test.tsx`
- Modify: `src/renderer/EdgePetStage.tsx`
- Modify: `src/renderer/EdgePetStage.test.tsx`
- Modify: `src/renderer/FramePetStage.tsx`
- Modify: `src/renderer/FramePetStage.test.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
- Produces: `EdgeCompanionStage` props limited to `profile`, `scale`, `noticeState`, `onNoticeActivate`, and `onLoadError`.
- Produces: `EdgePetStage` static mode that renders `profile.idle.frames[0]` without scheduling animation timers.
- Consumes: the unchanged `data-desktop-interactive-region` contract and alpha bounds utilities.

- [ ] **Step 1: Write failing static renderer tests**

Update `src/renderer/EdgeCompanionStage.test.tsx` to assert:

```ts
expect(screen.getByTestId("edge-companion-frame")).toHaveAttribute(
  "src",
  profile.idleUrl,
);
expect(vi.getTimerCount()).toBe(0);
```

Dispatch pointer enter/leave and click on the mascot and assert no callbacks or visual frame changes occur. Start a pointer drag through `FramePetStage` and retain the existing assertion that the drag crosses the threshold and continues across the edge-to-normal rerender.

Add an `EdgePetStage` test proving the top static mode keeps the first idle frame after advancing fake time. Keep asset-failure and alpha-hit-region tests.

Add a source-level assertion that the production stylesheet no longer contains `.edge-companion-stage.is-hovered` or a transition on `.edge-companion-box`.

- [ ] **Step 2: Run renderer tests and confirm they fail**

```powershell
pnpm vitest run src/renderer/EdgeCompanionStage.test.tsx src/renderer/EdgePetStage.test.tsx src/renderer/FramePetStage.test.tsx
```

Expected: failures show blink timers, hover/react callbacks, click-to-wake, and top idle frame animation are still active.

- [ ] **Step 3: Simplify the micro companion**

Remove blink state, random delay, react timer, hover state, mascot click behavior, and notice hover callbacks from `EdgeCompanionStage`. Resolve alpha bounds once from `profile.idleUrl`, render that image only, and retain a drag-capable alpha hit surface with no `onClick`.

Delete the obsolete `.edge-companion-stage.is-hovered` offset rules and `.edge-companion-box` transition from `src/app/app.css` so the removed interaction cannot reappear through stale classes.

Render `EdgeNoticeCard` only when `noticeState.active` is a message or surprise and `noticeState.presentation === "expanded"`. Pass only `onActivate`; do not pass pointer-enter/leave handlers.

- [ ] **Step 4: Freeze the top stage and trim FramePetStage wiring**

Add a static/frozen rendering option to `EdgePetStage` that selects `profile.idle.frames[0]` and creates no playback timer. `FramePetStage` must always use this option for top edge idle and must remove `onEdgePhaseComplete`, `onEdgePointerEnter`, `onEdgePointerLeave`, and mascot `onPetClick` from edge rendering.

Do not change the outer pointer threshold logic: pointer down and movement on the static alpha hit surface must continue to bubble into the existing custom drag pipeline.

- [ ] **Step 5: Run renderer tests until green**

```powershell
pnpm vitest run src/renderer/EdgeCompanionStage.test.tsx src/renderer/EdgePetStage.test.tsx src/renderer/FramePetStage.test.tsx src/desktop/interactiveRegions.test.ts
```

Expected: PASS, zero static-stage animation timers, draggable mascot, clickable card, and precise hit regions.

---

### Task 3: Persistent Message And Surprise Cards

**Files:**
- Modify: `src/app/edgeNoticeProjection.ts`
- Modify: `src/app/edgeNoticeProjection.test.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

**Interfaces:**
- Produces: `projectStaticEdgeNotice(remoteMessages: RemoteMessageQueueState): EdgeNoticeState | null`.
- Consumes: active remote message content and existing message/surprise assets.
- Consumes: `requestExitThen` from Task 1 and current full `RemoteMessageLayer` behavior.

- [ ] **Step 1: Write failing projection tests**

Replace presence/timer expectations with these cases in `src/app/edgeNoticeProjection.test.ts`:

```ts
expect(projectStaticEdgeNotice(emptyQueue)).toBeNull();

expect(projectStaticEdgeNotice(textQueue)).toMatchObject({
  presentation: "expanded",
  expiresAt: null,
  active: { kind: "message", id: "message-1" },
});

expect(projectStaticEdgeNotice(surpriseQueue)).toMatchObject({
  presentation: "expanded",
  expiresAt: null,
  active: { kind: "surprise", id: "surprise-1" },
});
```

The function must not accept or project `peerStatusView`, and it must never return `presence`, `marker`, or an expiry timestamp.

- [ ] **Step 2: Add App integration tests**

Update the edge section of `src/app/App.test.tsx` to cover:

- peer presence changes render no edge notice surface or marker;
- active text renders one expanded message card and active surprise renders one expanded surprise card;
- pointer enter/leave does not change the card;
- clicking either card calls native restore, then reveals the existing full content;
- message acknowledgement or surprise dismissal does not call edge docking again;
- a simple click on the static mascot does not restore, while crossing the drag threshold does restore and continue movement;
- transparent regions and card buttons preserve their current interactive-region attributes.

- [ ] **Step 3: Run projection and App tests to confirm failure**

```powershell
pnpm vitest run src/app/edgeNoticeProjection.test.ts src/app/App.test.tsx
```

Expected: current presence notice, timers, exit animation, click-to-wake, and auto-return expectations fail.

- [ ] **Step 4: Implement the static projection**

Build an `EdgeNoticeState` only from `remoteMessages.active`. Set `active` to the existing message or surprise copy, `presentation: "expanded"`, `expiresAt: null`, `presenceMarker: null`, and the snapshot presence to `null`. Return `null` with no active remote item.

In `App.tsx`, remove `useEdgeNotice`, peer-status projection, notice pointer handlers, notice-return cancellation, dismissal completion return, and all `cancelNoticeReturn` calls. `handleEdgeNoticeActivate` must ignore non-remote kinds defensively and call:

```ts
requestEdgeExitThen(() => {
  // The existing active remote message becomes visible because edge mode is now off.
});
```

Keep `RemoteMessageLayer` hidden while edge mode is active and let it render after restore. Do not mutate or acknowledge the remote queue from the edge card click.

- [ ] **Step 5: Run the integration tests until green**

```powershell
pnpm vitest run src/app/edgeNoticeProjection.test.ts src/app/App.test.tsx src/sync/RemoteMessageLayer.test.tsx src/sync/useRealtimeSync.test.tsx
```

Expected: PASS with FIFO ownership unchanged and no automatic edge return.

---

### Task 4: Regression, Windows Visual QA, And Debug EXE

**Files:**
- Modify: `docs/manual-verification/edge-interaction-v2.md`
- Create: `.superpowers/sdd/2026-08-17-static-edge-hidden/progress.md`
- Create: `.superpowers/sdd/2026-08-17-static-edge-hidden/implementation-report.md`
- Create: `.superpowers/sdd/2026-08-17-static-edge-hidden/screenshots/*.png`

**Interfaces:**
- Produces: verified debug executable at `src-tauri/target-static-edge-debug/debug/couple-desktop-pet.exe`.

- [ ] **Step 1: Update the manual acceptance matrix**

Document exact left/right/top/bottom checks, static frame checks, drag recovery, message click, surprise click, no auto-return, and transparent desktop clicks. Remove checks for blink timing, hover expansion, state dots, markers, enter/exit animation, and same-edge return.

- [ ] **Step 2: Run focused feature tests**

```powershell
pnpm vitest run src/pet/edgeInteraction.test.ts src/pet/useEdgeInteraction.test.tsx src/renderer/EdgeCompanionStage.test.tsx src/renderer/EdgePetStage.test.tsx src/renderer/FramePetStage.test.tsx src/app/edgeNoticeProjection.test.ts src/app/App.test.tsx src/desktop/interactiveRegions.test.ts src/desktop/windowCommands.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run complete verification gates**

```powershell
pnpm test
pnpm typecheck
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: every command exits `0`. Record any pre-existing unrelated failure instead of altering unrelated modules.

- [ ] **Step 4: Build an isolated debug executable**

```powershell
$env:CARGO_TARGET_DIR = (Join-Path (Resolve-Path 'src-tauri').Path 'target-static-edge-debug')
pnpm tauri build --debug --no-bundle
Test-Path 'src-tauri\target-static-edge-debug\debug\couple-desktop-pet.exe'
```

Expected: build exits `0`; `Test-Path` returns `True`.

- [ ] **Step 5: Launch only the new debug executable**

```powershell
$exe = (Resolve-Path 'src-tauri\target-static-edge-debug\debug\couple-desktop-pet.exe').Path
$process = Start-Process -FilePath $exe -WindowStyle Hidden -PassThru
$process.Id
```

Do not terminate another `couple-desktop-pet.exe` from a different target directory.

- [ ] **Step 6: Capture Windows evidence**

Capture and inspect:

- left, right, bottom static micro mascot;
- top static hanging frame;
- message card at one side and one horizontal edge;
- surprise card at one side and one horizontal edge;
- full message and full surprise after card click;
- the normal pet remaining visible after content closes;
- drag recovery from every edge with no square outline;
- clicks through transparent corners to the desktop.

Reject the build if any screenshot contains a presence dot, marker badge, blink frame, hover motion, clipping, broken asset, colored square, card overlap, card outside the work area, or full-window input blocking.

- [ ] **Step 7: Record artifact identity**

```powershell
Get-Item 'src-tauri\target-static-edge-debug\debug\couple-desktop-pet.exe' |
  Select-Object FullName, Length, LastWriteTime
Get-FileHash 'src-tauri\target-static-edge-debug\debug\couple-desktop-pet.exe' -Algorithm SHA256
```

Record the absolute path, PID, byte size, timestamp, SHA-256, test totals, Rust test totals, and screenshot paths in the implementation report.

---

## Self-Review

- Spec coverage: all static-state, two-card, direct-restore, no-auto-return, hit-region, failure, regression, and EXE requirements map to Tasks 1-4.
- Placeholder scan: no `TBD`, `TODO`, deferred implementation, or unspecified test step remains.
- Type consistency: `projectStaticEdgeNotice` returns `EdgeNoticeState | null`; renderers consume that exact shape; `requestExitThen` remains the sole native restore coordinator used by App and dragging.
- Scope: no Relay, pairing, remote-message queue, full-content visual, or native docking geometry change is planned.
