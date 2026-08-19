# Couple Spark Streak And Leaderboard Design

Date: 2026-08-19
Status: Approved

## Goal

Turn the remaining `求抱抱` interaction-menu slot into a server-authoritative
couple streak named `续火花`.

One successfully relayed text message or structured surprise between the
currently bound devices qualifies the pair for that Beijing business day. A
pair can gain at most one day per business day. Saturday and Sunday neither
increment nor break the streak. The server persists the streak and exposes an
all-server leaderboard with the top 20 active pairs plus the requesting pair's
own rank.

## Approved Visual Target

The approved leaderboard reference is:

`docs/assets/spark-leaderboard-selected-v1.png`

Implementation must preserve its information hierarchy and visual character:

- compact off-white desktop panel with a thin near-black outline;
- coral-red eyebrow and ranking accents;
- leaderboard-first layout with a visually dominant top three;
- a continuous ranked list with lightweight separators rather than row cards;
- a fixed near-black self-ranking strip at the bottom;
- purpose-built flame illustrations with visibly different intensity;
- zero letter spacing, restrained 7px radii, and no nested cards.

The logical panel target is `424 x 600` pixels. When the monitor work area is
shorter, keep the header, top-three area, status line, and self strip at their
specified sizes and shrink only the scrollable ranking-list region. The existing
composer surface remains transparent outside the panel.

## Product Boundaries

- Replace `求抱抱`; keep the interaction menu at exactly six entries.
- Do not change the pet action state machine or edge-hidden behavior.
- Do not add accounts, historical charts, rewards, manual check-in, streak
  repair, holiday calendars, sharing, or social interaction between unrelated
  pairs.
- Text messages and structured `surprise` messages qualify. Other present or
  future structured message kinds do not qualify unless explicitly added.
- A failed, rejected, unauthenticated, or peer-offline send does not qualify.
- The server clock is authoritative. Client clocks never decide the activity
  date or streak value.
- A new `pair_id` starts at zero, including after the same two devices unbind
  and bind again.

## Calendar Semantics

All calendar rules use `Asia/Shanghai`.

- A qualifying weekday event records that local calendar date.
- Repeated qualifying events on the same date do not increment again.
- Weekend events remain normal messages but do not create spark activity rows.
- Friday at 10 days followed by a Monday interaction becomes 11 days.
- A full missed weekday makes the effective streak zero at the start of the
  next Beijing date.
- After a break, the first qualifying weekday event starts the new streak at
  1 day.
- A pair created on a weekend remains at zero until its first qualifying
  weekday event.
- Only Saturday and Sunday are skipped. Public holidays remain ordinary
  business days.

Before the current weekday has ended, the previous business day's streak still
displays. For example, a Monday that has not yet received an interaction keeps
Friday's value until Tuesday 00:00 Beijing time.

## Architecture Decision

Use an idempotent daily activity ledger plus a materialized streak summary.
Evaluate summary freshness at query time instead of running a reset cron job.

This design was selected over:

- a midnight reset job, which adds deployment, restart, and multi-instance
  coordination failure modes; and
- a complete message-event history used for live aggregation, which adds
  unnecessary storage, privacy exposure, and query cost.

### Persistence

Add `pair_spark_activity_days`:

| Column | Contract |
| --- | --- |
| `pair_id` | Active or historical pair identifier; foreign key to `pairs` |
| `activity_date` | `YYYY-MM-DD` in `Asia/Shanghai` |
| `first_interaction_kind` | `message` or `surprise` |
| `first_interaction_at` | UTC ISO timestamp from the injected server clock |

The primary key is `(pair_id, activity_date)`.

Add `pair_spark_streaks`:

| Column | Contract |
| --- | --- |
| `pair_id` | Primary key and foreign key to `pairs` |
| `streak_days` | Last persisted positive streak length |
| `last_qualified_date` | Last qualifying Beijing date |
| `last_qualified_at` | UTC ISO timestamp of that day's first qualifying event |
| `updated_at` | UTC ISO update timestamp |

Schema migration must be additive and idempotent for existing SQLite files.
Index the active ranking path by streak and last-qualified fields.

### Atomic Increment

After relay authentication, message validation, active-pair validation, and
peer-availability checks succeed:

1. Relay the message to the peer.
2. Derive the Beijing date from the injected server clock.
3. Ignore spark accounting if the date is Saturday or Sunday.
4. In one SQLite transaction, insert the daily row with conflict-ignore.
5. Continue only when that insert created a new row.
6. If `last_qualified_date` equals the previous business date, increment the
   persisted streak; otherwise set it to 1.
7. Upsert the summary and commit.
8. Publish the changed snapshot to both capable connected clients.

