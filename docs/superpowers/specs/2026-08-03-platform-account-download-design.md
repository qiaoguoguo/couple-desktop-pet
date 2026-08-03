# 平台一期：账号、下载与设备绑定设计

## 背景

桌宠客户端已经具备本地桌宠、资源包导入、局域网中继配对和基础消息互动能力。下一阶段需要从“本地开发版”走向“可开放给用户下载的内测平台”，并为后续互动数据、连续互动天数、排行榜和轻社交打基础。

当前云服务器信息：

- 服务器：`159.75.175.47`
- 系统：OpenCloudOS 9.4
- Docker：29.3.1
- Docker Compose：2.30.3
- 内存：约 3.6GiB
- 根盘：40G，已用约 67%
- 已占用端口：`443`、`5432`、`5175`、`18080`、`6080`、`8000`、`8889`、`19000`、`19001`
- 已有业务目录：`/opt/qherp`

当前没有域名。平台一期先用 IP + 独立端口内测，不改动已有 `qherp` 服务和已有 443 入口。

## 目标

- 提供一个封闭内测官网，用户通过邀请码进入注册/登录流程。
- 支持邮箱 + 密码登录。
- 登录后用户可以下载 Windows 版桌宠安装包或 debug 内测包。
- 桌宠客户端后续可以登录账号，并把本机注册为该账号下的设备。
- 提供基础管理后台，能管理用户、邀请码、设备、版本包和下载记录。
- 为后续互动数据、连续互动天数和排行榜预留数据模型，但不在一期实现完整轻社交。
- 使用 Docker Compose 部署到单台云服务器，避免影响现有服务。

## 非目标

- 一期不做开放注册。
- 一期不做手机号短信验证码。
- 一期不做支付、会员、商城、创意工坊。
- 一期不做公开广场、评论、关注和私信。
- 一期不存储聊天消息原文，避免早期隐私和合规风险扩大。
- 一期不改现有 `.cdpet` 资源包格式。
- 一期不替换现有本地/局域网 relay 的实现；后续可逐步迁移到云端实时网关。
- 一期不接管服务器现有 `qherp` 容器、数据库和 MinIO。

## 部署形态

一期采用单机 Docker Compose，目录固定为：

```text
/opt/couple-pet-platform
```

推荐端口：

- `19080`：前台官网、下载页、管理后台静态页面。
- `19081`：平台 API 和后续实时网关入口。

暂时不使用 443。等有域名后，再新增统一反向代理或接入已有网关，映射为：

- `https://pet.example.com`
- `https://api.pet.example.com`
- `wss://api.pet.example.com/ws`
- `https://admin.pet.example.com`

## 服务组成

### `platform-api`

负责账号、邀请码、设备、版本、下载记录和管理后台 API。第一版建议用 Node.js + Fastify 或 Hono，数据库使用 PostgreSQL。

核心能力：

- 健康检查：`GET /health`
- 邀请码校验：`POST /auth/invitations/verify`
- 注册：`POST /auth/register`
- 登录：`POST /auth/login`
- 当前用户：`GET /me`
- 设备注册：`POST /devices`
- 我的设备：`GET /devices`
- 版本列表：`GET /releases`
- 下载记录：`POST /downloads`
- 管理后台 API：`/admin/*`

### `platform-web`

负责官网、登录注册、下载页和管理后台页面。第一版可以是一个 React + Vite 应用，用路由区分：

- `/`：内测介绍和登录入口
- `/invite`：邀请码输入
- `/login`：邮箱登录
- `/register`：邀请码注册
- `/download`：登录后下载
- `/admin`：管理后台

官网不是营销页优先，而是内测入口和下载工具，页面应克制、清晰、可操作。

### `postgres`

独立 PostgreSQL 容器，不复用已有 `qherp-postgres`。原因：

- 避免业务数据和权限混用。
- 方便备份、迁移和回滚。
- 后续平台数据模型会快速变化，独立数据库更安全。

### `storage`

一期可以先用服务器本地目录挂载保存安装包：

```text
/opt/couple-pet-platform/storage/releases
```

后续有域名和 CDN 后，再迁移到对象存储。

## 数据模型

### `users`

- `id`
- `email`
- `password_hash`
- `display_name`
- `role`：`user` 或 `admin`
- `status`：`active`、`disabled`
- `created_at`
- `last_login_at`

约束：

- `email` 唯一。
- 密码只存 hash，不存明文。

