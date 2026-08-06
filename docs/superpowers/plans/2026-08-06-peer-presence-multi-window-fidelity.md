# Peer Presence Multi-Window Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Keep every task test-first, commit after each green task, and stop for review if platform behavior differs from the approved specification.

**Goal:** 将当前嵌入主桌宠窗口的在线提示，重构为与批准渲染图一致的多透明窗口陪伴场景，并在在线、离线、暂停、拖动、多屏和消息输入场景下稳定运行。

**Architecture:** `main` 保持唯一业务主窗口和实时连接所有者；新增 `peer-presence`、`peer-link`、`offline-nest` 三个透明卫星窗口。Rust `desktop` 层集中负责创建、定位、缩放和生命周期，React 卫星入口只渲染状态。资源包 v3 增加可选在线/离线头像，旧包缺失时回退到预览图。

**Tech Stack:** Tauri 2、Rust、React 19、TypeScript、Vite、Vitest、Testing Library、CSS keyframes、PNG 位图资源。

**Global Constraints:**

- 设计基准：`docs/superpowers/specs/2026-08-06-peer-presence-multi-window-fidelity-design.md`。
- 视觉目标：`docs/assets/references/peer-presence-emotional-target.png`。
- 不修改 Relay、配对、服务端和 WebSocket 协议；卫星窗口不得建立实时连接。
- 不增加托盘或角落状态徽章；初始 EXE 仍只内置女孩完整包。
- 所有卫星窗口透明、无边框、置顶、跳过任务栏；仅 `peer-presence` 可点击。
- 设置、消息输入、远程消息播放、贴边半隐藏时，整组陪伴场景隐藏。
- 生成位图需使用内置 Image Gen，并逐张检查透明通道。

## File Map

新增：

- `src-tauri/src/companion_windows.rs`
- `src/desktop/companionWindowCommands.ts` 及测试
- `src/sync/companion/` 下状态契约、三类 Surface、动画导演和 CSS
- `src/assets/ui/presence/*.png`、`src/assets/fonts/*`
- `scripts/package_pet_resource.ps1`、`docs/pet-package-v3.md`

修改：

- `src-tauri/src/main.rs`、`commands.rs`、`pet_packages.rs`、`capabilities/default.json`
- `src/main.tsx`、`src/app/App.tsx`、`src/app/App.test.tsx`、`src/app/app.css`
- `src/assets/petPackageContract.ts`、`petPackageRegistry.ts`、`builtInPetManifest.ts` 及测试
- 女孩和男孩完整 v3 输出包

退役：`src/sync/PeerPresenceLayer.tsx` 及旧嵌入式 `.peer-presence-*` CSS。

---

## Task 1: 扩展资源包头像契约

**Files:** `src-tauri/src/pet_packages.rs`、`src/assets/petPackageContract.ts`、`src/assets/petPackageRegistry.ts` 及测试。

1. 先写 Rust 失败测试，证明根目录 `portrait.png` 和 `portrait-offline.png` 被允许，嵌套路径和 JPG 被拒绝，摘要能返回两个可选路径。

```rust
#[test]
fn summary_reports_optional_presence_portraits() {
    let package = create_valid_package_fixture();
    write_png(package.path().join("portrait.png"));
    write_png(package.path().join("portrait-offline.png"));
    let summary = read_package_summary(package.path()).unwrap();
    assert!(summary.portrait_path.unwrap().ends_with("portrait.png"));
    assert!(summary.offline_portrait_path.unwrap().ends_with("portrait-offline.png"));
}
```

