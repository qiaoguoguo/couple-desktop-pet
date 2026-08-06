# Peer Presence Emotional Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the paired person's online/offline state next to the desktop pet with a small emotional companion bubble, without adding any tray badge or screen-corner badge.

**Architecture:** The relay already emits `peer.online` and `peer.offline`; this plan makes presence explicit on auth, tracks timestamps on the client, then renders a focused `PeerPresenceLayer` beside the current pet. The visual layer consumes sync state and peer pet package preview/frame data only; it must not own websocket or pairing logic.

**Tech Stack:** Tauri 2, React, TypeScript, Vitest, Node `ws` relay server.

## Global Constraints

- Communicate with the user in Chinese, but keep code identifiers in English.
- Do not add a tray badge or screen-corner badge in this version.
- Do not implement offline message persistence in this version.
- Do not add new PNG animation frames for this version; use CSS animation and existing pet preview/frame assets.
- Do not let the presence UI block pet dragging, the interaction menu, settings, or remote message hover acknowledgement.
- Keep sync protocol changes backward-tolerant where practical; unknown optional fields must not break parsing.
- Use TDD: write failing tests before production code.

---

## File Structure

- Modify `shared/syncProtocol.ts`: add optional presence timestamp fields and keep parser tolerant.
- Modify `server/src/websocketRelay.ts`: send explicit offline state after auth when peer is absent, and include `changedAt`.
- Modify `server/src/websocketRelay.test.ts`: cover explicit offline-on-auth and online/offline timestamp events.
- Modify `src/sync/syncTypes.ts`: add `peerPresenceChangedAt` and optional `peerLastSeenAt`.
- Modify `src/sync/realtimeClient.ts`: surface presence timestamps to React.
- Modify `src/sync/realtimeClient.test.ts`: cover timestamp parsing and event emission.
- Modify `src/sync/useRealtimeSync.ts`: store peer presence timestamps, reset them on disconnect.
- Modify `src/sync/useRealtimeSync.test.tsx`: cover online/offline/unknown state transitions.
- Create `src/sync/PeerPresenceLayer.tsx`: desktop-pet-side emotional presence UI.
- Create `src/sync/PeerPresenceLayer.test.tsx`: cover online/offline/unknown rendering and click behavior.
- Modify `src/app/App.tsx`: compute peer package preview, render `PeerPresenceLayer`, and open message composer from the layer.
- Modify `src/app/App.test.tsx`: integration coverage for rendered presence layer and composer click behavior.
- Modify `src/app/app.css`: compact emotional bubble styles and motion-reduced behavior.

---

### Task 1: Make Presence Explicit In Relay Protocol

**Files:**
- Modify: `shared/syncProtocol.ts`
- Modify: `server/src/websocketRelay.ts`
- Test: `server/src/websocketRelay.test.ts`

**Interfaces:**
- Produces: `peer.online` and `peer.offline` may include `changedAt?: string` and `lastSeenAt?: string`.
- Produces: after `auth.ok`, the authenticated socket receives either `peer.online` or `peer.offline`.
- Consumes: existing `ConnectionRegistry.get(deviceId)`.

- [ ] **Step 1: Write failing server test for explicit offline after auth**

Add a test in `server/src/websocketRelay.test.ts`:

```ts
it("reports the peer as offline immediately after auth when the peer is absent", async () => {
  const pair = await createPair();
  const alice = await connectAndAuth("dev_a", "secret_a", pair.pairId);

  await expect(readJson(alice)).resolves.toMatchObject({
    type: "peer.offline",
    pairId: pair.pairId,
    peerDeviceId: "dev_b",
    changedAt: "2026-08-03T12:00:00.000Z",
  });

  alice.close();
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm --dir server test -- websocketRelay`

Expected: the new test fails because no `peer.offline` event is sent after auth.

- [ ] **Step 3: Write failing server test for timestamped online/offline**

Extend the existing "authenticates paired devices and forwards an online message" test to expect `changedAt` on both `peer.online` messages and on the close-triggered `peer.offline` message.

```ts
await expect(readJson(bob)).resolves.toMatchObject({
  type: "peer.online",
  peerDeviceId: "dev_a",
  changedAt: "2026-08-03T12:00:00.000Z",
});
```

After `alice.close()`, read from `bob`:

