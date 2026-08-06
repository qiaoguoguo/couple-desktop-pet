# 桌宠形象资源包格式

新生成资源包的目标格式为 `formatVersion: 3`，渲染器为 `renderer: "motion-pool"`。v3 最少只需要一个 motion，也允许多个 motion；所有 motion 会作为桌宠待机/ambient 动作池，由运行时随机或按权重选择播放。

旧版 `formatVersion: 2` 固定动作资源包仍作为过渡兼容输入保留，但不再建议新生成。`formatVersion: 1` 资源包会被拒绝导入。

`.cdpet` 本质是 zip 文件。资源包只允许包含 JSON 和 PNG，不包含脚本、网页、音频、视频、模型或远程链接。

## v3 目录结构

```text
my-pet.cdpet
├─ pet.json
├─ preview.png
├─ portrait.png              # 可选，在线陪伴头像
├─ portrait-offline.png      # 可选，离线陪伴头像
└─ motions/
   ├─ motion-001/
   │  ├─ 0001.png
   │  ├─ 0002.png
   │  └─ 0030.png
   └─ motion-002/
      ├─ 0001.png
      └─ 0018.png
```

每个 motion 一个目录，目录名必须和 `pet.json` 里的 motion id 一致。帧文件从 `0001.png` 开始连续编号，数量必须等于该 motion 的 `frameCount`。

## v3 pet.json

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
      "weight": 2,
      "tags": ["idle"]
    },
    "motion-002": {
      "fps": 5,
      "loop": true,
      "frameCount": 18,
      "durationMs": 6000,
      "frames": "motions/motion-002/",
      "weight": 1,
      "tags": ["idle", "ambient"]
    },
    "motion-message": {
      "fps": 5,
      "loop": true,
      "frameCount": 12,
      "durationMs": 5000,
      "frames": "motions/motion-message/",
      "weight": 1,
      "tags": ["message"]
    }
  }
}
```

`id` 和 motion id 只能使用英文字母、数字、下划线和短横线，长度不超过 64。导入后运行时 ID 会变成 `imported:<id>`。默认内置形象是 `builtin:q-girl`。

`defaultMotion` 必须指向一个存在的 motion。带有 `message` 标签的 motion 会优先用于远程消息来访展示；没有该标签时会回退到默认 motion、首个可用 motion、预览图或可读占位。

## 运行时行为

v3 不再要求资源包提供固定的 12 个动作名，也不要求生成 `act-cute`、`act-wave`、`walk` 这类固定 action 目录。运行时会把所有 motion 视为可播放动作池：

- 待机和环境互动会从 motion pool 中选择下一段 motion。
- 多个 motion 可以用 `weight` 调整出现概率。
- `tags` 用来表达用途，例如 `idle`、`ambient`、`message`，但不等同于旧版固定动作名。
- 六个环绕互动按钮是产品功能入口，不是资源包动作要求。
- `act-typing` / “敲电脑”按钮在当前产品中复用为消息输入入口；它不要求资源包提供同名动画。
- 其他互动按钮可以临时显示提示或播放可用 runtime motion，不应强制资源包绑定固定动作文件。

## 导入与存储

应用会把导入的资源包复制到 app data 目录下的 `pet-packages/`，运行时不依赖原始 `.cdpet` 文件路径。

导入 v3 包前必须校验：

- `pet.json` 是合法 JSON。
- `formatVersion` 必须是 `3`。
- `renderer` 必须是 `motion-pool`。
- `id`、motion id 必须符合 `[A-Za-z0-9_-]{1,64}`。
- `name` 必须是非空字符串。
- `baseSize` 和 `frameSize` 的宽高必须在 `64..=2048`。
- `defaultMotion` 必须存在于 `motions`。
- `motions` 至少包含一个 motion，允许包含多个 motion。
- 每个 motion 的 `fps` 必须是有限整数，范围 `1..=12`。
- 每个 motion 的 `durationMs` 必须是有限整数，范围 `3000..=12000`。
- 每个 motion 的 `frameCount` 必须是有限整数，范围 `1..=60`。
- 每个 motion 的 `loop` 必须是布尔值。
- 每个 motion 的 `frames` 必须严格等于 `motions/<motion-id>/`。
- 每个 motion 的 `weight` 必须是有限数字且不小于 `0`。
- 每个 motion 的 `tags` 建议提供非空字符串数组；省略时前端会按 `idle` 处理，但新生成器应显式写出。
- 每个 motion 目录必须包含 `0001.png` 到 `NNNN.png` 的连续 PNG 帧，数量和 `frameCount` 一致。
- `preview.png` 必须存在且为 PNG。
- `portrait.png` 和 `portrait-offline.png` 可选，存在时用于多窗口陪伴在线/离线头像；缺失时客户端回退到 `preview.png`。
- PNG 签名必须合法，建议使用 RGBA 透明背景。
- 文件数量不超过 500 个。
- 每个单文件不超过 8 MiB。
- 原始 `.cdpet` 不超过 80 MiB，解压后总量不超过 160 MiB。
- zip 路径安全，不允许绝对路径、`..`、反斜杠路径或任意嵌套逃逸。
- 只允许 `pet.json`、`preview.png`、可选根目录 `portrait.png` / `portrait-offline.png` 和 `motions/<motion-id>/<NNNN>.png` 这类文件落盘。

## v2 过渡兼容

`formatVersion: 2` 使用 `renderer: "frame-sequence"`，要求 12 个标准动作、每个动作 30 帧，并带有固定 scene 元数据。当前客户端仍可导入 v2 包，主要用于兼容已有 Q-girl 固定动作资源。

新资源生成不建议继续产出 v2。未来编辑器、生成器和导入文档应优先面向 v3 motion-pool。

旧版 `formatVersion: 1` 资源包导入失败，用户需要使用新版生成器重新生成。

## 生成建议

- 最低成本包可以只生成一个 motion，例如 `motion-001`，只要帧数和 `pet.json` 一致即可。
- 推荐生成多个短 motion，例如呼吸、张望、挥手、打盹等，并用 `weight` 控制出现频率。
- 远程消息来访想有专属表现时，可以额外生成一个带 `message` 标签的 motion。
- 如果资源包要参与对方在线/离线陪伴窗口，建议额外提供 512x512 RGBA 透明 `portrait.png` 和 `portrait-offline.png`，胸部以上构图，头部约占画面 68%，不要包含文字、边框或额外人物。
- PNG 建议使用透明背景，画布尺寸和角色落点在所有帧中保持稳定。
- 角色在小尺寸显示时仍应能看清动作意图，不要只做整体缩放或静态重复帧。
- 不要放入版权不明的角色、图片、模型、字体或音频。
- 第一版不会通过 Relay 上传、下载、转发或同步资源包文件。

如果两台设备想显示同一个自定义形象，需要手动交换新版 `.cdpet` 文件并各自导入。
