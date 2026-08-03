# Couple Desktop Pet

本仓库实现本地优先的情侣桌宠 MVP。默认桌宠动画、窗口行为和设置不依赖网络服务。

## Realtime Relay MVP

Local desktop pet features do not require the relay. The relay is only needed for the opt-in one-to-one pairing and online message MVP.

```bash
pnpm server:dev
pnpm server:dev:lan
pnpm server:test
pnpm server:typecheck
pnpm server:build
```

Use `pnpm server:dev` for same-machine testing. For cross-host LAN testing,
run `pnpm server:dev:lan` on the relay host, then set the other computer's
relay URL to `http://<relay-host-lan-ip>:8787`, for example
`http://192.168.1.47:8787`. `127.0.0.1` only points to the same machine.

The relay stores local development SQLite data under `server/.data/`.

## Platform Account/Download MVP

The account/download platform is a separate local/deployable workspace and does
not change the realtime relay protocol.

```bash
pnpm platform-api:dev
pnpm platform-web:dev
pnpm platform-api:test
pnpm platform-web:test
```

For Compose deployment, configure `PLATFORM_CORS_ORIGINS` with the platform web
origin, for example `http://159.75.175.47:19080`. Release files are served only
through the authenticated platform API download endpoint so download events can
be recorded.
