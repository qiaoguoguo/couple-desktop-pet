# Tasks 1-4 Report

## Scope

- Implemented only Tasks 1-4 from `docs/superpowers/plans/2026-08-06-embedded-peer-activity-status.md`.
- Did not modify App UI, InteractionMenu, CSS, Tauri satellite windows, character assets, pairing/account/database schema, or deploy a remote server.

## Commits

- Task 1: `a2b2566 feat: define realtime activity status protocol`
- Task 2: `956f2a8 feat: relay paired activity statuses`
- Task 3: `c98a687 feat: persist local activity status`
- Task 4: `adb5420 feat: sync peer activity status in realtime`

Note: `d4ee9cf docs: fix relay deployment copy layout` is present between Task 1 and Task 2 in history. It is outside Tasks 1-4 and was not part of this implementation scope.

## Task 1 - Shared Activity Status Contract

Files:
- `shared/activityStatus.ts`
- `shared/syncProtocol.ts`
- `shared/syncProtocol.test.ts`

RED evidence:
- Task 1 was already committed in the worktree at handoff (`a2b2566`), so I did not recreate a failing RED run without rewriting history.
- The committed test additions cover valid `peer.status` values, `null`, and rejection of `playing-games`.

GREEN evidence:
- Command: `pnpm vitest run shared/syncProtocol.test.ts`
- Result: exit 0, 1 test file passed, 9 tests passed.

Review notes:
- The shared catalog is limited to `slacking`, `dazing`, and `overtime`.
- `peer.status` parsing rejects unknown status IDs and accepts only nullable catalog values.

## Task 2 - Relay Status Forwarding

Files:
- `server/src/connectionRegistry.ts`
- `server/src/websocketRelay.ts`
- `server/src/websocketRelay.test.ts`

RED evidence:
- Relay status tests and implementation were already present as uncommitted work before the Task 2 commit.
- Command run at that point: `pnpm --dir server test -- websocketRelay.test.ts`
- Result: exit 0, 3 test files passed, 21 tests passed. This means a failing RED run was not captured in the current handoff state.

GREEN evidence:
- Command: `pnpm --dir server test`
- Result: exit 0, 3 test files passed, 21 tests passed.
- Command: `pnpm --dir server build`
- Result: exit 0.

Log-safety evidence:
- Command: `rg -n "console\.|logger|log\(|activityStatus|message\.text|deviceSecret" server/src`
- Result: only code/test references were found; no new console/logger logging of `activityStatus`, device secrets, or message text.

Review notes:
- Relay stores `activityStatus` only on `AuthenticatedConnection` in `ConnectionRegistry`.
- Relay does not write activity status to SQLite or `RelayRepository`.
- `status.update` validates `pairId` and nullable catalog status before mutating the live connection.
- Status events are sent only to the authenticated paired peer.
- Later-authenticated peers receive the already-online peer status only when it is non-null; live `null` updates are still forwarded to clear stale peer UI state.

## Task 3 - Persist Local Activity Status

Files:
- `src/settings/settingsTypes.ts`
- `src/settings/defaultSettings.ts`
- `src/settings/settingsStore.ts`
- `src/settings/settingsStore.test.ts`

RED evidence:
- Command: `pnpm vitest run src/settings/settingsStore.test.ts`
- Result: exit 1, 1 test file failed, 23 tests run, 5 failed.
- Failed checks: missing default `activityStatus`, valid status not persisted, unknown status not normalized to `null`, pair-field clearing did not retain local status, and save output omitted selected status.

GREEN evidence:
- Command: `pnpm vitest run src/settings/settingsStore.test.ts`
- Result: exit 0, 1 test file passed, 23 tests passed.
- Command: `pnpm typecheck`
- Result: exit 0.

Review notes:
- Older persisted settings without `activityStatus` migrate to `null`.
- Unknown persisted values such as `gaming` normalize to `null`.
- Clearing `pairId` and `peerDeviceId` does not clear local activity status.

## Task 4 - Realtime Client and React Sync State

Files:
- `src/sync/realtimeClient.ts`
- `src/sync/realtimeClient.test.ts`
- `src/sync/syncTypes.ts`
- `src/sync/useRealtimeSync.ts`
- `src/sync/useRealtimeSync.test.tsx`
- `src/sync/SyncPanel.test.tsx` (fixture update for the new required runtime state field)

RED evidence:
- Command: `pnpm vitest run src/sync/realtimeClient.test.ts src/sync/useRealtimeSync.test.tsx`
- Result: exit 1, 2 test files failed, 14 tests run, 6 failed.
- Failed checks: no auth-time `status.update`, missing `setActivityStatus`, no queued resend after reconnect, no `peer.status` event projection, hook did not pass local status into the client, and hook did not store/clear peer activity status.

