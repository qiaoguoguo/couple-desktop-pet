# 桌面边缘互动 V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前四张静态贴边图替换为角色窗口自然越界裁切、接触点稳定、包含进入/待机/悬浮反应/退出阶段的四方向序列帧互动。

**Architecture:** React 侧维护独立的边缘互动状态机并播放内置 Q-girl 边缘动作；Tauri 只负责边缘判定、原生窗口越界定位和恢复，不感知动画帧。每个方向使用固定窗口接触锚点，帧元数据允许用逐帧锚点抵消绘制偏差，避免换帧时手掌与桌面边缘出现缝隙。首版只为内置 Q-girl 提供边缘资源，导入包缺少能力时保持普通桌宠，禁止回退成 Q-girl 边缘形象。

**Tech Stack:** Tauri 2、Rust、React 19、TypeScript、Vitest、PNG RGBA 序列帧。

## Global Constraints

- 视觉基准为 `docs/assets/edge-interaction-concept-v2.png`。
- 四方向必须包含 `enter -> idle -> react -> exit`；`exit` 可倒放 `enter`，不得使用单张静态图代替。
- `idle` 单次循环时长必须不少于 5 秒；角色显示尺寸与普通桌宠接近，不能切换到边缘状态后突然放大。
- 左右角色主体位于屏幕外侧；顶部双手抓住上边缘且身体按重力向下；底部身体位于屏幕下方、头肩和双手爬起。
- 接触手掌与边缘的可见缝隙不得超过 1 个物理像素；不得出现绿色残边、断手、多余人物或方向错误。
- 隐藏窗口位置不得写入用户窗口位置；应用重启不能直接出现在屏幕外。
- 边缘状态下左键、右键和拖拽必须先播放退出动作并恢复窗口，再执行原有命令。
- 不修改 Relay、配对、消息、账号、后台网站和远程部署代码。
- 不合并或引用 `C:\Users\14567\.codex\worktrees\rig-demo\情侣桌宠` 的分层骨骼实验。
- 保留现有 v2/v3 导入兼容行为；本计划不升级 `.cdpet` 格式。

---

### Task 1: 边缘互动契约与状态机

**Files:**
- Create: `src/pet/edgeInteraction.ts`
- Create: `src/pet/edgeInteraction.test.ts`
- Modify: `src/desktop/edgePeek.ts`

**Interfaces:**
- Produces: `EdgeSide = "left" | "right" | "top" | "bottom"`。
- Produces: `EdgePhase = "enter" | "idle" | "react" | "exit"`。
- Produces: `EdgeInteractionState = { side: EdgeSide; phase: EdgePhase } | null`。
- Produces: `transitionEdgeInteraction(state, event): EdgeInteractionState`。
- Produces: `getEdgePhaseMotion(profile, phase): EdgePhaseMotion`；`exit` 返回倒序的 `enter.frames` 与 `enter.frameAnchors`。

- [ ] **Step 1: 写失败测试覆盖完整状态流**

```ts
expect(transitionEdgeInteraction(null, { type: "SNAPPED", side: "left" }))
  .toEqual({ side: "left", phase: "enter" });
expect(transitionEdgeInteraction({ side: "left", phase: "enter" }, { type: "PHASE_FINISHED" }))
  .toEqual({ side: "left", phase: "idle" });
expect(transitionEdgeInteraction({ side: "left", phase: "idle" }, { type: "POINTER_ENTER" }))
  .toEqual({ side: "left", phase: "react" });
expect(transitionEdgeInteraction({ side: "left", phase: "react" }, { type: "PHASE_FINISHED" }))
  .toEqual({ side: "left", phase: "idle" });
expect(transitionEdgeInteraction({ side: "left", phase: "idle" }, { type: "REQUEST_EXIT" }))
  .toEqual({ side: "left", phase: "exit" });
expect(transitionEdgeInteraction({ side: "left", phase: "exit" }, { type: "PHASE_FINISHED" }))
  .toBeNull();
```

- [ ] **Step 2: 运行 RED**

Run: `pnpm vitest run src/pet/edgeInteraction.test.ts`

Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 实现纯状态机和资源类型**

