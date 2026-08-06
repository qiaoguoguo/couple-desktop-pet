# 主窗口对方状态卡与趣味状态同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除在线状态卫星窗口，在 320 x 360 主窗口内加入轻量对方状态卡，并允许用户通过环形菜单选择和实时同步“摸鱼中、发呆中、加班中”。

**Architecture:** 连接状态继续由现有一对一 WebSocket presence 事件提供，趣味状态使用独立的 `status.update` / `peer.status` 协议。Relay 只在当前连接注册表中保存受控状态 ID；React 主窗口根据配对、连接、在线状态和对方趣味状态计算单一展示模型，卫星窗口运行时代码全部移除。

**Tech Stack:** Tauri 2、Rust、React 19、TypeScript、Vite、Vitest、Node.js、`ws`、SQLite 配对仓库、Docker Compose。

## Global Constraints

- 只支持当前一对一配对，不增加公共匹配或多人广播。
- 不自动检测前台应用、键盘、鼠标或工作时长。
- 不允许自由状态文本；首版仅允许 `slacking`、`dazing`、`overtime` 或 `null`。
- 状态消息不写入聊天记录、SQLite、互动排行榜或日志。
- 主窗口保持 320 x 360，不创建 `peer-presence`、`peer-link`、`offline-nest` 窗口。
- “敲电脑”继续发送消息；“困困打盹”槽位改为“我的状态”。
- 保留角色包 `portrait`、`offlinePortrait` 和对方角色包映射。
- 不修改配对、账号、消息正文转发和数据库结构。
- 默认 Relay 仍为 `http://159.75.175.47:8787`。
- 每个任务先写失败测试，再做最小实现，验证通过后独立提交。

---

## File Map

- Create `shared/activityStatus.ts`: 共享趣味状态 ID、类型和校验函数。
- Modify `shared/syncProtocol.ts`: 增加状态更新和对方状态协议消息。
- Modify `shared/syncProtocol.test.ts`: 共享协议解析和拒绝未知状态测试。
- Modify `server/src/connectionRegistry.ts`: 当前 WebSocket 连接保存趣味状态。
- Modify `server/src/websocketRelay.ts`: 校验、保存和转发状态事件。
- Modify `server/src/websocketRelay.test.ts`: 一对一状态转发、重连补发和隔离测试。
- Modify `src/settings/settingsTypes.ts`: 本地同步设置增加 `activityStatus`。
- Modify `src/settings/defaultSettings.ts`: 默认趣味状态为 `null`。
- Modify `src/settings/settingsStore.ts`: 归一化合法状态并拒绝未知值。
- Modify `src/settings/settingsStore.test.ts`: 状态持久化和迁移测试。
- Modify `src/sync/realtimeClient.ts`: 发送本地状态、重连重发并接收对方状态。
- Modify `src/sync/realtimeClient.test.ts`: 状态同步生命周期测试。
- Modify `src/sync/syncTypes.ts`: 运行态增加 `peerActivityStatus`。
- Modify `src/sync/useRealtimeSync.ts`: 将 `peer.status` 投影到 React 状态。
- Modify `src/sync/useRealtimeSync.test.tsx`: 对方状态设置、清理和重连测试。
- Create `src/status/peerStatusPresentation.ts`: 纯函数状态优先级和展示文案目录。
- Create `src/status/peerStatusPresentation.test.ts`: 展示优先级测试。
- Create `src/status/PeerStatusCard.tsx`: 主窗口轻量状态卡和头像回退。
- Create `src/status/PeerStatusCard.test.tsx`: 状态卡渲染和头像回退测试。
- Create `src/status/ActivityStatusPicker.tsx`: “我的状态”二级选择器。
- Create `src/status/ActivityStatusPicker.test.tsx`: 选择、取消和键盘关闭测试。
- Modify `src/assets/builtInPetManifest.ts`: 六按钮中的两个功能槽使用语义 ID。
- Modify `src/interaction/InteractionMenu.tsx`: 支持动作和功能入口的联合选择类型。
- Modify `src/interaction/InteractionMenu.test.tsx`: 六槽位、发送消息和状态入口测试。
- Modify `src/app/App.tsx`: 嵌入状态卡、状态选择器和状态同步。
- Modify `src/app/App.test.tsx`: 主窗口集成、避让、持久化和无卫星调用测试。
- Modify `src/app/app.css`: 状态卡与选择器布局和过渡。
- Modify `src/main.tsx`: 始终挂载主应用。
- Delete `src/desktop/companionWindowCommands.ts` and test.
- Delete `src/sync/companion/`: 删除卫星 React 状态与动画导演层。
- Delete `src-tauri/src/companion_windows.rs`: 删除卫星窗口协调器。
- Modify `src-tauri/src/commands.rs`: 删除卫星命令及窗口同步调用。
- Modify `src-tauri/src/main.rs`: 删除卫星状态管理和命令注册。
- Delete `src/assets/ui/presence/heart-badge.png`, `heart-travel.png`, `moon-badge.png`, `offline-nest.png`.
- Modify `.superpowers/sdd/2026-08-06-peer-presence-multi-window-fidelity/dev-implementation-report.md`: 标记旧方案被主窗口方案替代。
- Create `.superpowers/sdd/2026-08-06-embedded-peer-activity-status/dev-implementation-report.md`: 最终实现、审核和 QA 证据。