```ts
await expect(readJson(bob)).resolves.toMatchObject({
  type: "peer.offline",
  peerDeviceId: "dev_a",
  changedAt: "2026-08-03T12:00:00.000Z",
});
```

- [ ] **Step 4: Run test to verify RED**

Run: `pnpm --dir server test -- websocketRelay`

Expected: timestamp assertions fail.

- [ ] **Step 5: Implement relay events**

In `server/src/websocketRelay.ts`, create a helper:

```ts
function createPresenceChangedAt(): string {
  return new Date().toISOString();
}
```

Use it in `authenticateSocket`:

```ts
const changedAt = createPresenceChangedAt();
const peer = registry.get(authenticated.peerDeviceId);
if (peer && peer.pairId === authenticated.pairId) {
  sendJson(socket, {
    type: "peer.online",
    pairId: authenticated.pairId,
    peerDeviceId: authenticated.peerDeviceId,
    changedAt,
  });
  sendJson(peer.socket, {
    type: "peer.online",
    pairId: authenticated.pairId,
    peerDeviceId: authenticated.deviceId,
    changedAt,
  });
} else {
  sendJson(socket, {
    type: "peer.offline",
    pairId: authenticated.pairId,
    peerDeviceId: authenticated.peerDeviceId,
    changedAt,
  });
}
```

Use a fresh timestamp in the close handler when broadcasting `peer.offline`.

- [ ] **Step 6: Update protocol parser**

In `shared/syncProtocol.ts`, add optional fields to `PeerOnlineServerMessage` and `PeerOfflineServerMessage`:

```ts
changedAt?: string;
lastSeenAt?: string;
```

Update `readPeerPresence` to preserve those fields only when they are strings.

- [ ] **Step 7: Run server tests**

Run: `pnpm --dir server test -- websocketRelay`

Expected: websocket relay tests pass.

- [ ] **Step 8: Commit**

```bash
git add shared/syncProtocol.ts server/src/websocketRelay.ts server/src/websocketRelay.test.ts
git commit -m "feat: report explicit peer presence"
```

---

### Task 2: Carry Presence Metadata Through Client Sync State

**Files:**
- Modify: `src/sync/syncTypes.ts`
- Modify: `src/sync/realtimeClient.ts`
- Modify: `src/sync/useRealtimeSync.ts`
- Test: `src/sync/realtimeClient.test.ts`
- Test: `src/sync/useRealtimeSync.test.tsx`

**Interfaces:**
- Consumes: `ServerToClientMessage` optional `changedAt` and `lastSeenAt`.
- Produces: `SyncRuntimeState.peerPresenceChangedAt: string | null`.
- Produces: `SyncRuntimeState.peerLastSeenAt: string | null`.

- [ ] **Step 1: Write failing RealtimeClient test**

Add to `src/sync/realtimeClient.test.ts`:

```ts
it("emits peer presence timestamps from relay events", () => {
  const events: RealtimeClientEvent[] = [];
  const client = new RealtimeClient({
    relayUrl: "http://127.0.0.1:8787",
    deviceId: "dev_a",
    deviceSecret: "secret_a",
    pairId: "pair_1",
    webSocketFactory: (url) => new FakeWebSocket(url) as unknown as WebSocket,
    onEvent: (event) => events.push(event),
  });

  client.connect();
  const fakeSocket = expectLatestSocket();
  fakeSocket.emitOpen();
  fakeSocket.emitMessage({
    type: "peer.offline",
    pairId: "pair_1",
    peerDeviceId: "dev_b",
    changedAt: "2026-08-06T08:00:00.000Z",
    lastSeenAt: "2026-08-06T07:58:00.000Z",
  });

  expect(events).toContainEqual({
    type: "presence",
    peerPresence: "offline",
    peerDeviceId: "dev_b",
    changedAt: "2026-08-06T08:00:00.000Z",
    lastSeenAt: "2026-08-06T07:58:00.000Z",
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm vitest run src/sync/realtimeClient.test.ts`

Expected: TypeScript/test failure because `RealtimeClientEvent` has no timestamp fields.

- [ ] **Step 3: Implement RealtimeClient metadata**

Update the presence event type:

```ts
| {
    type: "presence";
    peerPresence: PeerPresence;
    peerDeviceId: string;
    changedAt: string | null;
    lastSeenAt: string | null;
  }
```