2. 运行 RED：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml pet_packages
```

3. 在 Rust 摘要结构增加两个 `Option<String>` 字段；白名单仅允许根目录固定文件名；存在时复用现有 PNG 解码、尺寸和文件大小校验，缺失不报错。

```rust
#[serde(rename_all = "camelCase")]
pub struct ImportedPetPackageSummary {
    // existing fields
    pub portrait_path: Option<String>,
    pub offline_portrait_path: Option<String>,
}
```

4. 写 TS 失败测试：有专用头像时优先使用，旧包字段为 `null` 时两种状态都回退到 `previewUrl`。

```ts
expect(resolveImportedPetPackage(withPortraits)).toMatchObject({
  portraitUrl: expect.stringContaining("portrait.png"),
  offlinePortraitUrl: expect.stringContaining("portrait-offline.png"),
});
expect(resolveImportedPetPackage(oldPackage).portraitUrl).toBe(oldResolved.previewUrl);
```

5. 实现 TS 契约：

```ts
interface ImportedPetPackageSummary {
  portraitPath: string | null;
  offlinePortraitPath: string | null;
}
interface ResolvedPetPackage {
  portraitUrl: string | null;
  offlinePortraitUrl: string | null;
}
```

6. 运行 GREEN 并提交：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml pet_packages
npm test -- --run src/assets/petPackageRegistry.test.ts
git add src-tauri/src/pet_packages.rs src/assets/petPackageContract.ts src/assets/petPackageRegistry.ts src/assets/petPackageRegistry.test.ts
git commit -m "feat: add presence portraits to pet packages"
```

---

## Task 2: 建立陪伴场景数据契约和 Tauri 前端桥接

**Files:** 新建 `src/sync/companion/companionSceneTypes.ts`、`companionSceneState.ts`、`src/desktop/companionWindowCommands.ts` 及测试。

1. 写失败测试：未知 presence 抛错、空 URL 归一为 `null`、比例限制到 `0.85..1.25`、Tauri invoke 使用准确 camelCase payload、listen 返回 unlisten。

```ts
expect(normalizeCompanionSceneState({ ...online, sceneScale: 2 }).sceneScale).toBe(1.25);
expect(() => normalizeCompanionSceneState({ presence: "busy" })).toThrow();
await updateCompanionScene(scene);
expect(invoke).toHaveBeenCalledWith("update_companion_scene", { state: scene });
```

2. 运行 RED：

```powershell
npm test -- --run src/sync/companion/companionSceneState.test.ts src/desktop/companionWindowCommands.test.ts
```

3. 实现稳定类型和桥接：

```ts
export type CompanionPresence = "hidden" | "online" | "offline";
export interface CompanionSceneContentState {
  presence: CompanionPresence;
  portraitUrl: string | null;
  offlinePortraitUrl: string | null;
  sceneScale: number;
  suspended: boolean;
}
export interface CompanionSceneViewState extends CompanionSceneContentState {
  side: "left" | "right";
  compact: boolean;
  revision: number;
}

export const updateCompanionScene = (state: CompanionSceneContentState) =>
  invoke<CompanionSceneViewState>("update_companion_scene", { state });
export const readCompanionScene = () =>
  invoke<CompanionSceneViewState>("read_companion_scene");
export const requestOpenMessageComposer = () =>
  invoke<void>("request_open_message_composer");
```

4. 运行 GREEN 并提交。

---

## Task 3: 实现 Rust 多窗口几何计算器

**Files:** 新建 `src-tauri/src/companion_windows.rs`，修改 `src-tauri/src/main.rs`。

1. 写纯函数失败测试，覆盖右侧完整布局、左侧镜像、空间不足 compact、125% DPI、工作区边缘和不覆盖主宠物。

```rust
#[test]
fn mirrors_to_the_left_near_the_right_edge() {
    let layout = calculate_layout(
        Rect::new(0, 0, 1920, 1080),
        Rect::new(1600, 560, 320, 360),
        1.0,
    );
    assert_eq!(layout.side, CompanionSide::Left);
    assert!(layout.presence.right() <= layout.main.x);
}
```

2. 运行 RED：`cargo test --manifest-path src-tauri/Cargo.toml companion_windows`。

3. 实现固定逻辑尺寸：`peer-presence` 168x176、`peer-link` 196x112、`offline-nest` 138x116；物理像素计算，按当前显示器 scale factor 转换；场景比例 clamp 到 `0.85..1.25`。