---

### Task 1: Shared Activity Status Contract

**Files:**
- Create: `shared/activityStatus.ts`
- Modify: `shared/syncProtocol.ts`
- Test: `shared/syncProtocol.test.ts`

**Interfaces:**
- Produces: `ActivityStatus`, `ACTIVITY_STATUS_IDS`, `isActivityStatus(value)`.
- Produces: `StatusUpdateClientMessage` and `PeerStatusServerMessage` in the shared protocol unions.

- [ ] **Step 1: Write failing shared protocol tests**

Add tests with these assertions:

```ts
expect(parseServerToClientMessage({
  type: "peer.status",
  pairId: "pair_1",
  peerDeviceId: "dev_b",
  activityStatus: "slacking",
  changedAt: "2026-08-06T12:00:00.000Z",
})).toMatchObject({ type: "peer.status", activityStatus: "slacking" });

expect(parseServerToClientMessage({
  type: "peer.status",
  pairId: "pair_1",
  peerDeviceId: "dev_b",
  activityStatus: null,
  changedAt: "2026-08-06T12:00:00.000Z",
})).toMatchObject({ type: "peer.status", activityStatus: null });

expect(parseServerToClientMessage({
  type: "peer.status",
  pairId: "pair_1",
  peerDeviceId: "dev_b",
  activityStatus: "playing-games",
  changedAt: "2026-08-06T12:00:00.000Z",
})).toBeNull();
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run shared/syncProtocol.test.ts`

Expected: FAIL because `peer.status` is not parsed.

- [ ] **Step 3: Add the shared status catalog and protocol types**

Create `shared/activityStatus.ts`:

```ts
export const ACTIVITY_STATUS_IDS = ["slacking", "dazing", "overtime"] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUS_IDS)[number];

const ACTIVITY_STATUS_SET = new Set<string>(ACTIVITY_STATUS_IDS);

export function isActivityStatus(value: unknown): value is ActivityStatus {
  return typeof value === "string" && ACTIVITY_STATUS_SET.has(value);
}

export function isNullableActivityStatus(
  value: unknown,
): value is ActivityStatus | null {
  return value === null || isActivityStatus(value);
}
```

Add to `shared/syncProtocol.ts`:

```ts
export interface StatusUpdateClientMessage {
  type: "status.update";
  requestId: string;
  pairId: string;
  activityStatus: ActivityStatus | null;
}

export interface PeerStatusServerMessage {
  type: "peer.status";
  pairId: string;
  peerDeviceId: string;
  activityStatus: ActivityStatus | null;
  changedAt: string;
}
```

Include both interfaces in their unions and parse `peer.status` only when IDs, timestamp, and nullable status are valid.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `pnpm vitest run shared/syncProtocol.test.ts`

Run: `pnpm typecheck`

Expected: all pass.

- [ ] **Step 5: Commit the shared contract**

```powershell
git add shared/activityStatus.ts shared/syncProtocol.ts shared/syncProtocol.test.ts
git commit -m "feat: define realtime activity status protocol"
```

---

### Task 2: Relay Status Forwarding

**Files:**
- Modify: `server/src/connectionRegistry.ts`
- Modify: `server/src/websocketRelay.ts`
- Test: `server/src/websocketRelay.test.ts`

**Interfaces:**
- Consumes: `ActivityStatus`, `StatusUpdateClientMessage`, `PeerStatusServerMessage`.
- Produces: authenticated connections with `activityStatus: ActivityStatus | null`.