When handling `peer.online` and `peer.offline`, emit `parsed.changedAt ?? null` and `parsed.lastSeenAt ?? null`.

- [ ] **Step 4: Run RealtimeClient test**

Run: `pnpm vitest run src/sync/realtimeClient.test.ts`

Expected: pass.

- [ ] **Step 5: Write failing hook test**

Update `src/sync/useRealtimeSync.test.tsx` probe output to include timestamps:

```tsx
return (
  <output data-testid="sync-state">
    {state.status}:{state.peerPresence}:{state.peerPresenceChangedAt ?? "none"}:{state.peerLastSeenAt ?? "none"}
  </output>
);
```

Add a test:

```ts
it("stores peer presence timestamps and clears them on disconnect", async () => {
  render(<HookProbe />);

  act(() => {
    realtimeMock.latestOptions?.onEvent({
      type: "status",
      status: "connected",
    });
  });
  act(() => {
    realtimeMock.latestOptions?.onEvent({
      type: "presence",
      peerPresence: "offline",
      peerDeviceId: "dev_b",
      changedAt: "2026-08-06T08:00:00.000Z",
      lastSeenAt: "2026-08-06T07:58:00.000Z",
    });
  });

  expect(screen.getByTestId("sync-state").textContent).toBe(
    "connected:offline:2026-08-06T08:00:00.000Z:2026-08-06T07:58:00.000Z",
  );

  act(() => {
    realtimeMock.latestOptions?.onEvent({
      type: "status",
      status: "disconnected",
    });
  });

  expect(screen.getByTestId("sync-state").textContent).toBe(
    "disconnected:unknown:none:none",
  );
});
```

- [ ] **Step 6: Run hook test to verify RED**

Run: `pnpm vitest run src/sync/useRealtimeSync.test.tsx`

Expected: fails because `SyncRuntimeState` lacks timestamp fields.

- [ ] **Step 7: Implement hook state**

In `src/sync/syncTypes.ts`, update `SyncRuntimeState`:

```ts
peerPresenceChangedAt: string | null;
peerLastSeenAt: string | null;
```

Initialize both fields to `null` in `useRealtimeSync`. On non-connected status, reset presence to `unknown` and both timestamps to `null`. On presence event, set presence and timestamps from the event.

- [ ] **Step 8: Run client sync tests**

Run: `pnpm vitest run src/sync/realtimeClient.test.ts src/sync/useRealtimeSync.test.tsx src/sync/SyncPanel.test.tsx`

Expected: pass; update any test fixtures with new `SyncRuntimeState` fields.

- [ ] **Step 9: Commit**

```bash
git add src/sync/syncTypes.ts src/sync/realtimeClient.ts src/sync/useRealtimeSync.ts src/sync/realtimeClient.test.ts src/sync/useRealtimeSync.test.tsx src/sync/SyncPanel.test.tsx
git commit -m "feat: track peer presence timestamps"
```

---

### Task 3: Render Emotional Peer Presence Beside The Pet

**Files:**
- Create: `src/sync/PeerPresenceLayer.tsx`
- Create: `src/sync/PeerPresenceLayer.test.tsx`
- Modify: `src/app/app.css`
- Modify: `src/app/App.tsx`
- Test: `src/app/App.test.tsx`

**Interfaces:**
- Consumes: `SyncRuntimeState`.
- Consumes: peer preview image URL as `peerImageUrl: string | null`.
- Produces: `PeerPresenceLayer` component.

- [ ] **Step 1: Write failing component tests**

