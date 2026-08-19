# 屏幕边缘微型陪伴 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将左右和下方的裁切式边缘隐藏替换为批准的微型 Q-girl，并让状态、普通消息和小心意在边缘隐藏时按 3/8/12 秒规则可靠反馈。

**Architecture:** 保留现有远程消息 FIFO 和边缘进入/退出状态机，新增独立的纯 `EdgeNoticeState` 管理边缘提示的展开、标记和计时。原生窗口停靠在工作区内，渲染层用专用微型角色资源和方向布局实现视觉隐藏；App 只负责把对方状态与 active remote message 投影为边缘快照，并协调“查看后回原边缘”。

**Tech Stack:** Tauri 2、Rust、React 19、TypeScript 7、Vitest、Testing Library、透明 PNG 资源、Windows 原生交互区域轮询。

## Global Constraints

- 左右和下方使用“圆脑袋 + 圆眼镜 + 双手扒边/托边”的完整微型角色；上方继续使用现有双手悬挂资源。
- `1.0x` 可见角色高度 `34px`，随桌宠缩放并限制在 `30–42px`；提示卡不跟随桌宠缩放。
- 眨眼约 `140ms`，随机间隔 `8–14s`，无连续双闪和持续摇摆。
- 状态、普通消息、小心意分别在 `3s`、`8s`、`12s` 后收起。
- 小心意边缘文案不得出现“外卖”“取件码”“暗号”，也不得提前暴露秘密内容。
- 普通消息和小心意继续使用现有 `RemoteMessageQueueState` FIFO；边缘预览不得修改消息 stage。
- 视觉重要度为“小心意 > 普通消息 > 状态”，但不得中断已经展开的远程消息或重排现有 FIFO。
- 只有微型角色 alpha 包围盒、提示卡和标记可阻挡鼠标；完整 `320x360` 透明舞台必须点击穿透。
- 不修改 Relay、同步协议、配对、服务器部署或导入包格式。
- 不使用 emoji、Unicode 图标、黄色方块、文字占位、品牌 Logo 或临时 CSS 图形代替图片资源。
- 当前工作树已有大量未提交改动。不得还原、覆盖或提交任务开始前的改动；每个检查点只记录本任务差异，只有能明确隔离当前任务文件时才允许提交。

## File Map

- Create `src/pet/edgeNotice.ts`: 边缘提示纯状态、优先级和计时规则。
- Create `src/pet/edgeNotice.test.ts`: 3/8/12 秒、悬停、标记、状态覆盖和远程消息优先级测试。
- Create `src/pet/useEdgeNotice.ts`: React 计时器与纯状态机桥接。
- Create `src/assets/builtInEdgeCompanion.ts`: 内置微型角色资源注册表。
- Create `src/assets/builtInEdgeCompanion.test.ts`: 方向、尺寸和资源完整性测试。
- Create `src/assets/pets/q-girl/edge-companion/{side,bottom}/{idle,blink}.png`: 批准的透明产品资源。
- Create `src/renderer/edgeCompanionLayout.ts`: 尺寸 clamp 和四边向内展开布局。
- Create `src/renderer/edgeCompanionLayout.test.ts`: 缩放和方向布局测试。
- Create `src/renderer/EdgeNoticeCard.tsx`: 状态、消息、小心意和收起标记。
- Create `src/renderer/EdgeNoticeCard.test.tsx`: 文案、图标、交互区域和秘密隐藏测试。
- Create `src/renderer/EdgeCompanionStage.tsx`: 微型角色、眨眼和卡片锚点。
- Create `src/renderer/EdgeCompanionStage.test.tsx`: 微型角色渲染、眨眼与 alpha 输入区域测试。
- Create `src/app/edgeNoticeProjection.ts`: 将现有状态和远程消息投影为边缘快照。
- Create `src/app/edgeNoticeProjection.test.ts`: 状态 revision、消息文案、未读数量和小心意脱敏测试。
- Modify `src/pet/edgeInteraction.ts`: 为工作区内停靠提供舞台接触锚点辅助函数。
- Modify `src/assets/builtInEdgeInteraction.ts`: 把微型视觉配置挂到内置 Q-girl 的左右和下方 profile。
- Modify `src/assets/builtInEdgeInteraction.test.ts`: 验证顶部保持旧资源且导入包不回退。
- Modify `src/pet/useEdgeInteraction.ts`: 增加通知查看返回意图和直接回原边缘能力。
- Modify `src/renderer/EdgePetStage.tsx`: 将原有边缘帧接触点对齐到舞台真实边界。
- Modify `src/renderer/FramePetStage.tsx`: 非顶部 idle 使用微型 stage，顶部和 enter/exit 保持现有序列帧。
- Modify `src/app/App.tsx`: 投影边缘提示、打开完整消息、关闭后归位并取消不适用的归位意图。
- Modify `src/app/app.css`: 实现已批准提示卡、方向布局、动画和 reduced-motion。
- Modify `src/desktop/windowCommands.ts`: 暴露 `dockWindowAtEdge(side)`。
- Modify `src/desktop/windowCommands.test.ts`: 新命令桥接测试。
- Modify `src-tauri/src/commands.rs`: 工作区内四边停靠和直接回边缘命令。
- Modify `src-tauri/src/main.rs`: 注册新 Tauri 命令。
- Modify `src/assets/README.md`: 记录新增自制/生成资源。
- Modify `docs/manual-verification/edge-interaction-v2.md`: 更新四边、提示、穿透和缩放验收步骤。