状态机必须忽略无效事件：`enter` 期间重复悬浮不切状态，`exit` 期间除 `CANCEL` 外不接受新状态。`EdgePhaseMotion` 必须包含 `frames`、`fps`、`loop`、`durationMs`、`frameAnchors`；锚点采用 0..1 归一化坐标。

- [ ] **Step 4: 测试倒放与时长约束**

```ts
expect(exit.frames).toEqual([...enter.frames].reverse());
expect(exit.frameAnchors).toEqual([...enter.frameAnchors].reverse());
expect(profile.idle.durationMs).toBeGreaterThanOrEqual(5000);
```

- [ ] **Step 5: 运行 GREEN 并提交**

Run: `pnpm vitest run src/pet/edgeInteraction.test.ts`

Commit: `feat: define edge interaction state machine`

---

### Task 2: 内置 Q-girl 边缘资源注册表

**Files:**
- Create: `src/assets/builtInEdgeInteraction.ts`
- Create: `src/assets/builtInEdgeInteraction.test.ts`
- Create: `src/assets/pets/q-girl/edge-interaction/left/{enter,idle,react}/*.png`
- Create: `src/assets/pets/q-girl/edge-interaction/right/{enter,idle,react}/*.png`
- Create: `src/assets/pets/q-girl/edge-interaction/top/{enter,idle,react}/*.png`
- Create: `src/assets/pets/q-girl/edge-interaction/bottom/{enter,idle,react}/*.png`
- Delete: `src/assets/pets/q-girl/edge-peek/left.png`
- Delete: `src/assets/pets/q-girl/edge-peek/right.png`
- Delete: `src/assets/pets/q-girl/edge-peek/top.png`
- Delete: `src/assets/pets/q-girl/edge-peek/bottom.png`

**Interfaces:**
- Produces: `getBuiltInEdgeProfile(packageId, side): EdgeInteractionProfile | null`。
- Built-in Q-girl 每方向：`enter` 6 帧、`idle` 22 帧、`react` 6 帧；播放参数分别为 8fps/非循环、4fps/循环、6fps/非循环。
- Imported package 或未知 package id 必须返回 `null`。

- [ ] **Step 1: 写失败测试约束身份与资源完整性**

```ts
expect(getBuiltInEdgeProfile("builtin:q-girl", "top")?.idle.frames).toHaveLength(22);
expect(getBuiltInEdgeProfile("imported:boy", "left")).toBeNull();
expect(profile.idle.durationMs).toBe(5500);
expect(profile.enter.frames).toHaveLength(profile.enter.frameAnchors.length);
```

- [ ] **Step 2: 运行 RED**

Run: `pnpm vitest run src/assets/builtInEdgeInteraction.test.ts`

- [ ] **Step 3: 注册明确的资源路径和接触锚点**

每张 PNG 使用 640x720 RGBA 画布，对应 320x360 原生窗口。接触锚点初值为：左 `x=0.275`（屏幕内区域在锚点右侧）、右 `x=0.725`（屏幕内区域在锚点左侧）、上 `y=0.05`（屏幕内区域在锚点下侧）、下 `y=0.367`（屏幕内区域在锚点上侧）；视觉校准后可以逐帧微调，但同一方向所有帧的接触轴偏差必须小于等于 `1/640` 或 `1/720`。

- [ ] **Step 4: 校验资源文件和 alpha**

增加测试读取资源 glob，确认编号连续、尺寸一致、四角 alpha 为 0、帧数量正确。测试不得只断言字符串路径。

- [ ] **Step 5: 运行 GREEN 并提交**

Run: `pnpm vitest run src/assets/builtInEdgeInteraction.test.ts`

Commit: `feat: add q girl edge interaction assets`

---

