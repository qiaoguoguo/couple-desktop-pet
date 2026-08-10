# 情侣桌宠项目交接文档

更新时间：2026-08-10

本文面向下一任 Codex/代码代理，用于快速接手当前项目。优先把本文当成入口，再按需阅读 `AGENTS.md`、`README.md`、`docs/superpowers/specs/` 和 `docs/superpowers/plans/`。

## 1. 当前接手结论

项目已经从“本地桌宠 MVP”推进到“跨平台桌宠 + 一对一远程互动 + 资源包导入 + 官网/账号下载平台 + macOS QA 包”的阶段。当前最重要的状态是：

- 主代码仓库在 `C:\Users\14567\.codex\worktrees\6515\情侣桌宠`，不是早期壳目录 `C:\Users\14567\Documents\情侣桌宠`。
- 当前分支：`codex/local-pet-mvp-scaffold`。
- 当前 HEAD：`d3b6609cd83ec1ebcf4b6e84686fa2b08d1cb8a8`。
- 远端公开仓库：`https://github.com/qiaoguoguo/couple-desktop-pet`。
- 当前 git 状态仅有既有未跟踪目录 `?? .superpowers/brainstorm/`，不要碰它。
- 桌面端主要功能基本可用，但动画表现、跨屏情绪价值和资源生成平台仍是后续重点。
- macOS QA DMG 已产出并通过 CI 验证，但不是正式公开发布包；正式发布仍需要 Apple Developer 签名、公证和真实 Mac 人工验收材料。
- “把 macOS 版本放到官方下载页面”的工作尚未完成。当前平台下载页仍主要按 `windows` 查询 release。

## 2. 协作模式和线程

必须遵守仓库根目录 `AGENTS.md` 的固定后台开发任务模式。

- 固定后台开发任务：`019fd712-d3bb-7c03-b4f1-36fd881de0a0`
- 固定代码审核任务：`019fdf79-a03c-7472-9cad-c1264d6cfaa0`
- 主代理职责：需求澄清、范围控制、架构规范、任务拆分、代码审核、验收总结。
- 后台开发任务职责：主要编码、测试、构建、修复。
- 用户明确要求：项目推进过程中全程使用中文交流。

对下一任代理的建议：

- 小文档、小脚本、小范围修复可由主代理直接做。
- 涉及桌面端核心、Tauri/Rust、平台 API、CI、发布流程的代码改动，优先发给固定后台开发任务，主代理复审。
- 不要静默降级模型或绕开固定任务模式；如果无法继续固定任务，要说明限制。

## 3. 目录地图

```text
C:\Users\14567\.codex\worktrees\6515\情侣桌宠
├─ src/                         # 桌面端 React 前端
│  ├─ app/                       # 主桌宠应用入口，状态汇合点
│  ├─ assets/                    # 内置资源、资源包契约、按钮图标
│  ├─ bubble/                    # 普通气泡
│  ├─ desktop/                   # Tauri 桌面命令封装
│  ├─ interaction/               # 环绕互动菜单
│  ├─ message/                   # 发送消息输入面板
│  ├─ motion/                    # 场景/动画导演层
│  ├─ pet/                       # 边缘交互
│  ├─ pet-core/                  # 状态机、调度器、motion pool
│  ├─ renderer/                  # PNG 序列帧渲染
│  ├─ settings/                  # 设置状态和设置面板
│  ├─ status/                    # 对方在线/离线/趣味状态卡
│  └─ sync/                      # 远程绑定、WebSocket、消息同步
├─ src-tauri/                    # Tauri/Rust 桌面壳和系统命令
├─ server/                       # 一对一 Relay 中继服务
├─ platform-api/                 # 账号/下载/后台 API
├─ platform-web/                 # 官网、登录、下载页、管理后台
├─ shared/                       # Relay 和平台协议共享类型
├─ e2e/                          # macOS/Windows WebDriverIO 测试
├─ scripts/                      # 资源打包、macOS gate、interop 工具
├─ deploy/                       # Relay 和平台 docker compose
└─ docs/                         # 设计、计划、手工验收和资源包文档
```

