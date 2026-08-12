# 情侣小心意消息 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有文字消息链路上增加有仪式感的小心意消息，并将六个环绕按钮严格实现为已确认的新茶饮包装式原创视觉。

**Architecture:** `shared/syncProtocol.ts` 负责结构化载荷的唯一类型和校验来源，Relay 只校验并透传，`RealtimeClient` 只发送和转交解析后的内容。React 侧用普通消息/小心意消息联合 FIFO 队列调度展示，发送表单和接收卡片保持独立组件；Tauri 只通过受控 surface 枚举决定 `440 x 260` 或 `440 x 460` 的窗口尺寸。

**Tech Stack:** Tauri 2、Rust、React 19、TypeScript 7 strict、Vite 8、Vitest 4、Testing Library、Node WebSocket Relay。

## Global Constraints

- 必须遵循 `docs/superpowers/specs/2026-08-12-heart-surprise-message-design.md`；该文档中的主题文案、尺寸、颜色、坐标和协议字段是验收基准。
- 继续使用 `message.send` / `message.received`；`text` 必填，`content` 仅允许 `{ kind: "surprise", version: 1, theme, secret, note? }`。
- 接收界面不得出现“外卖”“订单”“配送”“取件码”“取餐”、平台名或商品名；使用“惊喜暗号”。
- 小心意暗号去除首尾空白后为 `1..24` 个 Unicode 字符，只允许 `[A-Za-z0-9-]+`；留言去除首尾空白后最多 `120` 个 Unicode 字符。
- 六个按钮保持 `68 x 62px` 和偏移 `(-76,-88)`、`(0,-112)`、`(76,-88)`、`(-92,-12)`、`(92,-12)`、`(0,62)`。
- 按钮使用 `#fafaf6`、`1.5px` 黑边、`7px` 圆角；悬停/聚焦为黑底白字和 `2px #f6534d` 外环；入场不超过 `180ms`。
- 所有六个入口和小心意卡必须使用项目自制透明 PNG，不得使用品牌 Logo、emoji、Unicode 图标、CSS 绘图、手写 SVG 或文字占位。
- 小心意卡保持固定可读尺寸，不随桌宠缩放；在 `0.6x`、`1.0x`、`1.45x` 下不得裁切或重叠。
- 普通文字消息的逐字展示、鼠标经过确认、FIFO 顺序和 Session 消息记录不得回归。
- Relay 和客户端日志不得包含暗号、留言、fallback 正文或完整结构化载荷。
- 生产 React 不使用 `dangerouslySetInnerHTML`，不读取剪贴板、通知或第三方应用。
- 采用严格 TDD：每个生产行为先添加失败测试并记录预期失败，再写最小实现。
- 当前工作区已有用户未提交修改；不得覆盖、回滚或把无关修改带入任务提交。`src/app/App.tsx`、`src/app/app.css` 等已脏文件只做聚焦修改，默认不提交整个文件。

---

## File Structure

### New files

- `src/surprise/surpriseThemes.ts`: 六套主题展示数据、默认留言和 fallback 文本生成。
- `src/surprise/surpriseThemes.test.ts`: 主题映射、Unicode 长度和 fallback 文案测试。
- `src/surprise/SurpriseComposerPanel.tsx`: 小心意发送表单和本地校验。
- `src/surprise/SurpriseComposerPanel.test.tsx`: 表单状态、校验、切换、失败重试和键盘行为。
- `src/surprise/SurpriseMessageCard.tsx`: 折叠、揭示、关闭四状态接收卡片。
- `src/surprise/SurpriseMessageCard.test.tsx`: 隐藏暗号、点击揭示、关闭语义和禁词测试。
- `src/assets/ui/surprise/heart-surprise.png`: 接收卡和 `外卖到啦` 入口共用的原创插画。
- `src/assets/ui/interaction-buttons/new-tea-{cute,message,wave,hug,status}.png`: 五个其余入口的原创透明 PNG。

