# Interaction Long Animation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-click happy action with a single-click interaction menu, long-form idle/interaction animations, and a regenerated star-sleeper animation asset set.

**Architecture:** Keep the local desktop pet core separated from desktop system controls. The state machine owns state transitions and currently selected action ids; React owns menu visibility, input routing, bubbles, and settings; the manifest owns action metadata and frame lists; generated PNG assets stay in the built-in star-sleeper package.

**Tech Stack:** Tauri 2, React 19, TypeScript 7, Vite 8, Vitest, DOM `<img>` sequence-frame rendering, Codex built-in Image Gen plus local chroma-key removal.

## Global Constraints

- Communicate with the user in Chinese throughout the project.
- Follow `AGENTS.md`: the fixed background Codex development task performs coding; the main agent owns scope, task dispatch, review, and acceptance.
- Do not reintroduce PixiJS into the MVP runtime path.
- Do not add networking, account, matching, chat, voice, AI, Live2D, resource import, packaging, signing, or auto-update features.
- Do not use third-party art, web-sourced sprites, unclear fonts, models, icons, audio, GPL, or AGPL code/assets.
- Single-click on the pet opens the interaction menu.
- Right-click stays reserved for the system menu: 设置, 重置位置, 隐藏, 退出.
- Each interaction action and each idle animation must last at least 5000 ms.
- Generated project assets must be moved into `src/assets/pets/star-sleeper/`; never leave referenced assets only under `$CODEX_HOME/*`.
- Use chroma-key generation plus local transparent PNG post-processing unless true native transparency is explicitly approved later.

---

## Planned File Structure

```text
src/
  app/
    App.tsx                         # Owns menu open/close, selected interactions, bubbles, desktop command calls
    App.test.tsx                    # Integration tests for menu, settings, right-click, click-through
    app.css                         # Pet surface, interaction menu, settings panel styles
  assets/
    builtInPetManifest.ts           # Action ids, metadata, interaction options, generated frame paths
    builtInPetManifest.test.ts      # Manifest duration and asset existence tests
    README.md                       # Updated generated asset contract
    pets/star-sleeper/
      character-base.png            # New visual identity baseline
      <action>-01.png ...           # Long animation frames
      README.md                     # Asset-specific provenance and generation notes
  interaction/
    InteractionMenu.tsx             # Lightweight single-click interaction menu
    InteractionMenu.test.tsx
  pet-core/
    petTypes.ts                     # Extended states/events/action ids
    petStateMachine.ts              # Pure transition logic
    petStateMachine.test.ts
    petScheduler.ts                 # Duration-based scheduler
    idleActionSelector.ts           # Avoids three repeated idle actions
    idleActionSelector.test.ts
  renderer/
    FramePetStage.tsx               # DOM image renderer, now emits click/drag only
    FramePetStage.test.tsx
    frameAtlas.ts                   # Asset URL lookup
docs/
  assets/
    star-sleeper-long-animation-prompts.md
  manual-verification/
    windows-mvp.md
```

Generated intermediate files may be staged under `tmp/imagegen/star-sleeper/` during work, but only final transparent PNGs and docs should be committed.

---

### Task 1: Extend Animation Manifest And Interaction Metadata

**Files:**
- Modify: `src/assets/builtInPetManifest.ts`
- Create: `src/assets/builtInPetManifest.test.ts`
- Modify: `src/assets/README.md`

**Interfaces:**
- Consumes existing PNG frame paths under `src/assets/pets/star-sleeper/`.
- Produces `PetActionName`, `IdleActionName`, `InteractionActionName`, `PetActionDefinition`, `PetInteractionOption`, `idleActionNames`, `interactionOptions`, `getActionDefinition`.
- Temporarily maps new long action ids to repeated existing frames so coding can proceed before regenerated assets land.

- [ ] **Step 1: Write failing manifest tests**

Create `src/assets/builtInPetManifest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  builtInPetManifest,
  idleActionNames,
  interactionOptions,
  type InteractionActionName,
} from "./builtInPetManifest";

describe("builtInPetManifest", () => {
  it("defines six single-click interaction options", () => {
    expect(interactionOptions.map((option) => option.id)).toEqual([
      "act-cute",
      "act-typing",
      "act-wave",
      "act-hug",
      "act-pout",
      "act-drowsy",
    ] satisfies InteractionActionName[]);
    expect(interactionOptions.map((option) => option.label)).toEqual([
      "撒娇卖萌",
      "敲电脑",
      "打招呼",
      "求抱抱",
      "生气鼓脸",
      "困困打盹",
    ]);
  });

  it("keeps every idle and interaction action at least five seconds long", () => {
    const longActionIds = [...idleActionNames, ...interactionOptions.map((option) => option.id)];

    for (const actionId of longActionIds) {
      expect(builtInPetManifest.actions[actionId].durationMs).toBeGreaterThanOrEqual(5000);
    }
  });

  it("marks idle, movement, and interaction categories explicitly", () => {
    expect(builtInPetManifest.actions["idle-breathe"].category).toBe("idle");
    expect(builtInPetManifest.actions.walk.category).toBe("movement");
    expect(builtInPetManifest.actions["act-cute"].category).toBe("interaction");
  });
});
```

