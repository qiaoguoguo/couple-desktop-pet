# 桌宠互动菜单 Q 版环绕弹出设计

## 背景

当前桌面端交互存在三个体验问题：

- 鼠标悬浮到桌宠窗口时，右下角会显示“设置”按钮；用户希望设置只通过右键菜单进入，默认桌宠界面更干净。
- 左键单击桌宠打开互动选项时，实际桌面端经常需要点击两次。代码层面的根因是 `FramePetStage` 在 `pointerdown` 时立即调用 `startWindowDrag()`，原生窗口拖拽会吞掉普通 click，导致第一次点击没有稳定触发互动菜单。
- 互动选项当前是普通矩形按钮网格，情绪价值弱；用户希望选项围绕桌宠弹出，并且按钮有 Q 版风格。

本设计只改本地桌宠交互体验，不改远程消息、绑定、资源包格式、后台系统或官网。

## 目标

1. 设置按钮不再因 hover 或 focus 自动显示。
2. 设置入口保留在右键菜单中，右键菜单仍包含设置、重置位置、隐藏、退出。
3. 左键单击桌宠一次即可打开或关闭互动选项。
4. 拖拽桌宠仍可用，并且真实拖拽后不会误触发互动菜单。
5. 互动菜单以环绕桌宠的方式弹出，6 个互动按钮围绕宠物分布。
6. 每个互动按钮使用 Q 版贴纸风格，有轻量弹出动画和 hover/active 反馈。
7. 新增按钮资源由项目自制生成，不能引入版权不明素材。

## 非目标

- 不新增互动动作类型。
- 不改现有 6 个互动动作的动画帧。
- 不改 `interactionOptions` 的语义、文案或 motion scene。
- 不改设置面板功能。
- 不改点击穿透、远程消息、relay、用户系统。
- 不引入新的 UI 库。

## 推荐方案

采用“延迟拖拽 + 环绕菜单 + Q 版按钮资源”的方案。

### 1. 设置入口

移除 CSS 中这类 hover/focus 规则：

```css
.app-shell:hover .settings-toggle.is-hidden,
.app-shell:focus-within .settings-toggle.is-hidden
```

保留：

- `settings-toggle.is-hidden`：默认透明且不可点击。
- `settings-toggle.is-visible`：设置面板打开时可见，用于表示面板状态。
- 设置面板内“关闭设置”按钮继续可用。
- 右键菜单中的“设置”继续打开设置面板。

体验结果：

- 用户不打开设置时，桌宠区域不再出现悬浮设置按钮。
- 用户右键桌宠，点击“设置”打开设置面板。
- 打开设置后可以点“关闭设置”关闭。

### 2. 左键单击与拖拽

把 `FramePetStage` 的交互从“按下立即开始拖拽”改成“移动超过阈值才开始拖拽”。

行为规则：

- `pointerdown`：只记录起点和 pointer id，不调用 `startWindowDrag()`。
- `pointermove`：移动距离超过 `dragClickThresholdPx` 后，若尚未开始拖拽，则调用 `onDragStart()` 并标记为 dragging。
- `pointerup`：
  - 如果已经 dragging，则调用 `onDragEnd()`，并抑制后续 click。
  - 如果没有 dragging，则不调用 `onDragEnd()`，让 `click` 正常触发 `onPetClick()`。
- `pointercancel` / 有效 `pointerleave`：只有已经 dragging 时才结束拖拽。

阈值继续使用当前 `dragClickThresholdPx = 4`，避免轻微手抖直接变拖拽。

### 3. 环绕互动菜单

互动菜单从原来的固定两列网格改为中心锚点周围的 6 个按钮。

布局规则：

- 菜单容器锚点仍由 `App.tsx` 计算，默认以宠物底部上方区域为中心。
- `InteractionMenu` 使用绝对定位容器，容器本身不显示背景卡片。
- 每个按钮用 CSS 变量接收极坐标或位移：
  - `--menu-x`
  - `--menu-y`
  - `--menu-delay`
- 6 个按钮围绕宠物呈半环或轻微椭圆环分布，避免遮挡宠物脸部：
  - 左上
  - 上方偏左
  - 上方偏右
  - 右上
  - 左下
  - 右下
- 桌宠窗口尺寸仍是当前小窗口，因此按钮整体应控制在窗口内，不扩大到屏幕级浮层。

建议坐标以菜单中心为基准：

```text
撒娇卖萌: -76px, -88px
敲电脑:    0px, -112px
打招呼:   76px, -88px
求抱抱:  -92px, -12px
生气鼓脸: 92px, -12px
困困:      0px, 62px
```

如果当前窗口高度不足，允许整体向上偏移 8 到 16px。

### 4. 弹出动画

按钮打开时使用错峰弹出动画。