## 4. 已实现功能概览

### 4.1 桌面端

技术栈：

- Tauri 2
- React 19
- TypeScript
- Rust commands
- PNG 序列帧渲染

当前桌面端能力：

- 透明无边框主窗口。
- 默认置顶。
- Windows 下跳过任务栏，只保留托盘入口。
- 右键弹出上下文菜单：设置、重置位置、隐藏、退出。
- 左键弹出 Q 版环绕互动菜单。
- 设置面板支持缩放、自动移动、活动范围、气泡、置顶、点击穿透、重置位置。
- 点击穿透开启后，打开设置会自动恢复可点击，避免设置页挡住后无法关闭。
- 消息输入不在设置页中，走独立消息输入面板。
- 收到远程消息后必须鼠标滑过/交互确认后才消失，避免错过消息。
- 消息气泡支持打字机式逐字显示。
- 在线/离线/趣味状态卡在主窗口内显示，不再使用多个卫星窗口。
- 状态支持：在线、离线、摸鱼中、发呆中、加班中。底层枚举是 `slacking`、`dazing`、`overtime`。
- 桌面边缘半隐藏功能存在，但用户近期要求先不要继续改这个功能。

主入口：

- `src/app/App.tsx`

风险提示：

- `src/app/App.tsx` 是高耦合汇合点，包含设置、资源包、同步、消息、边缘交互、菜单、状态卡等逻辑。后续应考虑逐步拆分，但不要在无明确任务时做大重构。
- 桌面边缘半隐藏效果目前用户不满意，但最近明确说“先不用改这个”。不要主动改 edge 行为。
- 消息输入、点击穿透、设置面板、远程消息确认之间存在窗口输入状态联动，改动前必须补测试。

### 4.2 内置形象和资源包

当前内置形象：

- `builtin:q-girl`
- 名称：`Q 版小人`
- 资源目录：`src/assets/pets/q-girl/`
- 内置按钮图标：`src/assets/ui/interaction-buttons/`

资源包最新推荐格式：

- `formatVersion: 3`
- `renderer: "motion-pool"`
- `.cdpet` 本质是 zip。
- 最少只需要一个 motion。
- 多个 motion 会作为待机/ambient 池按权重随机播放。
- 带 `message` 标签的 motion 会优先用于远程消息触发。

关键文档：

- `docs/pet-resource-pack-format.md`
- `docs/pet-package-v3.md`

关键实现：

- `src-tauri/src/pet_packages.rs`
- `src/assets/petPackageContract.ts`
- `src/assets/petPackageRegistry.ts`
- `src/pet-core/motionPoolDirector.ts`

导入后存储：

- 应用数据目录下的 `pet-packages/`
- Windows 通常在 `%APPDATA%` 对应 Tauri app data 目录。
- 运行时不依赖原始 `.cdpet` 文件路径。

当前产品语义：

- 六个环绕按钮是产品功能入口，不再要求资源包必须提供六个同名动作。
- “敲电脑”按钮当前复用为发送消息入口。
- 所有 v3 motion 都可当待机/环境动作随机触发。
- 后续可用 tags 为指定功能触发特定 motion。

### 4.3 一对一远程互动 Relay

当前范围：

- 只支持 1 对 1。
- 不做随机匹配。
- 不做远程控制对方电脑。
- Relay 负责绑定码、绑定关系、WebSocket 在线状态、消息转发、状态同步。

默认中继地址：

- `http://159.75.175.47:8787`
- 定义位置：`src/settings/defaultSettings.ts`

Relay 部署：

- 服务目录：`server/`
- 部署说明：`deploy/couple-pet-relay/README.md`
- 远端目标：`/opt/couple-pet-relay`
- 端口：`8787`
- 健康检查：`curl http://159.75.175.47:8787/health`

共享协议：

- `shared/syncProtocol.ts`
- `shared/activityStatus.ts`

桌面端同步实现：

