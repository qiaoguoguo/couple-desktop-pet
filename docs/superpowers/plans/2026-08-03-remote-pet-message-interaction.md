# Remote Pet Message Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a desktop-pet style remote message experience where incoming messages show the peer pet avatar and persist until mouse-hover acknowledgement.

**Architecture:** Keep realtime transport in `sync`, asset resolution in `assets`, and visual presentation in a new `RemoteMessageLayer`. `App` owns a small remote message queue and passes resolved peer package data into the visual layer.

**Tech Stack:** Tauri 2, React, TypeScript, Vitest, Testing Library.

## Global Constraints

- Communicate project progress to the user in Chinese.
- Preserve existing uncommitted imported-pet asset protocol/path-normalization fixes.
- Do not change `.cdpet` package format in this feature.
- Do not use system dialogs or settings panel as the primary incoming message presentation.
- Incoming remote messages must not auto-hide before user hover acknowledgement.
- Mouse hover over the peer pet visit area confirms the message; confirmed messages hide after about 800ms.
- Keep the message feature 1-to-1 only.
- Do not introduce remote computer control behavior.
- Run `pnpm test` and `pnpm typecheck` before handing back.

---

## File Structure

- Create `src/sync/remoteMessageQueue.ts`: pure queue reducer/helpers for incoming remote message cards.
- Create `src/sync/remoteMessageQueue.test.ts`: unit coverage for enqueue, hover acknowledgement, dismissal, and FIFO promotion.
- Create `src/sync/RemoteMessageLayer.tsx`: visual layer that renders the peer pet visit avatar and speech bubble.
- Create `src/sync/RemoteMessageLayer.test.tsx`: component tests for image, fallback, and hover acknowledgement callback.
- Modify `src/app/App.tsx`: remove incoming-message use of generic `BubbleLayer`, add remote message queue state, resolve peer package from settings, render `RemoteMessageLayer`, and use longer local feedback for sent messages.
- Modify `src/bubble/bubbleStore.ts`: add optional per-bubble duration so sent-message feedback can last longer without changing all local interaction bubbles.
- Modify `src/app/App.test.tsx`: update realtime message tests to assert remote pet visit behavior, hover-to-dismiss, persistence, queueing, and peer package selection.
- Modify `src/settings/AppearancePanel.tsx`: add a paired-peer package selector so the user can choose which imported package represents the other device.
- Modify `src/app/app.css`: add remote message visit styles and peer package selector styles.

---

### Task 1: Remote Message Queue

**Files:**
- Create: `src/sync/remoteMessageQueue.ts`
- Create: `src/sync/remoteMessageQueue.test.ts`

**Interfaces:**
- Produces:
  - `export type RemoteMessageStage = "visible" | "hovered" | "dismissing"`
  - `export interface RemoteMessageInput { id: string; fromDeviceId: string; text: string; at: string }`
  - `export interface RemoteMessageCard extends RemoteMessageInput { stage: RemoteMessageStage }`
  - `export interface RemoteMessageQueueState { active: RemoteMessageCard | null; queue: RemoteMessageCard[] }`
  - `export function createEmptyRemoteMessageQueue(): RemoteMessageQueueState`
  - `export function enqueueRemoteMessage(state: RemoteMessageQueueState, input: RemoteMessageInput): RemoteMessageQueueState`
  - `export function markRemoteMessageHovered(state: RemoteMessageQueueState, id: string): RemoteMessageQueueState`
  - `export function markRemoteMessageDismissing(state: RemoteMessageQueueState, id: string): RemoteMessageQueueState`
  - `export function completeRemoteMessageDismissal(state: RemoteMessageQueueState, id: string): RemoteMessageQueueState`

- [ ] **Step 1: Write queue tests**

