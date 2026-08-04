# 桌宠形象资源包格式

当前资源包格式为 `formatVersion: 2`。旧版 `formatVersion: 1` 资源包不再兼容，也不再作为导入目标。

第一期仍使用 `.cdpet` 扩展名，本质是 zip 文件。资源包只允许包含 JSON 和 PNG，不包含脚本、网页、音频、视频、模型或远程链接。

## 目录结构

```text
my-pet.cdpet
├─ pet.json
├─ preview.png
└─ frames/
   ├─ idle-breathe/
   │  ├─ 0001.png
   │  ├─ 0002.png
   │  └─ 0030.png
   ├─ act-cute/
   │  ├─ 0001.png
   │  └─ 0030.png
   └─ act-drowsy/
      ├─ 0001.png
      └─ 0030.png
```

必须包含 12 个标准动作，每个动作正好 30 帧：

- `idle-breathe`
- `idle-look`
- `idle-stretch`
- `walk`
- `drag`
- `sleep`
- `act-cute`
- `act-typing`
- `act-wave`
- `act-hug`
- `act-pout`
- `act-drowsy`

帧文件命名必须是 `0001.png` 到 `0030.png`，并放在 `frames/<action>/` 目录内。

## pet.json

```json
{
  "formatVersion": 2,
  "renderer": "frame-sequence",
  "id": "my-custom-pet",
  "name": "我的桌宠",
  "baseSize": { "width": 256, "height": 320 },
  "frameSize": { "width": 768, "height": 960 },
  "actions": {
    "idle-breathe": {
      "fps": 5,
      "loop": true,
      "frameCount": 30,
      "durationMs": 6000,
      "frames": "frames/idle-breathe/"
    },
    "idle-look": {
      "fps": 5,
      "loop": true,
      "frameCount": 30,
      "durationMs": 6000,
      "frames": "frames/idle-look/"
    },
    "idle-stretch": {
      "fps": 5,
      "loop": true,
      "frameCount": 30,
      "durationMs": 6000,
      "frames": "frames/idle-stretch/"
    },
    "walk": {
      "fps": 5,
      "loop": true,
      "frameCount": 30,
      "durationMs": 6000,
      "frames": "frames/walk/"
    },
    "drag": {
      "fps": 5,
      "loop": true,
      "frameCount": 30,
      "durationMs": 6000,
      "frames": "frames/drag/"
    },
    "sleep": {
      "fps": 5,
      "loop": true,
      "frameCount": 30,
      "durationMs": 6000,
      "frames": "frames/sleep/"
    },
    "act-cute": {
      "fps": 5,
      "loop": false,
      "frameCount": 30,
      "durationMs": 6000,
      "frames": "frames/act-cute/"
    },
    "act-typing": {
      "fps": 5,
      "loop": false,
      "frameCount": 30,
      "durationMs": 6000,
      "frames": "frames/act-typing/"
    },
    "act-wave": {
      "fps": 5,
      "loop": false,
      "frameCount": 30,
      "durationMs": 6000,
      "frames": "frames/act-wave/"
    },
    "act-hug": {
      "fps": 5,
      "loop": false,
      "frameCount": 30,
      "durationMs": 6000,
      "frames": "frames/act-hug/"
    },
    "act-pout": {
      "fps": 5,
      "loop": false,
      "frameCount": 30,
      "durationMs": 6000,
      "frames": "frames/act-pout/"
    },
    "act-drowsy": {
      "fps": 5,
      "loop": false,
      "frameCount": 30,
      "durationMs": 6000,
      "frames": "frames/act-drowsy/"
    }
  },
  "scenes": {
    "act-cute": {
      "action": "act-cute",
      "bubbleCues": [{ "atMs": 1800, "text": "陪我一会儿嘛。" }],
      "returnTo": "idle-breathe"
    },
    "act-typing": {
      "action": "act-typing",
      "bubbleCues": [{ "atMs": 1800, "text": "我也在努力敲代码。" }],
      "returnTo": "idle-breathe"
    },
    "act-wave": {
      "action": "act-wave",
      "bubbleCues": [{ "atMs": 1200, "text": "嗨，我在这里！" }],
      "returnTo": "idle-breathe"
    },
    "act-hug": {
      "action": "act-hug",
      "bubbleCues": [{ "atMs": 2000, "text": "可以抱一下吗？" }],
      "returnTo": "idle-breathe"
    },
    "act-pout": {
      "action": "act-pout",
      "bubbleCues": [{ "atMs": 1800, "text": "哼，快哄我。" }],
      "returnTo": "idle-breathe"
    },
    "act-drowsy": {
      "action": "act-drowsy",
      "bubbleCues": [{ "atMs": 2200, "text": "有点困啦。" }],
      "returnTo": "idle-breathe"
    },
    "remote-message": {
      "action": "act-wave",
      "bubbleCues": [{ "atMs": 1000, "source": "remoteMessage" }],
      "waitForAcknowledge": true,
      "returnTo": "idle-breathe"
    }
  }
}
```

`id` 只能使用英文字母、数字、下划线和短横线，长度不超过 64。导入后运行时 ID 会变成 `imported:<id>`。新的默认内置形象是 `builtin:q-girl`。

## 导入与存储

应用会把导入的资源包复制到 app data 目录下的 `pet-packages/`，运行时不依赖原始 `.cdpet` 文件路径。

导入前必须校验：

- `pet.json` 是合法 JSON。
- `formatVersion` 必须是 `2`。
- `renderer` 必须是 `frame-sequence`。
- 必须包含 12 个标准动作。
- 每个动作必须正好 30 帧。
- `fps` 必须是 `5`。
- `durationMs` 必须是 `6000`。
- PNG 签名合法。
- `preview.png` 存在且为 PNG。
- 文件数量、单文件大小、总包体积在限制内。
- zip 路径安全，不允许绝对路径、`..`、反斜杠路径或任意嵌套逃逸。

旧版 `formatVersion: 1` 资源包导入失败，提示用户使用新版生成器重新生成。

## 生成建议

- 每张 PNG 建议 768x960，透明背景。
- 角色在所有帧中保持相同大小、脚底基线和画布位置。
- 动作必须有明显肢体变化，不能只改变表情或整体缩放。
- 每个动作至少包含起始、中段、高潮、回落四个关键姿势。
- 角色在 128px 高度下仍能看清动作意图。
- 不要放入版权不明的角色、图片、模型、字体或音频。
- 第一版不会通过 Relay 上传、下载、转发或同步资源包文件。

如果两台设备想显示同一个自定义形象，需要手动交换新版 `.cdpet` 文件并各自导入。