The daily primary key makes concurrent or repeated messages idempotent.

Spark persistence failure must not retract or block an otherwise valid message.
The relay logs a structured error and emits no false `spark.updated` event.

### Effective Reset

The persisted summary is considered active only when its last-qualified date is
either the current Beijing date or the previous Beijing business date. Weekend
queries treat Friday as the previous business date. Any older summary returns an
effective value of zero without requiring a database rewrite.

The next qualifying event after an effective reset overwrites the summary with
1 day. Ranking queries use effective values, never raw stale values.

## Shared Protocol

Add a focused `shared/sparkProtocol.ts` module with strict runtime parsers.

`SparkTier` values:

- `unlit`: 0 days
- `glimmer`: 1 through 4 days
- `warm`: 5 through 14 days
- `heartflame`: 15 through 29 days
- `blaze`: 30 through 59 days
- `everbright`: 60 through 99 days
- `stellar`: 100 days or more

`SparkStreakSnapshotV1` contains:

- `version: 1`
- `pairId`
- effective `streakDays`
- `tier`
- `calendarState`: `qualified_today`, `pending_today`, or
  `weekend_protected`
- `lastQualifiedDate`, nullable
- `timezone: "Asia/Shanghai"`
- server `asOf`
- `refreshAt`, the next Beijing midnight when the client must refresh the
  effective presentation

Leaderboard entries contain only rank, display names, city names, effective
days, and tier. Public entries never expose device IDs, pair IDs, secrets,
coordinates, districts, or other profile fields.

## Relay Synchronization

Advertise a new `spark-v1` capability.

- New clients receive a current snapshot after successful authentication and
  active-pair resolution.
- The server emits `spark.updated` to both capable clients only after the first
  qualifying weekday event changes persisted state.
- Same-day duplicates and weekend interactions produce no spark event.
- Clients without `spark-v1` continue messaging normally and still contribute
  to server-side streaks.
- On reconnect or system resume, the client requests or receives a fresh
  snapshot.
- At `refreshAt`, a connected client calls the lightweight snapshot endpoint so
  a missed weekday becomes visible without a server cron job or app restart.

## HTTP API

Use authenticated `POST` endpoints so device secrets never appear in URLs.

### `POST /pairs/spark/snapshot`

Request fields: `deviceId`, `deviceSecret`, and `pairId`.

Response: `SparkStreakSnapshotV1`.

### `POST /pairs/spark/leaderboard`

Request fields: `deviceId`, `deviceSecret`, and `pairId`.

Response fields:

- `version: 1`
- `snapshot`
- `top20`, containing at most 20 active pairs with effective days above zero
- `self`, always present for the requesting active pair
- server `asOf`

Both endpoints authenticate the device, require membership in the active pair,
and use the existing API error envelope. Each endpoint allows 30 requests per
minute per device and 30 requests per minute per source IP, matching the current
pair-weather route. Opening the panel always performs a fresh leaderboard
request; the client does not persist or cache leaderboard rows.

## Ranking Rules

- Exclude disabled pairs and effective zero-day pairs from `top20`.
- Higher effective streak days rank first.
- Equal days share the same competition rank: `1, 1, 3`, not `1, 1, 2`.
- Within an equal-day group, order by `last_qualified_at` descending, then
  `pair_id` for deterministic output. Tie ordering does not alter the shared
  rank.
- Return at most 20 pairs after deterministic ordering, even when the cutoff is
  tied.
- The requester's self row is returned separately even when outside the top 20.
- The self rank is calculated against every active pair with an effective value
  above zero, not only against the returned top 20 rows.
- An effective zero-day self row uses `rank: null` and the UI text `暂未上榜`.

### Public Identity

Public leaderboard rows display both manually selected city names and masked
nicknames.

- Segment nicknames by user-perceived characters.
- A one-character nickname becomes `*`.
- A longer nickname keeps only its first character followed by `*`.
- Join the two masked names with ` & `.
- Join the two city names with ` · `.
- A missing city displays `城市待设置`.
- The two members use the pair's stable A/B order so public rows do not reorder
  depending on the viewer.

The self row displays full nicknames. It uses requesting user then peer order and
shows the full manually selected city names.

## Menu Entry

Replace the manifest entry currently labeled `求抱抱` with `续火花`.

- The visible label is `${streakDays}天` after a snapshot loads.
- Before the first snapshot, display `--天` for an active pair.
- When unpaired, display `续火花` and route a click to the existing binding
  guidance.
- The accessible name is `续火花，当前连续 N 天`.
- Keep the existing `68 x 62` menu cell and `34 x 34` icon slot stable at every
  tier.

The menu icon is selected from the current tier. Intensity changes through
inner flame layers, contrast, halo, and restrained sparks, not through a larger
layout box.

