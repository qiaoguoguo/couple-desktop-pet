# Couple Spark Streak And Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the remaining `求抱抱` menu slot with a server-authoritative weekday couple streak, a dynamic tiered flame entry, and the approved top-20 all-server leaderboard.

**Architecture:** Add strict shared spark contracts, a Beijing calendar helper, and an idempotent SQLite daily ledger plus materialized streak summary. The WebSocket relay records only successfully relayed eligible messages and pushes changed snapshots; authenticated HTTP endpoints provide lightweight refreshes and fresh leaderboard reads. React keeps spark state in a focused hook, while a dedicated panel and generated flame assets implement the approved visual target without changing the pet state machine or edge-hidden behavior.

**Tech Stack:** TypeScript 7, React 19, Vitest, Node.js 22, `ws`, `better-sqlite3`, Tauri 2, Rust, CSS, transparent PNG assets, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-08-19-couple-spark-streak-leaderboard-design.md`

## Global Constraints

- Read the spec and `docs/assets/spark-leaderboard-selected-v1.png` before editing.
- Keep the interaction menu at exactly six entries and replace `act-hug`; do not change or delete the existing hug action frames or pet state-machine support.
- Only a successfully relayed plain text message or `content.kind === "surprise"` can qualify.
- Use server time in `Asia/Shanghai`; Saturday and Sunday neither increment nor break the streak.
- Daily accounting must be idempotent and a new `pair_id` must start at zero.
- Never expose public device IDs, pair IDs, secrets, coordinates, districts, or message content through leaderboard responses or logs.
- Use seven original transparent PNG flame assets. Do not use emoji, Unicode fire characters, text, colored squares, inline SVG, handcrafted SVG, or CSS primitive drawings as visible flame assets.
- Match the selected reference: `#fafaf6`, `#111`, `#f6534d`, 7px radius, zero letter spacing, leaderboard-first hierarchy, unframed top three, continuous rows, and fixed near-black self strip.
- Keep transparent window regions click-through and leave all static edge-hidden behavior unchanged.
- Add no runtime dependency unless repository inspection proves the existing platform APIs cannot implement a required behavior.
- Preserve every pre-existing dirty-worktree change. Do not reset, restore, reformat, stage, or commit unrelated files.
- The fixed worker must not create commits. The coordinating agent reviews and stages the final scoped implementation.

---

### Task 1: Shared Spark Contract And Tier Boundaries

**Files:**
- Create: `shared/sparkProtocol.ts`
- Create: `shared/sparkProtocol.test.ts`
- Modify: `shared/syncProtocol.ts`
- Modify: `shared/syncProtocol.test.ts`

**Interfaces:**
- Produces `SPARK_SYNC_CAPABILITY`, `SparkTier`, `SparkCalendarState`, `SparkInteractionKind`, `PairSparkRequest`, `SparkStreakSnapshotV1`, `SparkLeaderboardEntryV1`, `SparkLeaderboardSelfV1`, `SparkLeaderboardResponseV1`, `getSparkTier`, `readSparkStreakSnapshot`, and `readSparkLeaderboardResponse`.
- Extends `SyncCapability` with `"spark-v1"`.
- Adds server message `{ type: "spark.updated"; pairId: string; snapshot: SparkStreakSnapshotV1 }`.

- [ ] **Step 1: Write failing parser and boundary tests**

Use every approved boundary and reject tier/day mismatches:

```ts
expect(getSparkTier(0)).toBe("unlit");
expect(getSparkTier(1)).toBe("glimmer");
expect(getSparkTier(5)).toBe("warm");
expect(getSparkTier(15)).toBe("heartflame");
expect(getSparkTier(30)).toBe("blaze");
expect(getSparkTier(60)).toBe("everbright");
expect(getSparkTier(100)).toBe("stellar");

expect(readSparkStreakSnapshot({
  version: 1,
  pairId: "pair-a",
  streakDays: 30,
  tier: "heartflame",
  calendarState: "qualified_today",
  lastQualifiedDate: "2026-08-19",
  timezone: "Asia/Shanghai",
  asOf: "2026-08-19T02:00:00.000Z",
  refreshAt: "2026-08-19T16:00:00.000Z",
})).toBeNull();
```