```rust
pub fn calculate_layout(work: Rect, main: Rect, scale: f64) -> CompanionLayout {
    let scale = scale.clamp(0.85, 1.25);
    let right = work.right() - main.right();
    let left = main.x - work.x;
    let side = if right >= 214.0 || right >= left {
        CompanionSide::Right
    } else {
        CompanionSide::Left
    };
    build_mirrored_layout(work, main, side, scale)
}
```

4. GREEN 后提交 `feat: calculate companion window layout`。

---

## Task 4: 实现卫星窗口协调器和生命周期

**Files:** `src-tauri/src/companion_windows.rs`、`commands.rs`、`main.rs`、`capabilities/default.json`。

1. 写 reducer 失败测试：suspended 隐藏全部；online 显示 presence/link；offline 显示 presence/link/nest；compact 只显示 presence；revision 单调递增。

2. 创建三个动态 WebviewWindow：

```rust
WebviewWindowBuilder::new(app, label, WebviewUrl::App(route.into()))
    .inner_size(width, height)
    .transparent(true)
    .decorations(false)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .visible(false)
    .build()
```

路由分别是 `index.html?surface=peer-presence`、`peer-link`、`offline-nest`。创建后对 link/nest 调用 `set_ignore_cursor_events(true)`；presence 保持可点击。

3. 实现命令：

```rust
#[tauri::command]
pub fn update_companion_scene(app: AppHandle, state: CompanionSceneContentState)
    -> Result<CompanionSceneViewState, String>;
#[tauri::command]
pub fn read_companion_scene(state: State<CompanionWindowCoordinator>)
    -> CompanionSceneViewState;
#[tauri::command]
pub fn hide_companion_scene(app: AppHandle) -> Result<(), String>;
#[tauri::command]
pub fn request_open_message_composer(app: AppHandle) -> Result<(), String> {
    app.emit_to("main", "open-message-composer", ())
        .map_err(|error| error.to_string())
}
```

协调器保存最后状态，避免新窗口先错过 event。主窗口移动时同步位置；主窗口隐藏时隐藏卫星；恢复时按最后状态恢复。退出不持久化离线窝。

4. capability 的 `windows` 改为 `main`、`peer-presence`、`peer-link`、`offline-nest`，不得增加文件、Shell 或网络权限。

5. 验证并提交：

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml companion_windows
cargo check --manifest-path src-tauri/Cargo.toml
git add src-tauri/src/companion_windows.rs src-tauri/src/commands.rs src-tauri/src/main.rs src-tauri/capabilities/default.json
git commit -m "feat: coordinate companion satellite windows"
```

---

## Task 5: 增加多窗口 React 入口

**Files:** `src/main.tsx`，新建 `src/sync/companion/CompanionSurfaceRoot.tsx` 和三类 Surface 及测试。

1. 写失败测试：三个 query surface 只挂载对应组件，卫星入口不 import/mount `App` 或实时连接模块；首次 mount 先读取当前状态再订阅更新。

```tsx
const surface = new URLSearchParams(window.location.search).get("surface");
createRoot(root).render(surface ? <CompanionSurfaceRoot surface={surface} /> : <App />);
```

2. 实现 `useCompanionSceneState`，同时调用 `readCompanionScene()` 和 `listenCompanionScene()`，卸载时取消订阅并忽略迟到 Promise。

3. `PeerPresenceSurface` 在线时可点击并 invoke `requestOpenMessageComposer`；离线 disabled。所有图片 `onError` 切换到回退 URL或隐藏，禁止破图标。

```tsx
<button
  className="peer-orbit"
  disabled={state.presence !== "online"}
  onClick={() => void requestOpenMessageComposer()}
>
  <img src={selectPresencePortrait(state)} alt="对方桌宠头像" />