- `src/sync/relayHttpClient.ts`
- `src/sync/realtimeClient.ts`
- `src/sync/useRealtimeSync.ts`
- `src/sync/SyncPanel.tsx`
- `src/sync/RemoteMessageLayer.tsx`

已实现的远程体验：

- 生成绑定码。
- 输入绑定码绑定。
- 取消绑定。
- 在线/离线感知。
- 趣味状态同步。
- 发送消息。
- 收到消息后切换当前动画为 message motion，并显示需确认的消息气泡。
- 本地保存 pair/device 身份。

历史问题和注意点：

- 远程不可用时 UI 会显示 Relay unavailable 或中文错误。
- 取消绑定之前出现过无响应问题，已有修复；后续改 SyncPanel 必须覆盖。
- 两台机器都必须能访问 `159.75.175.47:8787`，安全组和服务器防火墙要同时放行。

### 4.4 官网、账号和下载平台

当前是独立平台，不改变桌面端 Relay 协议。

模块：

- 前端官网：`platform-web/`
- 后端 API：`platform-api/`
- 共享平台协议：`shared/platformProtocol.ts`
- 部署目录：`deploy/couple-pet-platform/`

已实现能力：

- 官网首页/落地页。
- 邀请码入口。
- 注册。
- 登录。
- 登录后下载页。
- 管理后台页面。
- 后台可查看用户、邀请码、设备、版本、下载记录。
- 下载文件必须通过认证 API 返回，并记录 download event。

平台部署：

- 远端目录：`/opt/couple-pet-platform`
- Web：`http://159.75.175.47:19080`
- API：`http://159.75.175.47:19081`
- PostgreSQL 仅 Compose 内部网络。
- Release 文件不走 nginx 静态暴露，只挂给 `platform-api`。

关键接口：

- `GET /health`
- `GET /releases?platform=windows|macos|linux`
- `GET /releases/:releaseId/download`
- `GET /admin/releases`
- `GET /admin/downloads`

关键实现：

- `platform-api/src/routes/releaseRoutes.ts`
- `platform-api/src/repository.ts`
- `platform-api/src/bootstrap.ts`
- `platform-web/src/App.tsx`
- `platform-web/src/apiClient.ts`

当前明显缺口：

- 下载页目前在 `platform-web/src/App.tsx` 中只调用 `listReleases("windows")`。
- 按钮文案写死为“下载 Windows 内测包”。
- Bootstrap 只有 `PLATFORM_DEMO_WINDOWS_EXE_PATH` / `PLATFORM_DEMO_WINDOWS_VERSION`，没有 macOS demo release bootstrap。
- 因此“把 macOS 版本放到官方下载页面”需要继续实现。

建议下一步实现：

1. 平台 web 下载页同时请求 `windows` 和 `macos` release，按平台分组显示。
2. 下载按钮文案按 `release.platform` 渲染，如“下载 Windows 内测包”“下载 macOS QA 包”。
3. 平台 API bootstrap 支持可选 macOS release，或提供管理后台创建 release 的操作。
4. 将 macOS DMG 放入 `release_storage` 卷，并写入 releases 表。
5. 部署平台并验证登录下载记录。

### 4.5 macOS QA 和发布

macOS QA 交付目录：

```text
C:\Users\14567\Downloads\couple-desktop-pet-macos-final-d3b6609
```

核心文件：

- `情侣桌宠_0.1.0_universal_QA_d3b6609.dmg`
- `DELIVERY-README.md`
- `SHA256SUMS.txt`
- `final-evidence/release-decision.md`

DMG 信息：

- Git SHA：`d3b6609cd83ec1ebcf4b6e84686fa2b08d1cb8a8`
- macOS：12+
- 架构：Universal `arm64` + `x86_64`
- SHA256：`46a9d1b02a171584688188261ed7f7948759fa55878c6a156fc8406a1d80624c`

已成功 CI：

- macOS QA run：`31256480129`
- Windows/macOS Interop run：`31256481945`

已验证：