- [ ] **Step 2: Run the new test to verify failure**

Run:

```powershell
pnpm test -- src/assets/builtInPetManifest.test.ts
```

Expected: FAIL because the new exports and action ids do not exist.

- [ ] **Step 3: Replace the manifest type model**

Modify `src/assets/builtInPetManifest.ts` to define these exact exported types:

```ts
export type IdleActionName = "idle-breathe" | "idle-look" | "idle-stretch";

export type MovementActionName = "walk" | "drag" | "sleep";

export type InteractionActionName =
  | "act-cute"
  | "act-typing"
  | "act-wave"
  | "act-hug"
  | "act-pout"
  | "act-drowsy";

export type PetActionName = IdleActionName | MovementActionName | InteractionActionName;

export interface PetActionDefinition {
  fps: number;
  loop: boolean;
  durationMs: number;
  category: "idle" | "movement" | "interaction";
  frames: readonly string[];
}

export interface PetInteractionOption {
  id: InteractionActionName;
  label: string;
  bubble: string;
}
```

- [ ] **Step 4: Add stable option lists**

Add these exports:

```ts
export const idleActionNames = [
  "idle-breathe",
  "idle-look",
  "idle-stretch",
] as const satisfies readonly IdleActionName[];

export const interactionOptions = [
  { id: "act-cute", label: "撒娇卖萌", bubble: "陪我一会儿嘛。" },
  { id: "act-typing", label: "敲电脑", bubble: "我也在努力敲代码。" },
  { id: "act-wave", label: "打招呼", bubble: "嗨，我在这里！" },
  { id: "act-hug", label: "求抱抱", bubble: "可以抱一下吗？" },
  { id: "act-pout", label: "生气鼓脸", bubble: "哼，快哄我。" },
  { id: "act-drowsy", label: "困困打盹", bubble: "有点困啦。" },
] as const satisfies readonly PetInteractionOption[];
```

- [ ] **Step 5: Add temporary repeated-frame actions**

Until Task 6 replaces them with regenerated frames, use repeated existing paths to produce 18-frame long actions without missing files:

```ts
const repeatFrames = (frames: readonly string[], count = 18) =>
  Array.from({ length: count }, (_, index) => frames[index % frames.length]);

const oldIdleFrames = [
  "pets/star-sleeper/idle-01.png",
  "pets/star-sleeper/idle-02.png",
  "pets/star-sleeper/idle-03.png",
  "pets/star-sleeper/idle-04.png",
] as const;

const oldHappyFrames = [
  "pets/star-sleeper/happy-01.png",
  "pets/star-sleeper/happy-02.png",
  "pets/star-sleeper/happy-03.png",
  "pets/star-sleeper/happy-04.png",
] as const;
```

Use `fps: 3`, `durationMs: 6000` for all long idle and interaction actions. Keep `walk`, `drag`, and `sleep` present, also with `durationMs >= 5000`; while using old assets, repeat old frames to 18 entries.

- [ ] **Step 6: Update asset README**

In `src/assets/README.md`, change the package description from 20 short frames to a long-animation package contract:

```markdown
The current manifest supports long idle and interaction action ids. During the transition, some long actions may temporarily reuse existing frames until the regenerated transparent PNG set is installed.
```

- [ ] **Step 7: Verify Task 1**

Run:

```powershell
pnpm test -- src/assets/builtInPetManifest.test.ts
pnpm typecheck
```

Expected: both exit 0.

- [ ] **Step 8: Commit Task 1**

```powershell
git add src/assets
git commit -m "feat: extend pet animation manifest"
```

---

### Task 2: Add Interaction State And Idle Action Scheduling

**Files:**
- Modify: `src/pet-core/petTypes.ts`
- Modify: `src/pet-core/petStateMachine.ts`
- Modify: `src/pet-core/petStateMachine.test.ts`
- Modify: `src/pet-core/petScheduler.ts`
- Create: `src/pet-core/idleActionSelector.ts`
- Create: `src/pet-core/idleActionSelector.test.ts`

