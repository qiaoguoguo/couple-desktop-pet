# Platform Homepage Social Landing Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `platform-web` 首页改造成第 3 张效果图方向的情绪化官网首页，同时保留现有邀请码、注册、登录、下载和管理后台能力。

**Architecture:** 只修改 `platform-web` 前端展示层。`App.tsx` 继续负责路由和业务流，新增小型展示组件/常量以避免首页 JSX 过长；后端 API、桌面端、部署配置不参与本轮改动。

**Tech Stack:** React 19, TypeScript, Vite, Vitest, existing CSS, existing platform API client.

## Global Constraints

- 全程中文文案。
- 首页主视觉参考：`C:\Users\14567\.codex\generated_images\019fbb47-9b0e-7e71-8989-56e2bce40542\call_QCbHr2VSk6yc0VqRBgRvjnvV.png`。
- 不能修改 `platform-api/`、`server/`、`src-tauri/`、`deploy/`。
- 不能新增真实 AI 生图、资源包生成、排行榜后端或付费功能。
- 不能移除现有 `/invite`、`/register`、`/login`、`/download`、`/admin` 路由。
- 不使用版权不明图片；需要新增视觉资产时用项目自制或 ImageGen 生成资产。
- 首页不要变成管理后台、KPI 仪表盘或下载表格页。
- 验证命令必须至少包含 `pnpm platform-web:test`、`pnpm platform-web:typecheck`、`pnpm platform-web:build`。

---

### Task 1: 首页内容结构重构

**Files:**
- Modify: `platform-web/src/App.tsx`
- Test: `platform-web/src/App.test.tsx`

**Interfaces:**
- Consumes: existing `PlatformRoute`, `navigate(route: PlatformRoute)`.
- Produces: `HomePage` still accepts `{ onNavigate(route: PlatformRoute): void }`.

- [ ] **Step 1: Add/adjust homepage test expectations**

在 `platform-web/src/App.test.tsx` 中找到首页渲染相关测试，增加以下断言：

```tsx
expect(screen.getByRole("heading", { name: "每天见一面，屏幕也会变温柔" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "加入内测" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "先下载体验" })).toBeInTheDocument();
expect(screen.getByText("连续互动 27 天")).toBeInTheDocument();
expect(screen.getByText("上传参考图")).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify current homepage fails**

Run: `pnpm platform-web:test -- App.test.tsx`

Expected: FAIL because the new homepage copy is not implemented yet.

- [ ] **Step 3: Replace `HomePage` content**

在 `platform-web/src/App.tsx` 中替换 `HomePage` 的 JSX，保留函数签名。需要包含：

```tsx
<section className="landing-hero" aria-labelledby="landing-title">
  <div className="landing-copy">
    <p className="landing-kicker">轻社交桌宠 · Windows 内测中</p>
    <h1 id="landing-title">每天见一面，屏幕也会变温柔</h1>
    <p className="landing-subtitle">
      下载桌面端，导入彼此的小人。消息、串门和连续互动，让陪伴变成可看见的日常。
    </p>
    <div className="landing-actions">
      <button type="button" className="primary-action" onClick={() => onNavigate("/invite")}>
        加入内测
      </button>
      <button type="button" className="secondary-action" onClick={() => onNavigate("/download")}>
        先下载体验
      </button>
    </div>
    <p className="platform-support">Windows 内测中 · 后续支持 macOS / Linux</p>
  </div>
  <div className="landing-stage" aria-label="桌宠互动预览">
    ...
  </div>