Also reject negative/fractional days, malformed canonical timestamps, invalid ranks, more than 20 public rows, a non-null rank for a zero-day self row, private identifier fields, and unsupported versions.

- [ ] **Step 2: Run RED**

Run:

```powershell
pnpm test -- shared/sparkProtocol.test.ts shared/syncProtocol.test.ts
```

Expected: failure because the spark contract and capability do not exist.

- [ ] **Step 3: Implement strict contracts and parsers**

Use these exact public shapes:

```ts
export type SparkTier =
  | "unlit"
  | "glimmer"
  | "warm"
  | "heartflame"
  | "blaze"
  | "everbright"
  | "stellar";

export type SparkCalendarState =
  | "qualified_today"
  | "pending_today"
  | "weekend_protected";

export interface SparkStreakSnapshotV1 {
  version: 1;
  pairId: string;
  streakDays: number;
  tier: SparkTier;
  calendarState: SparkCalendarState;
  lastQualifiedDate: string | null;
  timezone: "Asia/Shanghai";
  asOf: string;
  refreshAt: string;
}

export interface SparkLeaderboardEntryV1 {
  rank: number;
  displayNames: [string, string];
  cities: [string, string];
  streakDays: number;
  tier: SparkTier;
}

export interface SparkLeaderboardSelfV1 {
  rank: number | null;
  displayNames: [string, string];
  cities: [string, string];
  streakDays: number;
  tier: SparkTier;
}

export interface PairSparkRequest {
  deviceId: string;
  deviceSecret: string;
  pairId: string;
}

export interface SparkLeaderboardResponseV1 {
  version: 1;
  snapshot: SparkStreakSnapshotV1;
  top20: SparkLeaderboardEntryV1[];
  self: SparkLeaderboardSelfV1;
  asOf: string;
}
```

Parsers must reconstruct only declared fields rather than casting arbitrary records.

- [ ] **Step 4: Parse `spark.updated` through the existing server-message parser**

Add the capability to both supported-capability lists and ensure legacy `auth.ok` payloads without it remain valid.

- [ ] **Step 5: Run GREEN**

Run the command from Step 2, then `pnpm typecheck`.

---

### Task 2: Beijing Business-Day Calendar

**Files:**
- Create: `server/src/spark/sparkCalendar.ts`
- Create: `server/src/spark/sparkCalendar.test.ts`

**Interfaces:**
- Produces `getSparkCalendarPoint(now: Date): SparkCalendarPoint` and `isSparkSummaryEffective(lastQualifiedDate: string | null, point: SparkCalendarPoint): boolean`.

```ts
export interface SparkCalendarPoint {
  activityDate: string;
  isWeekend: boolean;
  previousBusinessDate: string;
  refreshAt: string;
  asOf: string;
}
```

- [ ] **Step 1: Write failing deterministic UTC-to-Beijing tests**

```ts
expect(getSparkCalendarPoint(new Date("2026-08-14T15:59:59.000Z"))).toMatchObject({
  activityDate: "2026-08-14",
  isWeekend: false,
  previousBusinessDate: "2026-08-13",
});
expect(getSparkCalendarPoint(new Date("2026-08-16T18:00:00.000Z"))).toMatchObject({
  activityDate: "2026-08-17",
  isWeekend: false,
  previousBusinessDate: "2026-08-14",
});
```

Cover Saturday, Sunday, Monday, month/year rollover, canonical `refreshAt`, and a Chinese public holiday that remains an ordinary weekday.

- [ ] **Step 2: Run RED**

Run: `pnpm --dir server test -- src/spark/sparkCalendar.test.ts`

- [ ] **Step 3: Implement with `Intl.DateTimeFormat` and explicit date arithmetic**