```ts
import { describe, expect, it } from "vitest";
import {
  completeRemoteMessageDismissal,
  createEmptyRemoteMessageQueue,
  enqueueRemoteMessage,
  markRemoteMessageDismissing,
  markRemoteMessageHovered,
} from "./remoteMessageQueue";

describe("remoteMessageQueue", () => {
  it("makes the first incoming message active", () => {
    const state = enqueueRemoteMessage(createEmptyRemoteMessageQueue(), {
      id: "msg_1",
      fromDeviceId: "dev_b",
      text: "想你啦",
      at: "2026-08-03T12:00:00.000Z",
    });

    expect(state.active).toEqual({
      id: "msg_1",
      fromDeviceId: "dev_b",
      text: "想你啦",
      at: "2026-08-03T12:00:00.000Z",
      stage: "visible",
    });
    expect(state.queue).toEqual([]);
  });

  it("queues later messages until the active message is dismissed", () => {
    const withFirst = enqueueRemoteMessage(createEmptyRemoteMessageQueue(), {
      id: "msg_1",
      fromDeviceId: "dev_b",
      text: "第一条",
      at: "2026-08-03T12:00:00.000Z",
    });
    const withSecond = enqueueRemoteMessage(withFirst, {
      id: "msg_2",
      fromDeviceId: "dev_b",
      text: "第二条",
      at: "2026-08-03T12:00:01.000Z",
    });

    expect(withSecond.active?.id).toBe("msg_1");
    expect(withSecond.queue.map((message) => message.id)).toEqual(["msg_2"]);
  });

  it("marks only the active matching message through hover and dismissal stages", () => {
    const state = enqueueRemoteMessage(createEmptyRemoteMessageQueue(), {
      id: "msg_1",
      fromDeviceId: "dev_b",
      text: "摸摸头",
      at: "2026-08-03T12:00:00.000Z",
    });

    expect(markRemoteMessageHovered(state, "other").active?.stage).toBe("visible");
    expect(markRemoteMessageHovered(state, "msg_1").active?.stage).toBe("hovered");
    expect(
      markRemoteMessageDismissing(
        markRemoteMessageHovered(state, "msg_1"),
        "msg_1",
      ).active?.stage,
    ).toBe("dismissing");
  });

  it("promotes queued messages after completing dismissal", () => {
    const withFirst = enqueueRemoteMessage(createEmptyRemoteMessageQueue(), {
      id: "msg_1",
      fromDeviceId: "dev_b",
      text: "第一条",
      at: "2026-08-03T12:00:00.000Z",
    });
    const withSecond = enqueueRemoteMessage(withFirst, {
      id: "msg_2",
      fromDeviceId: "dev_b",
      text: "第二条",
      at: "2026-08-03T12:00:01.000Z",
    });

    const next = completeRemoteMessageDismissal(withSecond, "msg_1");

    expect(next.active?.id).toBe("msg_2");
    expect(next.active?.stage).toBe("visible");
    expect(next.queue).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the new queue test to verify it fails**

Run: `pnpm vitest run src/sync/remoteMessageQueue.test.ts`

Expected: FAIL because `src/sync/remoteMessageQueue.ts` does not exist.

- [ ] **Step 3: Implement queue helpers**

```ts
export type RemoteMessageStage = "visible" | "hovered" | "dismissing";

export interface RemoteMessageInput {
  id: string;
  fromDeviceId: string;
  text: string;
  at: string;
}

export interface RemoteMessageCard extends RemoteMessageInput {
  stage: RemoteMessageStage;
}

export interface RemoteMessageQueueState {
  active: RemoteMessageCard | null;
  queue: RemoteMessageCard[];
}

export function createEmptyRemoteMessageQueue(): RemoteMessageQueueState {
  return { active: null, queue: [] };
}

export function enqueueRemoteMessage(
  state: RemoteMessageQueueState,
  input: RemoteMessageInput,
): RemoteMessageQueueState {
  const message: RemoteMessageCard = { ...input, stage: "visible" };

  if (!state.active) {
    return { active: message, queue: state.queue };
  }

  return { active: state.active, queue: [...state.queue, message] };
}

export function markRemoteMessageHovered(
  state: RemoteMessageQueueState,
  id: string,
): RemoteMessageQueueState {
  if (!state.active || state.active.id !== id || state.active.stage !== "visible") {
    return state;
  }

  return { ...state, active: { ...state.active, stage: "hovered" } };
}

export function markRemoteMessageDismissing(
  state: RemoteMessageQueueState,
  id: string,
): RemoteMessageQueueState {
  if (!state.active || state.active.id !== id || state.active.stage === "dismissing") {
    return state;
  }

  return { ...state, active: { ...state.active, stage: "dismissing" } };
}

