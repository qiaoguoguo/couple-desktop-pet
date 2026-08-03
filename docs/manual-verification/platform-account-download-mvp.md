# 平台一期本地手工验证

## 本地验证

1. 运行 `pnpm platform-api:dev`。
2. 运行 `pnpm platform-web:dev`。
3. 打开 `http://127.0.0.1:19080`。
4. 在 API 启动前设置 `PLATFORM_ADMIN_EMAIL` 和 `PLATFORM_ADMIN_PASSWORD`，确认首个管理员会由 bootstrap 创建。
5. 如需演示下载包，把 Windows exe 放在 `PLATFORM_RELEASE_STORAGE_PATH` 下，并设置 `PLATFORM_DEMO_WINDOWS_EXE_PATH` 与 `PLATFORM_DEMO_WINDOWS_VERSION`。
6. 使用管理员登录并进入管理后台，创建邀请码。
7. 使用邀请码注册普通用户。
8. 普通用户登录后进入下载页。
9. 使用 Bearer token 调用 `POST /devices`，确认返回 `devicePublicId` 和一次性 `deviceSecret`。
10. 添加或 bootstrap Windows release。
11. 下载页显示 Windows release。
12. 点击下载后，管理后台能看到 download event。
13. 普通用户访问 `/admin` 时显示需要管理员权限。

## Compose 验证

1. 复制 `.env.example` 为 `.env` 并替换强密码/密钥。
2. 执行：

```bash
docker compose -p couple-pet-platform -f deploy/couple-pet-platform/compose.yaml up -d --build
```

3. 检查：

```bash
curl http://127.0.0.1:19081/health
```

4. Web 访问：`http://127.0.0.1:19080`。

## 未覆盖

- 本轮不部署云服务器。
- 本轮不接入桌宠客户端账号登录。
- 本轮不迁移或修改现有 relay 协议。
- 本轮不实现手机号、支付、排行榜或轻社交。