</button>
```

4. GREEN：`npm test -- --run src/sync/companion/CompanionSurfaceRoot.test.tsx && npm run typecheck`，提交。

---

## Task 6: 生成视觉资源并实现动画导演层

**Files:** `src/assets/ui/presence/*.png`、`src/assets/fonts/*`、`src/sync/companion/presenceMotionDirector.ts`、`companion.css` 及测试。

1. 使用内置 Image Gen 生成透明 PNG，无文字：

- `heart-badge.png`：珊瑚粉圆形聊天徽章，暖白爱心。
- `heart-travel.png`：发光珊瑚粉爱心粒子。
- `moon-badge.png`：柔和灰紫月亮/睡眠徽章。
- `offline-nest.png`：暖白枕头小窝，珊瑚粉包边。

逐张检查透明通道和发丝/软边，无绿色或白色底。

2. 从 Noto Fonts 官方发行版加入 `NotoSansSC-Regular.woff2` 和原始 `OFL.txt`，不访问 CDN。

3. 写动画 reducer 失败测试：online enter 700ms -> idle 5600ms；hover 180ms；press 320ms；offline transition 900ms -> idle 6000ms；reduced motion 只淡入 180ms；卸载清除 timer。

```ts
export type PresenceMotionPhase =
  | "hidden" | "enter" | "online-idle" | "hover" | "press"
  | "offline-transition" | "offline-idle" | "reduced-enter";
```

4. 按目标图实现固定像素：头像圆 82px、在线徽章 28px、主胶囊 78x30、次胶囊 86x30、垂直间距 7px；link 用珊瑚虚点弧线和 3 个错峰粒子；nest 仅离线显示。

5. CSS 空白区域 `pointer-events:none`，头像和状态卡 `pointer-events:auto`；不得形成黑框或方形遮罩。

6. GREEN 后执行 `npm run typecheck`、`npm run build`，提交。

---

## Task 7: 接入主 App 并删除旧嵌入层

**Files:** `src/app/App.tsx`、`App.test.tsx`、`app.css`、旧 `PeerPresenceLayer`。

1. 写失败测试：已配对在线投影 `online` + 对方头像；离线投影 `offline`；设置/消息框/远程消息/贴边都投影 `suspended:true`；页面中不存在旧 layer；卫星事件打开现有居中消息框。

```tsx
const companionScene = useMemo<CompanionSceneContentState>(() => ({
  presence: !isPaired ? "hidden" : peerOnline ? "online" : "offline",
  portraitUrl: peerPackage?.portraitUrl ?? peerPackage?.previewUrl ?? null,
  offlinePortraitUrl:
    peerPackage?.offlinePortraitUrl ?? peerPackage?.portraitUrl ?? peerPackage?.previewUrl ?? null,
  sceneScale: settings.companionSceneScale ?? 1,
  suspended: settingsOpen || messageComposerOpen || activeRemoteMessage !== null || edgePeekSide !== null,
}), [/* exact dependencies */]);

useEffect(() => { void updateCompanionScene(companionScene); }, [companionScene]);
```

2. 监听 `open-message-composer`；仅已配对且对方在线时调用现有 `openMessageComposerPanel`，不得新增窗口尺寸逻辑。

3. 删除旧 JSX、组件和旧 CSS，将旧测试改成卫星命令集成回归测试。

4. GREEN：App 测试、typecheck、build，提交 `refactor: move peer presence out of the pet window`。

---

## Task 8: 生成角色头像并重打完整 v3 包

**Files:** 内置女孩和 `output/pet-packages/q-{girl,boy}-complete-v3`，`builtInPetManifest.ts`、打包脚本和文档。

1. 用现有女孩/男孩角色作为身份参考，经内置 Image Gen 各生成在线和离线头像。512x512 透明底、胸部以上、头部占约 68%；在线温柔微笑，离线闭眼困倦且轻降饱和；无文字、边框、额外人物。

2. 写测试证明内置女孩使用专用头像；旧导入包仍回退预览。

3. 内置静态映射：

```ts
import qGirlPortraitUrl from "./pets/q-girl/portrait.png";
import qGirlOfflinePortraitUrl from "./pets/q-girl/portrait-offline.png";
```

4. 新建 `scripts/package_pet_resource.ps1`：校验 `pet.json`、`preview.png`，将目录内容压缩并重命名为 `.cdpet`。解析绝对路径，不递归删除，不碰调用方以外目录。

```powershell
param([Parameter(Mandatory=$true)][string]$PackageDirectory,
      [Parameter(Mandatory=$true)][string]$OutputFile)