- [ ] **Step 1: Write failing relay integration tests**

Add tests that authenticate paired sockets A and B and verify:

```ts
a.send(JSON.stringify({
  type: "status.update",
  requestId: "status_1",
  pairId,
  activityStatus: "slacking",
}));

await expect(readJson(b)).resolves.toMatchObject({
  type: "peer.status",
  peerDeviceId: deviceA.deviceId,
  activityStatus: "slacking",
});
await expectNoJson(a);
```

Also cover clearing with `null`, rejecting an incorrect `pairId`, rejecting `playing-games`, and a later-authenticated peer receiving the already-online peer's current status.

- [ ] **Step 2: Run relay tests and verify RED**

Run: `pnpm --dir server test -- websocketRelay.test.ts`

Expected: FAIL because `status.update` is unsupported.

- [ ] **Step 3: Store status on the live connection and forward it**

Extend the registry type:

```ts
export interface AuthenticatedConnection {
  socket: WebSocket;
  deviceId: string;
  pairId: string;
  peerDeviceId: string;
  activityStatus: ActivityStatus | null;
}
```

Initialize it to `null` on authentication. Parse `status.update` using `isNullableActivityStatus`. In `handleAuthenticatedMessage`, validate `pairId`, mutate only the authenticated connection's in-memory status, and send this exact event only to the paired peer:

```ts
sendJson(peer.socket, {
  type: "peer.status",
  pairId: connection.pairId,
  peerDeviceId: connection.deviceId,
  activityStatus: connection.activityStatus,
  changedAt: now().toISOString(),
});
```

Pass `now` into authenticated message handling so timestamps remain deterministic in tests. When both peers are online at authentication, emit each connection's current status after presence events. Do not write status to `RelayRepository`.

- [ ] **Step 4: Run Relay test, build, and log-safety scan**

Run: `pnpm --dir server test`

Run: `pnpm --dir server build`

Run: `rg -n "activityStatus|deviceSecret|message\.text" server/src`

Expected: tests/build pass; no new logging of secrets, message text, or activity status.

- [ ] **Step 5: Commit Relay support**

```powershell
git add server/src/connectionRegistry.ts server/src/websocketRelay.ts server/src/websocketRelay.test.ts
git commit -m "feat: relay paired activity statuses"
```

---

### Task 3: Persist Local Activity Status

**Files:**
- Modify: `src/settings/settingsTypes.ts`
- Modify: `src/settings/defaultSettings.ts`
- Modify: `src/settings/settingsStore.ts`
- Test: `src/settings/settingsStore.test.ts`

**Interfaces:**
- Consumes: `ActivityStatus` and `isNullableActivityStatus`.
- Produces: `SyncSettings.activityStatus: ActivityStatus | null`.

- [ ] **Step 1: Add failing settings tests**

Add tests:

```ts
expect(defaultSettings.sync.activityStatus).toBeNull();
expect(mergeSettings({ sync: { activityStatus: "dazing" } as never }).sync.activityStatus)
  .toBe("dazing");
expect(mergeSettings({ sync: { activityStatus: "gaming" } as never }).sync.activityStatus)
  .toBeNull();
```

Also verify `saveSettings` writes the selected status and that cancelling a pair does not implicitly clear it through normalization.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm vitest run src/settings/settingsStore.test.ts`

Expected: FAIL because the setting does not exist.

- [ ] **Step 3: Add the setting and strict normalization**

Extend `SyncSettings`:

```ts
activityStatus: ActivityStatus | null;
```

Set `defaultSettings.sync.activityStatus` to `null`. In `readSyncSettings`, use:

```ts
activityStatus: isNullableActivityStatus(value.activityStatus)
  ? value.activityStatus
  : null,
