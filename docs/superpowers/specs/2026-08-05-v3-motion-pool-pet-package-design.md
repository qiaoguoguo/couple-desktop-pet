# v3 动作池资源包与功能按钮解耦设计

日期：2026-08-05

状态：待用户复核后进入实施计划阶段

## 背景

当前桌宠客户端的 v2 资源包把资源动作和客户端行为强绑定：资源包必须提供 `idle-breathe`、`walk`、`drag`、`sleep`、`act-cute`、`act-typing` 等 12 个固定动作，每个动作 30 帧。这个设计适合早期验证状态机，但不适合后续用户上传照片生成资源包。

用户确认的新方向是：

- 资源包允许只包含一个动作。
- 上传生成的所有动作资源统一视为待机/氛围动作。
- 这些动作由桌宠在空闲时随机触发。
- 现有单击弹出的 6 个原动作按钮保留，但不再用于直接执行同名动作。
- 这些按钮后续会承载互动、礼物、关系、生成、设置等功能入口。
- 发送消息按钮作为已有命令入口继续保留。
- 后期功能需要动画反馈时，可以实时触发某个动作池动作，但不把按钮 ID 和动作 ID 硬编码绑定。

因此需要把资源包模型从“固定动作表”改为“动作池”，并把交互菜单从“动作菜单”改为“功能菜单”。

## 目标

1. 新增 `formatVersion: 3` 资源包格式。
2. v3 资源包最少只要求一个动作序列。
3. 所有导入动作默认进入待机动作池，客户端空闲时随机播放。
4. 6 个原动作按钮继续显示，但不再默认触发资源包动作。
5. 发送消息按钮继续打开消息输入面板。
6. 其他按钮短期可显示占位反馈，后续接具体轻社交功能。
7. 后期功能触发动画时，通过 motion id、tag 或策略选择动作，而不是通过按钮名选择固定动作。
8. 降低“用户上传照片生成资源包”的最低成本。

## 非目标

- 不在本轮实现用户账号、资源包云端生成、支付或排行榜。
- 不在本轮实现 Live2D、Spine、骨骼绑定或分层动画。
- 不要求用户上传资源必须覆盖 6 个互动动作。
- 不要求 v3 资源包继续提供 `walk`、`drag`、`sleep` 等固定基础动作。
- 不把 6 个原动作按钮设计成永久功能，本轮只完成动作解耦和可扩展入口。

## v3 资源包格式

`.cdpet` 仍然是 zip 文件，建议结构如下：

```text
my-pet.cdpet
├─ pet.json
├─ preview.png
└─ motions/
   └─ motion-001/
      ├─ 0001.png
      ├─ 0002.png
      └─ 0030.png
```

可以包含多个 motion：

```text
motions/
├─ motion-001/
│  ├─ 0001.png
│  └─ 0030.png
├─ motion-002/
│  ├─ 0001.png
│  └─ 0030.png
└─ motion-003/
   ├─ 0001.png
   └─ 0030.png
```

### pet.json 示例

```json
{
  "formatVersion": 3,
  "renderer": "motion-pool",
  "id": "my-custom-pet",
  "name": "我的桌宠",
  "baseSize": { "width": 256, "height": 320 },
  "frameSize": { "width": 768, "height": 960 },
  "defaultMotion": "motion-001",
  "motions": {
    "motion-001": {
      "fps": 5,
      "loop": true,
      "frameCount": 30,
      "durationMs": 6000,
      "frames": "motions/motion-001/",
      "weight": 1,
      "tags": ["idle"]
    }
  }
}
```

### motion 字段

- `fps`：建议 5。导入器可以先限制为 1 到 12。
- `loop`：是否循环。待机动作通常为 `true`。
- `frameCount`：实际帧数量。为了支持最低成本生成，v3 应允许 1 到 60 帧。
- `durationMs`：动作播放时长。建议 3000 到 12000ms。
- `frames`：固定为 `motions/<motionId>/`。
- `weight`：随机待机播放权重，默认 1。
- `tags`：可选标签。当前只需要 `idle`，未来可扩展 `message`、`happy`、`comfort`、`typing` 等。

## 导入校验

v3 导入器应校验：

- `pet.json` 存在且为合法 JSON。
- `formatVersion` 为 `3`。
- `renderer` 为 `motion-pool`。
- `id` 只包含英文、数字、下划线和短横线，长度不超过 64。
- `name` 非空。
- `baseSize` 和 `frameSize` 在 64 到 2048 范围内。
- `preview.png` 存在且为 PNG。
- `motions` 至少包含一个 motion。
- `defaultMotion` 必须存在于 `motions`。
- 每个 motion 的目录只能是 `motions/<motionId>/`。
- 每个 motion 必须包含 `0001.png` 到 `frameCount` 对应的 PNG。
- 不允许包内出现脚本、网页、SVG、音频、视频、模型或远程 URL。
- 保留现有 zip 安全限制：禁止路径穿越、禁止绝对路径、限制文件数、单文件大小、总包大小和解压大小。

## 运行时模型

前端不再要求资源包提供固定 `actions` 表。运行时解析出的包应包含：

```ts
interface ResolvedMotionPoolPackage {
  id: string;
  name: string;
  previewUrl: string;
  baseSize: PetPackageSize;
  frameSize: PetPackageSize;
  defaultMotionId: string;
  motions: Record<string, ResolvedPetMotion>;
}
```