export function completeRemoteMessageDismissal(
  state: RemoteMessageQueueState,
  id: string,
): RemoteMessageQueueState {
  if (!state.active || state.active.id !== id) {
    return state;
  }

  const [nextMessage, ...remainingQueue] = state.queue;

  return {
    active: nextMessage ?? null,
    queue: remainingQueue,
  };
}
```

- [ ] **Step 4: Run the queue tests**

Run: `pnpm vitest run src/sync/remoteMessageQueue.test.ts`

Expected: PASS.

---

### Task 2: Remote Message Visual Layer

**Files:**
- Create: `src/sync/RemoteMessageLayer.tsx`
- Create: `src/sync/RemoteMessageLayer.test.tsx`

**Interfaces:**
- Consumes:
  - `RemoteMessageCard` from `src/sync/remoteMessageQueue.ts`
  - `ResolvedPetPackage` from `src/assets/petPackageRegistry.ts`
- Produces:
  - `export interface RemoteMessageLayerProps`
  - `export function RemoteMessageLayer(props: RemoteMessageLayerProps): JSX.Element | null`

- [ ] **Step 1: Write component tests**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PetActionName } from "../assets/builtInPetManifest";
import type { ResolvedPetPackage } from "../assets/petPackageRegistry";
import type { RemoteMessageCard } from "./remoteMessageQueue";
import { RemoteMessageLayer } from "./RemoteMessageLayer";

const actionNames: PetActionName[] = [
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
];

function remoteMessage(stage: RemoteMessageCard["stage"] = "visible"): RemoteMessageCard {
  return {
    id: "msg_1",
    fromDeviceId: "dev_b",
    text: "想你啦",
    at: "2026-08-03T12:00:00.000Z",
    stage,
  };
}

function resolvedPackage(): ResolvedPetPackage {
  return {
    id: "imported:moon-buddy",
    name: "月亮伙伴",
    baseSize: { width: 256, height: 320 },
    previewUrl: "asset://moon/preview.png",
    source: "imported",
    actions: Object.fromEntries(
      actionNames.map((action) => [
        action,
        {
          fps: 3,
          loop: action.startsWith("idle"),
          durationMs: 6000,
          category: action.startsWith("idle") ? "idle" : "interaction",
          frames: [`asset://moon/${action}-01.png`],
        },
      ]),
    ) as ResolvedPetPackage["actions"],
  };
}