### Existing files to modify

- `shared/syncProtocol.ts` / `.test.ts`: 结构化消息类型、校验和防御性解析。
- `server/src/websocketRelay.ts` / `.test.ts`: 合法内容原样透传，非法内容拒绝。
- `src/sync/realtimeClient.ts` / `.test.ts`: 可选内容发送、接收事件透传。
- `src/sync/useRealtimeSync.ts` / `.test.tsx`: 将结构化内容传给 App。
- `src/sync/remoteMessageQueue.ts` / `.test.ts`: 普通与小心意联合 FIFO 状态机。
- `src/sync/RemoteMessageLayer.tsx` / `.test.tsx`: 按消息种类渲染普通气泡或小心意卡。
- `src/desktop/windowCommands.ts` / `.test.ts`: 受控 `message | surprise` composer surface。
- `src-tauri/src/commands.rs`: 两种固定尺寸、保存/恢复几何状态和测试。
- `src/assets/builtInPetManifest.ts` / `.test.ts`: `发消息`、`外卖到啦` 和独立菜单图标键。
- `src/interaction/InteractionMenu.tsx` / `.test.tsx`: 六个新资源和无回归坐标。
- `src/app/App.tsx` / `.test.tsx`: 打开发送面板、发送、队列、motion、点击穿透和界面互斥。
- `src/app/app.css`: 已确认的按钮、发送表单和接收卡视觉及 reduced-motion。
- `src/assets/README.md`: 自制资源来源、用途和禁止品牌化说明。

---

### Task 1: Shared structured message contract

**Files:**
- Modify: `shared/syncProtocol.ts`
- Test: `shared/syncProtocol.test.ts`

**Interfaces:**
- Produces: `SurpriseTheme`, `SurpriseMessageContent`, `StructuredMessageContent`, `validateStructuredMessageContent(input)`。
- Changes: `SendClientMessage.content?` and `MessageReceivedServerMessage.content?`。
- `parseServerToClientMessage()` must drop invalid/unknown `content` and still return the valid `text` message for client fallback.

- [ ] **Step 1: Write failing protocol tests**

Add table-driven cases for all themes and explicit rejection cases:

```ts
const themes = ["cheer", "apology", "birthday", "festival", "miss", "general"] as const;

it.each(themes)("accepts surprise theme %s", (theme) => {
  expect(validateStructuredMessageContent({
    kind: "surprise",
    version: 1,
    theme,
    secret: "A-7482",
    note: "看到它的时候，就当我抱了你一下。",
  })).toEqual({
    ok: true,
    content: {
      kind: "surprise",
      version: 1,
      theme,
      secret: "A-7482",
      note: "看到它的时候，就当我抱了你一下。",
    },
  });
});

it("falls back to text when received content has an unknown version", () => {
  expect(parseServerToClientMessage({
    type: "message.received",
    pairId: "pair_1",
    serverMessageId: "server_1",
    fromDeviceId: "dev_b",
    text: "一份小心意在等你。惊喜暗号：7482。",
    sentAt: "2026-08-12T10:00:00.000Z",
    content: { kind: "surprise", version: 2, theme: "general", secret: "7482" },
  })).toEqual(expect.objectContaining({
    type: "message.received",
    text: "一份小心意在等你。惊喜暗号：7482。",
    content: undefined,
  }));
});
```

Also cover empty secret, 25 Unicode characters, spaces/underscore, 121-character note, unknown kind/theme, non-integer version, empty note normalization, and legacy extra fields.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm test -- shared/syncProtocol.test.ts`

Expected: FAIL because the exported types/validator and parsed `content` do not exist.

- [ ] **Step 3: Implement the validator and protocol fields**

Use `Array.from(value).length` for Unicode length and return a discriminated result:

```ts
export type StructuredMessageValidation =
  | { ok: true; content: StructuredMessageContent }
  | { ok: false; code: "malformed_message"; message: string };