渲染器只关心当前 motion：

```ts
interface ActivePetMotion {
  packageId: string;
  motionId: string;
  startedAt: number;
}
```

桌宠状态机仍然可以保留 `idle`、`dragging`、`sleeping` 等内部状态，但这些状态不再要求资源包提供同名动作。渲染层根据当前状态选择：

- 空闲：从 motion pool 随机选 motion。
- 拖拽：保持当前 motion 或回退到 default motion。
- 睡眠：可以继续播放 default motion，后续再由功能策略选择更合适 motion。
- 收到消息：显示对方资源包的 default motion 或按 `message` tag 选择。

## 待机导演层

待机导演层负责把动作池变成有节奏的桌宠体验：

1. 桌宠空闲时播放一个 motion。
2. motion 播放结束后，根据随机延迟或权重选择下一个 motion。
3. 如果只有一个 motion，就循环该 motion。
4. 如果用户正在拖拽、打开设置、打开消息输入或执行功能，暂停随机切换。
5. 功能触发动画时，临时覆盖待机 motion；播放完毕后回到待机导演层。

这一层的职责是“安排动作”，不是“定义功能”。功能按钮只发出功能事件。

## 功能按钮解耦

当前 6 个原动作按钮保留视觉和弹出方式，但语义从动作改为功能；发送消息按钮继续作为独立命令入口：

| 当前入口 | 本轮行为 | 后续方向 |
| --- | --- | --- |
| 撒娇/卖萌 | 占位反馈或随机播放一个 motion | 情绪互动、亲密度 |
| 敲电脑 | 占位反馈或随机播放一个 motion | 陪伴工作、专注计时 |
| 打招呼 | 占位反馈或随机播放一个 motion | 远程招呼 |
| 抱抱 | 占位反馈或随机播放一个 motion | 远程互动 |
| 嘟嘴/生气 | 占位反馈或随机播放一个 motion | 情绪表达 |
| 发送消息 | 打开消息输入面板 | 继续保留 |

除了发送消息外，本轮不需要让原动作按钮强制播放同名动画。可以先统一触发一个轻量反馈，例如气泡“功能开发中”，或随机播放动作池中的一个 motion。具体实现计划阶段再定。

## 与用户上传照片生成的关系

v3 的最低生成路径是：

1. 用户上传一张参考图。
2. 后台生成一个 Q 版形象。
3. 后台生成 1 个 motion，通常是轻微呼吸、眨眼、头发摆动。
4. 自动生成 `preview.png` 和 `pet.json`。
5. 打包为 `.cdpet`。
6. 用户下载并导入桌面端。

更高级的生成路径可以生成多个 motion，但不再要求固定 6 个互动动作或 12 个基础动作。

推荐商业化档位：

- 基础版：1 个 motion，成本最低，可导入可展示。
- 增强版：3 到 5 个 motion，待机随机更丰富。
- 高级版：更多 motion，并带标签，后续可被功能实时触发。

## 兼容策略

v3 是新导入目标。v2 固定动作包不再作为新生成器目标。

实现时可以选择两种策略：

1. 彻底切换：导入器只接受 v3，v2 提示使用新版生成器重新生成。
2. 过渡兼容：短期把 v2 的 12 个固定动作转换为 v3 motions，并在设置中继续可用。

推荐方案是过渡兼容：可以避免已有内置 Q 版资源和开发测试资源突然失效。新上传、新生成、新导入统一产出 v3。

## 测试要求

需要覆盖：

- v3 资源包只包含一个 motion 时可以导入。
- v3 资源包包含多个 motion 时可以导入并随机选择。
- `defaultMotion` 缺失时导入失败。
- motion 目录不匹配时导入失败。
- motion 缺少帧或 PNG 无效时导入失败。
- v2 包过渡兼容或拒绝策略符合最终实现选择。
- 互动按钮点击后不再依赖同名动作存在。
- 发送消息按钮仍能打开消息输入面板。
- 收到消息时没有 `act-wave` 也能显示对方形象。
- 只有一个 motion 的资源包不会导致空白、崩溃或状态机卡住。

## 验收标准

1. 能导入一个只包含 `motion-001` 的 `.cdpet`。
2. 导入后能把该资源包设为本地桌宠形象。
3. 桌宠空闲时能播放该 motion。
4. 如果资源包有多个 motion，空闲时会随机切换。
5. 单击弹出的 6 个原动作按钮和发送消息按钮仍显示。
6. 非发送消息按钮不再要求资源包存在同名动作。
7. 发送消息功能保持可用。
8. 远程消息展示不再依赖 `act-wave`。
9. 无效资源包有清晰错误提示。
10. 类型检查、前端测试、Rust 测试和 Tauri debug 构建通过。

## 后续扩展

- motion 标签体系：`idle`、`message`、`happy`、`comfort`、`work`。
- 功能触发策略：功能模块请求某类 tag，导演层选择具体 motion。
- 云端资源包生成器：一张照片生成基础版、增强版、高级版。
- 资源包预览器：导入前查看 motion 列表和预览。
- 资源包质量评分：检查透明边缘、角色抖动、帧间一致性和小尺寸可读性。