- 前端测试 57 文件 / 446 项。
- Rust 默认测试 48 项。
- Rust E2E 特性测试 50 项。
- macOS native E2E 2 spec / 8 cases。
- Windows/macOS 绑定、状态、消息、解绑、重启恢复互通通过。
- Universal binary 校验通过。

正式发布仍未完成：

- 当前 DMG 是 QA/ad-hoc 签名包，不是正式 Developer ID 公证包。
- Apple Developer 账号、证书、notarization secrets 尚未提供。
- 真实 Mac 人工验收材料尚未补齐。

正式发布需要的 GitHub Secrets：

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `KEYCHAIN_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

相关 CI：

- `.github/workflows/macos-qa.yml`
- `.github/workflows/macos-release.yml`
- `.github/workflows/cross-platform-interop.yml`

发布 gate：

- `scripts/macos/final-release-gate.mjs`
- `pnpm macos:final-gate -- --evidence-root <final-evidence-dir>`

最后一次 gate 状态：

- 状态：blocked。
- Invalid Evidence：none。
- 阻塞项主要是人工验收、网络连通记录和正式签名/公证证据缺失。

## 5. 重要需求和用户偏好

用户明确表达过的产品判断：

- 最大卖点应该是跨屏交互，而不是普通聊天。
- 单纯弹对话框没有竞争力，应该让桌宠动画/对方形象参与消息互动。
- 目前 PNG 序列帧动画效果仍不够连贯，但骨骼/分层变形试验效果用户不接受，先回到动画帧方案。
- 资源包应该允许用户只上传一个 motion；所有 motion 统一进入待机/ambient 池。
- 六个环绕按钮后续会变成功能入口，不应强制和动作文件绑定。
- 收到消息时应切换当前桌宠动画到互动动画，而不是额外显示一个小动画。
- 设置入口通过右键，不要鼠标悬浮显示设置按钮。
- 下载 exe 后用户应能导入自己的资源包，也能导入对方资源包。
- 后续官网要支持用户上传参考图，生成多版 Q 版桌宠形象供选择并下载资源包。
- 后续平台要做用户系统、互动数据、连续互动天数、排行榜和轻社交。

近期明确禁止或暂停的点：

- 暂停修改桌面边缘半隐藏/edge 行为。
- 旧星星人资源不再作为内置主形象。
- 旧版资源包无需优先兼容，v3 motion-pool 是后续生成主方向。

## 6. 关键文档索引

设计文档：

- `docs/superpowers/specs/2026-08-02-local-desktop-pet-mvp-design.md`
- `docs/superpowers/specs/2026-08-03-realtime-pairing-message-design.md`
- `docs/superpowers/specs/2026-08-03-importable-pet-resource-pack-design.md`
- `docs/superpowers/specs/2026-08-03-platform-account-download-design.md`
- `docs/superpowers/specs/2026-08-04-platform-homepage-social-landing-design.md`
- `docs/superpowers/specs/2026-08-05-v3-motion-pool-pet-package-design.md`
- `docs/superpowers/specs/2026-08-06-embedded-peer-activity-status-design.md`
- `docs/superpowers/specs/2026-08-07-macos-cross-platform-release-design.md`

实施计划：

- `docs/superpowers/plans/2026-08-05-v3-motion-pool-pet-package.md`
- `docs/superpowers/plans/2026-08-06-embedded-peer-activity-status.md`
- `docs/superpowers/plans/2026-08-07-macos-cross-platform-release.md`
- `docs/superpowers/plans/2026-08-07-edge-interaction-v2.md`

资源与验收：

- `docs/pet-resource-pack-format.md`
- `docs/pet-package-v3.md`
- `docs/manual-verification/macos-cross-platform.md`
- `docs/manual-verification/platform-account-download-mvp.md`
- `docs/manual-verification/realtime-message-mvp.md`
- `docs/manual-verification/edge-interaction-v2.md`

## 7. 本地开发命令

根项目：

```powershell
pnpm install
pnpm dev
pnpm test
pnpm typecheck
pnpm build
```

桌面端：

```powershell
pnpm tauri dev
pnpm tauri build
pnpm e2e:windows:build
```

Relay：

```powershell
pnpm server:dev
pnpm server:dev:lan
pnpm server:test
pnpm server:typecheck
pnpm server:build
```

平台：

```powershell
pnpm platform-api:dev
pnpm platform-web:dev
pnpm platform-api:test
pnpm platform-web:test
pnpm platform-api:typecheck
pnpm platform-web:typecheck
pnpm platform-api:build
pnpm platform-web:build
```

macOS 相关：

```powershell
pnpm macos:qa-build
pnpm macos:formal-build
pnpm macos:final-gate
pnpm macos:production-scan
```

Rust：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

资源包打包：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package_pet_resource.ps1 `
  -PackageDirectory output/pet-packages/<package-dir> `
  -OutputFile output/pet-packages/<package-name>.cdpet
```