### Task 3: 原生窗口越界定位和安全恢复

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src/desktop/windowCommands.ts`
- Modify: `src/desktop/windowCommands.test.ts`

**Interfaces:**
- `snap_window_to_edge_if_needed` 仍返回 `Option<EdgePeekSide>`，但命中后将窗口接触锚点放到当前显示器工作区边缘。
- `restore_window_from_edge_peek(side)` 将窗口恢复到边缘内侧 `SAFE_WINDOW_MARGIN_PX`。
- 隐藏位置不调用 `save_window_position`；恢复位置才保存。

- [ ] **Step 1: 修改 Rust 测试为真实越界预期**

320x360 窗口的首版目标位置：左边缘 `work_left - 88`，右边缘 `work_right - 232`，顶部 `work_top - 18`，底部 `work_bottom - 132`。这样左边缘只显示窗口锚点右侧，右边缘只显示窗口锚点左侧。测试同时覆盖工作区原点为负数的副显示器。

- [ ] **Step 2: 增加最近边缘和角落测试**

窗口同时进入两个阈值时选择距离更近的边缘；距离相同按 `left/right` 优先于 `top/bottom`，保证结果可预测。中心窗口返回 `None`。

- [ ] **Step 3: 运行 RED**

Run: `cargo test --manifest-path src-tauri/Cargo.toml edge_peek -- --nocapture`

Expected: 旧实现仍把窗口完整保留在工作区内，断言失败。

- [ ] **Step 4: 实现越界定位并停止持久化隐藏位置**

边缘检测先计算四个非负候选距离，再从触发阈值内选择最小值，禁止依赖 `if left -> if right -> if top` 的固定检查顺序。恢复计算必须对隐藏窗口几何仍然有效。

- [ ] **Step 5: 增加前端桥接回归测试**

确认 `snapWindowToEdgeIfNeeded()` 和 `restoreWindowFromEdgePeek(side)` 的命令名与参数没有改变，避免破坏 App 调用。

- [ ] **Step 6: 运行 GREEN 并提交**

Run: `cargo test --manifest-path src-tauri/Cargo.toml edge_peek -- --nocapture`

Run: `pnpm vitest run src/desktop/windowCommands.test.ts`

Commit: `fix: position edge pets across screen bounds`

---

### Task 4: 序列帧边缘渲染器

**Files:**
- Create: `src/renderer/EdgePetStage.tsx`
- Create: `src/renderer/EdgePetStage.test.tsx`
- Modify: `src/renderer/FramePetStage.tsx`
- Modify: `src/renderer/FramePetStage.test.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
- `EdgePetStage` consumes `profile`, `phase`, `scale`, `onPhaseComplete`, `onPointerEnter`, `onPointerLeave`, `onPetClick`, `onDragStart`, `onDragEnd`。
- `FramePetStage` accepts `edgeInteraction: { profile; phase } | null`，删除 `edgePeekImageUrl`。
- 每帧使用 `requestAnimationFrame` 根据单调时间计算索引；非循环阶段只触发一次 `onPhaseComplete`。

- [ ] **Step 1: 写失败测试覆盖帧播放和回调**

测试必须验证 `enter` 从 0001 前进到 0006 后只回调一次，`idle` 在 5500ms 后回到 0001，切换 phase 时重置 elapsed，悬浮事件透传。

- [ ] **Step 2: 写失败测试覆盖锚点补偿**

当当前帧锚点比 profile 接触锚点向右 0.01 时，图片 CSS 位移必须向左 `0.01 * 320px`；顶部和底部同理使用 360px。缩放的 `transform-origin` 必须等于接触锚点，保证缩放不拉开手掌。

- [ ] **Step 3: 运行 RED**

Run: `pnpm vitest run src/renderer/EdgePetStage.test.tsx src/renderer/FramePetStage.test.tsx`

- [ ] **Step 4: 实现渲染和预加载**

进入边缘状态前预加载当前方向 `enter`；进入后并行预加载 `idle/react`。加载失败时取消边缘状态并恢复普通角色，禁止显示旧静态图或空白窗口。

- [ ] **Step 5: 替换旧 CSS**

边缘 stage 使用完整 320x360 坐标面，图片保持 contain 且不改变角色比例；删除 `.pet-edge-peek-image` 和强制 `--pet-scale: 1`。边缘缩放沿接触锚点进行，不能改变窗口布局尺寸。

- [ ] **Step 6: 运行 GREEN 并提交**

Run: `pnpm vitest run src/renderer/EdgePetStage.test.tsx src/renderer/FramePetStage.test.tsx`

Commit: `feat: animate edge pet frame sequences`

---

### Task 5: App 交互编排与无资源降级