export function validateStructuredMessageContent(
  input: unknown,
): StructuredMessageValidation;
```

On receive, only attach `content` when validation succeeds. Unknown/invalid content is omitted while the base message remains valid. Do not weaken `validateMessageText`.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test -- shared/syncProtocol.test.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit only clean protocol files**

```bash
git add shared/syncProtocol.ts shared/syncProtocol.test.ts
git commit -m "feat: define surprise message protocol"
```

Before committing, verify `git diff --cached --name-only` contains only those two paths.

---

### Task 2: Relay validation and forwarding

**Files:**
- Modify: `server/src/websocketRelay.ts`
- Test: `server/src/websocketRelay.test.ts`

**Interfaces:**
- Consumes: `validateStructuredMessageContent()` and `StructuredMessageContent` from Task 1.
- Produces: parsed `message.send.content?` and forwarded `message.received.content?`.

- [ ] **Step 1: Add failing WebSocket integration tests**

Add a two-client test that sends:

```ts
{
  type: "message.send",
  requestId: "msg_surprise",
  pairId: pair.pairId,
  clientMessageId: "local_surprise",
  text: "一份小心意在等你。惊喜暗号：7482。",
  content: {
    kind: "surprise",
    version: 1,
    theme: "apology",
    secret: "7482",
    note: "是我不好。",
  },
}
```

Assert Bob receives the same `content` and Alice receives `message.delivered`. Add a second test with `secret: "74 82"` asserting Alice gets `malformed_message` and Bob gets no JSON. Add a legacy pure-text assertion and a spy on error output proving secret/note are absent.

- [ ] **Step 2: Run server test and verify RED**

Run: `pnpm server:test -- websocketRelay.test.ts`

Expected: valid content is dropped by the current parser/forwarder and invalid content is not rejected.

- [ ] **Step 3: Parse, validate, and forward content**

In `parseClientMessage`, preserve absent `content`; when present, call the shared validator and throw `RelayError("malformed_message", 400, validation.message)` on failure. In `handleAuthenticatedMessage`, add only validated `content` to the peer payload:

```ts
sendJson(peer.socket, {
  type: "message.received",
  pairId: connection.pairId,
  serverMessageId: createServerMessageId(),
  fromDeviceId: connection.deviceId,
  text: text.text,
  sentAt,
  ...(message.content ? { content: message.content } : {}),
});
```

Do not log payload objects.

- [ ] **Step 4: Run relay verification**

Run: `pnpm server:test -- websocketRelay.test.ts`

Expected: PASS.

Run: `pnpm server:typecheck`

Expected: PASS.

- [ ] **Step 5: Commit relay files**

```bash
git add server/src/websocketRelay.ts server/src/websocketRelay.test.ts
git commit -m "feat: relay surprise message content"
```

---

### Task 3: Realtime client transport and callback

**Files:**
- Modify: `src/sync/realtimeClient.ts`
- Modify: `src/sync/realtimeClient.test.ts`
- Modify: `src/sync/useRealtimeSync.ts`
- Modify: `src/sync/useRealtimeSync.test.tsx`

**Interfaces:**
- Consumes: `StructuredMessageContent` from Task 1.
- Changes: `RealtimeClient.sendMessage(text, content?)` and `RealtimeClientEvent` message variant with `content?`.
- Produces: `UseRealtimeSyncCallbacks.onMessage(message)` with optional validated content.

- [ ] **Step 1: Add failing transport tests**

Assert `sendMessage(fallback, content)` writes both fields and returns a client ID. Feed a `message.received` frame with valid content and assert the event contains it. Feed unknown version and assert the event contains text with `content` undefined. In hook tests, assert `onMessage` receives the optional field unchanged.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm test -- src/sync/realtimeClient.test.ts src/sync/useRealtimeSync.test.tsx`

Expected: FAIL because `sendMessage` and events only accept text.