describe("RemoteMessageLayer", () => {
  it("renders the peer pet image and incoming message", () => {
    render(
      <RemoteMessageLayer
        message={remoteMessage()}
        peerPackage={resolvedPackage()}
        onAcknowledge={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("对方桌宠消息")).toBeTruthy();
    expect(screen.getByRole("img", { name: "月亮伙伴来访" })).toBeTruthy();
    expect(screen.getByText("想你啦")).toBeTruthy();
  });

  it("uses a readable fallback when no peer package is selected", () => {
    render(
      <RemoteMessageLayer
        message={remoteMessage()}
        peerPackage={null}
        onAcknowledge={vi.fn()}
      />,
    );

    expect(screen.getByRole("img", { name: "对方桌宠来访占位" })).toBeTruthy();
    expect(screen.getByText("对方桌宠")).toBeTruthy();
  });

  it("acknowledges the message on mouse hover", () => {
    const onAcknowledge = vi.fn();
    render(
      <RemoteMessageLayer
        message={remoteMessage()}
        peerPackage={resolvedPackage()}
        onAcknowledge={onAcknowledge}
      />,
    );

    fireEvent.pointerEnter(screen.getByLabelText("对方桌宠消息"));

    expect(onAcknowledge).toHaveBeenCalledWith("msg_1");
  });

  it("does not render when there is no active message", () => {
    render(
      <RemoteMessageLayer
        message={null}
        peerPackage={resolvedPackage()}
        onAcknowledge={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("对方桌宠消息")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the component test to verify it fails**

Run: `pnpm vitest run src/sync/RemoteMessageLayer.test.tsx`

Expected: FAIL because `RemoteMessageLayer` does not exist.

- [ ] **Step 3: Implement `RemoteMessageLayer`**

```tsx
import type { ResolvedPetPackage } from "../assets/petPackageRegistry";
import type { RemoteMessageCard } from "./remoteMessageQueue";

export interface RemoteMessageLayerProps {
  message: RemoteMessageCard | null;
  peerPackage: ResolvedPetPackage | null;
  onAcknowledge(messageId: string): void;
}

export function RemoteMessageLayer({
  message,
  peerPackage,
  onAcknowledge,
}: RemoteMessageLayerProps) {
  if (!message) {
    return null;
  }

  const peerName = peerPackage?.name ?? "对方桌宠";
  const imageUrl =
    peerPackage?.previewUrl ??
    peerPackage?.actions["idle-breathe"].frames[0] ??
    null;

  return (
    <div
      className={`remote-message-layer is-${message.stage}`}
      role="status"
      aria-label="对方桌宠消息"
      aria-live="polite"
      onPointerEnter={() => onAcknowledge(message.id)}
    >
      <figure className="remote-visitor">
        {imageUrl ? (
          <img
            className="remote-visitor-image"
            src={imageUrl}
            alt={`${peerName}来访`}
            draggable={false}
          />
        ) : (
          <div className="remote-visitor-fallback" role="img" aria-label="对方桌宠来访占位">
            <span>友</span>
          </div>
        )}
        <figcaption>{peerName}</figcaption>
      </figure>
      <div className="remote-message-bubble">{message.text}</div>
    </div>
  );
}
```

- [ ] **Step 4: Run the component test**

Run: `pnpm vitest run src/sync/RemoteMessageLayer.test.tsx`

Expected: PASS.

---

### Task 3: App Integration and Incoming Message Lifecycle

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/bubble/bubbleStore.ts`
- Modify: `src/app/App.test.tsx`

**Interfaces:**
- Consumes:
  - `RemoteMessageLayer`
  - queue helpers from `remoteMessageQueue`
- Produces:
  - Incoming remote messages are queued and rendered by `RemoteMessageLayer`.
  - Generic `BubbleLayer` no longer displays incoming remote messages.
  - Sent-message local feedback uses a longer duration.

- [ ] **Step 1: Extend bubble store tests inside `App.test.tsx` through observable behavior**

Update or add App tests with these cases:

```tsx
it("shows received realtime messages as a persistent remote pet visit", async () => {
  vi.useFakeTimers();
  windowCommandsMock.readSettings.mockResolvedValueOnce({
    sync: {
      enabled: true,
      relayUrl: "http://127.0.0.1:8787",
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId: "pair_1",
      peerDeviceId: "dev_b",
    },
  });
  render(<App />);

  await waitFor(() => expect(realtimeSyncMock.callbacks).toBeTruthy());

  act(() => {
    realtimeSyncMock.callbacks?.onMessage({
      id: "msg_1",
      fromDeviceId: "dev_b",
      text: "想你啦",
      at: "2026-08-03T12:00:00.000Z",
    });
  });

  expect(screen.getByLabelText("对方桌宠消息")).toBeTruthy();
  expect(screen.getByText("想你啦")).toBeTruthy();

  act(() => vi.advanceTimersByTime(5000));

  expect(screen.getByText("想你啦")).toBeTruthy();
});

it("dismisses a received remote message only after hover acknowledgement", async () => {
  vi.useFakeTimers();
  windowCommandsMock.readSettings.mockResolvedValueOnce({
    sync: {
      enabled: true,
      relayUrl: "http://127.0.0.1:8787",
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId: "pair_1",
      peerDeviceId: "dev_b",
    },
  });
  render(<App />);

  await waitFor(() => expect(realtimeSyncMock.callbacks).toBeTruthy());

  act(() => {
    realtimeSyncMock.callbacks?.onMessage({
      id: "msg_1",
      fromDeviceId: "dev_b",
      text: "摸摸头",
      at: "2026-08-03T12:00:00.000Z",
    });
  });

  fireEvent.pointerEnter(screen.getByLabelText("对方桌宠消息"));
  act(() => vi.advanceTimersByTime(799));
  expect(screen.getByText("摸摸头")).toBeTruthy();

  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByText("摸摸头")).toBeNull();
});

it("shows queued remote messages one at a time", async () => {
  vi.useFakeTimers();
  windowCommandsMock.readSettings.mockResolvedValueOnce({
    sync: {
      enabled: true,
      relayUrl: "http://127.0.0.1:8787",
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId: "pair_1",
      peerDeviceId: "dev_b",
    },
  });
  render(<App />);

  await waitFor(() => expect(realtimeSyncMock.callbacks).toBeTruthy());

  act(() => {
    realtimeSyncMock.callbacks?.onMessage({
      id: "msg_1",
      fromDeviceId: "dev_b",
      text: "第一条",
      at: "2026-08-03T12:00:00.000Z",
    });
    realtimeSyncMock.callbacks?.onMessage({
      id: "msg_2",
      fromDeviceId: "dev_b",
      text: "第二条",
      at: "2026-08-03T12:00:01.000Z",
    });
  });

  expect(screen.getByText("第一条")).toBeTruthy();
  expect(screen.queryByText("第二条")).toBeNull();

  fireEvent.pointerEnter(screen.getByLabelText("对方桌宠消息"));
  act(() => vi.advanceTimersByTime(800));

  expect(screen.queryByText("第一条")).toBeNull();
  expect(screen.getByText("第二条")).toBeTruthy();
});
```

- [ ] **Step 2: Run the targeted App tests to verify they fail**

Run: `pnpm vitest run src/app/App.test.tsx`

Expected: FAIL because `RemoteMessageLayer` is not integrated and incoming messages still use `BubbleLayer`.

- [ ] **Step 3: Add per-bubble duration**

Change `src/bubble/bubbleStore.ts` to:

```ts
export interface BubbleState {
  id: number;
  message: string;
  visible: boolean;
  durationMs: number;
}

let nextBubbleId = 1;

export function createHiddenBubble(): BubbleState {
  return {
    id: 0,
    message: "",
    visible: false,
    durationMs: 0,
  };
}

export function showBubble(
  message: string,
  options: { durationMs?: number } = {},
): BubbleState {
  return {
    id: nextBubbleId++,
    message,
    visible: true,
    durationMs: options.durationMs ?? 1800,
  };
}

export function hideBubble(state: BubbleState): BubbleState {
  return {
    ...state,
    visible: false,
  };
}
```

- [ ] **Step 4: Wire remote queue into `App.tsx`**

Add imports:

```ts
import { RemoteMessageLayer } from "../sync/RemoteMessageLayer";
import {
  completeRemoteMessageDismissal,
  createEmptyRemoteMessageQueue,
  enqueueRemoteMessage,
  markRemoteMessageDismissing,
  markRemoteMessageHovered,
  type RemoteMessageCard,
} from "../sync/remoteMessageQueue";
```

Add constants near the existing timers:

```ts
const remoteMessageDismissDelayMs = 800;
const sentMessageBubbleDurationMs = 5000;
```

Add state:

```ts
const [remoteMessages, setRemoteMessages] = useState(() =>
  createEmptyRemoteMessageQueue(),
);
```

Change `realtimeCallbacks.onMessage` so it appends history and enqueues the remote message, but does not call `setBubble(showBubble(message.text))`:

```ts
setRemoteMessages((current) => enqueueRemoteMessage(current, message));
```

Resolve active peer package:

```ts
const activeRemoteMessage = remoteMessages.active;
const activePeerPetPackage = useMemo(() => {
  if (!activeRemoteMessage) {
    return null;
  }

  const peerPackageId =
    settings.appearance.peerPetPackageByDeviceId[activeRemoteMessage.fromDeviceId];

  return peerPackageId
    ? petPackages.find((pkg) => pkg.id === peerPackageId) ?? null
    : null;
}, [
  activeRemoteMessage,
  petPackages,
  settings.appearance.peerPetPackageByDeviceId,
]);
```

Add acknowledgement callback:

```ts
const handleRemoteMessageAcknowledge = useCallback((messageId: string) => {
  setRemoteMessages((current) => markRemoteMessageHovered(current, messageId));
}, []);
```

Add hover-to-dismiss effect:

```ts
useEffect(() => {
  const activeMessage = remoteMessages.active;

  if (!activeMessage || activeMessage.stage !== "hovered") {
    return;
  }

  setRemoteMessages((current) =>
    markRemoteMessageDismissing(current, activeMessage.id),
  );

  const timer = window.setTimeout(() => {
    setRemoteMessages((current) =>
      completeRemoteMessageDismissal(current, activeMessage.id),
    );
  }, remoteMessageDismissDelayMs);

  return () => window.clearTimeout(timer);
}, [remoteMessages.active]);
```

Update the existing generic bubble timer:

```ts
const hideTimer = window.setTimeout(() => {
  setBubble((current) => hideBubble(current));
}, bubble.durationMs);
```

Render `RemoteMessageLayer` inside `.pet-surface`, after `FramePetStage` so it can sit visually above the pet:

```tsx
<RemoteMessageLayer
  message={activeRemoteMessage}
  peerPackage={activePeerPetPackage}
  onAcknowledge={handleRemoteMessageAcknowledge}
/>
```

In `handleSendMessage`, after adding the sent history item:

```ts
if (settingsRef.current.bubblesEnabled) {
  setBubble(showBubble("消息已送出", { durationMs: sentMessageBubbleDurationMs }));
}
```

- [ ] **Step 5: Run App tests**

Run: `pnpm vitest run src/app/App.test.tsx`

Expected: PASS after implementation.

---

### Task 4: Peer Pet Package Selection

**Files:**
- Modify: `src/settings/AppearancePanel.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

**Interfaces:**
- Produces:
  - `AppearancePanel` accepts `peerDeviceId`, `selectedPeerPackageId`, and `onSelectPeerPackage`.
  - App persists `settings.appearance.peerPetPackageByDeviceId[peerDeviceId]`.

- [ ] **Step 1: Add App-level tests for peer package rendering and selection**

Add tests:

```tsx
it("renders a received message with the selected peer pet package", async () => {
  const moonPackage = importedPackageSummary();
  petPackageCommandsMock.listPetPackages.mockResolvedValueOnce([moonPackage]);
  windowCommandsMock.readSettings.mockResolvedValueOnce({
    appearance: {
      selectedPetPackageId: "builtin:star-sleeper",
      peerPetPackageByDeviceId: {
        dev_b: "imported:moon-buddy",
      },
    },
    sync: {
      enabled: true,
      relayUrl: "http://127.0.0.1:8787",
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId: "pair_1",
      peerDeviceId: "dev_b",
    },
  });
  render(<App />);

  await waitFor(() => expect(realtimeSyncMock.callbacks).toBeTruthy());

  act(() => {
    realtimeSyncMock.callbacks?.onMessage({
      id: "msg_1",
      fromDeviceId: "dev_b",
      text: "我来串门啦",
      at: "2026-08-03T12:00:00.000Z",
    });
  });

  expect(await screen.findByRole("img", { name: "月亮伙伴来访" })).toBeTruthy();
});

it("persists the selected peer pet package for the paired device", async () => {
  petPackageCommandsMock.listPetPackages.mockResolvedValueOnce([
    importedPackageSummary(),
  ]);
  windowCommandsMock.readSettings.mockResolvedValueOnce({
    sync: {
      enabled: true,
      relayUrl: "http://127.0.0.1:8787",
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId: "pair_1",
      peerDeviceId: "dev_b",
    },
  });
  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: "设置" }));
  await waitFor(() =>
    expect(screen.getByLabelText("对方形象")).toBeTruthy(),
  );

  fireEvent.change(screen.getByLabelText("对方形象"), {
    target: { value: "imported:moon-buddy" },
  });

  expect(windowCommandsMock.writeSettings).toHaveBeenCalledWith(
    expect.objectContaining({
      appearance: expect.objectContaining({
        peerPetPackageByDeviceId: {
          dev_b: "imported:moon-buddy",
        },
      }),
    }),
  );
});
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `pnpm vitest run src/app/App.test.tsx`

Expected: FAIL because `AppearancePanel` does not expose peer package selection yet.

- [ ] **Step 3: Extend `AppearancePanel` props and UI**

Add props:

```ts
peerDeviceId: string | null;
selectedPeerPackageId: string | null;
onSelectPeerPackage(packageId: string): void;
```

Render this after the current local package selector:

```tsx
{peerDeviceId ? (
  <label className="appearance-field">
    <span>对方形象</span>
    <select
      value={selectedPeerPackageId ?? ""}
      onChange={(event) => onSelectPeerPackage(event.currentTarget.value)}
    >
      <option value="">未指定</option>
      {packages.map((pkg) => (
        <option key={pkg.id} value={pkg.id}>
          {pkg.name}
        </option>
      ))}
    </select>
  </label>
) : null}
```

- [ ] **Step 4: Wire peer package selection in `App.tsx`**

Add handler:

```ts
const handleSelectPeerPetPackage = useCallback(
  (packageId: string) => {
    const peerDeviceId = settingsRef.current.sync.peerDeviceId;

    if (!peerDeviceId) {
      return;
    }

    const nextMap = {
      ...settingsRef.current.appearance.peerPetPackageByDeviceId,
    };

    if (packageId) {
      nextMap[peerDeviceId] = packageId;
    } else {
      delete nextMap[peerDeviceId];
    }

    handleSettingsChange({
      appearance: {
        ...settingsRef.current.appearance,
        peerPetPackageByDeviceId: nextMap,
      },
    });
  },
  [handleSettingsChange],
);
```

Pass props into `AppearancePanel`:

```tsx
peerDeviceId={settings.sync.peerDeviceId}
selectedPeerPackageId={
  settings.sync.peerDeviceId
    ? settings.appearance.peerPetPackageByDeviceId[settings.sync.peerDeviceId] ?? null
    : null
}
onSelectPeerPackage={handleSelectPeerPetPackage}
```

- [ ] **Step 5: Run App tests**

Run: `pnpm vitest run src/app/App.test.tsx`

Expected: PASS.

---

### Task 5: Styling, Full Verification, and Handoff

**Files:**
- Modify: `src/app/app.css`

**Interfaces:**
- Consumes:
  - `.remote-message-layer`
  - `.remote-visitor`
  - `.remote-visitor-image`
  - `.remote-visitor-fallback`
  - `.remote-message-bubble`

- [ ] **Step 1: Add CSS for the visit layer**

Add:

```css
.remote-message-layer {
  position: absolute;
  right: 8px;
  top: 38px;
  z-index: 6;
  display: grid;
  grid-template-columns: 72px minmax(116px, 172px);
  align-items: end;
  gap: 8px;
  max-width: calc(100% - 16px);
  pointer-events: auto;
  transition: opacity 160ms ease, transform 160ms ease;
}

.remote-message-layer.is-dismissing {
  opacity: 0.72;
  transform: translateY(-3px);
}

.remote-visitor {
  display: grid;
  justify-items: center;
  gap: 2px;
  margin: 0;
  min-width: 0;
}

.remote-visitor-image {
  width: 72px;
  height: 90px;
  object-fit: contain;
  display: block;
  filter: drop-shadow(0 5px 8px rgb(75 43 26 / 0.14));
  user-select: none;
  pointer-events: none;
}

.remote-visitor-fallback {
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  border: 2px solid #4b2b1a;
  border-radius: 45% 50% 46% 48%;
  background: #fff1d8;
  color: #8a4d23;
  font-size: 24px;
  font-weight: 700;
}

.remote-visitor figcaption {
  max-width: 76px;
  overflow: hidden;
  color: #5c3a25;
  font-size: 11px;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remote-message-bubble {
  position: relative;
  min-width: 0;
  max-width: 172px;
  padding: 8px 10px;
  border: 2px solid #4b2b1a;
  border-radius: 8px;
  background: rgb(255 255 255 / 0.94);
  box-shadow: 0 8px 18px rgb(75 43 26 / 0.16);
  color: #2c1f18;
  font-size: 13px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.remote-message-bubble::before {
  position: absolute;
  left: -8px;
  bottom: 18px;
  width: 12px;
  height: 12px;
  border-left: 2px solid #4b2b1a;
  border-bottom: 2px solid #4b2b1a;
  background: rgb(255 255 255 / 0.94);
  content: "";
  transform: rotate(45deg);
}
```

- [ ] **Step 2: Run all frontend tests**

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 4: Run debug build if frontend checks pass**

Run: `pnpm tauri build --debug`

Expected: PASS. If Windows reports the exe is locked, stop the running `couple-desktop-pet.exe` process and rerun the same command.

- [ ] **Step 5: Manual smoke test**

Start the rebuilt debug exe:

```powershell
Start-Process -FilePath "C:\Users\14567\.codex\worktrees\6515\情侣桌宠\src-tauri\target\debug\couple-desktop-pet.exe" -WindowStyle Hidden
```

Manual checks:
- Open settings, bind or use existing local relay pairing.
- Send a message from the other host.
- Confirm the local pet window shows peer pet visit UI, not a settings dialog.
- Do not move the mouse over the message for at least 5 seconds; message remains visible.
- Move the mouse over the peer pet/message; message fades and disappears after about 800ms.
- Send two messages quickly; second appears only after first is acknowledged.

---

## Plan Self-Review

- Spec coverage: the plan covers peer pet rendering, persistent incoming messages, hover confirmation, fallback avatar, FIFO queue, message history regression, and tests.
- 占位内容扫描：没有未定项、待办标记或未明确的实现块。
- Type consistency: `RemoteMessageCard`, `RemoteMessageQueueState`, and handler names are consistent across tasks.
- Scope check: `.cdpet` schema remains unchanged; optional `duoActions` is intentionally left for a later feature.
