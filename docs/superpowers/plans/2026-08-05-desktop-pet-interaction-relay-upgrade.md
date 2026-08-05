# Desktop Pet Interaction Relay Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增强桌宠互动体验：支持拖到屏幕边缘半隐藏、托盘-only 启动、默认云端中继、打字机消息气泡，以及从互动菜单打开屏幕中心消息发送窗口。

**Architecture:** 桌宠本地体验仍由前端状态机、Tauri 桌面命令和内置资源包共同驱动；同步层只负责绑定、连接和消息收发。边缘半隐藏是窗口状态，不进入宠物动作状态机；消息输入窗口是独立 Tauri webview，不占用 320x360 主桌宠窗口。

**Tech Stack:** Tauri 2 + Rust、TypeScript + React + Vite、Vitest、Cargo test、Node relay server + WebSocket + SQLite、Docker Compose for remote relay deployment.

## Global Constraints

- 全程中文沟通。
- 固定开发任务：`019fc0d5-21c1-7a52-b8c5-897829450edb`，编码任务使用 `gpt-5.5` + `xhigh`。
- 代码改动保持聚焦，不改账号系统、排行榜、官网、支付或 AI 生图平台。
- 本地桌宠核心不能被远程同步实现污染；远程能力保留在 `sync`、`server`、部署目录和窄接口内。
- 主窗口保持透明、无边框、置顶，不能重新出现方形背景框。
- 拖到边缘半隐藏只支持 `left`、`right`、`top`，不支持底部任务栏边缘触发。
- 内置桌宠资源继续使用 Q 版小人，不恢复星星人作为默认形象。
- 导入资源包本轮不要求提供半隐藏资源；缺失时使用内置 Q 版半隐藏资源。
- 默认中继地址固定为 `http://159.75.175.47:8787`；用户设置页不再暴露中继地址输入框。
- 交付前运行：`pnpm test`、`pnpm typecheck`、`pnpm build`、`cargo test --manifest-path src-tauri/Cargo.toml`、`pnpm --dir server test`、`pnpm --dir server build`、`pnpm tauri build --debug`。

---

## File Map

- Create `src/assets/pets/q-girl/edge-peek/left.png`：左侧屏幕边缘半隐藏 Q 版资源。
- Create `src/assets/pets/q-girl/edge-peek/right.png`：右侧屏幕边缘半隐藏 Q 版资源。
- Create `src/assets/pets/q-girl/edge-peek/top.png`：顶部屏幕边缘半隐藏 Q 版资源。
- Create `src/assets/ui/interaction-buttons/send-message.png`：Q 版发送消息按钮资源。
- Create `src/desktop/edgePeek.ts`：前端可序列化边缘类型、回退资源映射、状态帮助函数。
- Modify `src-tauri/tauri.conf.json`：主窗口跳过任务栏，CSP 允许云端中继。
- Modify `src-tauri/src/commands.rs`：新增边缘吸附/恢复窗口命令和消息输入窗口命令。
- Modify `src-tauri/src/main.rs`：注册新增命令。
- Modify `src/desktop/windowCommands.ts`：新增边缘吸附、恢复、打开消息输入窗口封装。
- Modify `src/desktop/desktopApi.ts`：让事件监听支持 payload。
- Modify `src/main.tsx`：根据窗口 label 渲染主桌宠或消息输入窗口。
- Create `src/message/MessageComposerWindow.tsx`：屏幕中心消息输入窗口 React 组件。
- Create `src/message/messageComposerEvents.ts`：消息输入窗口和主窗口之间的事件名、payload、监听封装。
- Create `src/ui/TypewriterText.tsx`：按 Unicode code point 流式显示文本。
- Modify `src/bubble/BubbleLayer.tsx`：使用打字机文本。
- Modify `src/sync/RemoteMessageLayer.tsx`：远程消息使用打字机文本，继续悬浮确认消失。
- Modify `src/sync/SyncPanel.tsx`：隐藏启用开关、中继 URL 和内联发送区，仅保留绑定、取消绑定和消息记录。
- Modify `src/settings/defaultSettings.ts`：远程互动默认启用，云端中继默认地址。
- Modify `src/settings/settingsStore.ts`：迁移空、本地或旧 LAN 中继 URL 到云端地址。
- Modify `src/interaction/InteractionMenu.tsx`：增加 `send-message` 命令型按钮，保持 radial 弹出动画。
- Modify `src/assets/builtInPetManifest.ts`：增加发送消息菜单选项，不把它塞进 `PetActionName`。
- Modify `src/app/App.tsx`：接入边缘半隐藏状态、消息输入窗口事件、发送消息菜单命令、设置面板同步简化后的 props。
- Modify `src/app/app.css`：补充半隐藏图、消息输入窗口、发送按钮菜单的样式，保持透明主窗口。
- Create `server/Dockerfile`：构建中继服务镜像。
- Create `deploy/couple-pet-relay/compose.yaml`：远程中继 Docker Compose。
- Create `deploy/couple-pet-relay/.env.example`：远程中继配置示例。
- Create `deploy/couple-pet-relay/README.md`：部署、开放端口、健康检查说明。
- Modify/Add tests:
  - `src/desktop/windowChrome.test.ts`
  - `src/desktop/tauriSecurityConfig.test.ts`
  - `src/settings/settingsStore.test.ts`
  - `src/sync/SyncPanel.test.tsx`
  - `src/ui/TypewriterText.test.tsx`
  - `src/bubble/BubbleLayer.test.tsx`
  - `src/sync/RemoteMessageLayer.test.tsx`
  - `src/interaction/InteractionMenu.test.tsx`
  - `src/app/App.test.tsx`
  - `src/message/MessageComposerWindow.test.tsx`
  - `src-tauri/src/commands.rs` Rust unit tests
  - `deploy/couple-pet-relay/composeConfig.test.ts`

---

### Task 1: 生成并接入边缘半隐藏与发送消息按钮资源

**Files:**
- Create: `src/assets/pets/q-girl/edge-peek/left.png`
- Create: `src/assets/pets/q-girl/edge-peek/right.png`
- Create: `src/assets/pets/q-girl/edge-peek/top.png`
- Create: `src/assets/ui/interaction-buttons/send-message.png`
- Create: `src/desktop/edgePeek.ts`
- Modify: `src/assets/builtInPetManifest.ts`
- Test: `src/assets/builtInPetManifest.test.ts`