- [ ] **Step 3: Extend transport signatures minimally**

Use this signature:

```ts
sendMessage(
  text: string,
  content?: StructuredMessageContent,
): { ok: true; clientMessageId: string } | { ok: false; message: string }
```

Keep text validation first, append `content` only when defined, and copy parsed `content` into the event/hook callback. Do not make the client revalidate already parsed server payloads.

- [ ] **Step 4: Verify client transport**

Run: `pnpm test -- src/sync/realtimeClient.test.ts src/sync/useRealtimeSync.test.tsx`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit transport files**

```bash
git add src/sync/realtimeClient.ts src/sync/realtimeClient.test.ts src/sync/useRealtimeSync.ts src/sync/useRealtimeSync.test.tsx
git commit -m "feat: transport surprise messages"
```

---

### Task 4: Theme data, fallback copy, and FIFO state machine

**Files:**
- Create: `src/surprise/surpriseThemes.ts`
- Create: `src/surprise/surpriseThemes.test.ts`
- Modify: `src/sync/remoteMessageQueue.ts`
- Modify: `src/sync/remoteMessageQueue.test.ts`

**Interfaces:**
- Produces: `SURPRISE_THEME_ORDER`, `SURPRISE_THEME_COPY`, `getSurpriseThemeCopy(theme)`, `buildSurpriseFallbackText(content)`.
- Produces queue operations: `revealRemoteSurprise(state, id)`, existing hover/dismiss/complete operations with one FIFO.
- Queue card uses `stage: "visible" | "hovered" | "collapsed" | "revealed" | "dismissing"` and optional valid `content`.

- [ ] **Step 1: Add failing pure-data and queue tests**

Assert all six exact rows from the spec, including default notes and prohibited-word scan:

```ts
const forbidden = ["外卖", "订单", "配送", "取件码", "取餐", "美团", "饿了么"];
for (const copy of Object.values(SURPRISE_THEME_COPY)) {
  for (const word of forbidden) expect(JSON.stringify(copy)).not.toContain(word);
}
```

Assert fallback is `一份小心意在等你。惊喜暗号：7482。是我不好。` and omits the trailing note when absent. Queue tests must prove: surprise starts `collapsed`; hover is a no-op; reveal changes only the active matching surprise; a later text waits; dismissal then promotes that text as `visible`.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm test -- src/surprise/surpriseThemes.test.ts src/sync/remoteMessageQueue.test.ts`

Expected: FAIL because the module and surprise stages do not exist.

- [ ] **Step 3: Implement immutable copy data and queue transitions**

Copy every string verbatim from the approved spec. Build fallback using trimmed content only. `markRemoteMessageHovered` must affect only `visible` text cards; `revealRemoteSurprise` must require active stage `collapsed`; both kinds share `completeRemoteMessageDismissal`.

- [ ] **Step 4: Verify pure logic**

Run: `pnpm test -- src/surprise/surpriseThemes.test.ts src/sync/remoteMessageQueue.test.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit pure logic files**

```bash
git add src/surprise/surpriseThemes.ts src/surprise/surpriseThemes.test.ts src/sync/remoteMessageQueue.ts src/sync/remoteMessageQueue.test.ts
git commit -m "feat: add surprise themes and queue states"
```

---

### Task 5: Controlled Tauri composer surfaces

**Files:**
- Modify: `src/desktop/windowCommands.ts`
- Modify: `src/desktop/windowCommands.test.ts`
- Modify: `src-tauri/src/commands.rs`

**Interfaces:**
- Produces: `type ComposerSurface = "message" | "surprise"`.
- Changes: `openMessageComposerSurface(surface: ComposerSurface)`; close command remains a single restore operation.
- Rust consumes only serde values `message` and `surprise`; arbitrary dimensions are impossible from React.

- [ ] **Step 1: Add failing TypeScript bridge and Rust geometry tests**

Bridge tests assert invocations:

```ts
expect(invokeCommand).toHaveBeenCalledWith("open_message_composer_surface", {
  surface: "surprise",
});
```

Rust tests must assert `message` produces `440 x 260`, `surprise` produces `440 x 460`, both center inside positive and negative-coordinate work areas, and repeated opens do not overwrite the original saved pet geometry.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm test -- src/desktop/windowCommands.test.ts`

Expected: FAIL because the bridge takes no argument.

Run: `cargo test --manifest-path src-tauri/Cargo.toml message_composer_surface`

Expected: FAIL because no surface enum or surprise size exists.

- [ ] **Step 3: Implement the controlled enum and geometry**

Add Rust constants `SURPRISE_COMPOSER_SURFACE_WIDTH_PX = 440` and `SURPRISE_COMPOSER_SURFACE_HEIGHT_PX = 460`, plus:

```rust
#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum ComposerSurface {
    Message,
    Surprise,
}
```

Select dimensions in the geometry helper; preserve current mutex cleanup and restore behavior. Do not accept width/height from the frontend.

- [ ] **Step 4: Verify bridge and Rust**

Run: `pnpm test -- src/desktop/windowCommands.test.ts`

Expected: PASS.

Run: `cargo test --manifest-path src-tauri/Cargo.toml message_composer_surface`

Expected: PASS.

- [ ] **Step 5: Commit only owned files**

```bash
git add src/desktop/windowCommands.ts src/desktop/windowCommands.test.ts src-tauri/src/commands.rs
git commit -m "feat: add surprise composer surface"
```

Do not stage the already-dirty `src-tauri/Cargo.toml`.

---

### Task 6: Production PNG assets and six-button visual

**Files:**
- Create: `src/assets/ui/surprise/heart-surprise.png`
- Create: `src/assets/ui/interaction-buttons/new-tea-cute.png`
- Create: `src/assets/ui/interaction-buttons/new-tea-message.png`
- Create: `src/assets/ui/interaction-buttons/new-tea-wave.png`
- Create: `src/assets/ui/interaction-buttons/new-tea-hug.png`
- Create: `src/assets/ui/interaction-buttons/new-tea-status.png`
- Modify: `src/assets/builtInPetManifest.ts`
- Modify: `src/assets/builtInPetManifest.test.ts`
- Modify: `src/interaction/InteractionMenu.tsx`
- Modify: `src/interaction/InteractionMenu.test.tsx`
- Modify: `src/assets/README.md`
- Modify: `src/app/app.css`

**Interfaces:**
- Adds `InteractionFunctionId` value `send-surprise`.
- Replaces action-derived icon mapping with stable `InteractionMenuIconName = "cute" | "message" | "wave" | "hug" | "surprise" | "status"`.
- Maintains the six exact positions and button hit area.

- [ ] **Step 1: Copy the approved binary resources without transforming their artwork**

Copy from:

```text
docs/assets/references/radial-menu-new-tea/cute.png -> src/assets/ui/interaction-buttons/new-tea-cute.png
docs/assets/references/radial-menu-new-tea/message.png -> src/assets/ui/interaction-buttons/new-tea-message.png
docs/assets/references/radial-menu-new-tea/wave.png -> src/assets/ui/interaction-buttons/new-tea-wave.png
docs/assets/references/radial-menu-new-tea/hug.png -> src/assets/ui/interaction-buttons/new-tea-hug.png
docs/assets/references/radial-menu-new-tea/status.png -> src/assets/ui/interaction-buttons/new-tea-status.png
docs/assets/references/heart-surprise-new-tea-icon.png -> src/assets/ui/surprise/heart-surprise.png
```

Verify every output is PNG with alpha and a transparent corner; do not regenerate or recolor.

- [ ] **Step 2: Write failing menu tests**

Assert exact IDs `act-cute`, `send-message`, `act-wave`, `act-hug`, `send-surprise`, `open-status`; exact labels `撒娇卖萌`, `发消息`, `打招呼`, `求抱抱`, `外卖到啦`, `我的状态`; six non-empty image `src` values; and callback `send-surprise`. Keep stagger variables and exact position variable assertions.

- [ ] **Step 3: Run tests and verify RED**

Run: `pnpm test -- src/assets/builtInPetManifest.test.ts src/interaction/InteractionMenu.test.tsx`

Expected: FAIL on old labels, old `act-pout` slot, and old icons.

- [ ] **Step 4: Implement manifest, resource map, and exact CSS**

Use independent icon keys so `act-pout` remains a valid pet action but is not a menu item. CSS must set:

```css
.pet-interaction-button {
  width: 68px;
  height: 62px;
  border: 1.5px solid #111;
  border-radius: 7px;
  background: #fafaf6;
  color: #111;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0;
  animation-duration: 180ms;
}

