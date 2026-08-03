# 桌宠形象资源包格式

第一版形象资源包使用 `.cdpet` 扩展名，本质是 zip 文件。资源包只允许包含 JSON 和 PNG，不包含脚本、网页、音频、视频、模型或远程链接。

## 目录结构

```text
my-pet.cdpet
├─ pet.json
├─ preview.png
└─ frames/
   ├─ idle-breathe-01.png
   ├─ idle-breathe-02.png
   └─ act-drowsy-18.png
```

必须包含 12 个固定动作，每个动作正好 18 帧：

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

帧文件命名必须是 `<action>-01.png` 到 `<action>-18.png`，并放在 `frames/` 目录内。

## pet.json

```json
{
  "formatVersion": 1,
  "id": "my-custom-pet",
  "name": "我的桌宠",
  "baseSize": { "width": 256, "height": 320 },
  "frameSize": { "width": 512, "height": 512 },
  "actions": {
    "idle-breathe": { "fps": 3, "loop": true },
    "idle-look": { "fps": 3, "loop": true },
    "idle-stretch": { "fps": 3, "loop": true },
    "walk": { "fps": 3, "loop": true },
    "drag": { "fps": 3, "loop": true },
    "sleep": { "fps": 3, "loop": true },
    "act-cute": { "fps": 3, "loop": false },
    "act-typing": { "fps": 3, "loop": false },
    "act-wave": { "fps": 3, "loop": false },
    "act-hug": { "fps": 3, "loop": false },
    "act-pout": { "fps": 3, "loop": false },
    "act-drowsy": { "fps": 3, "loop": false }
  }
}
```

`id` 只能使用英文字母、数字、下划线和短横线，长度不超过 64。导入后运行时 ID 会变成 `imported:<id>`。内置 fallback 始终是 `builtin:star-sleeper`。

## 导入与存储

应用会把导入的资源包复制到 app data 目录下的 `pet-packages/`，运行时不依赖原始 `.cdpet` 文件路径。导入前会校验 manifest、必需帧、PNG 签名、文件数量、大小限制和 zip 路径安全。

资源包内不允许绝对路径、`..`、反斜杠路径、任意嵌套目录或非 JSON/PNG 文件。第一版不会通过 Relay 上传、下载、转发或同步资源包文件。

## 生成建议

- 每张 PNG 建议 512x512，透明背景。
- 角色在所有帧中保持相同大小和位置。
- `baseSize` 建议保持 256x320，方便适配当前桌宠窗口。
- 不要放入版权不明的角色、图片、模型、字体或音频。
- 如果两台设备想显示同一个自定义形象，需要手动交换 `.cdpet` 文件并各自导入。
