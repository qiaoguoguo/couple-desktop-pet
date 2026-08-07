# Cloud Relay Migration Fix Implementation Report

Date: 2026-08-07
Workspace: `C:\Users\14567\.codex\worktrees\6515\情侣桌宠`
Start HEAD: `2b16736`

## Root Cause

- Public Relay health is available at `http://159.75.175.47:8787/health`.
- Existing local settings could persist an old LAN Relay URL such as `http://192.168.1.47:8787` together with a stale Relay-scoped `pairId`.
- `settingsStore.normalizeRelayUrl` only migrated exact localhost values, so RFC1918 LAN URLs remained active.
- The cloud Relay has no old LAN-scoped pair/device state, so the client attempted connect/unpair against the wrong Relay and surfaced `relay_unavailable`.

## Fix

- `settingsStore` now detects legacy local/private Relay hosts using URL host parsing:
  - `localhost`
  - `::1`
  - IPv4 `0/8`, `10/8`, `127/8`, `172.16/12`, `192.168/16`
- When such a Relay URL is migrated to `DEFAULT_RELAY_URL`, `pairId` and `peerDeviceId` are cleared.
- `deviceId`, `deviceSecret`, `activityStatus`, appearance, and other settings are preserved.
- Custom public Relay URLs are preserved, including private-looking domain names such as `https://192.168.x.example.com`.
- `loadSettings` persists the normalized migrated settings back through the settings API. Write failure is ignored so startup still uses the normalized in-memory settings.
- App startup regression verifies a stale LAN-bound setting renders as unpaired and generates a new pair code against the cloud Relay.

## RED Evidence

1. `pnpm vitest run src/settings/settingsStore.test.ts`
   - Exit: 1
   - Result: 32 tests, 7 failed, 25 passed
   - Expected failures: RFC1918/local Relay URLs were not migrated and stale `pairId`/`peerDeviceId` were not cleared.

2. `pnpm vitest run src/settings/settingsStore.test.ts`
   - Exit: 1
   - Result: 33 tests, 1 failed, 32 passed
   - Expected failure: migrated settings were returned in memory but not persisted through `writeSettings`.

## GREEN Evidence

- `pnpm vitest run src/settings/settingsStore.test.ts`
  - Exit: 0
  - Result: 33 tests passed

- `pnpm vitest run src/settings/settingsStore.test.ts src/app/App.test.tsx`
  - Exit: 0
  - Result: 97 tests passed

## Full Verification

- `pnpm test`
  - Exit: 0
  - Result: 37 test files passed, 283 tests passed

- `pnpm typecheck`
  - Exit: 0

- `pnpm build`
  - Exit: 0

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
  - Exit: 0

- `cargo test --manifest-path src-tauri/Cargo.toml`
  - Exit: 0
  - Result: 36 tests passed

- `cargo check --manifest-path src-tauri/Cargo.toml`
  - Exit: 0

- `pnpm tauri build --debug`
  - First attempt exit: 1
  - Cause: old debug EXE was locked by `couple-desktop-pet.exe` PID 43632 from this worktree.
  - Action: stopped only PID 43632 after confirming its command line pointed at this worktree debug EXE.
  - Retry exit: 0

- `git diff --check`
  - Exit: 0
  - Note: Git emitted LF/CRLF normalization warnings only.

## Debug EXE

- Path: `C:\Users\14567\.codex\worktrees\6515\情侣桌宠\src-tauri\target\debug\couple-desktop-pet.exe`
- Last write: `2026-08-07 09:33:03 +08:00`
- Size: `172851712` bytes
- SHA256: `7ABA2A96F37E41733DA837CB1AF3DF4EB00DA493F13A6135775406FE0A280439`

## Public Relay Smoke

Command used a temporary `tsx` script from the `server` workspace with `ws` and shared protocol parsing/capability constants. No device secrets were printed.

- Health: `200`
- Temporary pair: `*164b1798`
- Temporary device suffixes: `*2cec1234` / `*e8b66f6d`
- WebSocket auth with `activity-status-v1`: OK
- Presence online observation: OK
- Status updates A to B: `slacking`, `dazing`, `overtime`, `null` all forwarded
- Reverse status B to A: OK
- Message delivery: receiver got `message.received`, sender got `message.delivered`, no sender echo observed
- Cleanup: `unpair` OK
- Old pair invalidation after cleanup: both devices returned `pair_not_found`

Transient smoke notes:
- One dry run failed before network work because stdin `tsx` was given TypeScript-only `import type` syntax.
- One run completed unpair but expected only `auth_failed`; Relay returned `pair_not_found`, which is also a valid old-pair invalidation result. The final smoke accepted either invalidation code and passed.

## Boundary Checks

- Modified files are limited to:
  - `src/settings/settingsStore.ts`
  - `src/settings/settingsStore.test.ts`
  - `src/app/App.test.tsx`
  - this report
- No changes to `shared`, `server`, Relay protocol, database schema, deployment files, or user settings.
- Public/custom Relay behavior is preserved.

## Remaining Risks

- Persisting migrated settings depends on `writeSettings`; if the OS write fails, the app still starts with normalized in-memory settings and will retry migration on next load.
- IPv4 detection intentionally uses parsed URL hostnames and numeric dotted IPv4 only; exotic numeric host notations are not treated as a supported user-facing custom Relay format.
