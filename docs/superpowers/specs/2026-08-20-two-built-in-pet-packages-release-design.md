# 双内置角色资源清理与跨平台初始安装包设计

日期：2026-08-20

状态：用户已确认聊天方案，待书面规格复核

## 背景

当前客户端只有 `builtin:q-girl` 一个源码内置角色。设置中显示的“Q版眼镜男孩完整互动版”来自本机应用数据目录中的 v3 导入包 `q-boy-complete-v3`，因此它不会随安装程序交付到另一台电脑。

项目运行时资源中还保留了旧 `star-sleeper` 角色、静态边缘模式不再展示的动画帧，以及已经被新版功能按钮替换的旧图标。这些资源会增加源码和安装包体积，也让“内置角色”边界不清晰。

本轮将现有女孩和男孩原样整理成两个正式内置角色，保留用户导入自定义角色的能力，并交付同一源码版本构建的 Windows EXE 与 macOS DMG。

## 目标

1. 新安装的客户端默认提供且只提供两个内置角色。
2. 女孩使用当前 `builtin:q-girl` 的完整资源，显示名改为“桃桃”。
3. 男孩使用当前 `q-boy-complete-v3` 导入包的原始资源，转为 `builtin:q-boy`，显示名改为“青禾”。
4. 保留 `.cdpet` 自定义资源包导入和删除能力。
5. 兼容已有角色选择，升级后不会因 ID 变化回退到错误角色。
6. 删除确认无运行时用途的旧角色、旧边缘动画和旧按钮图片。
7. 构建干净的 Windows Release EXE 与 macOS Universal DMG，并记录校验值。

## 非目标

- 不重新绘制、AI 生成或改变桃桃、青禾的角色造型。
- 不为青禾补造当前导入包没有的新动作。
- 不修改消息、小心意、天气、倒计时、状态、火花排行榜或服务器协议。
- 不取消用户导入自定义角色的能力。
- 不自动删除用户应用数据目录中的自定义导入包。
- 不在没有 Apple Developer 凭据的情况下宣称 macOS 安装包已公证。

## 内置角色定义

### 桃桃

- 稳定 ID：`builtin:q-girl`
- 显示名：`桃桃`
- 默认角色：是
- 资源来源：现有 `src/assets/pets/q-girl/`
- 渲染模式：现有固定动作兼容模型，并保留 `motion-message-pair`
- 现有动作、场景、头像、离线头像和静态边缘形象保持不变

### 青禾

- 稳定 ID：`builtin:q-boy`
- 显示名：`青禾`
- 默认角色：否
- 资源来源：本机现有 `q-boy-complete-v3` 包，迁入 `src/assets/pets/q-boy/`
- 渲染模式：v3 `motion-pool`
- 默认动作：`motion-001`，20 帧、5 FPS、循环
- 发消息互动：`motion-message-pair`，48 帧、8 FPS、循环
- 预览、动作图片和清单参数按现有包原样迁移，不重新压缩或重绘

角色显示名只属于 UI 元数据，不参与设置持久化、同步或资源寻址。后续改文案时不会再次改变角色 ID。

## 内置包架构

现有注册表只会构建一个 `buildBuiltInPackage()`，需要改为显式的内置包定义集合。集合按固定顺序返回桃桃、青禾，然后追加合法的用户导入包。

内置定义支持两类现有渲染契约：

- 桃桃继续由当前内置 manifest 构建固定动作和额外 motion。
- 青禾直接由内置 v3 motion-pool manifest 构建，不伪造 `act-*` 动作。需要旧 action 接口的调用继续使用当前 default-motion fallback。

资源解析必须使用源码内明确列出的 `q-girl` 与 `q-boy` 路径，不能扫描或自动打包任意历史角色目录。这样安装包资源边界由代码中的内置白名单决定。

`BUILT_IN_PET_PACKAGE_ID` 继续表示默认包 `builtin:q-girl`，同时新增可枚举的内置包 ID/定义，避免把“默认角色”和“唯一内置角色”继续混为一个概念。

## 导入包保留与去重

设置页继续展示“导入形象资源包”和“删除当前导入形象”。新安装且没有用户数据时，角色下拉框只显示桃桃、青禾。

已有应用数据中可能存在这两个内置角色的历史导入副本。注册表需要按 manifest ID 屏蔽以下重复项：

- `q-girl-complete-v3`
- `q-boy-complete-v3`

屏蔽仅影响列表和运行时选择，不删除磁盘文件。其他导入包，例如本机的 `q-photo-chibi`，仍作为用户自定义角色正常显示和删除。

## 设置迁移

读取设置时统一规范化以下历史 ID：

| 历史 ID | 新 ID |
| --- | --- |
| `builtin:star-sleeper` | `builtin:q-girl` |
| `imported:q-girl-complete-v3` | `builtin:q-girl` |
| `imported:q-boy-complete-v3` | `builtin:q-boy` |

迁移同时应用于：

- `appearance.selectedPetPackageId`
- `appearance.peerPetPackageByDeviceId` 中的每一个值

只要发生角色 ID 或现有 Relay 地址迁移，就把规范化后的设置写回一次。写回失败不得阻止应用启动；本次会话仍使用已迁移的内存值。

未知或已删除的角色 ID继续由当前选择解析逻辑回退到 `builtin:q-girl`，不能产生空白桌宠。

## 资源清理范围

本轮只清理确认不再参与生产运行的源码资源，不把文档历史、测试证据、构建配置或用户应用数据当成安装包资源删除。

### 删除旧角色

- 删除 `src/assets/pets/star-sleeper/` 的全部 217 个文件。
- 保留 `builtin:star-sleeper` 到 `builtin:q-girl` 的纯设置迁移规则。