.pet-interaction-button:hover,
.pet-interaction-button:focus-visible {
  background: #111;
  color: #fff;
  outline: 2px solid #f6534d;
  outline-offset: 2px;
}
```

Remove nth-child gradients, asymmetric pill radii, inset jelly highlight and oversized spring easing. In reduced motion, disable animation and transforms while preserving color/focus. Give the `surprise` icon a modifier class with width `38px`.

- [ ] **Step 5: Verify menu behavior**

Run: `pnpm test -- src/assets/builtInPetManifest.test.ts src/interaction/InteractionMenu.test.tsx`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 6: Record a no-commit checkpoint for the dirty stylesheet**

Do not commit this task because `src/app/app.css` already contains user changes. Save `git diff -- src/assets/builtInPetManifest.ts src/interaction/InteractionMenu.tsx src/app/app.css` in the SDD report and let the main agent review/stage the final integrated diff.

---

### Task 7: Surprise composer form

**Files:**
- Create: `src/surprise/SurpriseComposerPanel.tsx`
- Create: `src/surprise/SurpriseComposerPanel.test.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
- Consumes: `SurpriseTheme`, `SURPRISE_THEME_ORDER`, `SURPRISE_THEME_COPY`.
- Produces: `onSubmit(content: SurpriseMessageContent, fallbackText: string)` returning the existing `{ ok, message? }` result shape.
- Produces no direct Tauri calls.

- [ ] **Step 1: Write failing component tests**

Cover: default `小小惊喜`; six segmented theme choices; default note replacement after theme changes; invalid empty/space/underscore/25-char secret; valid `A-7482`; 121-character note; Unicode character count; sending disables all controls; failed submit retains inputs; successful submit closes; Cancel and Escape close; first invalid field receives focus.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm test -- src/surprise/SurpriseComposerPanel.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement controlled fields and accessible labels**

Use real `<button>`, `<input>` and `<textarea>` controls with labels `这次想说`, `惊喜暗号`, `想对 TA 说`; submit text `送出这份心意`. Validation uses `Array.from(trimmed).length`, `/^[A-Za-z0-9-]+$/`, and calls `buildSurpriseFallbackText` only after all fields pass.

- [ ] **Step 4: Match the approved new-tea card language**

Use near-white background, black lines, coral selection/focus, no yellow gradients, no nested cards and no text describing how the feature works. Ensure the complete `440 x 460` surface has no vertical scroll at Windows 100% and 150% scaling.

- [ ] **Step 5: Verify the form**

Run: `pnpm test -- src/surprise/SurpriseComposerPanel.test.tsx`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 6: Record a no-commit checkpoint**

Do not commit because the shared stylesheet is dirty. Report the exact changed/new paths and focused test output.

---

### Task 8: Surprise receiver card and polymorphic message layer