### `invitations`

- `id`
- `code`
- `status`：`unused`、`used`、`disabled`
- `max_uses`
- `used_count`
- `created_by`
- `created_at`
- `expires_at`

一期推荐默认一个邀请码只能使用一次。后续可以支持批量邀请码和多次使用邀请码。

### `devices`

- `id`
- `user_id`
- `device_name`
- `platform`：`windows`、`macos`、`linux`
- `client_version`
- `device_public_id`
- `device_secret_hash`
- `last_seen_at`
- `created_at`

客户端登录后注册设备。设备 secret 只在客户端本地保存，服务端存 hash。

### `releases`

- `id`
- `version`
- `platform`
- `channel`：`internal`、`stable`
- `file_name`
- `file_path`
- `file_size`
- `sha256`
- `release_notes`
- `created_at`
- `published_at`

一期先支持 Windows 包。后续扩展 macOS、Linux。

### `download_events`

- `id`
- `user_id`
- `release_id`
- `ip`
- `user_agent`
- `created_at`

用于判断安装包分发情况，不记录过多敏感信息。

### 预留：`interaction_events`

一期只设计不实现完整统计。

- `id`
- `source_user_id`
- `target_user_id`
- `pair_id`
- `event_type`
- `occurred_at`

后续连续互动天数和排行榜基于事件聚合，不直接依赖聊天消息原文。

## 客户端接入原则

桌宠客户端后续增加“账号登录”设置区：

- 用户输入邮箱和密码登录。
- 客户端保存访问令牌和刷新令牌。
- 登录成功后调用设备注册接口。
- 设备注册成功后保存 `device_public_id` 和设备凭据。
- 后续绑定、互动统计、版本更新都通过平台 API 关联用户和设备。

令牌存储应通过 Tauri 安全存储能力或系统凭据能力实现；如果第一版环境暂不具备，必须在文档中明确风险，不把 token 明文长期散落在普通配置中。

## 安全边界

- 管理后台必须登录管理员账号才能访问。
- 邀请码注册接口必须校验邀请码状态和过期时间。
- 密码使用强 hash，例如 Argon2id 或 bcrypt。
- API 返回错误不能泄露密码、hash、数据库细节。
- 下载记录可以记录 IP，但不要记录聊天原文。
- 管理后台不提供查看用户私聊内容的入口。
- 一期如果使用 IP + HTTP，必须标注为内测环境；正式开放前必须切换到域名 + HTTPS。

## 服务器部署约束

- 不使用已被占用的 `443`、`5432`、`5175`、`18080`、`6080`、`8000`、`8889`、`19000`、`19001`。
- 不修改 `/opt/qherp`。
- 不停止已有 Docker 容器。
- 新服务统一放到 `/opt/couple-pet-platform`。
- Compose 项目名使用 `couple-pet-platform`。
- 数据库端口默认不暴露到公网，只允许 Compose 内部网络访问。
- 只暴露 `19080` 和 `19081` 给外部内测访问。

## 后续扩展路径

### 阶段二：客户端账号登录

- Tauri 客户端增加账号登录 UI。
- 客户端从本地 relay 配置过渡到云端 API 配置。
- 设备注册和在线状态纳入平台。

### 阶段三：互动数据

- 消息、串门、互动动作只记录事件类型和时间。
- 计算每日互动次数、连续互动天数、最近互动时间。
- 用户可关闭数据统计参与。

### 阶段四：轻社交

- 连续互动排行榜。
- 本周互动榜。
- 用户昵称、头像、公开桌宠形象。
- 排行榜 opt-in，不默认公开用户关系。

## 验收标准

- 设计不要求修改现有桌宠客户端核心。
- 设计不要求修改现有 relay 协议。
- 平台一期可以在无域名情况下通过 `http://159.75.175.47:19080` 和 `http://159.75.175.47:19081` 内测。
- Docker Compose 部署不影响已有 `qherp` 服务。
- 数据模型能支撑邀请码、用户、设备、版本下载和后续互动统计。
- 管理后台第一版至少能查看和管理用户、邀请码、设备、版本和下载记录。

## 自检

- 范围已拆到平台一期，没有把排行榜和轻社交直接塞进第一版。
- 无域名场景已明确为内测，不作为正式开放方案。
- 已避开服务器现有端口和现有业务目录。
- 账号、设备、下载、后台和后续互动数据之间有清晰边界。
- 没有要求存储聊天原文，降低隐私风险。
