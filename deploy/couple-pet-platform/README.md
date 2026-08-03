# 情侣桌宠平台一期部署说明

本目录只描述独立平台一期服务，不复用也不修改现有 `/opt/qherp`。

## 目录和端口

- 远端目录：`/opt/couple-pet-platform`
- Web：`19080:80`
- API：`19081:3000`
- PostgreSQL：仅 Compose 内部网络，不暴露公网端口

## 准备

1. 将仓库复制到 `/opt/couple-pet-platform`。
2. 复制环境变量模板：

```bash
cp deploy/couple-pet-platform/.env.example .env
```

3. 修改 `.env`，至少设置强随机值：

```bash
POSTGRES_PASSWORD=...
PLATFORM_JWT_SECRET=...
PLATFORM_CORS_ORIGINS=http://159.75.175.47:19080
PLATFORM_ADMIN_EMAIL=...
PLATFORM_ADMIN_PASSWORD=...
```

不要把 `.env` 提交到 git。

## 启动

```bash
docker compose -p couple-pet-platform -f deploy/couple-pet-platform/compose.yaml up -d --build
```

## 冒烟检查

```bash
curl http://159.75.175.47:19081/health
```

预期返回：

```json
{"ok":true,"service":"platform-api"}
```

Web 入口：

```text
http://159.75.175.47:19080
```

Release 文件只挂载给 `platform-api`，由登录态保护的
`GET /releases/:id/download` 记录下载后返回文件；不要通过 nginx
静态 `/releases/` 暴露安装包。

## 停止与回滚

停止服务但保留数据卷：

```bash
docker compose -p couple-pet-platform -f deploy/couple-pet-platform/compose.yaml down
```

回滚代码版本后重新构建：

```bash
git checkout <previous-commit>
docker compose -p couple-pet-platform -f deploy/couple-pet-platform/compose.yaml up -d --build
```

如需删除数据卷，必须先备份并由主代理确认。