**Files:**
- Create: `src/pet/useEdgeInteraction.ts`
- Create: `src/pet/useEdgeInteraction.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

**Interfaces:**
- `useEdgeInteraction` exposes `state`, `snapAfterDrag()`, `requestExitThen(callback)`, `handlePhaseComplete()`, `handlePointerEnter()` 和 `cancel()`。
- `requestExitThen` 在 `exit` 播放完成并成功恢复窗口后只执行一次 callback；恢复失败时清理 pending callback 并回到普通状态。

- [ ] **Step 1: 写失败测试覆盖用户流程**

必须覆盖：拖到左/右/上/下后进入；进入完成后待机；悬浮触发 react；react 完成回待机；左键退出后打开环形菜单；右键退出后打开上下文菜单；拖拽退出后才调用 `startWindowDrag`。

- [ ] **Step 2: 写失败测试覆盖竞态**

连续左键两次只能恢复一次并只打开一次菜单；`exit` 中的 pointer enter 不得打断退出；组件卸载清理计时器和 pending callback。

- [ ] **Step 3: 写失败测试覆盖导入包**

选中不含边缘资源的导入包后拖到边缘，App 不调用原生 snap，继续显示导入角色；绝不能出现内置 Q-girl 边缘动画。

- [ ] **Step 4: 运行 RED**

Run: `pnpm vitest run src/pet/useEdgeInteraction.test.tsx src/app/App.test.tsx`

- [ ] **Step 5: 实现编排并清理旧静态逻辑**

删除 `builtInEdgePeekImages` 的 App 依赖和 `edgePeekImageUrl` props。状态卡、气泡、远程消息层、环形菜单和设置层在边缘阶段保持隐藏，恢复后沿用现有显示规则。

- [ ] **Step 6: 运行 GREEN 并提交**

Run: `pnpm vitest run src/pet/useEdgeInteraction.test.tsx src/app/App.test.tsx`

Commit: `feat: orchestrate edge pet interactions`

---

### Task 6: 自动化验证、实机视觉验收和构建

**Files:**
- Create: `docs/manual-verification/edge-interaction-v2.md`
- Create: `.superpowers/sdd/2026-08-07-edge-interaction-v2/implementation-report.md`
- Create: `.superpowers/sdd/2026-08-07-edge-interaction-v2/screenshots/*.png`

**Interfaces:**
- 视觉验收截图包含四方向 `idle`、四方向 `react`，共至少 8 张真实 Tauri 窗口截图。

- [ ] **Step 1: 运行完整自动化验证**

Run: `pnpm test`

Run: `pnpm typecheck`

Run: `pnpm build`

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Run: `cargo build --manifest-path src-tauri/Cargo.toml`

Run: `git diff --check`

- [ ] **Step 2: 启动真实 debug EXE**

只结束本项目 `couple-desktop-pet.exe` 进程，不影响 Xshell、浏览器或 Relay。启动 `src-tauri/target/debug/couple-desktop-pet.exe`，验证任务栏无应用图标且托盘仍可用。

- [ ] **Step 3: 四方向视觉检查**

逐方向拖拽触发，等待进入动作完成后截图；鼠标悬浮后再截图。检查角色尺寸、方向、重力、手掌缝隙、边缘裁切、绿色残边和重复肢体。

- [ ] **Step 4: 行为回归检查**

验证边缘状态下左键、右键、拖拽均能退出；设置、发送消息、托盘退出仍可用；退出并重启应用后窗口位于安全可见区域。

- [ ] **Step 5: 写实现报告并提交**

报告记录每个任务提交、RED/GREEN 命令、完整测试数量、8 张截图绝对路径和残余风险。

Commit: `docs: verify edge interaction v2`

## Self-Review

- Spec coverage：四方向姿态、自然裁切、逐帧锚点、多阶段动画、5 秒待机、点击/右键/拖拽恢复、导入包身份安全、多显示器和实机截图均有对应任务。
- Placeholder scan：无 TBD/TODO/“类似 Task N”占位内容。
- Type consistency：`EdgeSide`、`EdgePhase`、`EdgeInteractionState`、`EdgeInteractionProfile`、`requestExitThen` 在生产和测试任务中命名一致。
