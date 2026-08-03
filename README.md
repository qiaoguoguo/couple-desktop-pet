# Couple Desktop Pet

本仓库实现本地优先的情侣桌宠 MVP。默认桌宠动画、窗口行为和设置不依赖网络服务。

## Realtime Relay MVP

Local desktop pet features do not require the relay. The relay is only needed for the opt-in one-to-one pairing and online message MVP.

```bash
pnpm server:dev
pnpm server:test
pnpm server:typecheck
pnpm server:build
```

The relay stores local development SQLite data under `server/.data/`.