$root = (Resolve-Path -LiteralPath $PackageDirectory).Path
foreach ($required in @("pet.json", "preview.png")) {
  if (-not (Test-Path -LiteralPath (Join-Path $root $required))) {
    throw "Missing required package file: $required"
  }
}
$zip = [IO.Path]::ChangeExtension($OutputFile, ".zip")
Compress-Archive -Path (Join-Path $root "*") -DestinationPath $zip -Force
Move-Item -LiteralPath $zip -Destination $OutputFile -Force
```

5. `docs/pet-package-v3.md` 写明两个头像可选、旧包回退、推荐构图/透明规范、动作数仍可为 1、完整打包命令。

6. 重打并实际导入两个包，确认动作数量不减少：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package_pet_resource.ps1 -PackageDirectory output/pet-packages/q-girl-complete-v3 -OutputFile output/q-girl-complete-v3.cdpet
powershell -ExecutionPolicy Bypass -File scripts/package_pet_resource.ps1 -PackageDirectory output/pet-packages/q-boy-complete-v3 -OutputFile output/q-boy-complete-v3.cdpet
```

7. 测试通过后提交 `feat: package dedicated peer presence portraits`。

---

## Task 9: 完整回归和真实 EXE 视觉验收

1. 自动化验证：

```powershell
npm test -- --run
npm run typecheck
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri build -- --debug
```

任何失败先找根因，不删测试、不放宽断言、不用延时掩盖竞态。

2. 运行 `src-tauri/target/debug/couple-desktop-pet.exe`，逐项检查：

- 任务栏无软件图标，托盘存在；三个卫星窗口也不进任务栏。
- 在线显示目标图同构的圆头像、角标、两层胶囊和弧形粒子。
- 离线切换文案并显示小窝；退出后无残留窗口。
- 拖动主宠物时整组同步，多屏不漂移；靠右时镜像到左侧。
- Windows 125% 缩放尺寸和清晰度正确。
- link/nest 点击穿透；在线头像单击打开现有消息输入框，不白屏、不卡死。
- 设置、消息输入、远程消息和贴边时隐藏，结束后恢复。
- reduced-motion 下无持续位移或缩放。

3. 保存真实 EXE 截图到：

- `output/qa/peer-presence-online.png`
- `output/qa/peer-presence-offline.png`
- `output/qa/peer-presence-left-mirror.png`
- `output/qa/peer-presence-125-percent.png`

逐张与 `docs/assets/references/peer-presence-emotional-target.png` 对照。明显不一致必须继续调整，不以“功能完成”代替视觉验收。

4. 最终检查：

```powershell
git diff --check
git status --short
git log --oneline -12
```

只提交本功能文件，不覆盖用户未提交改动。最后提交 `test: verify peer presence visual fidelity`。

## Final Acceptance

- [ ] 视觉结构与批准渲染图一致，不再是主窗口内的小标签。
- [ ] 多窗口透明、无边框、跳过任务栏，交互区域正确。
- [ ] 在线/离线实时切换，无额外 WebSocket。
- [ ] 设置、消息、远程动画、贴边时正确暂停。
- [ ] 移动、多屏、左右镜像、125% DPI 稳定。
- [ ] 新头像可选，旧资源包安全回退。
- [ ] 女孩和男孩完整 v3 包均重打且可导入；初始 EXE 只内置女孩。
- [ ] 全部测试、类型检查、Rust 检查、构建及真实 EXE 截图验收通过。