**Files:**
- Create: `src/surprise/SurpriseMessageCard.tsx`
- Create: `src/surprise/SurpriseMessageCard.test.tsx`
- Modify: `src/sync/RemoteMessageLayer.tsx`
- Modify: `src/sync/RemoteMessageLayer.test.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
- `SurpriseMessageCard` consumes active card plus `onReveal(id)` and `onDismiss(id)`.
- `RemoteMessageLayer` routes cards with `content?.kind === "surprise"` to the new component and leaves text hover behavior unchanged.

- [ ] **Step 1: Write failing receiver tests**

Collapsed assertions: image exists, eyebrow/main copy exist, `轻轻点开看看` exists, secret/note/button are absent. Hover must not call reveal. Click must call reveal. Revealed assertions: exact expanded copy, `惊喜暗号`, secret, optional note, `我收下啦`; clicking close calls dismiss. Scan rendered text for every forbidden word.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm test -- src/surprise/SurpriseMessageCard.test.tsx src/sync/RemoteMessageLayer.test.tsx`

Expected: FAIL because the card and routing do not exist.

- [ ] **Step 3: Implement semantic collapsed/revealed UI**

Render collapsed content as a real button with `aria-expanded`; render revealed content in a status region with a black `我收下啦` button. The illustration is an `<img>` using `heart-surprise.png`, not a CSS background. Never place the secret in collapsed DOM, hidden attributes, aria-labels or data attributes.

- [ ] **Step 4: Add exact card CSS and reduced motion**

Collapsed width must be `248px`, revealed width `284px`, and both centered within `320px` with at least `18px` side safety. Use near-white solid fill, thin black border, restrained shadow, coral eyebrow, a white secret area with black dashed border, and black primary action. Entry <= `320ms`; reduced motion removes transform/scale.

- [ ] **Step 5: Verify receiver components**

Run: `pnpm test -- src/surprise/SurpriseMessageCard.test.tsx src/sync/RemoteMessageLayer.test.tsx`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 6: Record a no-commit checkpoint**

Do not commit because the stylesheet is dirty. Include DOM assertions and rendered screenshot notes in the task report.

---