### 收敛静态边缘资源

当前生产状态进入边缘后只有 `idle`，左右和底部只渲染 `edge-companion/*/idle.png`，顶部被冻结在 `edge-interaction/top/idle/0001.png`。因此：

- 左、右共用现有 `side/idle.png`。
- 底部保留现有 `bottom/idle.png`。
- 顶部只保留 `top/idle/0001.png`。
- 删除所有 `enter`、`react`、其余 `idle` 帧和未被渲染的 `blink.png`。
- 从边缘视觉类型和测试中移除未使用的 blink 字段，生产行为仍是已经确认的纯静态模式。

收到普通消息和小心意时的边缘通知卡及其点击打开流程保持不变。

### 删除旧按钮图片

删除以下没有任何生产代码引用的图片：

- `interaction-buttons/act-cute.png`
- `interaction-buttons/act-drowsy.png`
- `interaction-buttons/act-hug.png`
- `interaction-buttons/act-pout.png`
- `interaction-buttons/act-typing.png`
- `interaction-buttons/act-wave.png`
- `interaction-buttons/new-tea-cute.png`
- `interaction-buttons/new-tea-hug.png`
- `interaction-buttons/new-tea-wave.png`
- `interaction-buttons/send-message.png`

保留当前六个功能入口、状态、惊喜、天气、倒计时和七档火花实际引用的所有图标。

按审计结果，删除项约为 364 个文件、72.23 MiB；迁入青禾约 20.24 MiB，运行时源码资源净减少约 52 MiB。最终数字以实施后的 Git diff 和文件统计为准。

## 初始安装语义

“完整初始安装包”表示安装程序包含完整客户端代码、两个内置角色和当前产品功能，但不捆绑开发机应用数据，包括：

- 不携带 `settings.json`、窗口位置或倒计时状态。
- 不携带设备 ID、设备密钥、配对关系或天气 API Key。
- 不携带 `pet-packages/` 中的用户导入包。
- 首次启动默认选择桃桃，处于未绑定状态。

升级安装不得清空既有用户数据。历史角色 ID只通过上述兼容迁移转换。

## 构建与交付

### Windows

- 使用 Release 模式构建 Tauri 应用。
- 交付 NSIS `.exe` 安装程序，而不是 debug 可执行文件。
- 安装程序不包含当前开发机 AppData。
- 在干净的应用数据目录验证首次启动和两个内置角色切换。

### macOS

- 使用同一提交构建 `universal-apple-darwin` DMG，同时支持 Intel 与 Apple Silicon。
- 在 macOS runner 上完成应用启动、角色列表和基础互动验证。
- 未配置 Apple Developer ID 与公证凭据时，产物只能标记为 ad-hoc 签名、未公证 QA DMG。

两个平台的交付记录必须包含：源码提交、文件名、字节数、构建时间和 SHA-256。

## 错误处理

- 任一内置清单缺失默认 motion、帧数不符或资源 URL 解析失败时，测试和构建必须失败，不能静默发布空白角色。
- 旧设置迁移写回失败时继续使用内存迁移结果，下次启动可重试。
- 被屏蔽的历史导入副本如果仍在磁盘，不影响内置包解析，也不允许覆盖相同内置 ID。
- 用户导入包解析失败时继续沿用现有隔离策略，不影响两个内置角色。
- 打包失败、macOS 架构不完整或验收截图出现空白角色时不得交付。

## 测试与验收

### 自动化

- 注册表测试证明顺序为桃桃、青禾、用户导入包。
- 新安装状态下内置列表恰好为 `builtin:q-girl` 和 `builtin:q-boy`。
- 桃桃名称、默认动作、固定动作和双人发消息 motion 可解析。
- 青禾名称、20 帧默认动作和 48 帧发消息 motion 可解析。
- 三个历史 ID 在本地选择和对方角色映射中均正确迁移。
- 同名历史导入副本被去重，其他自定义导入包仍正常显示。
- 被删除的旧资源不再有源码引用，资源解析不会产生空 URL。
- 静态边缘测试只引用左右/底部 idle 和顶部第一帧，不再引用 blink、enter 或 react。
- 类型检查、前端完整测试、前端构建、Rust 格式检查、Rust 测试和 Rust check 全部通过。

### Windows 实机

- 使用隔离的干净 AppData 首次启动，设置中只显示桃桃、青禾两个内置角色。
- 两个角色都能作为“当前形象”和“对方形象”选择，切换后没有空白、拉伸或错误占位。
- 桃桃保留现有动作；青禾播放现有待机并能在对应消息场景显示双人互动。
- 导入一个第三方测试包后列表新增该包，删除后恢复两个内置角色。
- 静态边缘、消息提示卡和小心意提示卡无资源回归。
- NSIS EXE 在干净目录完成安装、启动和卸载。

### macOS 实机

- DMG 内应用为 Universal Binary。
- 干净用户目录首次启动后角色列表、角色切换和 Windows 验收语义一致。
- 透明窗口、拖拽、托盘/菜单栏入口、消息和静态边缘基础能力没有平台回归。

## 发布阻断条件

以下任一情况发生时不得把产物标记为完成：

- 新安装不是恰好两个内置角色。
- 青禾资源与当前 `q-boy-complete-v3` 原始包不一致。
- 旧设置选择迁移后丢失或回退错误。
- 自定义导入功能被误删。
- 仍有生产代码引用已删除资源。
- Windows 仅生成裸程序而没有安装 EXE。
- macOS DMG 不是 Universal，或把未公证产物描述为正式已公证版本。