**Interfaces:**
- Consumes `PetActionName`, `IdleActionName`, and `InteractionActionName` from `builtInPetManifest.ts`.
- Produces `PetState.action`, `INTERACTION_SELECTED`, `IDLE_ANIMATION_FINISHED`, and `selectNextIdleAction`.
- `PetState.action` is the single source for the renderer action id.

- [ ] **Step 1: Write failing idle selector tests**

Create `src/pet-core/idleActionSelector.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { IdleActionName } from "../assets/builtInPetManifest";
import { selectNextIdleAction } from "./idleActionSelector";

const idleActions: readonly IdleActionName[] = [
  "idle-breathe",
  "idle-look",
  "idle-stretch",
];

describe("selectNextIdleAction", () => {
  it("selects a deterministic idle action from the random value", () => {
    expect(selectNextIdleAction([], idleActions, () => 0)).toBe("idle-breathe");
    expect(selectNextIdleAction([], idleActions, () => 0.4)).toBe("idle-look");
    expect(selectNextIdleAction([], idleActions, () => 0.8)).toBe("idle-stretch");
  });

  it("avoids selecting the same idle action three times in a row", () => {
    const history: readonly IdleActionName[] = [
      "idle-breathe",
      "idle-breathe",
    ];

    expect(selectNextIdleAction(history, idleActions, () => 0)).toBe("idle-look");
  });
});
```

- [ ] **Step 2: Implement `selectNextIdleAction`**

Create `src/pet-core/idleActionSelector.ts`:

```ts
import type { IdleActionName } from "../assets/builtInPetManifest";

export function selectNextIdleAction(
  history: readonly IdleActionName[],
  idleActions: readonly IdleActionName[],
  random: () => number = Math.random,
): IdleActionName {
  if (idleActions.length === 0) {
    throw new Error("idleActions must not be empty");
  }

  const recent = history.slice(-2);
  const blocked =
    recent.length === 2 && recent[0] === recent[1] ? recent[0] : null;
  const candidates = blocked
    ? idleActions.filter((action) => action !== blocked)
    : [...idleActions];
  const pool = candidates.length > 0 ? candidates : [...idleActions];
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));

  return pool[index];
}
```

- [ ] **Step 3: Write failing state machine tests**

Update `src/pet-core/petStateMachine.test.ts` with explicit interaction expectations:

```ts
it("starts in idle-breathe", () => {
  expect(createInitialPetState(1000)).toMatchObject({
    name: "idle",
    action: "idle-breathe",
  });
});

it("opens an interaction action and returns to idle after completion", () => {
  const idle = createInitialPetState(1000);
  const interacting = transitionPetState(idle, {
    type: "INTERACTION_SELECTED",
    action: "act-cute",
    at: 1200,
  });
  const returnedIdle = transitionPetState(interacting, {
    type: "ANIMATION_FINISHED",
    at: 7200,
  });

  expect(interacting).toMatchObject({
    name: "interacting",
    action: "act-cute",
    lastInteractionAt: 1200,
  });
  expect(returnedIdle).toMatchObject({
    name: "idle",
    action: "idle-breathe",
  });
});

it("switches idle action when the current idle animation finishes", () => {
  const idle = createInitialPetState(1000);
  const nextIdle = transitionPetState(idle, {
    type: "IDLE_ANIMATION_FINISHED",
    action: "idle-look",
    at: 7000,
  });

  expect(nextIdle).toMatchObject({
    name: "idle",
    action: "idle-look",
  });
});
```

- [ ] **Step 4: Update pet types**

Modify `src/pet-core/petTypes.ts`:

```ts
import type {
  IdleActionName,
  InteractionActionName,
  PetActionName,
} from "../assets/builtInPetManifest";

export type PetStateName = "idle" | "walking" | "dragging" | "interacting" | "sleeping";

export type PetEvent =
  | { type: "APP_READY"; at: number }
  | { type: "PET_CLICKED"; at: number }
  | { type: "DRAG_STARTED"; at: number }
  | { type: "DRAG_ENDED"; at: number }
  | { type: "AUTO_MOVE_TICK"; at: number }
  | { type: "IDLE_TIMEOUT"; at: number }
  | { type: "SETTINGS_CHANGED"; at: number }
  | { type: "ANIMATION_FINISHED"; at: number }
  | { type: "IDLE_ANIMATION_FINISHED"; action: IdleActionName; at: number }
  | { type: "INTERACTION_SELECTED"; action: InteractionActionName; at: number };

export type PetEventType = PetEvent["type"];

export interface PetState {
  name: PetStateName;
  action: PetActionName;
  enteredAt: number;
  lastInteractionAt: number;
  direction: -1 | 1;
  idleHistory: readonly IdleActionName[];
}
```

