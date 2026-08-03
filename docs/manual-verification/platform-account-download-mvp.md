# 平台一期本地手工验证

## 本地验证

1. 运行 `pnpm platform-api:dev`。
2. 运行 `pnpm platform-web:dev`。
3. 打开 `http://127.0.0.1:19080`。
4. 通过管理员 API 或 bootstrap 创建管理员。
5. 进入管理后台，创建邀请码。
6. 使用邀请码注册普通用户。
7. 普通用户登录后进入下载页。
8. 使用 Bearer token 调用 `POST /devices`，确认返回 `devicePublicId` 和一次性 `deviceSecret`。
9. 添加或 bootstrap Windows release。
10. 下载页显示 Windows release。
11. 点击下载后，管理后台能看到 download event。
12. 普通用户访问 `/admin` 时显示需要管理员权限。

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