---

### Task 1: 边缘提示纯状态模型

**Files:**
- Create: `src/pet/edgeNotice.ts`
- Create: `src/pet/edgeNotice.test.ts`

**Interfaces:**
- Produces:
  - `EdgeNoticeKind = "presence" | "message" | "surprise"`
  - `EdgeNoticePresentation = "hidden" | "expanded" | "marker"`
  - `EdgeNoticeSnapshot`
  - `EdgeNoticeState`
  - `createEdgeNoticeState(snapshot)`
  - `transitionEdgeNotice(state, event)`
  - `getEdgeNoticeTimeoutMs(kind)`

- [ ] **Step 1: Write failing timing and priority tests**

```ts
it.each([
  ["presence", 3000],
  ["message", 8000],
  ["surprise", 12000],
] as const)("uses the approved %s timeout", (kind, expected) => {
  expect(getEdgeNoticeTimeoutMs(kind)).toBe(expected);
});

it("keeps the active remote message ahead of a later presence revision", () => {
  const state = createEdgeNoticeState(emptySnapshot);
  const withMessage = transitionEdgeNotice(state, {
    type: "SNAPSHOT_CHANGED",
    now: 100,
    snapshot: messageSnapshot("m-1", 1),
  });
  const withPresence = transitionEdgeNotice(withMessage, {
    type: "SNAPSHOT_CHANGED",
    now: 200,
    snapshot: {
      ...messageSnapshot("m-1", 1),
      presence: onlinePresence("online:2"),
    },
  });

  expect(withPresence.active?.kind).toBe("message");
  expect(withPresence.presenceMarker).toBe("online");
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `pnpm vitest run src/pet/edgeNotice.test.ts`

Expected: FAIL because `edgeNotice.ts` does not exist.

- [ ] **Step 3: Implement the exact state contract**

```ts
export type PresenceMarkerTone = "online" | "offline";
export type EdgeNoticeKind = "presence" | "message" | "surprise";
export type EdgeNoticePresentation = "hidden" | "expanded" | "marker";

export interface EdgePresenceNotice {
  kind: "presence";
  revision: string;
  tone: PresenceMarkerTone;
  title: string;
  detail: string;
  iconUrl: string;
}

export interface EdgeRemoteNotice {
  kind: "message" | "surprise";
  id: string;
  title: string;
  detail: string;
  iconUrl: string;
  unreadCount: number;
}

export interface EdgeNoticeSnapshot {
  presence: EdgePresenceNotice | null;
  remote: EdgeRemoteNotice | null;
}