- [ ] **Step 5: Update transition logic**

Update `src/pet-core/petStateMachine.ts`:

- `createInitialPetState(now)` returns `name: "idle"`, `action: "idle-breathe"`, `idleHistory: ["idle-breathe"]`.
- `PET_CLICKED` returns state unchanged. Opening the interaction menu is UI state, not a pet state transition.
- `INTERACTION_SELECTED` enters `name: "interacting"` with `action: event.action`, `lastInteractionAt: event.at`.
- `IDLE_ANIMATION_FINISHED` enters idle with `action: event.action` and appends to `idleHistory`.
- `AUTO_MOVE_TICK` from idle enters `walking` with `action: "walk"`.
- `DRAG_STARTED` enters `dragging` with `action: "drag"`.
- `DRAG_ENDED` enters `idle` with `action: "idle-breathe"` unless a later task passes a selected idle action.
- `IDLE_TIMEOUT` enters `sleeping` with `action: "sleep"`.
- `ANIMATION_FINISHED` from `interacting` or `walking` returns to `idle-breathe`.

- [ ] **Step 6: Update scheduler tests**

In `src/pet-core/petStateMachine.test.ts`, replace old happy tests with interaction-duration tests:

```ts
it("schedules interaction completion from the action duration", () => {
  const interacting = transitionPetState(createInitialPetState(1000), {
    type: "INTERACTION_SELECTED",
    action: "act-cute",
    at: 1100,
  });

  expect(getNextScheduledEvent(interacting, 6099, true, 6000)).toBeNull();
  expect(getNextScheduledEvent(interacting, 7100, true, 6000)).toEqual({
    type: "ANIMATION_FINISHED",
    at: 7100,
  });
});
```

Use a fourth `currentActionDurationMs` parameter:

```ts
export function getNextScheduledEvent(
  state: PetState,
  now: number,
  autoMoveEnabled: boolean,
  currentActionDurationMs: number,
): PetEvent | null
```

- [ ] **Step 7: Update scheduler implementation**

Rules:

- If `state.name === "interacting"` and `now - state.enteredAt >= currentActionDurationMs`, return `ANIMATION_FINISHED`.
- If `state.name === "walking"` and elapsed >= current action duration, return `ANIMATION_FINISHED`.
- If `state.name === "idle"` and elapsed >= current action duration, return `IDLE_ANIMATION_FINISHED` only if the caller will fill action later. If avoiding generated actions in scheduler, leave idle completion to App using `selectNextIdleAction`; choose one strategy and keep it pure.
- Preserve sleep timeout and auto-move behavior.

Recommended simpler contract: scheduler returns `{ type: "IDLE_ANIMATION_FINISHED", action: state.action as IdleActionName, at: now }`, and App replaces `action` with selected next idle before calling `transitionPetState`.

- [ ] **Step 8: Verify Task 2**

Run:

```powershell
pnpm test -- src/pet-core/petStateMachine.test.ts src/pet-core/idleActionSelector.test.ts
pnpm typecheck
```

Expected: both exit 0.

- [ ] **Step 9: Commit Task 2**

```powershell
git add src/pet-core
git commit -m "feat: add interaction pet state"
```

---

### Task 3: Build The Single-Click Interaction Menu Component

**Files:**
- Create: `src/interaction/InteractionMenu.tsx`
- Create: `src/interaction/InteractionMenu.test.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
- Consumes `interactionOptions` and `InteractionActionName`.
- Produces `InteractionMenu({ open, x, y, options, onSelect, onClose })`.

- [ ] **Step 1: Write failing component tests**

Create `src/interaction/InteractionMenu.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { interactionOptions } from "../assets/builtInPetManifest";
import { InteractionMenu } from "./InteractionMenu";

describe("InteractionMenu", () => {
  it("renders nothing when closed", () => {
    render(
      <InteractionMenu
        open={false}
        x={10}
        y={20}
        options={interactionOptions}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("menu", { name: "互动选项" })).toBeNull();
  });

  it("renders all interaction choices when open", () => {
    render(
      <InteractionMenu
        open
        x={10}
        y={20}
        options={interactionOptions}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("menu", { name: "互动选项" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "撒娇卖萌" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "敲电脑" })).toBeTruthy();
  });

  it("selects an interaction and closes via callbacks", () => {
    const onSelect = vi.fn();
    render(
      <InteractionMenu
        open
        x={10}
        y={20}
        options={interactionOptions}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "撒娇卖萌" }));

    expect(onSelect).toHaveBeenCalledWith("act-cute");
  });
});
```

- [ ] **Step 2: Implement `InteractionMenu`**

Create `src/interaction/InteractionMenu.tsx`:

```tsx
import type {
  InteractionActionName,
  PetInteractionOption,
} from "../assets/builtInPetManifest";