Create `src/sync/PeerPresenceLayer.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PeerPresenceLayer } from "./PeerPresenceLayer";
import type { SyncRuntimeState } from "./syncTypes";

const baseStatus: SyncRuntimeState = {
  status: "connected",
  peerPresence: "online",
  peerPresenceChangedAt: "2026-08-06T08:00:00.000Z",
  peerLastSeenAt: null,
  lastError: null,
};

describe("PeerPresenceLayer", () => {
  it("renders warm online companion status", () => {
    render(
      <PeerPresenceLayer
        status={baseStatus}
        peerImageUrl="peer.png"
        onOpenMessageComposer={() => undefined}
      />,
    );

    expect(screen.getByLabelText("对方在线状态")).toBeInTheDocument();
    expect(screen.getByText("TA 在线")).toBeInTheDocument();
    expect(screen.getByText("正在陪你")).toBeInTheDocument();
    expect(screen.getByAltText("对方形象")).toHaveAttribute("src", "peer.png");
  });

  it("renders gentle offline waiting status", () => {
    render(
      <PeerPresenceLayer
        status={{
          ...baseStatus,
          peerPresence: "offline",
          peerLastSeenAt: "2026-08-06T07:58:00.000Z",
        }}
        peerImageUrl={null}
        onOpenMessageComposer={() => undefined}
      />,
    );

    expect(screen.getByText("TA 离线")).toBeInTheDocument();
    expect(screen.getByText("等TA回来")).toBeInTheDocument();
    expect(screen.getByLabelText("离线留言小窝")).toBeInTheDocument();
  });

  it("does not render when sync is not connected or peer presence is unknown", () => {
    const { rerender } = render(
      <PeerPresenceLayer
        status={{ ...baseStatus, status: "connecting", peerPresence: "unknown" }}
        peerImageUrl={null}
        onOpenMessageComposer={() => undefined}
      />,
    );

    expect(screen.queryByLabelText("对方在线状态")).not.toBeInTheDocument();

    rerender(
      <PeerPresenceLayer
        status={{ ...baseStatus, status: "connected", peerPresence: "unknown" }}
        peerImageUrl={null}
        onOpenMessageComposer={() => undefined}
      />,
    );
    expect(screen.queryByLabelText("对方在线状态")).not.toBeInTheDocument();
  });

  it("opens the message composer when online status is clicked", () => {
    const onOpenMessageComposer = vi.fn();
    render(
      <PeerPresenceLayer
        status={baseStatus}
        peerImageUrl={null}
        onOpenMessageComposer={onOpenMessageComposer}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "给在线的TA发消息" }));

    expect(onOpenMessageComposer).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run component test to verify RED**

Run: `pnpm vitest run src/sync/PeerPresenceLayer.test.tsx`

Expected: fails because the component does not exist.

- [ ] **Step 3: Implement `PeerPresenceLayer`**

Create `src/sync/PeerPresenceLayer.tsx`:

```tsx
import type { SyncRuntimeState } from "./syncTypes";

export interface PeerPresenceLayerProps {
  status: SyncRuntimeState;
  peerImageUrl: string | null;
  onOpenMessageComposer(): void;
}

export function PeerPresenceLayer({
  status,
  peerImageUrl,
  onOpenMessageComposer,
}: PeerPresenceLayerProps) {
  if (status.status !== "connected" || status.peerPresence === "unknown") {
    return null;
  }

  const isOnline = status.peerPresence === "online";
  const label = isOnline ? "TA 在线" : "TA 离线";
  const detail = isOnline ? "正在陪你" : "等TA回来";
  const buttonLabel = isOnline ? "给在线的TA发消息" : "查看离线状态";

  return (
    <aside
      className={`peer-presence-layer is-${status.peerPresence}`}
      aria-label="对方在线状态"
    >
      <button
        type="button"
        className="peer-presence-card"
        aria-label={buttonLabel}
        onClick={isOnline ? onOpenMessageComposer : undefined}
      >
        <span className="peer-presence-avatar" aria-hidden={!peerImageUrl}>
          {peerImageUrl ? (
            <img src={peerImageUrl} alt="对方形象" draggable={false} />
          ) : (
            <span className="peer-presence-placeholder" aria-hidden="true">
              TA
            </span>
          )}
        </span>
        <span className="peer-presence-copy">
          <span className="peer-presence-label">
            <span className="peer-presence-dot" aria-hidden="true" />
            {label}
          </span>
          <span className="peer-presence-detail">{detail}</span>
        </span>
        {isOnline ? (
          <span className="peer-presence-heartline" aria-hidden="true" />
        ) : (
          <span className="peer-presence-nest" aria-label="离线留言小窝">
            月
          </span>
        )}
      </button>
    </aside>
  );
}
```

- [ ] **Step 4: Run component test**

Run: `pnpm vitest run src/sync/PeerPresenceLayer.test.tsx`

Expected: pass after small accessible-name adjustments if needed.

- [ ] **Step 5: Write failing App integration test**

Add coverage in `src/app/App.test.tsx` using the existing realtime mock setup:

```ts
it("renders peer presence beside the pet and opens composer from online status", async () => {
  render(<App />);
  await hydrateApp();

  act(() => {
    realtimeMock.latestOptions?.onEvent({
      type: "status",
      status: "connected",
    });
  });
  act(() => {
    realtimeMock.latestOptions?.onEvent({
      type: "presence",
      peerPresence: "online",
      peerDeviceId: "dev_b",
      changedAt: "2026-08-06T08:00:00.000Z",
      lastSeenAt: null,
    });
  });

  expect(screen.getByText("TA 在线")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "给在线的TA发消息" }));

  expect(screen.getByRole("dialog", { name: "发送消息" })).toBeInTheDocument();
});
```

Adapt the helper names to the existing `App.test.tsx` test harness; do not create duplicate global mocks.

- [ ] **Step 6: Run App test to verify RED**

Run: `pnpm vitest run src/app/App.test.tsx`

Expected: fails because App does not render `PeerPresenceLayer`.

- [ ] **Step 7: Wire component into App**

In `src/app/App.tsx`:

- Import `PeerPresenceLayer`.
- Compute peer image URL from selected peer package when `settings.sync.peerDeviceId` has a mapped package:

```ts
const selectedPeerPetPackageId = settings.sync.peerDeviceId
  ? settings.appearance.peerPetPackageByDeviceId[settings.sync.peerDeviceId] ?? null
  : null;