</section>
```

`landing-stage` 内必须展示消息气泡、两个桌宠预览、`连续互动 27 天` 和 `本周暖心榜` 三行示例。

- [ ] **Step 4: Add below-fold sections in `HomePage`**

在同一 `HomePage` 中追加两个区域：

```tsx
<section className="ritual-strip" aria-label="桌宠互动流程">...</section>
<section className="workshop-preview" aria-labelledby="workshop-title">...</section>
```

`ritual-strip` 展示 `绑定好友`、`互发消息`、`桌宠串门`、`互动天数`。

`workshop-preview` 展示 `上传参考图`、`生成多版 Q 版形象`、`选择喜欢版本`、`下载资源包`、`导入桌面端`，并用文案说明“形象工坊即将开放”。

- [ ] **Step 5: Run homepage test**

Run: `pnpm platform-web:test -- App.test.tsx`

Expected: PASS.

---

### Task 2: 官网视觉样式落地

**Files:**
- Modify: `platform-web/src/app.css`
- Test: `platform-web/src/App.test.tsx`

**Interfaces:**
- Consumes: class names from Task 1.
- Produces: responsive landing page styles without affecting form/table usability.

- [ ] **Step 1: Add CSS foundation**

在 `platform-web/src/app.css` 中调整全局背景、文字色和按钮基础状态：

```css
:root {
  color: #34251f;
  background: #fff8ee;
  font-family:
    Inter, "Segoe UI", "Microsoft YaHei", system-ui, -apple-system, sans-serif;
}
```

保留现有 `button`, `input`, `table` 的基础可用性，不删除表格滚动。

- [ ] **Step 2: Style top navigation**

将 `.platform-nav` 改成官网导航：品牌感更强、按钮更轻，普通用户入口保留 `首页`、`邀请码`、`账号登录`；`管理后台` 不能视觉压过主 CTA。

- [ ] **Step 3: Style hero and stage**

新增 `.landing-hero`、`.landing-copy`、`.landing-stage`、`.pet-window`、`.pet-bubble`、`.streak-card`、`.leaderboard-preview` 等类。

目标：

- 1440 桌面宽度下，首屏左右分区，左侧文案，右侧互动预览。
- 背景使用暖奶油和柔和层次，不使用紫蓝渐变、装饰光球或深色仪表盘。
- Q 版桌宠预览用生成资产或轻量图片；若暂时没有独立资产，可使用现有项目内可授权的桌宠图片资源，不能使用版权不明外链。

- [ ] **Step 4: Style below-fold sections**

新增 `.ritual-strip`、`.ritual-item`、`.workshop-preview`、`.workshop-steps` 等类。功能项圆角不超过 `8px`，不要做卡片套卡片。

- [ ] **Step 5: Add responsive rules**

增加 `@media (max-width: 760px)`：

- 导航换行。
- hero 单列。
- 标题不溢出。
- CTA 按钮宽度适配。
- 表格下载页仍可横向滚动。

- [ ] **Step 6: Run focused tests**

Run: `pnpm platform-web:test -- App.test.tsx`

Expected: PASS.

---

### Task 3: 路由与真实业务流回归

**Files:**
- Modify: `platform-web/src/App.test.tsx`
- Modify only if needed: `platform-web/src/App.tsx`

**Interfaces:**
- Consumes: existing API client mock patterns.
- Produces: homepage CTA navigates to existing routes.

- [ ] **Step 1: Add CTA navigation tests**

新增或扩展测试：

```tsx
await user.click(screen.getByRole("button", { name: "加入内测" }));
expect(screen.getByRole("heading", { name: "内测邀请码" })).toBeInTheDocument();
```

另一个测试：

```tsx
await user.click(screen.getByRole("button", { name: "先下载体验" }));
expect(screen.getByRole("heading", { name: "请先登录后下载" })).toBeInTheDocument();
```

- [ ] **Step 2: Run tests and fix route regressions**

Run: `pnpm platform-web:test -- App.test.tsx`

Expected: PASS. If a CTA route fails, fix only `HomePage` button handlers.

- [ ] **Step 3: Verify admin/download pages still render**

Run: `pnpm platform-web:test`

Expected: all platform-web tests pass.

---

### Task 4: 构建验证与交付说明

**Files:**
- Modify only if needed: `platform-web/src/App.tsx`
- Modify only if needed: `platform-web/src/app.css`

**Interfaces:**
- Consumes: completed homepage implementation.
- Produces: verified local frontend build.

- [ ] **Step 1: Run typecheck**

Run: `pnpm platform-web:typecheck`

Expected: exit code 0.

- [ ] **Step 2: Run frontend build**

Run: `pnpm platform-web:build`

Expected: exit code 0.

- [ ] **Step 3: Run root typecheck**

Run: `pnpm typecheck`

Expected: exit code 0.

- [ ] **Step 4: Provide implementation summary**

交付格式必须包含：

```text
实现内容：
- ...

验证：
- pnpm platform-web:test
- pnpm platform-web:typecheck
- pnpm platform-web:build
- pnpm typecheck

未做：
- 未实现真实 AI 生图资源包服务。
- 未实现真实排行榜后端。
- 未修改桌面端。
```