interface InteractionMenuProps {
  open: boolean;
  x: number;
  y: number;
  options: readonly PetInteractionOption[];
  onSelect(action: InteractionActionName): void;
}

export function InteractionMenu({
  open,
  x,
  y,
  options,
  onSelect,
}: InteractionMenuProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="pet-interaction-menu"
      role="menu"
      aria-label="互动选项"
      style={{ left: x, top: y }}
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="menuitem"
          onClick={() => onSelect(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
```

Do not add visible explanatory text.

- [ ] **Step 3: Add menu CSS**

In `src/app/app.css`, add:

```css
.pet-interaction-menu {
  position: absolute;
  z-index: 9;
  display: grid;
  grid-template-columns: repeat(2, minmax(72px, 1fr));
  gap: 4px;
  width: 164px;
  padding: 6px;
  border: 1px solid rgb(75 43 26 / 0.26);
  border-radius: 8px;
  background: rgb(255 255 255 / 0.94);
  box-shadow: 0 10px 24px rgb(75 43 26 / 0.16);
}

.pet-interaction-menu button {
  height: 32px;
  min-width: 0;
  border: 0;
  border-radius: 6px;
  background: #fff7ed;
  color: #2c1f18;
  font-size: 12px;
  white-space: nowrap;
}

.pet-interaction-menu button:hover,
.pet-interaction-menu button:focus-visible {
  background: #ffe8bd;
  outline: none;
}
```

- [ ] **Step 4: Verify Task 3**

Run:

```powershell
pnpm test -- src/interaction/InteractionMenu.test.tsx
pnpm typecheck
```

Expected: both exit 0.

- [ ] **Step 5: Commit Task 3**

```powershell
git add src/interaction src/app/app.css
git commit -m "feat: add pet interaction menu"
```

---

### Task 4: Wire App Single-Click Interaction Flow

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/renderer/FramePetStage.tsx`
- Modify: `src/renderer/FramePetStage.test.tsx`

**Interfaces:**
- Consumes `FramePetStage.onPetClick`, `interactionOptions`, `InteractionMenu`, `transitionPetState`.
- Produces single-click menu flow and selected interaction playback.

- [ ] **Step 1: Write failing App tests for single-click menu**

Update `src/app/App.test.tsx`:

```tsx
it("opens interaction options when clicking the pet", async () => {
  render(<App />);

  fireEvent.click(await screen.findByRole("img", { name: "星星睡衣小星人" }));

  expect(screen.getByRole("menu", { name: "互动选项" })).toBeTruthy();
  expect(screen.getByRole("menuitem", { name: "撒娇卖萌" })).toBeTruthy();
});

it("selects an interaction, closes the menu, and shows the interaction bubble", async () => {
  render(<App />);

  fireEvent.click(await screen.findByRole("img", { name: "星星睡衣小星人" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "撒娇卖萌" }));

  expect(screen.queryByRole("menu", { name: "互动选项" })).toBeNull();
  expect(screen.getByText("陪我一会儿嘛。").textContent).toBe("陪我一会儿嘛。");
});

it("keeps right-click reserved for the system menu", async () => {
  render(<App />);

  fireEvent.contextMenu(await screen.findByRole("img", { name: "星星睡衣小星人" }), {
    clientX: 48,
    clientY: 52,
  });

  expect(screen.getByRole("menu", { name: "桌宠菜单" })).toBeTruthy();
  expect(screen.queryByRole("menu", { name: "互动选项" })).toBeNull();
});
```

Replace old tests that expected clicking the pet frame to immediately show `我在这里。`.

- [ ] **Step 2: Add menu state to App**

In `src/app/App.tsx`, add:

```ts
const interactionMenuWidth = 164;
const interactionMenuHeight = 112;
const [interactionMenuPosition, setInteractionMenuPosition] = useState<{ x: number; y: number } | null>(null);
```

Add helper:

```ts
function getInteractionMenuPosition() {
  return {
    x: clampMenuAxis(window.innerWidth / 2 - interactionMenuWidth / 2, window.innerWidth, interactionMenuWidth),
    y: clampMenuAxis(window.innerHeight - interactionMenuHeight - 42, window.innerHeight, interactionMenuHeight),
  };
}
```

- [ ] **Step 3: Change click behavior**

Replace `handlePetClick` with:

```ts
const handlePetClick = useCallback(() => {
  if (settingsOpen) {
    return;
  }

  setContextMenuPosition(null);
  setInteractionMenuPosition((current) =>
    current ? null : getInteractionMenuPosition(),
  );
}, [settingsOpen]);
```

Add:

```ts
const handleInteractionSelect = useCallback((action: InteractionActionName) => {
  const option = interactionOptions.find((candidate) => candidate.id === action);

  setInteractionMenuPosition(null);
  setPetState((currentState) =>
    transitionPetState(currentState, {
      type: "INTERACTION_SELECTED",
      action,
      at: Date.now(),
    }),
  );

  if (option && settingsRef.current.bubblesEnabled) {
    setBubble(showBubble(option.bubble));
  }
}, []);
```

- [ ] **Step 4: Render `InteractionMenu`**

Import `InteractionMenu`, `interactionOptions`, and `InteractionActionName`. Render near the existing context menu:

```tsx
<InteractionMenu
  open={Boolean(interactionMenuPosition)}
  x={interactionMenuPosition?.x ?? 0}
  y={interactionMenuPosition?.y ?? 0}
  options={interactionOptions}
  onSelect={handleInteractionSelect}
/>
```

- [ ] **Step 5: Close interaction menu on outside click and Escape**

Extend the existing document pointer/key listeners or add a separate effect:

- If pointer target is inside `.pet-interaction-menu`, ignore.
- If pointer target is outside `.pet-interaction-menu` and outside `.pet-frame-stage`, close the interaction menu.
- If `Escape`, close interaction menu and system context menu.

- [ ] **Step 6: Use `petState.action` directly**

Remove `actionByState` from `App.tsx`; pass `action={petState.action}` to `FramePetStage`.

- [ ] **Step 7: Preserve drag behavior**

When `handleDragStart` runs, close `interactionMenuPosition` and `contextMenuPosition` before starting drag.

- [ ] **Step 8: Verify Task 4**

Run:

```powershell
pnpm test -- src/app/App.test.tsx src/renderer/FramePetStage.test.tsx
pnpm test
pnpm typecheck
pnpm build
```

Expected: all exit 0.

- [ ] **Step 9: Commit Task 4**

```powershell
git add src/app src/renderer
git commit -m "feat: wire single-click pet interactions"
```

---

### Task 5: Generate And Install Long Animation Asset Set

**Files:**
- Create: `docs/assets/star-sleeper-long-animation-prompts.md`
- Create: `src/assets/pets/star-sleeper/character-base.png`
- Create: `src/assets/pets/star-sleeper/<action>-01.png` through `<action>-18.png` for each long action
- Modify: `src/assets/pets/star-sleeper/README.md`
- Modify: `src/assets/README.md`

**Interfaces:**
- Consumes approved spec `docs/superpowers/specs/2026-08-02-interaction-long-animation-redesign.md`.
- Produces transparent PNG frames for the action ids declared in Task 1.
- Uses built-in Image Gen by default; no CLI fallback unless explicitly approved.

- [ ] **Step 1: Create prompt documentation**

Create `docs/assets/star-sleeper-long-animation-prompts.md` containing the shared base prompt:

```markdown
# Star Sleeper Long Animation Prompts

Use case: illustration-story
Asset type: desktop pet 2D animation sprite sheet

Primary request:
Generate a 3 columns by 6 rows sprite sheet, exactly 18 animation frames, for a cute "star sleeper little person" desktop pet.

Input images:
Image 1 is the original style and character reference only.
Image 2 is the accepted character-base identity reference. Keep the same identity, colors, proportions, face, star pajama hood, orange round face, large oval dark eyes with tiny star highlights, red cheeks, soft hand-drawn outline.

Style/medium:
Hand-drawn crayon children's illustration, warm wax-crayon texture, slightly uneven pencil outline, cute and lightweight.

Composition/framing:
Each cell contains one full-body character, centered, same approximate character size, generous padding, readable at 128px desktop size. Keep every frame inside its cell.

Scene/backdrop:
Perfectly flat solid #00ff00 chroma-key background in every cell and in the gutters.

Text:
No text.

Constraints:
No watermark. No extra characters. No floor plane. No cast shadow. No contact shadow. No background texture. Do not use #00ff00 in the character. Keep the 3x6 grid clear enough for local splitting.

Avoid:
Photorealism, vector-clean icon style, hard shadows, gradients in the background, white background, transparent checkerboard, copied pixels from the reference.
```

Add one section per action with exact action-specific motion notes.

- [ ] **Step 2: Generate `character-base.png`**

Main agent uses built-in `image_gen` with the original reference image. Prompt:

```text
Use case: illustration-story
Asset type: desktop pet character identity reference
Primary request: Create a clean standard full-body reference frame for the cute "star sleeper little person" desktop pet.
Input images: Image 1 is a style and character reference only. Do not copy exact pixels.
Subject: yellow star-shaped pajama hood and body, orange round face, large oval dark eyes with tiny star highlights, red round cheeks, gentle small smile, tiny star ornament on the hat tip.
Style/medium: hand-drawn crayon children's illustration, soft uneven pencil outline, warm wax-crayon texture, cute and lightweight.
Composition/framing: full body centered, generous padding, front-facing with a slight cute tilt, readable at 128px desktop size.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for background removal.
Text: no text.
Constraints: no watermark, no unrelated props, no extra characters, no readable text on clothing, no floor plane, no cast shadow, no contact shadow, no background texture, keep the whole character inside frame.
Avoid: photorealism, vector-clean flat icon style, hard shadows, gradients in background, white background, transparent checkerboard, copied pixels from the reference.
```

Run chroma-key removal:

```powershell
python "$env:USERPROFILE\\.codex\\skills\\.system\\imagegen\\scripts\\remove_chroma_key.py" --input <generated-source.png> --out src/assets/pets/star-sleeper/character-base.png --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill
```

- [ ] **Step 3: Generate action sprite sheets**

For each action id, generate one 3x6 sprite sheet using the shared prompt and an action-specific line:

```text
Action frame sequence: <18-frame motion description for this action>. The first and last frames should connect cleanly for looping actions, and non-looping interactions should end in a calm return pose.
```

Actions:

- `idle-breathe`: slow breathing, two blinks, hat tip gentle sway.
- `idle-look`: eyes look up toward hat star, star tip sways, face returns forward.
- `idle-stretch`: small stretch, sleeves spread, body rises, then relaxes.
- `walk`: left-right soft stepping loop, small bounce, hat trailing.
- `drag`: dangling loop as if held by hat, body swings left and right.
- `sleep`: closed eyes, slow breathing, hat droop loop.
- `act-cute`: shy cute sway, cheeks redder, eyes sparkle, tiny bounce, return.
- `act-typing`: tiny keyboard or mini computer, taps several times, looks up proudly, return.
- `act-wave`: raises sleeve, waves, leans forward, returns.
- `act-hug`: arms/sleeves open, small hop forward, expectant face, return.
- `act-pout`: cheeks puff, sideways glance, hat star trembles, soft return.
- `act-drowsy`: eyes droop, body sinks, almost sleeps, tiny startled wake, return.

- [ ] **Step 4: Split sheets into frames**

Use a local script or one-off Pillow processing to split each sheet into 18 frame PNGs. If writing a reusable script, place it under `scripts/asset_tools/split_sprite_sheet.py` and commit it only if it is generally useful.

Output names:

```text
src/assets/pets/star-sleeper/idle-breathe-01.png
...
src/assets/pets/star-sleeper/act-drowsy-18.png
```

Every final frame must be transparent PNG after chroma-key removal.

- [ ] **Step 5: Validate final PNGs**

Run or create an asset validation check that verifies:

- all referenced files exist.
- every PNG has alpha.
- all four corners have alpha 0.
- dimensions are consistent.
- no frame file is empty or suspiciously tiny.

At minimum run:

```powershell
pnpm test -- src/assets/builtInPetManifest.test.ts
pnpm build
```

- [ ] **Step 6: Update asset READMEs**

`src/assets/pets/star-sleeper/README.md` must state:

```markdown
The long animation frames are generated first-party project assets using Codex built-in Image Gen. The original user-provided image and `character-base.png` are identity/style references only. Frames are locally processed to transparent PNG with chroma-key removal.
```

- [ ] **Step 7: Commit Task 5**

```powershell
git add docs/assets/star-sleeper-long-animation-prompts.md src/assets
git commit -m "feat: add long star sleeper animation assets"
```

---

### Task 6: Replace Temporary Frame Aliases With Generated Frames

**Files:**
- Modify: `src/assets/builtInPetManifest.ts`
- Modify: `src/assets/builtInPetManifest.test.ts`
- Modify: `src/renderer/FramePetStage.test.tsx`

**Interfaces:**
- Consumes generated files from Task 5.
- Produces final manifest frame paths with unique long animation files.

- [ ] **Step 1: Add failing asset existence and uniqueness tests**

Extend `src/assets/builtInPetManifest.test.ts`:

```ts
import { existsSync } from "node:fs";
import { join } from "node:path";

it("references only existing generated frame files", () => {
  for (const action of Object.values(builtInPetManifest.actions)) {
    for (const frame of action.frames) {
      expect(existsSync(join(process.cwd(), "src/assets", frame))).toBe(true);
    }
  }
});

it("uses generated long frame names for idle and interaction actions", () => {
  const longActions = [...idleActionNames, ...interactionOptions.map((option) => option.id)];

  for (const actionId of longActions) {
    const action = builtInPetManifest.actions[actionId];
    expect(action.frames).toHaveLength(action.durationMs / (1000 / action.fps));
    expect(new Set(action.frames).size).toBe(action.frames.length);
    expect(action.frames[0]).toContain(`${actionId}-01.png`);
  }
});
```

- [ ] **Step 2: Replace repeated old frame lists**

In `src/assets/builtInPetManifest.ts`, replace `repeatFrames(...)` temporary lists with:

```ts
const frameSequence = (action: PetActionName, count = 18) =>
  Array.from(
    { length: count },
    (_, index) => `pets/star-sleeper/${action}-${String(index + 1).padStart(2, "0")}.png`,
  );
```

Use `frameSequence("act-cute")`, etc. Keep `fps: 3`, `durationMs: 6000`.

- [ ] **Step 3: Update renderer tests**

Update `FramePetStage.test.tsx` to render `action: "idle-breathe"` by default and assert first source contains `idle-breathe-01`.

- [ ] **Step 4: Verify Task 6**

Run:

```powershell
pnpm test -- src/assets/builtInPetManifest.test.ts src/renderer/FramePetStage.test.tsx
pnpm test
pnpm typecheck
pnpm build
```

Expected: all exit 0 and Vite build lists generated PNG assets.

- [ ] **Step 5: Commit Task 6**

```powershell
git add src/assets src/renderer
git commit -m "feat: wire generated long animation frames"
```

---

### Task 7: Final Desktop Verification And Manual Checklist

**Files:**
- Modify: `docs/manual-verification/windows-mvp.md`

**Interfaces:**
- Consumes completed interaction code and generated assets.
- Produces validation evidence and updated manual checklist.

- [ ] **Step 1: Update manual checklist**

Add these unchecked manual items to `docs/manual-verification/windows-mvp.md`:

```markdown
- [ ] Single-clicking the pet opens the interaction option menu.
- [ ] Selecting 撒娇卖萌 plays a visibly longer cute animation and shows its bubble.
- [ ] Selecting 敲电脑 plays a visibly longer typing animation with the mini keyboard/computer prop.
- [ ] All six interaction animations last more than 5 seconds.
- [ ] Idle mode randomly rotates between at least three idle animations.
- [ ] Right-click still opens only the system menu.
- [ ] Enabling click-through from settings closes the settings panel first and does not trap the user.
```

- [ ] **Step 2: Run automated verification**

Run:

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm tauri build --debug
pnpm tauri build
```

Expected: all exit 0.

- [ ] **Step 3: Check generated executables**

Run:

```powershell
Test-Path .\src-tauri\target\debug\couple-desktop-pet.exe
Test-Path .\src-tauri\target\release\couple-desktop-pet.exe
```

Expected: both print `True`.

- [ ] **Step 4: Commit Task 7**

```powershell
git add docs/manual-verification/windows-mvp.md
git commit -m "docs: update interaction verification checklist"
```

---

## Acceptance Checklist

- [ ] Single-click opens a desktop-pet interaction menu.
- [ ] The menu contains 撒娇卖萌, 敲电脑, 打招呼, 求抱抱, 生气鼓脸, 困困打盹.
- [ ] Selecting each interaction plays the corresponding action and closes the menu.
- [ ] Interaction actions last at least 5000 ms.
- [ ] Idle mode rotates between `idle-breathe`, `idle-look`, and `idle-stretch`.
- [ ] The manifest references only existing project-local PNG assets.
- [ ] Generated frames are transparent PNGs with no chroma-key corners.
- [ ] Right-click system menu and tray menu still work.
- [ ] Click-through setting no longer traps the user behind the settings panel.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm tauri build --debug`, and `pnpm tauri build` pass.

## Self-Review Notes

- Spec coverage: This plan covers single-click menu, six interactions, long idle animations, regenerated resources, click-through regression, testing, and desktop verification.
- Scope control: The plan does not add remote matching, networking, messaging, voice, AI, Live2D, resource import, packaging features beyond build verification, or third-party assets.
- Type consistency: Action ids match the approved spec: `idle-breathe`, `idle-look`, `idle-stretch`, `walk`, `drag`, `sleep`, `act-cute`, `act-typing`, `act-wave`, `act-hug`, `act-pout`, `act-drowsy`.
- Execution mode: Coding tasks must be dispatched to the fixed background development task. Image generation and visual asset acceptance are coordinated by the main agent.