**Interfaces:**
- Produces:
  - `export type EdgePeekSide = "left" | "right" | "top";`
  - `export const builtInEdgePeekImages: Record<EdgePeekSide, string>;`
  - `export const SEND_MESSAGE_INTERACTION_ID = "send-message" as const;`
  - `export type InteractionCommandName = typeof SEND_MESSAGE_INTERACTION_ID;`
  - `interactionOptions` includes an item `{ id: "send-message", kind: "command", label: "发消息", bubble: "想说什么呢？" }`.

- [ ] **Step 1: Generate the four PNG assets**

  Generate at 1024x1024 on solid `#00ff00` chroma-key background, then remove chroma key to transparent PNG and trim padding only if the resulting subject remains stable at desktop scale.

  Use these prompts:

  ```text
  Generate one transparent-ready desktop pet asset. Character: Q版女孩桌宠，长深棕色头发，圆框眼镜，大眼睛，浅紫灰格纹吊带上衣，白色宽松裙裤，白色运动鞋，可爱软萌比例，和现有 Q 版小人资源一致。Action: hiding at the left edge of a computer screen, only the right half of her head, one eye, one cheek, one small hand and a little shoulder visible, as if gripping the left screen edge and peeking in. Style: polished anime chibi illustration, clean soft outline, warm blush, crisp transparent-ready edges. Background: perfectly flat solid #00ff00 chroma-key. No text, no shadow, no props, no extra character.
  ```

  ```text
  Generate one transparent-ready desktop pet asset. Character: Q版女孩桌宠，长深棕色头发，圆框眼镜，大眼睛，浅紫灰格纹吊带上衣，白色宽松裙裤，白色运动鞋，可爱软萌比例，和现有 Q 版小人资源一致。Action: hiding at the right edge of a computer screen, only the left half of her head, one eye, one cheek, one small hand and a little shoulder visible, as if gripping the right screen edge and peeking in. Style: polished anime chibi illustration, clean soft outline, warm blush, crisp transparent-ready edges. Background: perfectly flat solid #00ff00 chroma-key. No text, no shadow, no props, no extra character.
  ```

  ```text
  Generate one transparent-ready desktop pet asset. Character: Q版女孩桌宠，长深棕色头发，圆框眼镜，大眼睛，浅紫灰格纹吊带上衣，白色宽松裙裤，白色运动鞋，可爱软萌比例，和现有 Q 版小人资源一致。Action: hanging from the top edge of a computer screen, upper half of the head, glasses, eyes, bangs, two small hands gripping the top edge, body mostly hidden above the screen, playful peeking expression. Style: polished anime chibi illustration, clean soft outline, warm blush, crisp transparent-ready edges. Background: perfectly flat solid #00ff00 chroma-key. No text, no shadow, no props, no extra character.
  ```

  ```text
  Generate one transparent-ready UI button sticker asset for a desktop pet radial menu. Subject: cute chibi envelope with tiny speech bubble and a small Q版女孩 face sticker, warm peach and cream colors, rounded hand-drawn anime style, readable at 34px, transparent-ready. Background: perfectly flat solid #00ff00 chroma-key. No text, no watermark, no shadow, no extra icons.
  ```

- [ ] **Step 2: Validate resource files**

  Run:

  ```powershell
  Get-ChildItem 'src/assets/pets/q-girl/edge-peek','src/assets/ui/interaction-buttons' -Filter *.png | Select-Object FullName,Length
  ```

  Expected: the four new files exist and each file has `Length` greater than `20000`.

- [ ] **Step 3: Add front-end edge asset mapping**

  Create `src/desktop/edgePeek.ts`:

  ```ts
  import edgeLeftUrl from "../assets/pets/q-girl/edge-peek/left.png";
  import edgeRightUrl from "../assets/pets/q-girl/edge-peek/right.png";
  import edgeTopUrl from "../assets/pets/q-girl/edge-peek/top.png";

  export type EdgePeekSide = "left" | "right" | "top";

  export const builtInEdgePeekImages: Record<EdgePeekSide, string> = {
    left: edgeLeftUrl,
    right: edgeRightUrl,
    top: edgeTopUrl,
  };

  export function isEdgePeekSide(value: unknown): value is EdgePeekSide {
    return value === "left" || value === "right" || value === "top";
  }
  ```

- [ ] **Step 4: Extend built-in interaction option type**

  Change `src/assets/builtInPetManifest.ts` so `PetInteractionOption` becomes:

  ```ts
  export const SEND_MESSAGE_INTERACTION_ID = "send-message" as const;
  export type InteractionCommandName = typeof SEND_MESSAGE_INTERACTION_ID;

  export interface PetInteractionOption {
    id: InteractionActionName | InteractionCommandName;
    kind: "action" | "command";
    label: string;
    bubble: string;
  }
  ```

  Update all existing options to `kind: "action"` and append:

  ```ts
  {
    id: SEND_MESSAGE_INTERACTION_ID,
    kind: "command",
    label: "发消息",
    bubble: "想说什么呢？",
  }
  ```

- [ ] **Step 5: Add manifest tests**

  Add assertions in `src/assets/builtInPetManifest.test.ts`:

  ```ts
  import { SEND_MESSAGE_INTERACTION_ID, interactionOptions } from "./builtInPetManifest";

  it("keeps send message as a command instead of a pet action", () => {
    expect(interactionOptions).toContainEqual(
      expect.objectContaining({
        id: SEND_MESSAGE_INTERACTION_ID,
        kind: "command",
        label: "发消息",
      }),
    );
  });
  ```

- [ ] **Step 6: Run tests and commit**

  Run:

  ```powershell
  pnpm vitest run src/assets/builtInPetManifest.test.ts
  ```

  Expected: PASS.

  Commit:

  ```powershell
  git add src/assets/pets/q-girl/edge-peek src/assets/ui/interaction-buttons/send-message.png src/desktop/edgePeek.ts src/assets/builtInPetManifest.ts src/assets/builtInPetManifest.test.ts
  git commit -m "feat: add edge peek and message menu assets"
  ```

---