```

Do not clear this field in `clearLocalPair` or unpair handlers.

- [ ] **Step 4: Run settings tests and typecheck**

Run: `pnpm vitest run src/settings/settingsStore.test.ts`

Run: `pnpm typecheck`

Expected: all pass after updating typed fixtures to include `activityStatus: null` where required.

- [ ] **Step 5: Commit settings support**

```powershell
git add src/settings/settingsTypes.ts src/settings/defaultSettings.ts src/settings/settingsStore.ts src/settings/settingsStore.test.ts
git commit -m "feat: persist local activity status"
```

---

### Task 4: Realtime Client and React Sync State

**Files:**
- Modify: `src/sync/realtimeClient.ts`
- Test: `src/sync/realtimeClient.test.ts`
- Modify: `src/sync/syncTypes.ts`
- Modify: `src/sync/useRealtimeSync.ts`
- Test: `src/sync/useRealtimeSync.test.tsx`

**Interfaces:**
- Consumes: `SyncSettings.activityStatus`, `PeerStatusServerMessage`.
- Produces: `RealtimeClient.setActivityStatus(status): { synced: boolean }`.
- Produces: `SyncRuntimeState.peerActivityStatus: ActivityStatus | null`.

- [ ] **Step 1: Write failing realtime client tests**

Cover these behaviors:

```ts
const client = new RealtimeClient({
  ...options,
  activityStatus: "overtime",
});

// After auth.ok, the next outbound message is status.update/overtime.
// Calling setActivityStatus("dazing") while authenticated sends immediately.
// Calling setActivityStatus("slacking") while disconnected returns { synced: false }.
// Reconnect + auth.ok sends the latest stored value, "slacking".
// peer.status produces an event with peerActivityStatus.
```

- [ ] **Step 2: Run client tests and verify RED**

Run: `pnpm vitest run src/sync/realtimeClient.test.ts`

Expected: FAIL because activity status is not supported.

- [ ] **Step 3: Implement authenticated status synchronization**

Add `activityStatus` to options and keep mutable internal state:

```ts
private localActivityStatus: ActivityStatus | null = this.options.activityStatus;
private authenticated = false;

setActivityStatus(activityStatus: ActivityStatus | null): { synced: boolean } {
  this.localActivityStatus = activityStatus;
  if (!this.authenticated || !this.socket || !isSocketOpen(this.socket)) {
    return { synced: false };
  }
  this.sendActivityStatus();
  return { synced: true };
}
```

Set `authenticated = true` on `auth.ok`, then call `sendActivityStatus()`. Reset it whenever the socket closes or is replaced. Parse `peer.status` into a dedicated realtime event.

- [ ] **Step 4: Add hook runtime tests and implementation**

Add `peerActivityStatus: null` to initial state. On `peer.status`, set the received value. Clear it when connection leaves `connected` and when a fresh `peer.online` event arrives; retain it while a known peer is merely marked offline because the presentation layer will override it.

Construct `RealtimeClient` with `activityStatus: sync.activityStatus`, but do not include `sync.activityStatus` in the memo dependencies; App will call `setActivityStatus` for live changes, and the client retains the latest value for reconnect.

Run: `pnpm vitest run src/sync/realtimeClient.test.ts src/sync/useRealtimeSync.test.tsx`

Expected: pass.

- [ ] **Step 5: Commit realtime client state**

```powershell
git add src/sync/realtimeClient.ts src/sync/realtimeClient.test.ts src/sync/syncTypes.ts src/sync/useRealtimeSync.ts src/sync/useRealtimeSync.test.tsx
git commit -m "feat: sync peer activity status in realtime"
```

---

### Task 5: Peer Status Presentation and Card

**Files:**
- Create: `src/status/peerStatusPresentation.ts`
- Test: `src/status/peerStatusPresentation.test.ts`
- Create: `src/status/PeerStatusCard.tsx`
- Test: `src/status/PeerStatusCard.test.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
- Consumes: `SyncConnectionStatus`, `PeerPresence`, `ActivityStatus`.
- Produces: `resolvePeerStatusView(input): PeerStatusView | null`.
- Produces: `<PeerStatusCard view imageCandidates />`.

- [ ] **Step 1: Write failing presentation priority tests**

Use a table that verifies:

```ts
[
  [{ paired: false }, null],
  [{ paired: true, connectionStatus: "connecting" }, "connecting"],
  [{ paired: true, connectionStatus: "connected", peerPresence: "offline" }, "offline"],
  [{ paired: true, connectionStatus: "connected", peerPresence: "online", peerActivityStatus: null }, "online"],
  [{ paired: true, connectionStatus: "connected", peerPresence: "online", peerActivityStatus: "slacking" }, "slacking"],
]
```

Also assert exact Chinese main/detail text from the spec.

- [ ] **Step 2: Run presentation tests and verify RED**

Run: `pnpm vitest run src/status/peerStatusPresentation.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure presentation model**

Define:

```ts
export type PeerStatusVariant =
  | "connecting"
  | "online"
  | "offline"
  | ActivityStatus;