### Task 9: App integration, motion fallback, click-through, and mutual exclusion

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/renderer/FramePetStage.tsx` only if the fixed overlay anchor needs an existing child-layer hook; do not resize the pet itself.
- Modify: `src/renderer/FramePetStage.test.tsx` only when `FramePetStage.tsx` changes.

**Interfaces:**
- Consumes all Tasks 1-8.
- Menu `send-surprise` opens `openMessageComposerSurface("surprise")`; normal message opens `"message"`.
- `handleSendSurprise(content, fallbackText)` calls realtime transport and records fallback text in Session messages.
- `selectMotionForTag` fallback order is `surprise`, then `message`, then no-op.

- [ ] **Step 1: Add failing App integration tests**

Add tests for: labels and selected callbacks; offline `send-surprise` shows existing availability feedback and does not open a surface; online opens surprise surface and hides menu/status/bubble; normal message opens message surface; successful surprise sends exact content/fallback and closes/restores; failed send keeps form; receive triggers surprise-first motion; absent surprise tag uses message; both absent leave motion unchanged; card suppresses peer status; mixed text/surprise/text receive order is FIFO; active card disables click-through until dismissed; settings/menu/status/composer do not overlap.

- [ ] **Step 2: Run focused App tests and verify RED**

Run: `pnpm test -- src/app/App.test.tsx`

Expected: FAIL on missing state, callbacks and renderer.

- [ ] **Step 3: Integrate two composer modes and receiver queue**

Use one discriminated state:

```ts
type ComposerMode = "message" | "surprise" | null;
```

Replace the message-only boolean without duplicating open/close geometry logic. Realtime callbacks pass `content` into `enqueueRemoteMessage`. `RemoteMessageLayer` receives reveal/dismiss callbacks; text still follows current hover timer. Ensure a surprise card remains until the explicit button path reaches dismissal completion.

- [ ] **Step 4: Add one motion helper for the exact fallback order**

Create a small local or focused pure helper returning the first motion tagged `surprise`, then `message`, else `null`; use it for receive and successful local send. Add pure test coverage if extracted.

- [ ] **Step 5: Verify App integration**

Run: `pnpm test -- src/app/App.test.tsx src/sync/remoteMessageQueue.test.ts src/sync/RemoteMessageLayer.test.tsx`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 6: Record a no-commit integration checkpoint**

Do not stage `src/app/App.tsx`, `src/app/App.test.tsx` or `src/renderer/FramePetStage.tsx` because they were dirty before this feature. The task report must list every retained pre-existing change and every new hunk.

---

### Task 10: Full verification, visual QA, Relay smoke, and Windows Debug EXE

**Files:**
- Modify: `src/assets/README.md` only if provenance is incomplete.
- Modify: `design-qa.md` only by appending a dated feature evidence section; preserve existing content.
- Output: `src-tauri/target/debug/couple-desktop-pet.exe` or the actual Cargo binary name reported by the build.

**Interfaces:**
- Consumes the completed application and Relay.
- Produces test/build evidence and the exact EXE path.

- [ ] **Step 1: Run all automated verification**

Run in order:

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm server:test
pnpm server:typecheck
pnpm server:build
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: every command exits `0` with no new warnings attributable to the feature.

- [ ] **Step 2: Start the frontend and perform browser visual checks**

Run `pnpm dev --host 127.0.0.1 --port 0`, record the assigned URL, and inspect at `320 x 360`, `440 x 260`, and `440 x 460`. Capture normal/focus/hover menu, composer validation, collapsed card, revealed card and reduced-motion states. Verify no yellow block, brand asset, clipped label, overlap or secret leakage.

- [ ] **Step 3: Run a real two-socket Relay smoke test**

Start the actual Relay, bind two disposable devices through its HTTP API, authenticate two WebSockets, send one ordinary text and one surprise payload in each direction, and record received message kinds plus `message.delivered` IDs. Do not print or save real user secrets; use disposable `7482` and `A-1024` test codes.

- [ ] **Step 4: Build the Windows Debug executable**

Run:

```powershell
pnpm tauri build --debug --no-bundle
```

If the CLI rejects this combination, run `cargo build --manifest-path src-tauri/Cargo.toml` after `pnpm build`. Confirm the actual `.exe` exists, has nonzero size, and starts without an immediate crash.

- [ ] **Step 5: Perform native visual QA**

In the Debug client, test `0.6x`, `1.0x`, `1.45x`; light and dark desktop backgrounds; keyboard focus; reduced motion; send failure retention; collapse/reveal/dismiss; mixed FIFO; window center/restore. Compare against the approved visual reference and record any pixel-level discrepancy before claiming completion.

- [ ] **Step 6: Final review package**

Create an SDD review package covering all implementation commits plus uncommitted integration hunks. A most-capable reviewer must return both spec-compliance and code-quality verdicts. Address every Critical/Important issue, re-run the covering tests, then repeat one scoped review.

- [ ] **Step 7: Leave the worktree reviewable**

Do not auto-commit pre-existing dirty files. Report: implementation paths, design commits `95ab13e` and `241b4e3`, automated command results, native visual QA result, real Relay result, and absolute Debug EXE path.

---

## Self-Review Record

- Spec coverage: protocol, Relay, client, queue, sender, receiver, menu resources, Tauri geometry, motion, click-through, visual QA and Debug build each map to an explicit task.
- Placeholder scan: every step names concrete files, commands, values and assertions; no unfinished marker or unspecified error path remains.
- Type consistency: `StructuredMessageContent` flows shared -> Relay -> realtime -> hook -> queue -> renderer; `ComposerSurface` is exactly `message | surprise`; theme values match the spec.
- Dirty-worktree safety: clean modules may be committed independently; dirty integration files are explicitly left uncommitted for main-agent review.
- Main residual risk: native two-instance Tauri verification may require separate application data directories; the Relay two-socket smoke is mandatory even when two native windows cannot share one installed app identity.
