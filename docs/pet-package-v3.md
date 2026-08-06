# v3 Motion-Pool 桌宠资源包

新生成资源包应使用 `formatVersion: 3` 和 `renderer: "motion-pool"`。`.cdpet` 本质是 zip 文件，只允许包含 `pet.json`、PNG 预览/头像和 motion 帧。

## 目录结构

```text
my-pet.cdpet
├─ pet.json
├─ preview.png
├─ portrait.png              # 可选，在线陪伴头像
├─ portrait-offline.png      # 可选，离线陪伴头像
└─ motions/
   ├─ motion-001/
   │  ├─ 0001.png
   │  └─ ...
   └─ motion-message-pair/
      ├─ 0001.png
      └─ ...
```

`preview.png` 必须存在。`portrait.png` 和 `portrait-offline.png` 可选；缺失时客户端会回退到 `preview.png`，旧包不会因此导入失败。

## pet.json 示例

```json
{
  "formatVersion": 3,
  "renderer": "motion-pool",
  "id": "my-pet",
  "name": "我的桌宠",
  "baseSize": { "width": 256, "height": 320 },
  "frameSize": { "width": 512, "height": 640 },
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
    "motion-message-pair": {
      "fps": 8,
      "loop": true,
      "frameCount": 48,
      "durationMs": 6000,
      "frames": "motions/motion-message-pair/",
      "weight": 1,
      "tags": ["message", "pair", "interaction"]
    }
  }
}
```

## 校验约束

- `defaultMotion` 必须指向已声明 motion。
- motion 至少 1 个，可以有多个；运行时会把可用 motion 作为待机/ambient 池。
- motion id 使用 `[A-Za-z0-9_-]{1,64}`。
- `fps`、`durationMs`、`frameCount`、`weight` 必须是有限整数；`frameCount` 必须等于实际 PNG 帧数量。
- 每个 motion 的帧路径为 `motions/<motion-id>/<0001..NNNN>.png`。
- `baseSize` 和 `frameSize` 宽高范围为 `64..=2048`。
- `preview.png`、`portrait.png`、`portrait-offline.png` 建议 512x512 RGBA 透明 PNG；头像推荐胸部以上，头部约占画面 68%，不要包含文字、边框或额外人物。
- 单文件不超过 8 MiB；压缩包不超过 80 MiB；解压后总量不超过 160 MiB。

## 打包命令

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package_pet_resource.ps1 `
  -PackageDirectory output/pet-packages/q-girl-complete-v3 `
  -OutputFile output/pet-packages/q-girl-complete-v3.cdpet
```

男孩包同理替换目录和输出文件名。

## 运行时说明

六个环绕按钮是产品功能入口，不是 v3 资源包必须提供的动作目录。`act-typing` / “敲电脑”按钮复用为消息输入入口；收到消息或发送成功时，客户端优先选择带 `message` 标签的 motion。

v2 固定动作包仍是过渡兼容格式，但不建议新生成。v1 包会被拒绝导入。