Use `timeZone: "Asia/Shanghai"`. Never use the host's local timezone and never infer day state from client input.

- [ ] **Step 4: Run GREEN**

Run the command from Step 2 and `pnpm --dir server typecheck`.

---

### Task 3: SQLite Ledger, Summary, Masking, And Ranking

**Files:**
- Modify: `server/src/database.ts`
- Create: `server/src/spark/sparkIdentity.ts`
- Create: `server/src/spark/sparkIdentity.test.ts`
- Create: `server/src/spark/sparkRepository.ts`
- Create: `server/src/spark/sparkRepository.test.ts`
- Modify: `server/src/repository.test.ts`

**Interfaces:**
- Produces class `SparkRepository`.

```ts
export class SparkRepository {
  constructor(db: Database.Database, getNow?: () => Date);
  recordQualifiedInteraction(
    pairId: string,
    kind: "message" | "surprise",
  ): { changed: boolean; snapshot: SparkStreakSnapshotV1 };
  getSnapshot(pairId: string): SparkStreakSnapshotV1;
  getLeaderboard(
    pairId: string,
    requestingDeviceId: string,
  ): SparkLeaderboardResponseV1;
}
```

- Produces `maskSparkNickname(name: string): string` using user-perceived characters.

- [ ] **Step 1: Add failing migration tests**

Initialize an in-memory database twice and assert both tables, primary keys, check constraints, foreign keys, and ranking index exist. Verify an existing legacy database gains the schema without losing devices or pairs.

- [ ] **Step 2: Add failing repository tests**

Required sequences include:

```ts
const friday = repository.recordQualifiedInteraction("pair-a", "message");
expect(friday.snapshot.streakDays).toBe(10);

clock.set("2026-08-17T02:00:00.000Z");
const monday = repository.recordQualifiedInteraction("pair-a", "surprise");
expect(monday.snapshot.streakDays).toBe(11);
```

Use seeded rows to cover same-day dedupe, weekend ignore, missed Monday then Tuesday effective zero/new value 1, disabled pairs, new `pair_id`, and persistence across repository reconstruction.

- [ ] **Step 3: Add failing masking and ranking tests**

Assert `雨 -> *`, `小雨 -> 小*`, and `Alice -> A*`. Seed more than 20 active pairs and verify competition ranks `1, 1, 3`, deterministic tie ordering, exact 20-row cutoff, separate global self rank, zero-day `rank: null`, full self names, masked public names, visible city names, and `城市待设置` fallback. Recursively assert serialized public entries contain none of `deviceId`, `pairId`, `latitude`, `longitude`, or secrets.

- [ ] **Step 4: Run RED**

Run:

```powershell
pnpm --dir server test -- src/spark/sparkIdentity.test.ts src/spark/sparkRepository.test.ts src/repository.test.ts
```

- [ ] **Step 5: Implement the additive schema and atomic update**

The transaction must use `INSERT OR IGNORE` into `(pair_id, activity_date)` and update the summary only when `changes === 1`. Weekend calls return an unchanged effective snapshot without inserting a ledger row.

- [ ] **Step 6: Implement effective ranking projection**

Rank every active positive pair by effective days. Use `last_qualified_at DESC, pair_id ASC` only to order ties; compute rank as `1 + count(pairs with greater streakDays)`.

- [ ] **Step 7: Run GREEN**

Run the Step 4 command, then:

```powershell
pnpm --dir server test
pnpm --dir server typecheck
pnpm --dir server build
```

---

### Task 4: WebSocket Qualification And Snapshot Push

**Files:**
- Modify: `server/src/connectionRegistry.ts`
- Modify: `server/src/websocketRelay.ts`
- Modify: `server/src/websocketRelay.test.ts`
- Modify: `server/src/server.ts`

**Interfaces:**
- Extends `AuthenticatedConnection` with `supportsSpark: boolean`.
- Extends `attachWebSocketRelay` with a `SparkRepository` dependency.
- Emits `spark.updated` only to authenticated connections advertising `spark-v1`.