动效要求：

- 每个按钮从中心附近开始，`opacity: 0`、`scale: 0.72`。
- 180ms 到 260ms 内弹到最终位置，使用轻微 overshoot 的 cubic-bezier。
- 每个按钮延迟递增 18ms 到 28ms。
- hover 时轻微上浮和放大，active 时略微压下。
- 不使用复杂物理库；CSS keyframes 足够。

动画应尊重 `prefers-reduced-motion: reduce`：

- reduce 时取消弹出位移动画，只保留直接显示。

### 5. Q 版按钮视觉

按钮使用“贴纸徽章 + 图标 + 文案”的结构。

DOM 建议：

```tsx
<button className="pet-interaction-button" style={...}>
  <span className="pet-interaction-icon" aria-hidden="true">
    <img src={optionIconUrl} alt="" />
  </span>
  <span className="pet-interaction-label">{option.label}</span>
</button>
```

视觉要求：

- 圆润但不是普通系统按钮，整体像手账贴纸。
- 每个按钮 58 到 70px 宽，高度 54 到 64px。
- 图标在上、文字在下。
- 文案仍由 HTML 渲染，不让 AI 图片生成文字。
- 按钮背景使用暖白、浅粉、浅桃、淡紫等柔和色，但不要变成单一粉色主题。
- 边框可以是深棕或暖灰描边。
- hover/active 反馈不能改变布局尺寸。

### 6. 按钮资源

生成 6 个无文字透明 PNG 图标，保存到：

```text
src/assets/ui/interaction-buttons/
```

文件名：

```text
act-cute.png
act-typing.png
act-wave.png
act-hug.png
act-pout.png
act-drowsy.png
```

图标语义：

- `act-cute.png`：小爱心或害羞手势贴纸。
- `act-typing.png`：迷你电脑/键盘贴纸。
- `act-wave.png`：挥手小手或气泡线贴纸。
- `act-hug.png`：张开双臂/拥抱心形贴纸。
- `act-pout.png`：鼓脸表情贴纸。
- `act-drowsy.png`：睡意月亮或困困气泡贴纸。

资源约束：

- 透明背景 PNG。
- 单个图标建议 256x256。
- 无文字、无水印、无额外角色。
- 风格与当前 Q 版小人协调：柔和、可爱、轻量、贴纸感。

### 7. 可访问性与关闭规则

- 互动菜单继续使用 `role="menu"`，按钮继续使用 `role="menuitem"`。
- `Escape` 关闭互动菜单和右键菜单。
- 点击菜单外关闭互动菜单。
- 点击桌宠本体时如果菜单已打开，则关闭；如果未打开，则打开。
- 右键打开上下文菜单时关闭互动菜单。
- 选择互动动作后关闭菜单并播放对应动作。

## 测试要求

新增或更新测试：

- `FramePetStage.test.tsx`
  - 单击不调用 `onDragStart` / `onDragEnd`，会调用 `onPetClick`。
  - 移动超过阈值才调用 `onDragStart`。
  - 拖拽结束后的 click 被抑制。
- `InteractionMenu.test.tsx`
  - 打开时渲染 6 个 menuitem。
  - 每个 menuitem 有图标容器和 Q 版按钮 class。
  - 每个按钮带有用于错峰动画的 style 变量。
  - 点击按钮仍调用对应 action。
- `App.test.tsx`
  - 默认设置按钮保持隐藏，hover/focus 不使其显示。
  - 右键菜单仍能打开设置。
  - 左键单击一次能打开互动菜单。

验证命令：

```bash
pnpm test -- src/renderer/FramePetStage.test.tsx src/interaction/InteractionMenu.test.tsx src/app/App.test.tsx
pnpm test
pnpm typecheck
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri build --debug
```

## 验收标准

- 鼠标悬浮桌宠窗口时，不出现右下角设置按钮。
- 单击右键可以打开右键菜单，并通过“设置”进入设置面板。
- 左键单击桌宠一次即可打开互动菜单。
- 轻微点击不会触发窗口拖拽。
- 明确拖动桌宠时窗口仍能移动，拖动后不会误弹互动菜单。
- 互动菜单 6 个按钮围绕桌宠错峰弹出。
- 按钮呈 Q 版贴纸风格，图标和文字清晰，窗口内不互相遮挡。
- 最新 debug exe 可直接体验。

## 风险

- Tauri 原生窗口拖拽可能与 Web pointer 事件存在平台差异，本轮优先验证 Windows。
- 环绕菜单受当前小窗口尺寸限制，按钮不能无限外扩；如果后续桌宠尺寸可配置到很大，需要让菜单半径随 scale 调整。
- AI 生成图标可能风格略有差异，需要通过本地裁切、缩放和统一 CSS 背景来降低不一致感。