## Flame Assets And Motion

Create seven original transparent PNG assets under `src/assets/ui/spark/`, one
for each tier. Record them as project-created assets in the asset README.

- Never substitute emoji, Unicode fire characters, text, colored squares,
  handcrafted SVG, or CSS primitive drawings.
- Match the approved reference's near-black, white, and coral-red language.
- Avoid yellow/orange dominance.
- Higher tiers add visible flame layers and sparks while retaining a shared
  silhouette family.
- `blaze`, `everbright`, and `stellar` use a low-frequency breathing glow.
- `prefers-reduced-motion: reduce` disables all glow animation without changing
  the tier asset.

Top-three assets in the leaderboard render at different visual sizes within
fixed columns, as shown in the approved reference. List-row and menu slots
remain fixed.

## Leaderboard Panel

Use the same mutually exclusive composer-surface lifecycle as weather, message,
surprise, and focus panels. Opening the leaderboard closes any competing panel;
closing restores normal pet window geometry and click-through behavior.

Approved loaded-state hierarchy:

1. Eyebrow `续火花`, title `全服火花榜`, supporting copy
   `看看哪一对把心意守得最久`, and a Lucide close icon.
2. Flat three-column top-three area with rank, tier flame, masked names, city
   pair, and day count.
3. One continuous scrollable list for the remaining returned rows.
4. Status copy: `今天的火花已经续上`, `今天等一次互动`, or
   `周末休息，火花会替你们守到周一`.
5. Fixed near-black self strip with flame, rank or `暂未上榜`, full nicknames,
   cities, days, and tier label.

Required states:

- loading skeleton with stable dimensions;
- unpaired guidance using the existing binding command;
- zero-day and empty leaderboard;
- missing city rendered as `城市待设置`;
- authentication or inactive-pair recovery;
- rate-limited and unavailable-server retry state.

The panel must not introduce an opaque rectangular backdrop outside its own
border. Only visible panel controls are desktop interactive regions.

## Error Handling

- Protocol parsers reject malformed, unsupported-version, negative-day, or
  inconsistent-tier responses.
- A failed snapshot refresh keeps the last value visually marked as unavailable
  for ranking actions; it must not locally invent a reset or increment.
- A failed leaderboard load keeps the panel open with a retry command.
- Active-pair or authentication errors route through existing binding recovery.
- Server logs distinguish eligibility rejection, persistence failure, and API
  rate limiting without logging message text, surprise notes, or device secrets.

## Testing

### Shared And Calendar

- Protocol parser acceptance and rejection.
- Tier boundary tests at 0, 1, 4, 5, 14, 15, 29, 30, 59, 60, 99, and 100.
- Beijing date conversion, month/year boundaries, Friday-to-Monday, weekend
  ignore, Monday miss then Tuesday reset, and public holidays treated as normal
  weekdays.

### Server

- Fresh and legacy database migration, including idempotent re-run.
- Atomic same-day deduplication and concurrent insert behavior.
- Plain text and `surprise` eligibility; failed/offline and unknown structured
  message ineligibility.
- Active, disabled, and newly rebound pair behavior.
- Effective zero, top-20 cutoff, competition ties, deterministic ordering, and
  separate self rank.
- Nickname masking, city output, missing-city fallback, and absence of private
  identifiers.
- Snapshot and leaderboard authentication and rate limits.
- Both connected clients receive one update; legacy clients remain compatible.

### Client

- Dynamic menu label, tier asset, unpaired state, initial sync, reconnect,
  resume, and `refreshAt` refresh.
- Panel loading, loaded, empty, self-outside-top-20, retry, and recovery states.
- Mutual exclusion with weather, message, surprise, focus, settings, and status
  surfaces.
- Reduced motion and accessible names.

### Visual And Desktop Verification

- Compare the implementation directly against
  `docs/assets/spark-leaderboard-selected-v1.png`.
- Verify typography, panel ratio, top-three hierarchy, row density, self strip,
  coral/black/off-white colors, flame fidelity, and transparent outer region.
- Verify at Windows scale factors 100%, 125%, and 150% with no clipping,
  overlap, square window backdrop, or layout shift between tiers.
- Confirm normal dragging, click-through, static edge-hidden presentation, and
  existing remote notice cards are unchanged.

## Delivery

After tests and visual QA pass:

1. Deploy the additive server migration, spark relay logic, and API endpoints to
   the existing SSH-hosted relay.
2. Run server health and two-client smoke checks.
3. Build the latest Windows Debug EXE and report its absolute path.
4. Keep the source cross-platform. A macOS binary still requires a macOS build
   host or CI runner and is not claimed from the Windows environment.