- [ ] **Step 1: Write failing relay tests**

Cover these observable contracts:

```ts
expect(authOk.capabilities).toContain("spark-v1");
expect(initialMessages).toContainEqual(expect.objectContaining({
  type: "spark.updated",
  snapshot: expect.objectContaining({ streakDays: 0 }),
}));
```

Test plain text and surprise qualification, one update per weekday, both capable peers receiving the update, weekend messages receiving no spark update, peer-offline sends not counting, malformed/auth failures not counting, old clients continuing to exchange messages, and a simulated SQLite failure still delivering the original message without emitting false spark state.

- [ ] **Step 2: Run RED**

Run: `pnpm --dir server test -- src/websocketRelay.test.ts`

- [ ] **Step 3: Wire authentication and initial snapshot**

Advertise `spark-v1` in `auth.ok`; send the authenticated device's current snapshot after auth only when that client advertised the capability.

- [ ] **Step 4: Record only after peer relay succeeds**

Use a future-proof eligibility helper:

```ts
function getSparkInteractionKind(message: SendClientMessage): SparkInteractionKind | null {
  if (message.content === undefined) return "message";
  return message.content.kind === "surprise" ? "surprise" : null;
}
```

Catch spark persistence errors inside this side effect, log the pair ID plus stable error category without message text, and continue the existing delivery acknowledgement.

- [ ] **Step 5: Run GREEN**

Run the Step 2 command, full server tests, and server typecheck.

---

### Task 5: Authenticated Snapshot And Leaderboard HTTP APIs

**Files:**
- Modify: `server/src/pairingApi.ts`
- Modify: `server/src/pairingApi.test.ts`
- Modify: `server/src/server.ts`
- Modify: `src/sync/syncTypes.ts`
- Modify: `src/sync/relayHttpClient.ts`
- Modify: `src/sync/relayHttpClient.test.ts`

**Interfaces:**
- Adds `POST /pairs/spark/snapshot` and `POST /pairs/spark/leaderboard`.
- Adds client methods:

```ts
getSparkSnapshot(request: PairSparkRequest): Promise<RelayResult<SparkStreakSnapshotV1>>;
getSparkLeaderboard(request: PairSparkRequest): Promise<RelayResult<SparkLeaderboardResponseV1>>;
```

- [ ] **Step 1: Write failing API route tests**

Assert exact POST paths, JSON envelopes, active-pair authentication, non-member rejection, disabled-pair rejection, malformed body rejection, and separate `30/minute` limits for source IP and authenticated device on each route.

- [ ] **Step 2: Write failing HTTP client tests**

```ts
expect(fetchMock).toHaveBeenCalledWith(
  "https://relay.example/pairs/spark/leaderboard",
  expect.objectContaining({ method: "POST" }),
);
```

Reject malformed success payloads through the shared parsers and map current server errors through `RelayResult`.

- [ ] **Step 3: Run RED**

Run:

```powershell
pnpm --dir server test -- src/pairingApi.test.ts
pnpm test -- src/sync/relayHttpClient.test.ts
```

- [ ] **Step 4: Implement routes after authentication**

Consume the IP limit before repository authentication and the device limit after reading credentials. Call `RelayRepository.authenticateDeviceForPair` before `SparkRepository` methods.

- [ ] **Step 5: Implement strict client methods and run GREEN**

Run the Step 3 commands, server typecheck, and root typecheck.

---

### Task 6: Client Realtime State And Midnight Refresh

**Files:**
- Modify: `src/sync/realtimeClient.ts`
- Modify: `src/sync/realtimeClient.test.ts`
- Modify: `src/sync/useRealtimeSync.ts`
- Modify: `src/sync/useRealtimeSync.test.tsx`
- Create: `src/spark/useSparkStreak.ts`
- Create: `src/spark/useSparkStreak.test.tsx`