export interface PeerStatusView {
  variant: PeerStatusVariant;
  title: string;
  detail: string;
  iconText: string;
}
```

Use `鱼`, `云`, `班`, `心`, `月`, and `…` as small circular icon text so no new icon dependency or bitmap resource is needed. Unknown activity IDs must resolve to ordinary online.

- [ ] **Step 4: Write and implement status card tests**

Test semantic markup, `data-status-variant`, exact text, 28px avatar, fallback to the next candidate after `error`, and final `TA` placeholder. Implement the fixed card:

```tsx
<aside className="peer-status-card" data-status-variant={view.variant} aria-label="对方状态">
  <span className="peer-status-avatar">...</span>
  <span className="peer-status-copy">
    <strong><i aria-hidden="true" />{view.title}</strong>
    <span>{view.detail}</span>
  </span>
  <span className="peer-status-icon" aria-hidden="true">{view.iconText}</span>
</aside>
```

CSS requirements: absolute top-right placement, `164px x 60px`, `pointer-events: none`, warm white solid/near-solid background, one border, one soft shadow, no nested card, no scale animation, text overflow protection. Only connecting icon rotates.

Run: `pnpm vitest run src/status/peerStatusPresentation.test.ts src/status/PeerStatusCard.test.tsx`

Expected: pass.

- [ ] **Step 5: Commit the status card**

```powershell
git add src/status src/app/app.css
git commit -m "feat: add embedded peer status card"
```

---

### Task 6: “我的状态” Function Slot and Picker

**Files:**
- Modify: `src/assets/builtInPetManifest.ts`
- Modify: `src/interaction/InteractionMenu.tsx`
- Test: `src/interaction/InteractionMenu.test.tsx`
- Create: `src/status/ActivityStatusPicker.tsx`
- Test: `src/status/ActivityStatusPicker.test.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
- Produces: `InteractionFunctionId = "send-message" | "open-status"`.
- Produces: `InteractionMenuSelection = InteractionActionName | InteractionFunctionId`.
- Produces: `<ActivityStatusPicker current onSelect onClose />`.

- [ ] **Step 1: Write failing menu semantics tests**

Assert six menu items remain, including `敲电脑` and `我的状态`, and that their callbacks are `send-message` and `open-status`. Keep the other four action IDs unchanged.

- [ ] **Step 2: Generalize interaction option types**

Replace action-only option typing with:

```ts
export type InteractionFunctionId = "send-message" | "open-status";
export type InteractionMenuSelection = InteractionActionName | InteractionFunctionId;

export interface PetInteractionOption {
  id: InteractionMenuSelection;
  iconAction: InteractionActionName;
  label: string;
  bubble: string;
}
```

Use these two options:

```ts
{ id: "send-message", iconAction: "act-typing", label: "敲电脑", bubble: "" },
{ id: "open-status", iconAction: "act-drowsy", label: "我的状态", bubble: "" },
```

Index icon assets through `iconAction`; keep six stable radial positions by option order instead of keying positions by semantic ID.

- [ ] **Step 3: Write failing picker tests**

Verify four buttons `在线`, `摸鱼中`, `发呆中`, `加班中`; `在线` emits `null`; `Escape` and backdrop call `onClose`; clicking inside does not trigger backdrop close; current selection has `aria-pressed=true`.

- [ ] **Step 4: Implement the compact picker and CSS**

Use a single modal-like unframed overlay inside the main window with one `status-picker-panel`, a 2 x 2 grid, and the same icon text catalog. Keep it inside 300px width and below the top status-card area. Add no new bitmap assets.

Run: `pnpm vitest run src/interaction/InteractionMenu.test.tsx src/status/ActivityStatusPicker.test.tsx`

Expected: pass.

- [ ] **Step 5: Commit menu and picker**

```powershell
git add src/assets/builtInPetManifest.ts src/interaction src/status/ActivityStatusPicker.tsx src/status/ActivityStatusPicker.test.tsx src/app/app.css
git commit -m "feat: add local activity status picker"
```

---

### Task 7: Integrate Status UI and Remove Satellite Runtime