## 8. 部署操作摘要

### 8.1 Relay 部署

```powershell
ssh root@159.75.175.47 "mkdir -p /opt/couple-pet-relay"
scp -r server shared package.json pnpm-lock.yaml pnpm-workspace.yaml deploy/couple-pet-relay root@159.75.175.47:/opt/couple-pet-relay/
ssh root@159.75.175.47 "cd /opt/couple-pet-relay && docker compose -f deploy/couple-pet-relay/compose.yaml up -d --build"
curl http://159.75.175.47:8787/health
```

### 8.2 平台部署

```bash
cd /opt/couple-pet-platform
cp deploy/couple-pet-platform/.env.example .env
docker compose -p couple-pet-platform -f deploy/couple-pet-platform/compose.yaml up -d --build
curl http://159.75.175.47:19081/health
```

必须配置：

- `POSTGRES_PASSWORD`
- `PLATFORM_JWT_SECRET`
- `PLATFORM_CORS_ORIGINS=http://159.75.175.47:19080`
- `PLATFORM_ADMIN_EMAIL`
- `PLATFORM_ADMIN_PASSWORD`

不要提交 `.env`。

## 9. 近期最建议继续做的任务

### 任务 A：把 macOS QA 包接入官方下载页

目标：

- 下载页同时显示 Windows 和 macOS。
- macOS DMG 通过认证下载接口返回并记录下载事件。
- 明确标注 macOS 当前为 QA 包，非正式公证包。

涉及文件：

- `platform-web/src/App.tsx`
- `platform-web/src/App.test.tsx`
- `platform-web/src/apiClient.ts`
- `platform-api/src/bootstrap.ts`
- `platform-api/src/config.ts`
- `platform-api/src/config.test.ts`
- `platform-api/src/bootstrap.test.ts`
- `platform-api/src/platformApi.test.ts`
- `deploy/couple-pet-platform/.env.example`
- `deploy/couple-pet-platform/README.md`

验收：

- `pnpm platform-web:test`
- `pnpm platform-web:typecheck`
- `pnpm platform-web:build`
- `pnpm platform-api:test`
- `pnpm platform-api:typecheck`
- `pnpm platform-api:build`
- 登录下载页能看到两个平台。
- 点击 macOS 下载返回 DMG blob。
- 后台下载记录增加。

### 任务 B：完善正式 macOS 发布链路

前置：

- 用户本人开通 Apple Developer Program。
- 用户配置 Developer ID 证书和 notarization secrets。

目标：

- 运行 `.github/workflows/macos-release.yml`。
- 产出 Developer ID signed + notarized + stapled DMG。
- final gate 不再因签名/公证缺失 blocked。

验收：

- `codesign --verify` pass。
- `spctl --assess` pass。
- `xcrun stapler validate` pass。
- `hdiutil verify` pass。
- DMG SHA256 记录。

### 任务 C：跨屏互动产品体验升级

方向：

- 延续 PNG 序列帧方案。
- 优先设计高质量双人互动 motion，而不是骨骼变形。
- 消息、状态、连续互动天数都应能触发不同的“对方来访/陪伴”动画。