**Interfaces:**
- Adds realtime event `{ type: "spark"; snapshot: SparkStreakSnapshotV1 }`.
- Adds optional callback `onSparkSnapshot?(snapshot: SparkStreakSnapshotV1): void`.
- Produces:

```ts
export interface SparkStreakController {
  snapshotState:
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready"; snapshot: SparkStreakSnapshotV1 }
    | { status: "failed"; code: SyncErrorCode };
  leaderboardState:
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready"; response: SparkLeaderboardResponseV1 }
    | { status: "failed"; code: SyncErrorCode };
  acceptSnapshot(snapshot: SparkStreakSnapshotV1): void;
  refreshSnapshot(): Promise<void>;
  requestLeaderboard(): Promise<void>;
  clearLeaderboard(): void;
}
```

- [ ] **Step 1: Write failing realtime tests**

Assert the client advertises `spark-v1`, parses `spark.updated`, emits one typed event, and ignores no existing capability. Assert `useRealtimeSync` forwards the snapshot callback without putting spark data into peer presence state.

- [ ] **Step 2: Write failing controller tests with fake timers**

Cover unpaired reset, initial HTTP fallback, WebSocket snapshot acceptance, fresh leaderboard on every panel open, retry, exact `refreshAt` scheduling, reconnect/visible-document refresh, cleanup on pair change, and stale timer cancellation.

- [ ] **Step 3: Run RED**

Run:

```powershell
pnpm test -- src/sync/realtimeClient.test.ts src/sync/useRealtimeSync.test.tsx src/spark/useSparkStreak.test.tsx
```

- [ ] **Step 4: Implement isolated state ownership**

`useSparkStreak` receives `SyncSettings` and a `RelayHttpClient` dependency. It never increments or resets days locally; all accepted values must pass shared parsers and originate from Relay responses/events.

- [ ] **Step 5: Run GREEN**

Run the Step 3 command and root typecheck.

---

### Task 7: Flame Assets And Dynamic Menu Entry