**Files:**
- Modify: `src/app/App.tsx`
- Test: `src/app/App.test.tsx`
- Modify: `src/main.tsx`
- Delete: `src/desktop/companionWindowCommands.ts`
- Delete: `src/desktop/companionWindowCommands.test.ts`
- Delete: `src/sync/companion/companionSceneState.ts`
- Delete: `src/sync/companion/companionSceneState.test.ts`
- Delete: `src/sync/companion/companionSceneTypes.ts`
- Delete: `src/sync/companion/CompanionSurfaceRoot.tsx`
- Delete: `src/sync/companion/CompanionSurfaceRoot.test.tsx`
- Delete: `src/sync/companion/presenceMotionDirector.ts`
- Delete: `src/sync/companion/presenceMotionDirector.test.tsx`
- Delete: `src-tauri/src/companion_windows.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/main.rs`
- Delete: `src/assets/ui/presence/heart-badge.png`
- Delete: `src/assets/ui/presence/heart-travel.png`
- Delete: `src/assets/ui/presence/moon-badge.png`
- Delete: `src/assets/ui/presence/offline-nest.png`

**Interfaces:**
- Consumes: `resolvePeerStatusView`, `PeerStatusCard`, `ActivityStatusPicker`.
- Consumes: `RealtimeClient.setActivityStatus`.
- Produces: main-window-only peer status experience.

- [ ] **Step 1: Replace companion-window App tests with embedded-card tests**

Delete mocks and assertions for `updateCompanionScene`, `hideCompanionScene`, and the satellite composer event. Add tests for:

```ts
// paired + peer offline => card says TA 离线
// paired + online + peerActivityStatus slacking => card says TA 摸鱼中
// unpaired => no 对方状态 region
// settings/composer/remote message/menu/edge peek => card hidden
// selecting 我的状态 -> 发呆中 persists sync.activityStatus and calls client.setActivityStatus("dazing")
// disconnected selection persists and shows the short queued-sync bubble
```

- [ ] **Step 2: Implement App state and rendering**

Add `statusPickerOpen`. Change `handleInteractionSelect`:

```ts
if (selection === "send-message") {
  openMessageComposerPanel();
  return;
}
if (selection === "open-status") {
  setStatusPickerOpen(true);
  return;
}
```

For selection:

```ts
const handleActivityStatusSelect = (activityStatus: ActivityStatus | null) => {
  handleSyncChange({ activityStatus });
  const result = realtime.client?.setActivityStatus(activityStatus);
  if (!result?.synced) {
    setBubble(showBubble("状态已保存，连接后会同步。", { durationMs: 4000 }));
  }
  setStatusPickerOpen(false);
};
```

Derive the status view from pairing and realtime runtime state. Render `PeerStatusCard` only when the view exists and no avoidance condition is active. Build image candidates from selected peer package portrait, offline portrait, preview, and default motion first frame.

- [ ] **Step 3: Remove all frontend satellite routing and files**

Make `src/main.tsx` render `<App />` only. Remove companion command imports, effects and listeners from App. Delete satellite frontend modules and presence-only UI assets. Confirm:

Run: `rg -n "peer-presence|peer-link|offline-nest|companionWindowCommands|CompanionSurfaceRoot" src`

Expected: no runtime source matches; historical docs may still match outside `src`.

- [ ] **Step 4: Remove Rust companion windows**

Delete the module, coordinator management, command imports and command registrations. Remove `sync_companion_windows` calls from move/show/restore handlers and `hide_companion_windows` calls from hide/quit paths, preserving all existing main-window operations.

Run: `rg -n "companion_windows|update_companion_scene|read_companion_scene|hide_companion_scene|request_open_message_composer" src-tauri/src`

Expected: no matches.

- [ ] **Step 5: Run focused integration and Rust tests**

Run: `pnpm vitest run src/app/App.test.tsx src/interaction/InteractionMenu.test.tsx src/status/PeerStatusCard.test.tsx src/status/ActivityStatusPicker.test.tsx`

Run: `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: all pass and Rust test count decreases only by the removed companion-window tests.

- [ ] **Step 6: Commit main-window integration and satellite removal**

```powershell
git add -A src src-tauri/src
git commit -m "refactor: move peer status into the main pet window"
```

---

### Task 8: Full Verification, Remote Relay Deployment, and Runtime QA

**Files:**
- Modify: `.superpowers/sdd/2026-08-06-peer-presence-multi-window-fidelity/dev-implementation-report.md`
- Create: `.superpowers/sdd/2026-08-06-embedded-peer-activity-status/dev-implementation-report.md`
- Modify when evidence requires correction: files from Tasks 1-7 only.

**Interfaces:**
- Consumes: completed client, Relay, main-window UI and Tauri application.
- Produces: deployed Relay, rebuilt debug EXE, screenshots and verification report.

- [ ] **Step 1: Run the complete local verification matrix**

Run each command separately and record exact counts:

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm --dir server test
pnpm --dir server build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
pnpm tauri build --debug
git diff --check
```