GREEN evidence:
- Command: `pnpm vitest run src/sync/realtimeClient.test.ts src/sync/useRealtimeSync.test.tsx`
- Result: exit 0, 2 test files passed, 14 tests passed.
- Command: `pnpm typecheck`
- Result: exit 0.

Review notes:
- `RealtimeClient` sends the current local status after `auth.ok`.
- `setActivityStatus` updates the retained local value and returns `{ synced: false }` while disconnected.
- Reconnect plus `auth.ok` resends the latest retained local status.
- `peer.status` is exposed as a `peerStatus` client event with `peerActivityStatus`.
- `useRealtimeSync` initializes `peerActivityStatus` to `null`, clears it when connection leaves `connected`, retains it while peer presence is `offline`, and clears it on a fresh `peer.online`.
- `sync.activityStatus` is passed to `RealtimeClient` construction but is intentionally not part of the memo dependency list.

## Required Verification Summary

- `pnpm vitest run shared/syncProtocol.test.ts`: exit 0, 1 file, 9 tests.
- `pnpm --dir server test`: exit 0, 3 files, 21 tests.
- `pnpm --dir server build`: exit 0.
- `pnpm vitest run src/settings/settingsStore.test.ts`: exit 0, 1 file, 23 tests.
- `pnpm vitest run src/sync/realtimeClient.test.ts src/sync/useRealtimeSync.test.tsx`: exit 0, 2 files, 14 tests.
- `pnpm typecheck`: exit 0.

## Self-Review

- Cross-version compatibility: older local settings and relay clients that omit activity status normalize to `null`; protocol parsing rejects unknown status IDs.
- Status cleanup timing: Relay state is tied to the live WebSocket connection; React state clears on disconnected/auth-failed/disabled and on fresh `peer.online`.
- Connection rebuild: local status changes while disconnected are retained in the client and resent after the next `auth.ok`.
- Log safety: no logging was added for activity status, device secrets, or message text.
- Remaining risk: RED evidence for Tasks 1 and 2 could not be freshly reproduced because those changes were already present in the handoff state before I continued from Task 3.

## Fix Round 1 - Capability Negotiation

Review findings addressed:
- New Relay no longer sends `peer.status` to clients that did not declare `activity-status-v1`.
- New client now declares `activity-status-v1` during auth but sends `status.update` only when Relay `auth.ok` advertises the same capability.
- Relay tests now include a third non-paired online socket for status-forwarding isolation.
- Wrong-pair status updates are proven not to pollute `connection.activityStatus`: the peer comes online after the rejected update, receives no status, then receives only the later valid value.

RED evidence:
- Command: `pnpm vitest run shared/syncProtocol.test.ts`
- Result: exit 1, 1 test file failed, 12 tests run, 2 failed. Failures showed `auth.ok` capabilities were not parsed and malformed capability arrays were accepted.
- Command: `pnpm --dir server test -- websocketRelay.test.ts`
- Result: exit 1, 3 test files run, websocket relay tests failed because Relay did not advertise capabilities in `auth.ok`.
- Command: `pnpm vitest run src/sync/realtimeClient.test.ts src/sync/useRealtimeSync.test.tsx`
- Result: exit 1, 2 test files run, 15 tests run, 2 failed. Failures showed auth did not declare `activity-status-v1` and the client still sent status to legacy relays.

GREEN evidence:
- Command: `pnpm vitest run shared/syncProtocol.test.ts`
- Result: exit 0, 1 test file passed, 12 tests passed.
- Command: `pnpm --dir server test -- websocketRelay.test.ts`
- Result: exit 0, 3 test files passed, 22 tests passed.
- Command: `pnpm vitest run src/sync/realtimeClient.test.ts src/sync/useRealtimeSync.test.tsx`
- Result: exit 0, 2 test files passed, 15 tests passed.
- Command: `pnpm typecheck`
- Result: exit 0.
- Command: `pnpm --dir server build`
- Result: exit 0.
- Command: `git diff --check`
- Result: exit 0.

Implementation notes:
- Added `ACTIVITY_STATUS_CAPABILITY = "activity-status-v1"` to the shared protocol surface.
- `auth.ok` parsing accepts only string arrays, filters to supported capabilities, rejects malformed capability payloads, and keeps missing capabilities compatible with old protocol peers.
- Relay parses auth capabilities, records `supportsActivityStatus` on live connections, advertises `activity-status-v1` in `auth.ok`, and filters `peer.status` by target support.
- Client includes the capability in auth and gates both auth-time and later `setActivityStatus` sends behind server capability support.
- Capability negotiation is not used as authorization; Relay still validates `pairId` before mutating activity status.
- No activity status, device secret, or message text logging was added.
- `d4ee9cf docs: fix relay deployment copy layout` remains a main-agent planning correction outside this code fix round and was not reverted.
