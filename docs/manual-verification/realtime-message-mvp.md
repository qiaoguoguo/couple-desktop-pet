# Realtime Message MVP Manual Verification

Date: 2026-08-03

## Scope

This verifies one-to-one directed pairing and online text message forwarding through the local relay.

## Commands

1. Start relay:

```bash
pnpm server:dev
```

For cross-host LAN testing, start the relay on the relay host instead:

```bash
pnpm server:dev:lan
```

2. Start desktop client A:

```bash
pnpm tauri dev
```

3. Start desktop client B with a separate local app data directory. On Windows, use a second copy of the built debug app with a different Tauri app identifier only when Tauri dev cannot isolate app data.

## Checks

1. Open settings on client A.
2. Enable remote interaction.
3. Keep relay URL as `http://127.0.0.1:8787` for same-machine testing. For
   cross-host LAN testing, enter the relay host LAN URL, for example
   `http://192.168.1.47:8787`; `127.0.0.1` only points to the current machine.
4. Click `生成绑定码`.
5. Open settings on client B.
6. Enable remote interaction.
7. Enter A's code and click `绑定`.
8. Confirm both clients show paired state.
9. Confirm both clients show peer online after WebSocket auth.
10. Send `想你啦` from A.
11. Confirm B shows `想你啦` in current-session history.
12. Confirm B shows a pet bubble with `想你啦` when bubbles are enabled.
13. Close B and confirm A changes peer presence to offline.
14. Restart relay and confirm the pair remains valid after both clients reconnect.

## Expected Data Behavior

- `server/.data/relay.sqlite` contains devices, pair codes, and pairs.
- Message text is not stored in SQLite.
- Local settings contain `sync.deviceId`, `sync.deviceSecret`, `sync.pairId`, and `sync.peerDeviceId`.