### Task 2: 托盘-only 启动、CSP 与边缘吸附窗口命令

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src/desktop/windowCommands.ts`
- Test: `src/desktop/windowChrome.test.ts`
- Test: `src/desktop/tauriSecurityConfig.test.ts`
- Test: `src-tauri/src/commands.rs`

**Interfaces:**
- Consumes: `EdgePeekSide` values `"left" | "right" | "top"`.
- Produces:
  - Tauri command `snap_window_to_edge_if_needed() -> Result<Option<EdgePeekSide>, String>`
  - Tauri command `restore_window_from_edge_peek(side: EdgePeekSide) -> Result<(), String>`
  - Front-end wrapper `snapWindowToEdgeIfNeeded(): Promise<EdgePeekSide | null>`
  - Front-end wrapper `restoreWindowFromEdgePeek(side: EdgePeekSide): Promise<void>`

- [ ] **Step 1: Write config tests**

  In `src/desktop/windowChrome.test.ts`, add:

  ```ts
  it("keeps the main desktop pet window out of the taskbar", () => {
    const mainWindow = readMainTauriWindowConfig();

    expect(mainWindow.skipTaskbar).toBe(true);
  });
  ```

  In `src/desktop/tauriSecurityConfig.test.ts`, add:

  ```ts
  it("allows the default cloud relay over http and websocket", () => {
    const csp = readTauriSecurityConfig().csp;

    expect(csp).toContain("http://159.75.175.47:8787");
    expect(csp).toContain("ws://159.75.175.47:8787");
  });
  ```

- [ ] **Step 2: Update Tauri config**

  In `src-tauri/tauri.conf.json`, set the main window field:

  ```json
  "skipTaskbar": true
  ```

  Extend `connect-src` to include:

  ```text
  http://159.75.175.47:8787 ws://159.75.175.47:8787
  ```

- [ ] **Step 3: Write Rust unit tests for edge calculation**

  Add to `src-tauri/src/commands.rs` tests:

  ```rust
  #[test]
  fn edge_peek_snaps_to_left_when_released_near_left_edge() {
      let work_area = TestWorkArea { x: 0, y: 0, width: 1200, height: 800 };
      let window = TestWindowGeometry { x: 10, y: 240, width: 320, height: 360 };

      let snap = calculate_edge_peek_snap(work_area, window);

      assert_eq!(snap, Some(EdgePeekSnap {
          side: EdgePeekSide::Left,
          position: PhysicalPosition::new(-160, 240),
      }));
  }

  #[test]
  fn edge_peek_snaps_to_top_when_released_near_top_edge() {
      let work_area = TestWorkArea { x: 0, y: 0, width: 1200, height: 800 };
      let window = TestWindowGeometry { x: 440, y: 12, width: 320, height: 360 };

      let snap = calculate_edge_peek_snap(work_area, window);

      assert_eq!(snap, Some(EdgePeekSnap {
          side: EdgePeekSide::Top,
          position: PhysicalPosition::new(440, -180),
      }));
  }

  #[test]
  fn edge_peek_does_not_trigger_on_bottom_edge() {
      let work_area = TestWorkArea { x: 0, y: 0, width: 1200, height: 800 };
      let window = TestWindowGeometry { x: 440, y: 430, width: 320, height: 360 };

      let snap = calculate_edge_peek_snap(work_area, window);

      assert_eq!(snap, None);
  }
  ```

- [ ] **Step 4: Implement edge calculation and commands**

  Add near existing geometry helpers in `src-tauri/src/commands.rs`:

  ```rust
  const EDGE_PEEK_TRIGGER_PX: i32 = 24;

  #[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
  #[serde(rename_all = "kebab-case")]
  enum EdgePeekSide {
      Left,
      Right,
      Top,
  }

  #[derive(Clone, Copy, Debug, PartialEq)]
  struct EdgePeekSnap {
      side: EdgePeekSide,
      position: PhysicalPosition<i32>,
  }
  ```

  Implement `calculate_edge_peek_snap(work_area, window)` with these exact positions:

  ```rust
  // left: x = work_area.x - window.width / 2
  // right: x = work_area.x + work_area.width - window.width / 2
  // top: y = work_area.y - window.height / 2
  // non-snapped axis is clamped with clamp_axis(...)
  ```

  Add Tauri commands:

  ```rust
  #[tauri::command]
  pub fn snap_window_to_edge_if_needed(app: AppHandle) -> Result<Option<EdgePeekSide>, String> { ... }

  #[tauri::command]
  pub fn restore_window_from_edge_peek(app: AppHandle, side: EdgePeekSide) -> Result<(), String> { ... }
  ```

  Restore positions:

  ```rust
  // left: x = work_area.x + SAFE_WINDOW_MARGIN_PX
  // right: x = work_area.x + work_area.width - window.width - SAFE_WINDOW_MARGIN_PX
  // top: y = work_area.y + SAFE_WINDOW_MARGIN_PX
  // preserve and clamp the other axis
  ```

- [ ] **Step 5: Register commands and TypeScript wrappers**

  Add to `src-tauri/src/main.rs` `generate_handler!`:

  ```rust
  commands::snap_window_to_edge_if_needed,
  commands::restore_window_from_edge_peek,
  ```

  Add wrappers in `src/desktop/windowCommands.ts`:

  ```ts
  import type { EdgePeekSide } from "./edgePeek";

  export function snapWindowToEdgeIfNeeded(): Promise<EdgePeekSide | null> {
    return invokeCommand<EdgePeekSide | null>("snap_window_to_edge_if_needed");
  }

  export function restoreWindowFromEdgePeek(side: EdgePeekSide): Promise<void> {
    return invokeCommand<void>("restore_window_from_edge_peek", { side });
  }
  ```

- [ ] **Step 6: Run tests and commit**

  Run:

  ```powershell
  pnpm vitest run src/desktop/windowChrome.test.ts src/desktop/tauriSecurityConfig.test.ts
  cargo test --manifest-path src-tauri/Cargo.toml edge_peek
  ```

  Expected: PASS.

  Commit:

  ```powershell
  git add src-tauri/tauri.conf.json src-tauri/src/commands.rs src-tauri/src/main.rs src/desktop/windowCommands.ts src/desktop/windowChrome.test.ts src/desktop/tauriSecurityConfig.test.ts
  git commit -m "feat: add tray-only edge peek window commands"
  ```

---

### Task 3: 前端边缘半隐藏状态与恢复交互

**Files:**
- Modify: `src/renderer/FramePetStage.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/app.css`
- Test: `src/renderer/FramePetStage.test.tsx`
- Test: `src/app/App.test.tsx`

**Interfaces:**
- Consumes:
  - `EdgePeekSide`
  - `builtInEdgePeekImages`
  - `snapWindowToEdgeIfNeeded()`
  - `restoreWindowFromEdgePeek(side)`
- Produces:
  - `FramePetStage` optional prop `edgePeekSide?: EdgePeekSide | null`
  - `FramePetStage` optional prop `edgePeekImageUrl?: string | null`

- [ ] **Step 1: Write FramePetStage test**

  In `src/renderer/FramePetStage.test.tsx`, add:

  ```ts
  it("renders the edge peek image instead of animation frames", () => {
    render(
      <FramePetStage
        action="idle-breathe"
        scale={1}
        petPackage={resolvedPetPackage}
        edgePeekSide="left"
        edgePeekImageUrl="/edge-left.png"
        onPetClick={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
      />,
    );

    expect(screen.getByAltText("桌宠半隐藏")).toHaveAttribute("src", "/edge-left.png");
    expect(screen.queryByAltText("桌宠动作")).not.toBeInTheDocument();
  });
  ```

- [ ] **Step 2: Implement FramePetStage edge rendering**

  Add props and render branch:

  ```tsx
  if (edgePeekSide && edgePeekImageUrl) {
    return (
      <div className={`pet-frame-stage is-edge-peek is-edge-${edgePeekSide}`} ...>
        <img className="pet-edge-peek-image" src={edgePeekImageUrl} alt="桌宠半隐藏" draggable={false} />
      </div>
    );
  }
  ```

  Keep existing click, drag and pointer behavior attached to the same wrapper so clicking or dragging the half-hidden pet still works.

- [ ] **Step 3: Write App edge tests**

  In `src/app/App.test.tsx`, add:

  ```ts
  it("enters edge peek after drag end returns an edge side", async () => {
    desktopApiMock.invoke.mockImplementation(async (command) => {
      if (command === "snap_window_to_edge_if_needed") return "left";
      return undefined;
    });

    render(<App />);
    await dragPetPastThresholdAndRelease();

    expect(await screen.findByAltText("桌宠半隐藏")).toBeInTheDocument();
  });

  it("restores from edge peek before opening the interaction menu", async () => {
    desktopApiMock.invoke.mockImplementation(async (command) => {
      if (command === "snap_window_to_edge_if_needed") return "left";
      return undefined;
    });

    render(<App />);
    await dragPetPastThresholdAndRelease();
    await userEvent.click(await screen.findByAltText("桌宠半隐藏"));

    expect(desktopApiMock.invoke).toHaveBeenCalledWith("restore_window_from_edge_peek", { side: "left" });
    expect(await screen.findByRole("menu", { name: "互动选项" })).toBeInTheDocument();
  });
  ```

- [ ] **Step 4: Implement App edge state**

  In `src/app/App.tsx`:

  ```ts
  const [edgePeekSide, setEdgePeekSide] = useState<EdgePeekSide | null>(null);
  ```

  On drag end:

  ```ts
  void snapWindowToEdgeIfNeeded()
    .then((side) => {
      if (side) setEdgePeekSide(side);
    })
    .catch(() => undefined);
  ```

  Add:

  ```ts
  const restoreFromEdgePeekIfNeeded = useCallback(async () => {
    const side = edgePeekSide;
    if (!side) return false;
    await restoreWindowFromEdgePeek(side);
    setEdgePeekSide(null);
    return true;
  }, [edgePeekSide]);
  ```

  Call `restoreFromEdgePeekIfNeeded()` before normal left click, right click and drag start behavior. After restore, left click may continue to open radial menu; right click may continue to open context menu.

- [ ] **Step 5: Add CSS**

  Add to `src/app/app.css`:

  ```css
  .pet-frame-stage.is-edge-peek {
    width: 256px;
    height: 320px;
  }

  .pet-edge-peek-image {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: contain;
    pointer-events: none;
    user-select: none;
  }
  ```

- [ ] **Step 6: Run tests and commit**

  Run:

  ```powershell
  pnpm vitest run src/renderer/FramePetStage.test.tsx src/app/App.test.tsx
  ```

  Expected: PASS.

  Commit:

  ```powershell
  git add src/renderer/FramePetStage.tsx src/app/App.tsx src/app/app.css src/renderer/FramePetStage.test.tsx src/app/App.test.tsx
  git commit -m "feat: show pet edge peek state"
  ```

---

### Task 4: 默认云端中继与同步设置页简化

**Files:**
- Modify: `src/settings/defaultSettings.ts`
- Modify: `src/settings/settingsStore.ts`
- Modify: `src/sync/SyncPanel.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/settings/settingsStore.test.ts`
- Test: `src/sync/SyncPanel.test.tsx`
- Test: `src/app/App.test.tsx`

**Interfaces:**
- Produces:
  - `export const DEFAULT_RELAY_URL = "http://159.75.175.47:8787";`
  - `export function normalizeRelayUrl(value: unknown): string`
  - `SyncPanelProps` no longer requires `onSendMessage`.

- [ ] **Step 1: Write settings migration tests**

  In `src/settings/settingsStore.test.ts`, add:

  ```ts
  it.each([
    undefined,
    "",
    "http://127.0.0.1:8787",
    "http://localhost:8787",
  ])("uses the cloud relay for legacy relay url %s", (relayUrl) => {
    const settings = mergeSettings({ sync: { relayUrl } });

    expect(settings.sync.enabled).toBe(true);
    expect(settings.sync.relayUrl).toBe("http://159.75.175.47:8787");
  });
  ```

- [ ] **Step 2: Implement default relay constants**

  In `src/settings/defaultSettings.ts`:

  ```ts
  export const DEFAULT_RELAY_URL = "http://159.75.175.47:8787";
  ```

  Set:

  ```ts
  sync: {
    enabled: true,
    relayUrl: DEFAULT_RELAY_URL,
    ...
  }
  ```

  In `src/settings/settingsStore.ts`, add:

  ```ts
  const LEGACY_LOCAL_RELAY_URLS = new Set([
    "http://127.0.0.1:8787",
    "http://localhost:8787",
  ]);

  export function normalizeRelayUrl(value: unknown): string {
    const relayUrl = readNonEmptyString(value, defaultSettings.sync.relayUrl);
    return LEGACY_LOCAL_RELAY_URLS.has(relayUrl) ? defaultSettings.sync.relayUrl : relayUrl;
  }
  ```

  Use `normalizeRelayUrl(value.relayUrl)` inside `readSyncSettings`.

- [ ] **Step 3: Write SyncPanel simplification tests**

  In `src/sync/SyncPanel.test.tsx`, add:

  ```ts
  it("hides relay internals and inline send form", () => {
    render(<SyncPanel {...propsWithEnabledCloudRelay} />);

    expect(screen.queryByLabelText("启用远程互动")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("中继地址")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("发送消息")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成绑定码" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "绑定" })).toBeEnabled();
  });
  ```

- [ ] **Step 4: Simplify SyncPanel**

  Remove:
  - `messageText` state
  - enable checkbox
  - relay URL input
  - inline send form
  - `onSendMessage` prop
  - `controlsDisabled` logic driven by `sync.enabled`

  Keep:
  - status header
  - generate binding code button
  - pair code output
  - accept binding code form
  - cancel binding button
  - message list
  - status error rendering

  Disable pair/bind controls only when an operation state already makes the control invalid, such as `Boolean(sync.pairId)` for generate.

- [ ] **Step 5: Update App call site**

  Remove `onSendMessage={handleSendMessage}` from `SyncPanel`.

- [ ] **Step 6: Run tests and commit**

  Run:

  ```powershell
  pnpm vitest run src/settings/settingsStore.test.ts src/sync/SyncPanel.test.tsx src/app/App.test.tsx
  ```

  Expected: PASS.

  Commit:

  ```powershell
  git add src/settings/defaultSettings.ts src/settings/settingsStore.ts src/sync/SyncPanel.tsx src/app/App.tsx src/settings/settingsStore.test.ts src/sync/SyncPanel.test.tsx src/app/App.test.tsx
  git commit -m "feat: default desktop sync to cloud relay"
  ```

---

### Task 5: 打字机文本组件并接入气泡

**Files:**
- Create: `src/ui/TypewriterText.tsx`
- Create: `src/ui/TypewriterText.test.tsx`
- Modify: `src/bubble/BubbleLayer.tsx`
- Modify: `src/sync/RemoteMessageLayer.tsx`
- Test: `src/bubble/BubbleLayer.test.tsx`
- Test: `src/sync/RemoteMessageLayer.test.tsx`

**Interfaces:**
- Produces:
  - `TypewriterText({ text, intervalMs = 35, disabled = false }: Props)`
  - Respects `prefers-reduced-motion: reduce` by showing full text immediately.

- [ ] **Step 1: Write TypewriterText tests**

  Create `src/ui/TypewriterText.test.tsx`:

  ```tsx
  import { render, screen } from "@testing-library/react";
  import { act } from "react";
  import { describe, expect, it, vi } from "vitest";
  import { TypewriterText } from "./TypewriterText";

  describe("TypewriterText", () => {
    it("reveals text one unicode code point at a time", () => {
      vi.useFakeTimers();
      render(<TypewriterText text="你呀" intervalMs={35} />);

      expect(screen.getByText("你")).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(35));
      expect(screen.getByText("你呀")).toBeInTheDocument();
      vi.useRealTimers();
    });

    it("shows full text when disabled", () => {
      render(<TypewriterText text="你好呀" disabled />);

      expect(screen.getByText("你好呀")).toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: Implement TypewriterText**

  Create `src/ui/TypewriterText.tsx`:

  ```tsx
  import { useEffect, useMemo, useState } from "react";

  interface TypewriterTextProps {
    text: string;
    intervalMs?: number;
    disabled?: boolean;
  }

  export function TypewriterText({ text, intervalMs = 35, disabled = false }: TypewriterTextProps) {
    const characters = useMemo(() => Array.from(text), [text]);
    const reducedMotion = usePrefersReducedMotion();
    const shouldShowImmediately = disabled || reducedMotion || characters.length <= 1;
    const [visibleCount, setVisibleCount] = useState(() => (shouldShowImmediately ? characters.length : 1));

    useEffect(() => {
      setVisibleCount(shouldShowImmediately ? characters.length : Math.min(1, characters.length));
    }, [characters.length, shouldShowImmediately, text]);

    useEffect(() => {
      if (shouldShowImmediately || visibleCount >= characters.length) return;
      const timer = window.setTimeout(() => setVisibleCount((count) => Math.min(count + 1, characters.length)), intervalMs);
      return () => window.clearTimeout(timer);
    }, [characters.length, intervalMs, shouldShowImmediately, visibleCount]);

    return <>{characters.slice(0, visibleCount).join("")}</>;
  }

  function usePrefersReducedMotion() {
    const [reduced, setReduced] = useState(() =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );

    useEffect(() => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      const update = () => setReduced(media.matches);
      media.addEventListener?.("change", update);
      return () => media.removeEventListener?.("change", update);
    }, []);

    return reduced;
  }
  ```

- [ ] **Step 3: Update bubble components**

  In `src/bubble/BubbleLayer.tsx`:

  ```tsx
  import { TypewriterText } from "../ui/TypewriterText";
  ...
  <TypewriterText text={message} />
  ```

  In `src/sync/RemoteMessageLayer.tsx`:

  ```tsx
  import { TypewriterText } from "../ui/TypewriterText";
  ...
  <div className="remote-message-bubble"><TypewriterText text={message.text} /></div>
  ```

- [ ] **Step 4: Run tests and commit**

  Run:

  ```powershell
  pnpm vitest run src/ui/TypewriterText.test.tsx src/bubble/BubbleLayer.test.tsx src/sync/RemoteMessageLayer.test.tsx
  ```

  Expected: PASS.

  Commit:

  ```powershell
  git add src/ui/TypewriterText.tsx src/ui/TypewriterText.test.tsx src/bubble/BubbleLayer.tsx src/sync/RemoteMessageLayer.tsx src/bubble/BubbleLayer.test.tsx src/sync/RemoteMessageLayer.test.tsx
  git commit -m "feat: stream pet bubble text"
  ```

---

### Task 6: 互动菜单发消息命令与独立消息输入窗口

**Files:**
- Modify: `src/interaction/InteractionMenu.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/main.tsx`
- Modify: `src/desktop/desktopApi.ts`
- Modify: `src/desktop/windowCommands.ts`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/main.rs`
- Create: `src/message/messageComposerEvents.ts`
- Create: `src/message/MessageComposerWindow.tsx`
- Modify: `src/app/app.css`
- Test: `src/interaction/InteractionMenu.test.tsx`
- Test: `src/app/App.test.tsx`
- Test: `src/message/MessageComposerWindow.test.tsx`

**Interfaces:**
- Consumes:
  - `SEND_MESSAGE_INTERACTION_ID`
  - `InteractionCommandName`
  - `handleSendMessage(text: string)`
- Produces:
  - `openMessageComposerWindow(): Promise<void>`
  - `listenForMessageComposerSubmit(handler: (payload: { text: string }) => void): Promise<DesktopEventUnlisten>`
  - `emitMessageComposerSubmit(text: string): Promise<void>`
  - `emitMessageComposerResult(result: { ok: boolean; message?: string }): Promise<void>`
  - `listenForMessageComposerResult(handler: (result) => void): Promise<DesktopEventUnlisten>`

- [ ] **Step 1: Write InteractionMenu command test**

  In `src/interaction/InteractionMenu.test.tsx`, add:

  ```tsx
  it("emits command selection for the send message option", async () => {
    const onSelect = vi.fn();
    render(
      <InteractionMenu
        open
        x={160}
        y={180}
        options={interactionOptions}
        onSelect={onSelect}
      />,
    );

    await userEvent.click(screen.getByRole("menuitem", { name: /发消息/ }));

    expect(onSelect).toHaveBeenCalledWith("send-message");
  });
  ```

- [ ] **Step 2: Update menu icon and positions**

  In `src/interaction/InteractionMenu.tsx`:

  ```ts
  import sendMessageIconUrl from "../assets/ui/interaction-buttons/send-message.png";
  import { SEND_MESSAGE_INTERACTION_ID, type InteractionCommandName } from "../assets/builtInPetManifest";

  type InteractionMenuSelection = InteractionActionName | InteractionCommandName;
  ```

  Update props:

  ```ts
  onSelect(selection: InteractionMenuSelection): void;
  ```

  Add icon and radial position:

  ```ts
  [SEND_MESSAGE_INTERACTION_ID]: sendMessageIconUrl
  [SEND_MESSAGE_INTERACTION_ID]: { x: 0, y: 116 }
  ```

- [ ] **Step 3: Write message composer component tests**

  Create `src/message/MessageComposerWindow.test.tsx`:

  ```tsx
  it("submits trimmed text through the composer event bridge", async () => {
    const emitSubmit = vi.fn().mockResolvedValue(undefined);
    render(<MessageComposerWindow emitSubmit={emitSubmit} closeWindow={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("消息内容"), "  今天也想你  ");
    await userEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(emitSubmit).toHaveBeenCalledWith("今天也想你");
  });

  it("uses Enter to send and Shift Enter for newline", async () => {
    const emitSubmit = vi.fn().mockResolvedValue(undefined);
    render(<MessageComposerWindow emitSubmit={emitSubmit} closeWindow={vi.fn()} />);

    const input = screen.getByLabelText("消息内容");
    await userEvent.type(input, "第一行{Shift>}{Enter}{/Shift}第二行");
    expect(input).toHaveValue("第一行\n第二行");
    await userEvent.keyboard("{Enter}");

    expect(emitSubmit).toHaveBeenCalledWith("第一行\n第二行");
  });
  ```

- [ ] **Step 4: Implement event bridge**

  Create `src/message/messageComposerEvents.ts`:

  ```ts
  import { emit } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { listenToDesktopEvent, type DesktopEventUnlisten } from "../desktop/desktopApi";

  export interface MessageComposerSubmitPayload { text: string }
  export interface MessageComposerResultPayload { ok: boolean; message?: string }

  export const MESSAGE_COMPOSER_SUBMIT_EVENT = "message-composer-submit";
  export const MESSAGE_COMPOSER_RESULT_EVENT = "message-composer-result";

  export function emitMessageComposerSubmit(text: string): Promise<void> {
    return emit(MESSAGE_COMPOSER_SUBMIT_EVENT, { text });
  }

  export function emitMessageComposerResult(result: MessageComposerResultPayload): Promise<void> {
    return emit(MESSAGE_COMPOSER_RESULT_EVENT, result);
  }

  export function listenForMessageComposerSubmit(
    handler: (payload: MessageComposerSubmitPayload) => void,
  ): Promise<DesktopEventUnlisten> {
    return listenToDesktopEvent<MessageComposerSubmitPayload>(MESSAGE_COMPOSER_SUBMIT_EVENT, handler);
  }

  export function listenForMessageComposerResult(
    handler: (payload: MessageComposerResultPayload) => void,
  ): Promise<DesktopEventUnlisten> {
    return listenToDesktopEvent<MessageComposerResultPayload>(MESSAGE_COMPOSER_RESULT_EVENT, handler);
  }

  export function closeCurrentMessageComposerWindow(): Promise<void> {
    return getCurrentWindow().close();
  }
  ```

  Modify `src/desktop/desktopApi.ts`:

  ```ts
  import type { Event } from "@tauri-apps/api/event";
  ...
  export function listenToDesktopEvent<T = void>(
    eventName: string,
    handler: (payload: T) => void,
  ): Promise<DesktopEventUnlisten> {
    return listen<T>(eventName, (event: Event<T>) => handler(event.payload));
  }
  ```

- [ ] **Step 5: Implement MessageComposerWindow**

  Create `src/message/MessageComposerWindow.tsx` with:

  ```tsx
  export function MessageComposerWindow({
    emitSubmit = emitMessageComposerSubmit,
    closeWindow = closeCurrentMessageComposerWindow,
  }: MessageComposerWindowProps) {
    const [text, setText] = useState("");
    const [status, setStatus] = useState<string | null>(null);
    const trimmed = text.trim();

    async function submit() {
      if (!trimmed) {
        setStatus("先写一点想说的话");
        return;
      }
      await emitSubmit(trimmed);
      await closeWindow();
    }

    return (...);
  }
  ```

  The textarea:

  ```tsx
  <textarea
    aria-label="消息内容"
    maxLength={280}
    rows={5}
    value={text}
    onChange={(event) => setText(event.currentTarget.value)}
    onKeyDown={(event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void submit();
      }
    }}
  />
  ```

- [ ] **Step 6: Route secondary window in main.tsx**

  In `src/main.tsx`:

  ```tsx
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { MessageComposerWindow } from "./message/MessageComposerWindow";

  const currentWindow = getCurrentWindow();
  const Root = currentWindow.label === "message-composer" ? MessageComposerWindow : App;
  ```

  Render `<Root />`.

- [ ] **Step 7: Add Tauri command to open centered composer**

  In `src-tauri/src/commands.rs`, add:

  ```rust
  const MESSAGE_COMPOSER_WINDOW_LABEL: &str = "message-composer";

  #[tauri::command]
  pub fn open_message_composer_window(app: AppHandle) -> Result<(), String> {
      if let Some(window) = app.get_webview_window(MESSAGE_COMPOSER_WINDOW_LABEL) {
          window.show().map_err(|error| format!("failed to show message composer: {error}"))?;
          return window.set_focus().map_err(|error| format!("failed to focus message composer: {error}"));
      }

      tauri::WebviewWindowBuilder::new(
          &app,
          MESSAGE_COMPOSER_WINDOW_LABEL,
          tauri::WebviewUrl::App("index.html".into()),
      )
      .title("发送消息")
      .inner_size(420.0, 240.0)
      .center()
      .always_on_top(true)
      .skip_taskbar(true)
      .resizable(false)
      .decorations(false)
      .transparent(false)
      .build()
      .map(|_| ())
      .map_err(|error| format!("failed to open message composer: {error}"))
  }
  ```

  Register it in `src-tauri/src/main.rs` and add wrapper:

  ```ts
  export function openMessageComposerWindow(): Promise<void> {
    return invokeCommand<void>("open_message_composer_window");
  }
  ```

- [ ] **Step 8: Connect command in App**

  In `src/app/App.tsx`, import:

  ```ts
  import { SEND_MESSAGE_INTERACTION_ID, type InteractionCommandName } from "../assets/builtInPetManifest";
  import { openMessageComposerWindow } from "../desktop/windowCommands";
  import { emitMessageComposerResult, listenForMessageComposerSubmit } from "../message/messageComposerEvents";
  ```

  Change `handleSendMessage` to return `{ ok: true } | { ok: false; message: string }` while preserving current session list and bubble side effects.

  Add submit listener:

  ```ts
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listenForMessageComposerSubmit(async ({ text }) => {
      const result = handleSendMessage(text);
      await emitMessageComposerResult(result);
    }).then((unsubscribe) => {
      if (disposed) unsubscribe();
      else unlisten = unsubscribe;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [handleSendMessage]);
  ```

  Update selection handler:

  ```ts
  const handleInteractionSelect = useCallback((selection: InteractionActionName | InteractionCommandName) => {
    if (selection === SEND_MESSAGE_INTERACTION_ID) {
      setInteractionMenuPosition(null);
      const sendable =
        settingsRef.current.sync.enabled &&
        Boolean(settingsRef.current.sync.pairId) &&
        realtime.state.status === "connected" &&
        realtime.state.peerPresence === "online";
      if (!sendable) {
        setBubble(showBubble("对方在线后再发消息吧。", { durationMs: 5000 }));
        return;
      }
      runDesktopCommand(openMessageComposerWindow);
      return;
    }
    ...
  }, [realtime.state.peerPresence, realtime.state.status, selectedPetPackage]);
  ```

- [ ] **Step 9: Add composer CSS**

  Add classes:

  ```css
  .message-composer-shell { ... }
  .message-composer-card { ... }
  .message-composer-textarea { ... }
  .message-composer-actions { ... }
  ```

  Use light warm Q style, 8px radius or less for container controls where practical, and ensure 420x240 has no clipping.

- [ ] **Step 10: Run tests and commit**

  Run:

  ```powershell
  pnpm vitest run src/interaction/InteractionMenu.test.tsx src/message/MessageComposerWindow.test.tsx src/app/App.test.tsx
  cargo test --manifest-path src-tauri/Cargo.toml open_message_composer
  ```

  Expected: PASS.

  Commit:

  ```powershell
  git add src/interaction/InteractionMenu.tsx src/app/App.tsx src/main.tsx src/desktop/desktopApi.ts src/desktop/windowCommands.ts src-tauri/src/commands.rs src-tauri/src/main.rs src/message src/app/app.css src/interaction/InteractionMenu.test.tsx src/app/App.test.tsx
  git commit -m "feat: send messages from pet interaction menu"
  ```

---

### Task 7: 远程中继部署文件与云服务器上线

**Files:**
- Create: `server/Dockerfile`
- Create: `deploy/couple-pet-relay/compose.yaml`
- Create: `deploy/couple-pet-relay/.env.example`
- Create: `deploy/couple-pet-relay/README.md`
- Create: `deploy/couple-pet-relay/composeConfig.test.ts`
- Test: `deploy/couple-pet-relay/composeConfig.test.ts`

**Interfaces:**
- Consumes server package command `pnpm --dir server build` and `pnpm --dir server start`.
- Produces remote service reachable at:
  - `http://159.75.175.47:8787/health`
  - `ws://159.75.175.47:8787/ws`

- [ ] **Step 1: Write compose config test**

  Create `deploy/couple-pet-relay/composeConfig.test.ts`:

  ```ts
  import { readFileSync } from "node:fs";
  import { describe, expect, it } from "vitest";

  describe("couple pet relay compose config", () => {
    it("publishes relay port and persists sqlite data", () => {
      const compose = readFileSync("deploy/couple-pet-relay/compose.yaml", "utf8");

      expect(compose).toContain('"8787:8787"');
      expect(compose).toContain("RELAY_HOST: 0.0.0.0");
      expect(compose).toContain("/app/server/.data");
    });
  });
  ```

- [ ] **Step 2: Add server Dockerfile**

  Create `server/Dockerfile`:

  ```dockerfile
  FROM node:22-bookworm-slim AS base
  WORKDIR /app
  RUN corepack enable

  COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
  COPY shared/package.json ./shared/package.json
  COPY server/package.json ./server/package.json
  RUN pnpm install --frozen-lockfile

  COPY shared ./shared
  COPY server ./server
  RUN pnpm --dir server build

  ENV NODE_ENV=production
  ENV RELAY_HOST=0.0.0.0
  ENV RELAY_PORT=8787
  EXPOSE 8787
  CMD ["pnpm", "--dir", "server", "start"]
  ```

- [ ] **Step 3: Add compose file**

  Create `deploy/couple-pet-relay/compose.yaml`:

  ```yaml
  services:
    relay:
      build:
        context: ../..
        dockerfile: server/Dockerfile
      restart: unless-stopped
      environment:
        RELAY_HOST: 0.0.0.0
        RELAY_PORT: 8787
        RELAY_DB_PATH: /app/server/.data/relay.sqlite
      ports:
        - "8787:8787"
      volumes:
        - relay-data:/app/server/.data

  volumes:
    relay-data:
  ```

- [ ] **Step 4: Add deployment docs**

  Create `deploy/couple-pet-relay/.env.example`:

  ```text
  RELAY_HOST=0.0.0.0
  RELAY_PORT=8787
  RELAY_DB_PATH=/app/server/.data/relay.sqlite
  ```

  Create `deploy/couple-pet-relay/README.md`:

  ```markdown
  # Couple Pet Relay Deployment

  Target: `159.75.175.47:8787`

  ## Deploy

  ```powershell
  ssh root@159.75.175.47 "mkdir -p /opt/couple-pet-relay"
  scp -r server shared package.json pnpm-lock.yaml pnpm-workspace.yaml deploy/couple-pet-relay root@159.75.175.47:/opt/couple-pet-relay/
  ssh root@159.75.175.47 "cd /opt/couple-pet-relay && docker compose -f deploy/couple-pet-relay/compose.yaml up -d --build"
  ```

  ## Health Check

  ```powershell
  curl http://159.75.175.47:8787/health
  ```

  If the health check cannot connect, open TCP port `8787` in the cloud security group and the server firewall.
  ```

- [ ] **Step 5: Run local relay tests and commit**

  Run:

  ```powershell
  pnpm vitest run deploy/couple-pet-relay/composeConfig.test.ts
  pnpm --dir server test
  pnpm --dir server build
  ```

  Expected: PASS.

  Commit:

  ```powershell
  git add server/Dockerfile deploy/couple-pet-relay
  git commit -m "build: add relay deployment config"
  ```

- [ ] **Step 6: Deploy to remote server**

  Run from `C:\Users\14567\.codex\worktrees\6515\情侣桌宠`:

  ```powershell
  ssh root@159.75.175.47 "mkdir -p /opt/couple-pet-relay"
  scp -r server shared package.json pnpm-lock.yaml pnpm-workspace.yaml deploy/couple-pet-relay root@159.75.175.47:/opt/couple-pet-relay/
  ssh root@159.75.175.47 "cd /opt/couple-pet-relay && docker compose -f deploy/couple-pet-relay/compose.yaml up -d --build"
  ssh root@159.75.175.47 "cd /opt/couple-pet-relay && docker compose -f deploy/couple-pet-relay/compose.yaml ps"
  curl http://159.75.175.47:8787/health
  ```

  Expected:
  - compose service status is `running` or `Up`
  - health endpoint returns JSON with service status from existing server health handler

---

### Task 8: Full Verification and Debug EXE

**Files:**
- No feature files should be edited in this task unless verification exposes a failure.

**Interfaces:**
- Consumes all previous task commits.
- Produces verified debug executable at `src-tauri/target/debug/couple-desktop-pet.exe`.

- [ ] **Step 1: Run full frontend tests**

  Run:

  ```powershell
  pnpm test
  ```

  Expected: all Vitest suites pass.

- [ ] **Step 2: Run typecheck**

  Run:

  ```powershell
  pnpm typecheck
  ```

  Expected: exits 0.

- [ ] **Step 3: Run production web build**

  Run:

  ```powershell
  pnpm build
  ```

  Expected: exits 0 and writes `dist`.

- [ ] **Step 4: Run Rust tests**

  Run:

  ```powershell
  cargo test --manifest-path src-tauri/Cargo.toml
  ```

  Expected: all Rust tests pass.

- [ ] **Step 5: Run server verification**

  Run:

  ```powershell
  pnpm --dir server test
  pnpm --dir server build
  ```

  Expected: both commands exit 0.

- [ ] **Step 6: Build debug desktop executable**

  Run:

  ```powershell
  pnpm tauri build --debug
  ```

  Expected: exits 0 and produces:

  ```text
  C:\Users\14567\.codex\worktrees\6515\情侣桌宠\src-tauri\target\debug\couple-desktop-pet.exe
  ```

- [ ] **Step 7: Manual smoke test**

  Run the debug EXE and verify:
  - Windows taskbar has no application icon for the pet.
  - Tray icon still has 显示、隐藏、设置、退出.
  - Left click opens radial menu once.
  - Right click opens settings/context menu.
  - Drag to left/right/top edge shows half-hidden pet image.
  - Click half-hidden pet restores and opens interaction menu.
  - 设置 -> 远程互动 shows binding controls but no relay URL field and no send textarea.
  - 生成绑定码 uses `http://159.75.175.47:8787`.
  - `发消息` opens a centered message composer window when paired and peer is online.
  - Sent and received message bubbles stream text one character at a time.
  - Received remote message remains until mouse hover acknowledgement.

- [ ] **Step 8: Final commit if verification required fixes**

  If verification required code fixes, commit them:

  ```powershell
  git add <changed-files>
  git commit -m "fix: stabilize interaction relay upgrade"
  ```

  If no fixes were needed, do not create an empty commit.

---

## Self-Review

- Spec coverage: all five requested items map to Tasks 1-7, with Task 8 covering verification and debug EXE.
- Scope check: account system、排行榜、官网购买转化、AI 资源包生成平台 are intentionally excluded from this implementation batch.
- Placeholder scan: every task includes concrete files, commands and expected outputs, with no unresolved placeholder instructions.
- Type consistency: `EdgePeekSide`, `InteractionCommandName`, `SEND_MESSAGE_INTERACTION_ID`, composer event payloads and Tauri command names are introduced before downstream tasks consume them.