Expected: every command exits 0 and the EXE exists at `src-tauri/target/debug/couple-desktop-pet.exe`.

- [ ] **Step 2: Perform source-boundary review**

Run:

```powershell
rg -n "peer-presence|peer-link|offline-nest|companion_windows" src src-tauri/src
rg -n "activityStatus" server/src
git status --short
```

Expected: no satellite runtime matches; Relay references contain no logging; worktree changes are intentional.

- [ ] **Step 3: Deploy the verified Relay to the existing server**

Use the existing SSH identity and deployment layout. Back up the current deployment directory first without deleting the live SQLite volume:

```powershell
ssh root@159.75.175.47 'backup=/opt/couple-pet-relay-backup-$(date +%Y%m%d%H%M%S); cp -a /opt/couple-pet-relay "$backup"; printf "%s\n" "$backup"'
ssh root@159.75.175.47 "mkdir -p /opt/couple-pet-relay"
scp -r server shared package.json pnpm-lock.yaml pnpm-workspace.yaml deploy/couple-pet-relay root@159.75.175.47:/opt/couple-pet-relay/
ssh root@159.75.175.47 "cd /opt/couple-pet-relay && docker compose -f deploy/couple-pet-relay/compose.yaml up -d --build"
ssh root@159.75.175.47 "cd /opt/couple-pet-relay && docker compose -f deploy/couple-pet-relay/compose.yaml ps"
```

Record the printed backup path in the implementation report. If the compose update fails, restore code/config from that exact backup path and restart the prior compose project; never remove the Docker volume.

- [ ] **Step 4: Verify remote health and two-socket status synchronization**

Run: `curl http://159.75.175.47:8787/health`

Then use temporary test devices and a temporary pair through the existing HTTP pairing API. Connect two `ws` clients to `ws://159.75.175.47:8787/ws`, authenticate, send `status.update` values `slacking`, `dazing`, `overtime`, and `null`, and assert the peer receives matching `peer.status` events. Unpair the temporary devices after the smoke test. Do not print device secrets or message content in the report.

- [ ] **Step 5: Perform desktop visual and regression QA**

Launch the rebuilt debug EXE with the main window on a normal desktop. Verify and capture screenshots for:

1. Offline card.
2. Ordinary online card.
3. Each of the three趣味状态 cards.
4. “我的状态” picker.
5. Card hidden while settings, message composer, remote message, radial menu, and edge peek are active.
6. Windows enumeration contains `main` only for this app and no three satellite labels.
7. Drag, right-click settings, send message, remote message acknowledgement, tray hide/show and quit still work.

Use Playwright/CDP only for DOM evidence; use Windows layered capture or direct desktop observation for transparent compositing evidence. Confirm the card stays inside 320 x 360 and does not cover the pet's face.

- [ ] **Step 6: Write reports and commit verified corrections**

Mark the old multi-window report as superseded. The new report must contain commits, exact test counts, remote health result, temporary-pair smoke result, EXE path, screenshot paths, and remaining risks.

```powershell
git add -A
git commit -m "fix: verify embedded peer activity status"
```

Do not create an empty commit if runtime QA required no source or report changes beyond an already committed report.

---

## Final Review Checklist

- [ ] Every design-spec requirement maps to one task above.
- [ ] The Relay stores activity status only in `ConnectionRegistry`, not SQLite.
- [ ] Offline overrides cached趣味状态; unknown Relay state shows connecting.
- [ ] Selecting ordinary online sends and persists `null`.
- [ ] New status selection persists while disconnected and resends after auth.
- [ ] Existing chat send/receive protocol remains unchanged.
- [ ] Main application creates no status satellite windows.
- [ ] Main window remains 320 x 360 and taskbar/tray behavior does not regress.
- [ ] Only the paired peer receives status events.
- [ ] Remote deployment preserves the existing SQLite data volume.
- [ ] Debug EXE and implementation report are available at documented paths.