const selectedPeerPetPackage = selectedPeerPetPackageId
  ? petPackages.find((petPackage) => petPackage.id === selectedPeerPetPackageId) ?? null
  : null;
const peerPresenceImageUrl =
  selectedPeerPetPackage?.previewUrl ??
  selectedPeerPetPackage?.motions[selectedPeerPetPackage.defaultMotionId]?.frames[0] ??
  null;
```

Use the actual `ResolvedPetPackage` field names from `src/assets/petPackageRegistry.ts`.

Render after `FramePetStage` and before `RemoteMessageLayer`:

```tsx
<PeerPresenceLayer
  status={syncStatus}
  peerImageUrl={peerPresenceImageUrl}
  onOpenMessageComposer={openMessageComposerPanel}
/>
```

If `openMessageComposerPanel` currently has narrower behavior, extract a callback that closes the interaction menu, clears context menu, and sets `messageComposerOpen` to true.

- [ ] **Step 8: Add CSS**

Add compact styles in `src/app/app.css`:

```css
.peer-presence-layer {
  position: absolute;
  left: calc(50% + 72px);
  top: 72px;
  z-index: 5;
  pointer-events: none;
}

.peer-presence-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  max-width: 154px;
  padding: 7px 9px;
  border: 1px solid rgb(75 43 26 / 0.2);
  border-radius: 12px;
  background: rgb(255 250 244 / 0.88);
  box-shadow: 0 8px 22px rgb(75 43 26 / 0.14);
  color: #3b2417;
  font: inherit;
  pointer-events: auto;
}

.peer-presence-layer.is-online .peer-presence-card {
  border-color: rgb(255 128 112 / 0.36);
  background: rgb(255 246 239 / 0.92);
}

.peer-presence-layer.is-offline .peer-presence-card {
  border-color: rgb(110 125 160 / 0.26);
  background: rgb(243 247 255 / 0.86);
  color: #394257;
}

.peer-presence-avatar {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 999px;
  overflow: hidden;
  background: rgb(255 255 255 / 0.82);
}

.peer-presence-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.peer-presence-layer.is-offline .peer-presence-avatar {
  filter: grayscale(0.85);
  opacity: 0.72;
}

.peer-presence-copy {
  min-width: 0;
  display: grid;
  gap: 1px;
  text-align: left;
}

.peer-presence-label,
.peer-presence-detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.peer-presence-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
}

.peer-presence-detail {
  font-size: 11px;
  opacity: 0.78;
}

.peer-presence-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #ff7c6e;
  box-shadow: 0 0 0 4px rgb(255 124 110 / 0.14);
}

.peer-presence-layer.is-offline .peer-presence-dot {
  background: #8f9ab3;
  box-shadow: 0 0 0 4px rgb(143 154 179 / 0.14);
}