export interface EdgeNoticeState {
  snapshot: EdgeNoticeSnapshot;
  active: EdgePresenceNotice | EdgeRemoteNotice | null;
  presentation: EdgeNoticePresentation;
  expiresAt: number | null;
  presenceMarker: PresenceMarkerTone | null;
  announcedPresenceRevision: string | null;
  announcedRemoteId: string | null;
}
```

Implement `SNAPSHOT_CHANGED`, `TIMER_EXPIRED`, `POINTER_ENTER`, `POINTER_LEAVE`, `EDGE_ENTERED`, and `EDGE_EXITED`. A new remote ID expands immediately; an unchanged remote stays in its current presentation. A presence revision expands only when no remote is active. Timer expiry converts presence/message/surprise to the correct marker and never clears surprise automatically.

- [ ] **Step 4: Add edge-case tests**

Cover these exact assertions:

```ts
expect(expire(presenceState).presentation).toBe("marker");
expect(expire(messageState).presentation).toBe("marker");
expect(expire(surpriseState).presentation).toBe("marker");
expect(hover(markerState).presentation).toBe("expanded");
expect(leave(hover(markerState)).presentation).toBe("marker");
expect(reconcileSameRemote(expandedState).expiresAt).toBe(expandedState.expiresAt);
expect(reconcileNewRemote(oldMessageState, surpriseSnapshot).active?.kind).toBe("surprise");
```

- [ ] **Step 5: Run the focused tests**

Run: `pnpm vitest run src/pet/edgeNotice.test.ts`

Expected: PASS.

- [ ] **Step 6: Record checkpoint**

Record the focused test result and exact changed files in `.superpowers/sdd/2026-08-14-edge-hidden-companion/progress.md`. Do not stage pre-existing changes.

---

### Task 2: 生成并注册批准的微型角色资源

**Files:**
- Create: `src/assets/pets/q-girl/edge-companion/side/idle.png`
- Create: `src/assets/pets/q-girl/edge-companion/side/blink.png`
- Create: `src/assets/pets/q-girl/edge-companion/bottom/idle.png`
- Create: `src/assets/pets/q-girl/edge-companion/bottom/blink.png`
- Create: `src/assets/builtInEdgeCompanion.ts`
- Create: `src/assets/builtInEdgeCompanion.test.ts`
- Modify: `src/pet/edgeInteraction.ts`
- Modify: `src/assets/builtInEdgeInteraction.ts`
- Modify: `src/assets/builtInEdgeInteraction.test.ts`
- Modify: `src/assets/README.md`

**Interfaces:**
- Consumes: `EdgeSide` from `src/pet/edgeInteraction.ts`.
- Produces: `EdgeCompanionVisualProfile` in the pet contract and `getBuiltInEdgeCompanionVisual(packageId, side)` in the assets registry.

- [ ] **Step 1: Write the failing profile test**

```ts
it("registers micro visuals only for built-in left, right, and bottom", () => {
  expect(getBuiltInEdgeCompanionVisual("builtin:q-girl", "left")?.mirrorX).toBe(true);
  expect(getBuiltInEdgeCompanionVisual("builtin:q-girl", "right")?.mirrorX).toBe(false);
  expect(getBuiltInEdgeCompanionVisual("builtin:q-girl", "bottom")?.placement).toBe("bottom");
  expect(getBuiltInEdgeCompanionVisual("builtin:q-girl", "top")).toBeNull();
  expect(getBuiltInEdgeCompanionVisual("imported:any", "right")).toBeNull();
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `pnpm vitest run src/assets/builtInEdgeCompanion.test.ts`

Expected: FAIL because the registry does not exist.

- [ ] **Step 3: Generate the side and bottom idle assets**

Use `docs/assets/edge-hidden-micro-mascot-approved.png` and `docs/assets/edge-hidden-micro-mascot-directions-approved.png` as visual references with this production prompt:

```text
Create one production transparent PNG desktop-pet sprite matching the approved Q-girl micro mascot exactly: complete compact round dark-brown hair silhouette, oversized round black glasses, huge warm brown eyes, gentle smile, two tiny hands, tiny cool-lavender collar. Preserve the approved proportions and premium hand-painted line quality. For side: both hands grip an invisible vertical screen edge on the right side. For bottom: face upright, chin and both hands rest on an invisible horizontal bottom edge. Tight alpha crop with 8 px transparent safety padding, no backdrop, no shadow, no line representing the screen, no text, no badge, no body, no extra character. Optimize for 34 px visible height.
```

Generate side and bottom separately. Do not derive bottom by rotating the side asset.

- [ ] **Step 4: Generate closed-eye frames as edits**

Edit each approved idle PNG with this exact delta:

```text
Keep every pixel-level design choice, crop, pose, hands, glasses, hair, colors and transparent padding unchanged. Close both eyes into two gentle curved eyelids behind the glasses. Do not move the head, hands, glasses or edge contact point. Transparent background.
```

Reject and regenerate any result whose alpha bounds differ from the matching idle frame by more than `2px` on any side at source resolution.

- [ ] **Step 5: Validate asset alpha and visual fidelity**

Use PowerShell `System.Drawing.Bitmap` to assert all four corner alpha values are `0`, then inspect all assets at native size and reduced to `34px` visible height on black, white and mixed backgrounds. Reject colored rectangles, black matte backgrounds, broken glasses, lost hands, extra fingers or dirty outlines.

- [ ] **Step 6: Implement the resource registry**

```ts
export interface EdgeCompanionVisualProfile {
  side: "left" | "right" | "bottom";
  placement: "side" | "bottom";
  idleUrl: string;
  blinkUrl: string;
  mirrorX: boolean;
  baseVisibleHeightPx: 34;
  minVisibleHeightPx: 30;
  maxVisibleHeightPx: 42;
}
```

Declare this interface in `src/pet/edgeInteraction.ts`, then use `new URL(..., import.meta.url).href` for the four PNG resources in `builtInEdgeCompanion.ts`. Return `null` for `top` and all imported packages. Add `companion?: EdgeCompanionVisualProfile` to `EdgeInteractionProfile`, and populate it in `builtInEdgeInteraction.ts` only for left, right and bottom.

- [ ] **Step 7: Run focused tests and update licensing notes**

Run: `pnpm vitest run src/assets/builtInEdgeCompanion.test.ts src/assets/builtInEdgeInteraction.test.ts src/assets/builtInPetManifest.test.ts`

Expected: PASS. Add an `edge-companion` entry to `src/assets/README.md` identifying the files as project-generated original assets and linking the two approved design references.

- [ ] **Step 8: Visual review checkpoint**

Capture side and bottom at true `30px`, `34px`, and `42px` visible heights. The main agent must approve these images before Task 3 integrates them.

---

### Task 3: 微型角色和分层提示渲染

**Files:**
- Create: `src/renderer/edgeCompanionLayout.ts`
- Create: `src/renderer/edgeCompanionLayout.test.ts`
- Create: `src/renderer/EdgeNoticeCard.tsx`
- Create: `src/renderer/EdgeNoticeCard.test.tsx`
- Create: `src/renderer/EdgeCompanionStage.tsx`
- Create: `src/renderer/EdgeCompanionStage.test.tsx`
- Modify: `src/renderer/FramePetStage.tsx`
- Modify: `src/renderer/FramePetStage.test.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
- Consumes: `EdgeNoticeState`, `EdgeCompanionVisualProfile`.
- Produces: `getEdgeCompanionVisibleHeight(scale, profile)`, `EdgeCompanionStage`, `EdgeNoticeCard`.

- [ ] **Step 1: Write failing layout tests**

```ts
it.each([
  [0.6, 30],
  [1, 34],
  [1.45, 42],
  [2, 42],
] as const)("clamps scale %s to %spx", (scale, height) => {
  expect(getEdgeCompanionVisibleHeight(scale, visual)).toBe(height);
});

expect(getEdgeNoticePlacement("left")).toEqual({ axis: "x", direction: 1 });
expect(getEdgeNoticePlacement("right")).toEqual({ axis: "x", direction: -1 });
expect(getEdgeNoticePlacement("top")).toEqual({ axis: "y", direction: 1 });
expect(getEdgeNoticePlacement("bottom")).toEqual({ axis: "y", direction: -1 });
```

- [ ] **Step 2: Run the layout tests and confirm RED**

Run: `pnpm vitest run src/renderer/edgeCompanionLayout.test.ts`

Expected: FAIL because the layout module does not exist.

- [ ] **Step 3: Implement layout helpers and card markup**

`EdgeNoticeCard` must render these exact structures:

```tsx
<button data-edge-notice-kind="message" data-desktop-interactive-region="">
  <img src={notice.iconUrl} alt="" aria-hidden="true" />
  <span><strong>{notice.title}</strong><small>{notice.detail}</small></span>
</button>
```

Presence uses a project status image plus title/detail. Message uses the peer avatar and a single-line ellipsis. Surprise uses `heart-surprise.png`, title “有一份心意正在等你” and detail “点一下，让惊喜慢慢打开”. Marker rendering rules are: presence color dot, message numeric badge capped at `9+`, surprise transparent heart image. No marker may use `♥`, emoji or a text character as its icon.

- [ ] **Step 4: Write failing render and privacy tests**

```ts
expect(screen.getByText("有一份心意正在等你")).toBeTruthy();
expect(screen.queryByText(/外卖|取件码|暗号|7482/)).toBeNull();
expect(screen.getByRole("button", { name: /有一份心意/ })).toHaveAttribute(
  "data-desktop-interactive-region",
  "",
);
expect(container.querySelector(".edge-notice-surface")?.hasAttribute(
  "data-desktop-interactive-region",
)).toBe(false);
```

- [ ] **Step 5: Implement `EdgeCompanionStage` blink scheduling**

Use `getNextBlinkDelayMs(randomValue) = 8000 + Math.round(clamp(randomValue, 0, 1) * 6000)`. Schedule one frame swap to `blinkUrl` for `140ms`, restore `idleUrl`, then schedule the next interval. Clear both timers on unmount, phase change and asset error. Under `prefers-reduced-motion: reduce`, keep the idle frame and disable the `2px` hover translation.

The image element and notice card are separate interactive regions. Use resolved image alpha bounds for the image hit rectangle; never mark `.edge-companion-stage` itself interactive.

- [ ] **Step 6: Route non-top idle to the micro stage**

In `FramePetStage`:

```tsx
const useMicroCompanion =
  edgeInteraction?.profile.companion != null &&
  (edgeInteraction.phase === "idle" || edgeInteraction.phase === "react");
```

Render `EdgeCompanionStage` for that condition. Continue rendering `EdgePetStage` for `enter`, `exit`, and every top phase. Preserve the existing custom pointer drag pipeline and suppress browser image dragging.

- [ ] **Step 7: Implement approved CSS tokens**

Use the exact card tokens from the spec: `#FBFCFA`, `1.3px #171715`, `7px`, `0 9px 20px rgba(27,31,28,.16)`. Widths are `126px`, `224px`, and `252px`. All cards expand toward the stage interior using `data-edge-side`; no font size may depend on viewport width.

- [ ] **Step 8: Run focused render tests**

Run:

```powershell
pnpm vitest run src/renderer/edgeCompanionLayout.test.ts src/renderer/EdgeNoticeCard.test.tsx src/renderer/EdgeCompanionStage.test.tsx src/renderer/FramePetStage.test.tsx
```

Expected: PASS.

---

### Task 4: 工作区内停靠与舞台接触点

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src/desktop/windowCommands.ts`
- Modify: `src/desktop/windowCommands.test.ts`
- Modify: `src/pet/edgeInteraction.ts`
- Modify: `src/pet/edgeInteraction.test.ts`
- Modify: `src/renderer/EdgePetStage.tsx`
- Modify: `src/renderer/EdgePetStage.test.tsx`

**Interfaces:**
- Produces: Tauri command `dock_window_at_edge`, TS bridge `dockWindowAtEdge(side)` and `getEdgeStageContactAnchor(side)`.

- [ ] **Step 1: Write failing Rust geometry tests**

```rust
#[test]
fn edge_dock_keeps_the_complete_window_inside_the_work_area() {
    let area = WorkArea { x: -1920, y: 0, width: 1920, height: 1040 };
    let window = WindowGeometry { x: -500, y: 300, width: 320, height: 360 };

    assert_eq!(calculate_edge_dock_position(EdgePeekSide::Left, area, window).x, -1920);
    assert_eq!(calculate_edge_dock_position(EdgePeekSide::Right, area, window).x, -320);
    assert_eq!(calculate_edge_dock_position(EdgePeekSide::Top, area, window).y, 0);
    assert_eq!(calculate_edge_dock_position(EdgePeekSide::Bottom, area, window).y, 680);
}
```

Also assert the orthogonal axis remains clamped inside the same work area.

- [ ] **Step 2: Run the Rust test and confirm RED**

Run: `cargo test --manifest-path src-tauri/Cargo.toml edge_dock -- --nocapture`

Expected: FAIL because `calculate_edge_dock_position` does not exist.

- [ ] **Step 3: Implement inside-work-area docking**

Replace the partial off-screen snap position with:

```rust
match side {
    EdgePeekSide::Left => PhysicalPosition::new(work_area.x, clamped_y),
    EdgePeekSide::Right => PhysicalPosition::new(work_right - window.width as i32, clamped_y),
    EdgePeekSide::Top => PhysicalPosition::new(clamped_x, work_area.y),
    EdgePeekSide::Bottom => PhysicalPosition::new(clamped_x, work_bottom - window.height as i32),
}
```

`snap_window_to_edge_if_needed` continues detecting the closest edge, then calls the same dock helper. Add `dock_window_at_edge(app, side)` for automatic return. Neither command saves the docked position as the normal pet position.

- [ ] **Step 4: Add and test the TS command bridge**

```ts
export function dockWindowAtEdge(side: EdgePeekSide): Promise<void> {
  return invokeCommand<void>("dock_window_at_edge", { side });
}
```

Run: `pnpm vitest run src/desktop/windowCommands.test.ts`

Expected: PASS with an assertion for the exact command name and `{ side: "right" }` payload.

- [ ] **Step 5: Align old animation anchors to real stage edges**

Add:

```ts
export const edgeStageContactAnchors: Record<EdgeSide, EdgeAnchor> = {
  left: { x: 0, y: 0.5 },
  right: { x: 1, y: 0.5 },
  top: { x: 0.5, y: 0 },
  bottom: { x: 0.5, y: 1 },
};
```

In `EdgePetStage`, calculate frame translation from `stageContactAnchor - frameAnchor`, not `profile.contactAnchor - frameAnchor`. Keep scale transform origin on the stage contact anchor. This reproduces physical clipping inside the transparent WebView and keeps the existing top hands at the real screen top.

- [ ] **Step 6: Run frontend and Rust geometry tests**

Run:

```powershell
pnpm vitest run src/pet/edgeInteraction.test.ts src/renderer/EdgePetStage.test.tsx src/desktop/windowCommands.test.ts
cargo test --manifest-path src-tauri/Cargo.toml edge -- --nocapture
```

Expected: PASS, including negative-coordinate secondary-monitor cases.

---

### Task 5: React 计时器、退出查看和自动归位

**Files:**
- Create: `src/pet/useEdgeNotice.ts`
- Create: `src/pet/useEdgeNotice.test.tsx`
- Modify: `src/pet/useEdgeInteraction.ts`
- Modify: `src/pet/useEdgeInteraction.test.tsx`

**Interfaces:**
- Consumes: `transitionEdgeNotice`, `dockWindowAtEdge`.
- Produces from `useEdgeNotice`: `state`, `handlePointerEnter`, `handlePointerLeave`, `handleNoticeOpen`.
- Produces from `useEdgeInteraction`: `requestExitForNotice(messageId)`, `completeNoticeFlow(messageId)`, `cancelNoticeReturn()`.

- [ ] **Step 1: Write failing fake-timer tests for `useEdgeNotice`**

Mount with a presence snapshot, then a new message snapshot. Assert the message starts expanded, remains expanded at `7999ms`, becomes a marker at `8000ms`, re-expands on pointer enter and returns to marker on pointer leave. Re-rendering the same message ID must not restart the timeout.

- [ ] **Step 2: Run the hook test and confirm RED**

Run: `pnpm vitest run src/pet/useEdgeNotice.test.tsx`

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement one deadline timer**

`useEdgeNotice` must keep exactly one timeout for `state.expiresAt`. On callback, dispatch `TIMER_EXPIRED` with `Date.now()`. Reconcile by absolute deadlines so system sleep or background throttling does not replay stale cards. Clear the timer while edge mode is inactive.

- [ ] **Step 4: Write failing return-intent tests**

```ts
it("returns to the same edge only after the opened message completes", async () => {
  const hook = renderEdgeHook({ side: "right" });
  act(() => hook.result.current.requestExitForNotice("m-1"));
  await finishExit(hook);
  await act(() => hook.result.current.completeNoticeFlow("m-1"));

  expect(dockWindowAtEdge).toHaveBeenCalledWith("right");
  expect(hook.result.current.state).toEqual({ side: "right", phase: "enter" });
});

it("does not return after drag cancels the intent", async () => {
  const hook = renderEdgeHook({ side: "right" });
  act(() => hook.result.current.requestExitForNotice("m-1"));
  act(() => hook.result.current.cancelNoticeReturn());
  await act(() => hook.result.current.completeNoticeFlow("m-1"));
  expect(dockWindowAtEdge).not.toHaveBeenCalled();
});
```

- [ ] **Step 5: Implement return intent without duplicating edge activation**

Extract an internal `activateEdge(side, dock)` callback used by both initial snap and automatic return. `requestExitForNotice` stores `{ side, messageId }` before requesting exit. `completeNoticeFlow` returns `Promise<boolean>` and only reactivates when IDs match, there is no current edge state, required sequence and companion resources preload successfully, and the intent has not been canceled.

- [ ] **Step 6: Run focused hook tests**

Run: `pnpm vitest run src/pet/useEdgeNotice.test.tsx src/pet/useEdgeInteraction.test.tsx`

Expected: PASS.

---

### Task 6: App 状态与远程消息集成

**Files:**
- Create: `src/app/edgeNoticeProjection.ts`
- Create: `src/app/edgeNoticeProjection.test.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/renderer/FramePetStage.tsx`

**Interfaces:**
- Consumes: `PeerStatusView`, `RemoteMessageQueueState`, `EdgeNoticeSnapshot`, `useEdgeNotice`, `useEdgeInteraction` return-intent methods.
- Produces: `projectEdgeNoticeSnapshot({ peerStatusView, remoteMessages })`.

- [ ] **Step 1: Write failing projection tests**

```ts
it("projects a surprise without leaking its secret", () => {
  const snapshot = projectEdgeNoticeSnapshot({
    peerStatusView: onlineView,
    remoteMessages: surpriseQueue({ secret: "7482", note: "原谅我" }),
  });

  expect(snapshot.remote).toMatchObject({
    kind: "surprise",
    title: "有一份心意正在等你",
    detail: "点一下，让惊喜慢慢打开",
  });
  expect(JSON.stringify(snapshot.remote)).not.toMatch(/7482|暗号|外卖|取件码/);
});

it("caps ordinary unread count at the renderer boundary", () => {
  expect(projectEdgeNoticeSnapshot(manyMessages).remote?.unreadCount).toBe(12);
});
```

Presence revision must be stable for unchanged `variant/title/detail` and change when any of those fields changes.

- [ ] **Step 2: Run the projection test and confirm RED**

Run: `pnpm vitest run src/app/edgeNoticeProjection.test.ts`

Expected: FAIL because the projection module does not exist.

- [ ] **Step 3: Implement projection without owning queue state**

Use only `remoteMessages.active` as the edge remote source. Compute `unreadCount` from `active + queue` without mutating either. For normal messages use the raw text as `title` and “有一句话想让你看见” as detail; CSS performs single-line ellipsis. For surprise always use the approved emotional copy and existing heart image.

- [ ] **Step 4: Add failing App integration tests**

Cover these scenarios:

1. Edge idle + new peer status renders a presence edge card and no `PeerStatusCard`.
2. Edge idle + text message renders an edge preview; `RemoteMessageLayer` remains absent.
3. Hovering an edge message does not call `markRemoteMessageHovered` or change the remote stage.
4. Clicking the edge message exits edge mode, then renders the existing full `RemoteMessageLayer`.
5. Dismissing that same message calls `completeNoticeFlow(messageId)` and returns to the original edge.
6. Drag, settings, composer, hide, or click-through change calls `cancelNoticeReturn()`.
7. A queued surprise does not jump ahead of the current active normal message.

- [ ] **Step 5: Integrate hooks and renderer props**

Keep these ownership rules in `App.tsx`:

```ts
const edgeNoticeSnapshot = projectEdgeNoticeSnapshot({
  peerStatusView,
  remoteMessages,
});
const edgeNotice = useEdgeNotice({
  active: isEdgeInteractionActive,
  snapshot: edgeNoticeSnapshot,
});
```

Pass `edgeNotice.state` into `FramePetStage` only during stable edge idle/react. `RemoteMessageLayer` continues receiving `null` while edge mode is active. `handleNoticeOpen` only requests edge exit for `message` and `surprise`; presence click performs a normal edge exit without setting return intent.

In the existing dismissal timer, preserve `activeMessage.id`, await `completeNoticeFlow(activeMessage.id)`, and only then call `completeRemoteMessageDismissal`. This guarantees that a promoted next FIFO item cannot flash as a full desktop message before edge mode is restored. Cancel return intent from every explicit user path listed in the test.

- [ ] **Step 6: Run App and remote-message regressions**

Run:

```powershell
pnpm vitest run src/app/edgeNoticeProjection.test.ts src/app/App.test.tsx src/sync/remoteMessageQueue.test.ts src/sync/RemoteMessageLayer.test.tsx src/surprise/SurpriseMessageCard.test.tsx
```

Expected: PASS, with existing FIFO and message-stage tests unchanged.

---

### Task 7: 全量验证、原生视觉验收和 debug EXE

**Files:**
- Modify: `docs/manual-verification/edge-interaction-v2.md`
- Create: `.superpowers/sdd/2026-08-14-edge-hidden-companion/progress.md`
- Create: `.superpowers/sdd/2026-08-14-edge-hidden-companion/implementation-report.md`
- Create: `.superpowers/sdd/2026-08-14-edge-hidden-companion/screenshots/*.png`

**Interfaces:**
- Produces: verified debug executable at `src-tauri/target-edge-hidden-debug/debug/couple-desktop-pet.exe`.

- [ ] **Step 1: Run focused feature tests**

```powershell
pnpm vitest run src/pet/edgeNotice.test.ts src/pet/useEdgeNotice.test.tsx src/pet/edgeInteraction.test.ts src/pet/useEdgeInteraction.test.tsx src/assets/builtInEdgeCompanion.test.ts src/renderer/edgeCompanionLayout.test.ts src/renderer/EdgeNoticeCard.test.tsx src/renderer/EdgeCompanionStage.test.tsx src/renderer/EdgePetStage.test.tsx src/renderer/FramePetStage.test.tsx src/app/edgeNoticeProjection.test.ts src/app/App.test.tsx src/desktop/windowCommands.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run complete static and test gates**

```powershell
pnpm test
pnpm typecheck
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: every command exits `0`. Do not dismiss unrelated failures; identify whether they predate the task using the initial git diff and report them explicitly.

- [ ] **Step 3: Build to an isolated debug target**

Do not terminate the currently running standard-target client. Build with:

```powershell
$env:CARGO_TARGET_DIR = (Join-Path (Resolve-Path 'src-tauri').Path 'target-edge-hidden-debug')
pnpm tauri build --debug --no-bundle
Test-Path 'src-tauri\target-edge-hidden-debug\debug\couple-desktop-pet.exe'
```

Expected: build exits `0`; `Test-Path` returns `True`.

- [ ] **Step 4: Launch the isolated EXE**

```powershell
Start-Process -FilePath (Resolve-Path 'src-tauri\target-edge-hidden-debug\debug\couple-desktop-pet.exe') -WindowStyle Hidden
```

Use only the PID returned for this isolated binary if it must be stopped later. Do not stop an existing `couple-desktop-pet.exe` from another target path.

- [ ] **Step 5: Capture the required Windows evidence**

At `0.6x`, `1.0x`, and `1.45x`, capture:

- Left idle, blink and ordinary message marker.
- Right status expanded, normal message expanded and surprise expanded.
- Bottom idle and surprise heart marker above the taskbar.
- Top existing hands-hanging idle and one inward notification.
- A desktop click in each transparent corner proving the work application receives input.
- Drag start from the micro mascot proving no square outline appears.
- Full message/surprise after edge click and the same edge after automatic return.

Use black, white and mixed desktop backgrounds. Reject any frame with clipped text, broken icons, yellow blocks, emoji substitutes, alpha fringe, card/mascot overlap or card outside the work area.

- [ ] **Step 6: Perform interaction verification**

Verify exact timing with logs or fake event injection: status `3s`, message `8s`, surprise `12s`; hover re-expands without acknowledging; ordinary unread displays `9+`; surprise remains until viewed; status never replaces an active remote preview; FIFO is preserved.

Also verify tray Settings recovers from full click-through and the checkbox reflects the native state.

- [ ] **Step 7: Update manual verification and implementation report**

Document commands, EXE path, screenshots, timer observations, DPI/monitor coverage, remaining platform limitations and the exact list of changed files. State explicitly that macOS/Linux received compile-safe code only and were not granted unverified Windows-style region hit testing.

- [ ] **Step 8: Main-agent code and visual review**

Review findings in this order: message loss/FIFO, click-through/drag regressions, native multi-monitor geometry, auto-return cancellation, visual fidelity, resource licensing, and test gaps. Send all required fixes back to the same fixed background development task, then rerun the affected gates before accepting.

---

## Plan Self-Review

- Spec coverage: every visual, timing, queue, click-through, scaling, auto-return, resource, multi-monitor and debug-build requirement maps to Tasks 1–7.
- Placeholder scan: every implementation and verification step contains concrete files, interfaces, commands and expected results.
- Type consistency: `EdgeNoticeSnapshot` is created by `projectEdgeNoticeSnapshot`, consumed by `useEdgeNotice`, and rendered by `EdgeCompanionStage`; automatic return consistently uses `requestExitForNotice`, `completeNoticeFlow`, and `cancelNoticeReturn`.
- Queue ownership: only `RemoteMessageQueueState` advances message order and stages; `EdgeNoticeState` stores presentation metadata only.
- Platform boundary: React never calls Windows APIs; all native docking and hit testing remain behind `desktop/windowCommands.ts` and Tauri commands.