注意：

- 先出渲染/效果图让用户确认，再生成资源和实现。
- 不要再用简单缩放/变形假装骨骼动画。

### 任务 D：AI 资源包生成平台

目标：

- 用户上传参考图。
- 生成多版 Q 版形象。
- 选择一版后生成 v3 `.cdpet`。
- 下载并导入桌面端。

建议先做：

- 资源包生成流水线规范。
- 输出质量验收标准。
- 后台任务状态模型。
- 存储策略和内容审核策略。

## 10. 高风险区域

- `src/app/App.tsx`：核心状态汇合，改动容易引发菜单、消息、设置、同步互相影响。
- `src-tauri/src/pet_packages.rs`：资源包安全边界，不能放松路径、大小、文件类型校验。
- `src-tauri/tauri.conf.json` CSP：Relay、asset protocol 和生产扫描相关，改动需谨慎。
- `.github/workflows/*.yml`：当前 GitHub token 曾因缺 workflow scope 拒绝 push。改 workflow 前确认权限。
- macOS release gate：不要伪造证据；QA 包和正式包必须区分。
- Remote Relay：不要把对方桌宠事件做成远程控制电脑。
- 资源授权：不要提交版权不明素材。

## 11. 当前已知问题/限制

- 动画整体情绪价值仍不足，用户已多次指出序列帧不够连贯。
- 骨骼/分层变形试验效果被用户否定，暂不作为主线。
- 边缘半隐藏效果用户不满意，但当前暂停修改。
- 官网下载页未完成 macOS 平台接入。
- 平台还没有完整用户运营功能：互动天数、排行榜、资源生成、支付、内容审核均未实现。
- 平台 release 创建目前偏 bootstrap/后台查看，缺少完善的管理端创建/上传发布包流程。
- macOS 正式公开发布缺 Apple Developer 凭据和人工验收。
- 当前默认 Relay 是明文 HTTP/WS IP，后续有域名后应升级 HTTPS/WSS。

## 12. 接手时先做的检查

```powershell
cd C:\Users\14567\.codex\worktrees\6515\情侣桌宠
git status --short --branch
git log --oneline -5
pnpm test
pnpm typecheck
```

如果继续平台下载页：

```powershell
pnpm platform-web:test
pnpm platform-api:test
```

如果继续桌面端：

```powershell
pnpm test
pnpm typecheck
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
```

如果继续 macOS 发布：

```powershell
pnpm macos:production-scan
pnpm macos:final-gate -- --evidence-root C:\Users\14567\Downloads\couple-desktop-pet-macos-final-d3b6609\final-evidence
```

预期 final gate 仍 blocked，但 Invalid Evidence 应为 none。

## 13. 给下一任代理的执行原则

1. 先确认用户最新意图，不要继续旧任务的惯性。
2. 所有交流用中文。
3. 不碰 `.superpowers/brainstorm/`。
4. 不主动改 edge 半隐藏，除非用户重新确认。
5. 发布包必须区分 QA 包和正式包。
6. 平台下载包必须通过认证 API，不要用 nginx 静态公开 release 文件。
7. 新资源包默认 v3 motion-pool。
8. 做桌面交互改动时先写测试，至少覆盖 App/renderer/sync 相关行为。
9. 涉及远程服务和账号时，不要把密钥、`.env`、Apple 凭据写入仓库。
10. 交付前用明确的验证命令说明做到了什么、没做到什么。

## 14. 术语说明

- Handoff document：本文这种“项目交接文档”，用于让下一任代理快速恢复上下文、边界和下一步。
- Release artifact：可下载的发布制品，例如 Windows `.exe` 或 macOS `.dmg`。
- Acceptance criteria：验收标准，指可检查的完成条件；参考 https://vibe-hub.org/acceptance-criteria。
- Motion pool：动作池，v3 资源包里多个 motion 作为候选动画，由运行时随机/按权重选择。
- Notarization：Apple 公证，macOS 正式公开分发时用于降低 Gatekeeper 阻拦。