**Files:**
- Create: `src/assets/ui/spark/unlit.png`
- Create: `src/assets/ui/spark/glimmer.png`
- Create: `src/assets/ui/spark/warm.png`
- Create: `src/assets/ui/spark/heartflame.png`
- Create: `src/assets/ui/spark/blaze.png`
- Create: `src/assets/ui/spark/everbright.png`
- Create: `src/assets/ui/spark/stellar.png`
- Create: `src/spark/sparkAssets.ts`
- Create: `src/spark/sparkAssets.test.ts`
- Modify: `src/assets/README.md`
- Modify: `src/assets/builtInPetManifest.ts`
- Modify: `src/assets/builtInPetManifest.test.ts`
- Modify: `src/interaction/InteractionMenu.tsx`
- Modify: `src/interaction/InteractionMenu.test.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
- Replaces function ID `act-hug` with `open-spark` and icon name `spark`.
- Produces `getSparkAsset(tier: SparkTier): string` and `getSparkTierLabel(tier: SparkTier): string`.
- `InteractionMenu` accepts `{ paired, snapshot }` spark presentation data and computes the visible/accessibility labels for only the `open-spark` item.

- [ ] **Step 1: Inspect the seven coordinator-generated PNGs**

Verify each file has a real alpha channel, no text or square backdrop, a consistent silhouette family, and increasing coral/white/near-black flame intensity. Reject an asset instead of substituting a placeholder.

- [ ] **Step 2: Write failing asset and menu tests**

```ts
expect(interactionOptions.map((option) => option.label)).toEqual([
  "双方天气",
  "发消息",
  "专注一下",
  "续火花",
  "外卖到啦",
  "我的状态",
]);
```

Assert unpaired `续火花`, paired-loading `--天`, ready `28天`, accessible name `续火花，当前连续 28 天`, a 34x34 stable icon slot, all seven imports, and breathing class only for `blaze`, `everbright`, and `stellar`.

- [ ] **Step 3: Run RED**

Run:

```powershell
pnpm test -- src/spark/sparkAssets.test.ts src/assets/builtInPetManifest.test.ts src/interaction/InteractionMenu.test.tsx
```

- [ ] **Step 4: Implement the asset map and manifest/menu change**

Remove the now-unused menu hug icon import but retain all hug action resources. Document the seven images as project-generated in `src/assets/README.md`.

- [ ] **Step 5: Add restrained motion**

Keep dimensions fixed and animate only opacity/filter at low frequency. Disable it in the existing `prefers-reduced-motion: reduce` block.

- [ ] **Step 6: Run GREEN**

Run the Step 3 command and root typecheck.

---

### Task 8: Approved Leaderboard Panel And Desktop Geometry

**Files:**
- Create: `src/spark/SparkLeaderboardPanel.tsx`
- Create: `src/spark/SparkLeaderboardPanel.test.tsx`
- Create: `src/spark/sparkPresentation.ts`
- Create: `src/spark/sparkPresentation.test.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/app/app.css`
- Modify: `src/desktop/windowCommands.ts`
- Modify: `src/desktop/windowCommands.test.ts`
- Modify: `src-tauri/src/commands.rs`

**Interfaces:**
- Adds `spark` to TypeScript and Rust `ComposerSurface`.
- Uses an outer logical surface `460 x 638` and an inner panel `424 x 600`.
- `SparkLeaderboardPanel` receives controller state, pairing state, and close/retry/binding commands.

- [ ] **Step 1: Write failing presentation and panel tests**

Test loaded top three, rows 4-20 in one continuous list, competition ranks, masked public identity, cities, fixed full-name self strip, all tier labels, weekend/pending/qualified copy, loading skeleton, zero/empty ranking, missing city, unpaired guidance, auth recovery, unavailable retry, Escape, and close icon.

```ts
expect(screen.getByText("看看哪一对把心意守得最久")).toBeTruthy();
expect(screen.getByText("周末休息，火花会替你们守到周一")).toBeTruthy();
expect(screen.getByText("小雨 & 阿程")).toBeTruthy();
```

- [ ] **Step 2: Write failing application arbitration tests**

Assert selecting `open-spark` opens only spark, requests a fresh leaderboard, closes weather/message/surprise/focus/status surfaces, restores the pet window on close, handles unpaired guidance, and never dispatches `act-hug` or any pet action.

- [ ] **Step 3: Write failing TypeScript and Rust geometry tests**

Assert exact spark surface size at 1.0, 1.25, and 1.5 scale factors. For a shorter work area, assert only spark window height is clamped while existing message, surprise, focus, and weather geometry snapshots remain unchanged.

- [ ] **Step 4: Run RED**

Run:

```powershell
pnpm test -- src/spark/SparkLeaderboardPanel.test.tsx src/spark/sparkPresentation.test.ts src/app/App.test.tsx src/desktop/windowCommands.test.ts
cargo test --manifest-path src-tauri/Cargo.toml composer -- --nocapture
```

- [ ] **Step 5: Implement the panel from the selected image**

Use a single bordered off-white panel. The top-three group is flat, list rows use separators, and the self strip is the only near-black band. Use Lucide `X`, no nested cards, no yellow, and no opaque outer backdrop.

- [ ] **Step 6: Integrate the controller and realtime callback in `App.tsx`**

Keep data logic in `useSparkStreak`. `App.tsx` maps menu selection, composer ownership, and callbacks only.

- [ ] **Step 7: Implement spark-only desktop clamping and run GREEN**

Run the Step 4 commands, root typecheck, and all Rust tests.

---

### Task 9: Compatibility Fixtures, Full Verification, Deployment, And Debug EXE

**Files:**
- Modify: `src/sync/e2eRealtimeOverride.ts`
- Modify: `src/sync/e2eRealtimeOverride.test.ts`
- Modify: `e2e/support/realtimeOverride.ts`
- Modify: `e2e/interop/specs/realtime-pairing.e2e.ts` only when the established interop harness can cover `spark.updated` without changing production behavior.
- Modify: `deploy/couple-pet-relay/README.md`
- Modify: `design-qa.md`
- Create: `.superpowers/visual-qa/spark-leaderboard/` evidence files.

**Interfaces:**
- No new production interface; this task proves compatibility and ships the verified implementation.

- [ ] **Step 1: Add deterministic E2E spark fixtures**

Expose only test-build controls needed to set a spark snapshot and inspect the panel. Assert production builds do not read those controls. Include a 28-day `heartflame` self row at rank 27 and at least eight public rows matching the approved visual reference.

- [ ] **Step 2: Run focused and full automated verification**

```powershell
pnpm test -- shared/sparkProtocol.test.ts src/spark src/interaction/InteractionMenu.test.tsx src/sync/realtimeClient.test.ts src/sync/relayHttpClient.test.ts src/app/App.test.tsx
pnpm test
pnpm typecheck
pnpm build
pnpm --dir server test
pnpm --dir server typecheck
pnpm --dir server build
cargo test --manifest-path src-tauri/Cargo.toml
```

Every command must exit 0. Record test counts rather than reporting only “passed.”

- [ ] **Step 3: Run two-client behavior verification against a local Relay**

Verify plain message increment, surprise increment on a new weekday fixture, same-day dedupe, weekend no-op, reconnect snapshot, disabled pair rejection, and leaderboard self rank. Confirm an old-capability client still sends and receives messages.

- [ ] **Step 4: Capture and compare real panel screenshots**

Capture loading, loaded 28-day rank-27, weekend, zero-day, and server-unavailable states. Verify at Windows scale factors 100%, 125%, and 150% using the established Tauri/WebdriverIO evidence path. Compare the loaded screenshot directly with `docs/assets/spark-leaderboard-selected-v1.png`; reject mismatched hierarchy, fonts, spacing, flame intensity, self strip, clipping, square backdrop, or interactive-region blocking.

- [ ] **Step 5: Deploy the Relay additively**

Preserve the existing remote `.env` and named `relay-data` volume. Use the documented `/opt/couple-pet-relay` deployment flow, rebuild the Compose service, then verify:

```powershell
curl http://159.75.175.47:8787/health
```

Confirm the old SQLite database migrates on startup and the container remains healthy. Run authenticated snapshot/leaderboard smoke requests with temporary test devices; do not print credentials.

- [ ] **Step 6: Build an isolated Windows Debug EXE**

```powershell
$env:CARGO_TARGET_DIR = (Join-Path (Resolve-Path 'src-tauri').Path 'target-spark-debug')
pnpm tauri build --debug --no-bundle
Test-Path 'src-tauri\target-spark-debug\debug\couple-desktop-pet.exe'
Get-FileHash 'src-tauri\target-spark-debug\debug\couple-desktop-pet.exe' -Algorithm SHA256
```

Do not terminate or overwrite a `couple-desktop-pet.exe` from another target directory. Report the absolute artifact path, byte size, modification time, and SHA-256.

- [ ] **Step 7: Record QA and deployment evidence**

Update `design-qa.md` with exact commands, test counts, screenshot paths, comparison findings, deployment health, smoke results, and Debug EXE metadata. Do not claim a macOS binary from Windows.

## Self-Review

- Spec coverage: eligibility, Beijing weekdays, weekend protection, daily dedupe, reset, rebind, persistence, capability negotiation, snapshot refresh, HTTP auth/rate limits, ranking/privacy, all seven tiers, selected UI, reduced motion, transparent interaction regions, deployment, and Debug EXE each map to a task.
- Placeholder scan: all production interfaces, thresholds, copy, dimensions, commands, and failure behaviors are explicit.
- Type consistency: the shared snapshot/leaderboard types flow unchanged through repository, WebSocket, HTTP client, React controller, menu, and panel.
- Scope check: this is one cohesive subsystem with incremental test gates; pet animation, edge-hidden behavior, account systems, social sharing, and unrelated weather/focus behavior remain out of scope.