.peer-presence-heartline {
  position: absolute;
  left: -44px;
  bottom: 7px;
  width: 42px;
  height: 18px;
  border-bottom: 2px dotted rgb(255 124 110 / 0.68);
  border-radius: 999px;
}

.peer-presence-heartline::after {
  position: absolute;
  right: -2px;
  bottom: -8px;
  color: #ff7c6e;
  font-size: 13px;
  content: "♥";
}

.peer-presence-nest {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: rgb(255 222 142 / 0.72);
  color: #8b6230;
  font-size: 12px;
}

@media (prefers-reduced-motion: no-preference) {
  .peer-presence-layer.is-online .peer-presence-card {
    animation: peer-presence-breathe 2.8s ease-in-out infinite;
  }

  .peer-presence-layer.is-online .peer-presence-dot {
    animation: peer-presence-pulse 1.8s ease-in-out infinite;
  }

  .peer-presence-layer.is-offline .peer-presence-nest {
    animation: peer-presence-lamp 3.2s ease-in-out infinite;
  }
}

@keyframes peer-presence-breathe {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}

@keyframes peer-presence-pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgb(255 124 110 / 0.14); }
  50% { box-shadow: 0 0 0 7px rgb(255 124 110 / 0.05); }
}

@keyframes peer-presence-lamp {
  0%, 100% { opacity: 0.76; }
  50% { opacity: 1; }
}
```

Adjust positions after visual/manual testing so the bubble does not overlap the main pet, remote message bubble, or radial menu.

- [ ] **Step 9: Run UI tests**

Run: `pnpm vitest run src/sync/PeerPresenceLayer.test.tsx src/app/App.test.tsx`

Expected: pass.

- [ ] **Step 10: Commit**

```bash
git add src/sync/PeerPresenceLayer.tsx src/sync/PeerPresenceLayer.test.tsx src/app/App.tsx src/app/App.test.tsx src/app/app.css
git commit -m "feat: render emotional peer presence"
```

---

### Task 4: Polish Regression Safety And Build

**Files:**
- Modify only files needed to fix regressions from Task 1-3.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified client and server build.

- [ ] **Step 1: Run focused test suite**

Run:

```bash
pnpm vitest run src/sync/realtimeClient.test.ts src/sync/useRealtimeSync.test.tsx src/sync/SyncPanel.test.tsx src/sync/PeerPresenceLayer.test.tsx src/app/App.test.tsx
pnpm --dir server test -- websocketRelay
```

Expected: all focused tests pass.

- [ ] **Step 2: Run full client and server verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm --dir server test
pnpm --dir server typecheck
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 3: Build debug exe**

Stop only the debug exe for this worktree if Windows locks it:

```powershell
$target = (Resolve-Path -LiteralPath 'src-tauri\target\debug\couple-desktop-pet.exe' -ErrorAction SilentlyContinue).Path
if ($target) {
  Get-Process -Name 'couple-desktop-pet' -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq $target } |
    ForEach-Object { Stop-Process -Id $_.Id -Force }
}
```

Run:

```bash
pnpm tauri build --debug
```

Expected: `src-tauri/target/debug/couple-desktop-pet.exe` is rebuilt.

- [ ] **Step 4: Manual smoke check**

Run the rebuilt exe. Verify:

- When paired and peer online, a small warm `TA 在线 / 正在陪你` card appears beside the pet.
- Clicking the online card opens the existing send-message dialog.
- When peer disconnects, the card changes to `TA 离线 / 等TA回来`.
- When not paired, connecting, auth failed, or unknown, the layer does not show misleading online/offline text.
- The layer does not block dragging, right-click menu, remote message hover acknowledgement, or settings.
- No tray badge or corner badge exists.

- [ ] **Step 5: Final commit if polish changes were needed**

```bash
git add <changed-files>
git commit -m "fix: polish peer presence regressions"
```

Skip this commit if Step 1-4 required no changes.

---

## Self-Review

- Spec coverage: online and offline emotional display is covered by Task 3; explicit presence reliability is covered by Task 1 and Task 2; no tray/corner badge is stated in Global Constraints and Task 4 manual checks.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: `changedAt`, `lastSeenAt`, `peerPresenceChangedAt`, and `peerLastSeenAt` are consistently named across protocol, client event, and runtime state.
