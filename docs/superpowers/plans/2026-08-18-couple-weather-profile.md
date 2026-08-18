# Couple Weather And Profile Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-persisted nickname/city profiles and a zero-cost, on-demand paired-weather surface that matches the approved black, white, and red mockup.

**Architecture:** Keep profile contracts in `shared`, durable identity/location data in the Relay SQLite repository, WeatherAPI translation and caching behind a server-only provider boundary, and UI state in focused `profile` and `weather` frontend modules. Pairing and WebSocket authentication carry peer profiles, while weather remains an authenticated HTTP read that derives both locations from the active pair.

**Tech Stack:** TypeScript 7, React 19, Vitest, Node HTTP and native `fetch`, SQLite through `better-sqlite3`, WebSocket through `ws`, Tauri 2/Rust, `lucide-react` for locally bundled interface/weather symbols, project-generated transparent PNG for the radial weather entry.

**Spec:** `docs/superpowers/specs/2026-08-18-couple-weather-profile-design.md`

## Global Constraints

- Preserve every pre-existing dirty-worktree change. At the start of each task, record `git status --short` and save the baseline diff for every already-dirty touched path. Never reset or restore unrelated files.
- For a path that was already dirty at task start, stage only this feature's hunks with `git add -p -- <path>` (or an equivalent index patch); never stage the whole path. Before every commit, inspect both `git diff --cached --stat` and `git diff --cached`. If a feature hunk cannot be isolated from pre-existing work, leave that path uncommitted and report it instead of absorbing earlier changes.
- Use TDD for every task: create a focused failing test, observe the expected failure, implement the smallest complete behavior, then run the focused suite.
- Keep exactly six radial menu entries. Replace `撒娇卖萌`/`act-cute` with `双方天气`/`open-weather`; do not change the other five entries.
- Persist only nickname and city-level location. Do not request GPS, IP location, precise address, or location permissions.
- Keep `WEATHER_API_KEY` on the Relay server only. Do not expose it in responses, logs, client settings, source assets, or the EXE.
- Weather fresh-cache TTL is exactly 1 hour; stale fallback is allowed only through 6 hours; city-search cache TTL is exactly 24 hours.
- Every weather-panel open requests Relay. Relay alone decides whether supplier access is required.
- No paid fallback, automatic plan upgrade, background weather polling, multi-day forecast, air quality, alerts, or new pet animation.
- Weather content panel is `424 x 466` logical pixels inside a `460 x 504` transparent Tauri surface.
- Visual tokens are `#fffefa` background, `#171717` primary, `#d52820` accent, `#dad6cf` divider, `#f2f0eb` care-note background, 1px border, 7px panel radius, zero letter spacing.
- Only visible weather controls may block desktop input; transparent WebView gutters remain click-through and opening weather must not mutate persisted click-through preference.
- Do not call the real WeatherAPI from automated tests. Use fake fetch/provider implementations and fake clocks.
- The final deliverable includes a newly built `src-tauri/target/debug/couple-desktop-pet.exe`, its SHA256, and real Tauri screenshots compared with the approved mockup.

## File Structure

### Shared contracts

- `shared/profileProtocol.ts`: profile/location types and runtime validators.
- `shared/weatherProtocol.ts`: normalized weather types and response parsers.
- `shared/syncProtocol.ts`: pairing profile fields, `profile-v1` capability, and `peer.profile` message.

### Relay

- `server/src/database.ts`: additive `device_locations` migration.
- `server/src/repository.ts`: profile persistence and pair-profile reads.
- `server/src/profileEvents.ts`: in-process profile-update publisher shared by HTTP and WebSocket layers.
- `server/src/weather/weatherProvider.ts`: provider interface and typed provider failures.
- `server/src/weather/weatherApiProvider.ts`: WeatherAPI HTTPS adapter.
- `server/src/weather/weatherCondition.ts`: provider-code to stable condition mapping.
- `server/src/weather/weatherService.ts`: search/weather caches, in-flight deduplication, and stale fallback.
- `server/src/requestRateLimiter.ts`: device/IP fixed-window limits.
- `server/src/pairingApi.ts`: profile, city-search, and pair-weather routes alongside current pairing routes.
- `server/src/websocketRelay.ts`: capability negotiation and peer-profile delivery.
- `server/src/config.ts`, `server/src/server.ts`: provider configuration and dependency composition.

### Desktop client

- `src/settings/settingsTypes.ts`, `settingsStore.ts`, `defaultSettings.ts`: persisted local/peer profile state.
- `src/profile/useProfileSync.ts`: profile save/search transport state and peer cache updates.
- `src/settings/ProfilePanel.tsx`: basic-information form.
- `src/weather/usePairWeather.ts`: one-request-per-open weather state.
- `src/weather/weatherPresentation.ts`: care copy, number formatting, and condition presentation.
- `src/weather/WeatherIcon.tsx`: stable condition-to-Lucide mapping.
- `src/weather/WeatherPanel.tsx`: approved paired-weather UI and degradation states.
- `src/sync/relayHttpClient.ts`, `realtimeClient.ts`, `useRealtimeSync.ts`: typed profile/weather transport.
- `src/app/App.tsx`, `app.css`: lifecycle integration and exact visual implementation.
- `src/assets/ui/interaction-buttons/new-tea-weather.png`: generated radial weather illustration.
- `src/assets/builtInPetManifest.ts`, `src/interaction/InteractionMenu.tsx`: weather entry and resource mapping.

### Native/deployment/QA

- `src-tauri/src/commands.rs`, `src/desktop/windowCommands.ts`: weather composer surface geometry.
- `deploy/couple-pet-relay/.env.example`, `compose.yaml`, `README.md`: free API configuration.
- `docs/manual-verification/couple-weather.md`: two-client and visual verification procedure.

---

### Task 1: Define Profile, Weather, And Realtime Contracts

**Files:**
- Create: `shared/profileProtocol.ts`
- Create: `shared/profileProtocol.test.ts`
- Create: `shared/weatherProtocol.ts`
- Create: `shared/weatherProtocol.test.ts`
- Modify: `shared/syncProtocol.ts`
- Modify: `shared/syncProtocol.test.ts`

**Interfaces:**
- Produces: `CityLocationV1`, `ProfileUpdateV1`, `DeviceProfileV1`, `validateProfileUpdate()`, `readDeviceProfile()`.
- Produces: `WeatherConditionV1`, `WeatherSnapshotV1`, `PairWeatherResponse`, `readPairWeatherResponse()`.
- Produces: `PROFILE_SYNC_CAPABILITY`, `SyncCapability`, `PeerProfileServerMessage`.
- Consumed by: every later Relay and client task.

- [ ] **Step 1: Write failing profile and weather validator tests**

```ts
it("normalizes a complete profile update", () => {
  expect(validateProfileUpdate({
    version: 1,
    nickname: "  小满  ",
    city: {
      provider: "weatherapi",
      providerLocationId: 1785728,
      name: "杭州",
      region: "浙江",
      country: "中国",
      latitude: 30.27,
      longitude: 120.15,
    },
  })).toEqual({ ok: true, profile: expect.objectContaining({ nickname: "小满" }) });
});

it.each(["", "123456789012345678901"])("rejects nickname %j", (nickname) => {
  expect(validateProfileUpdate({ version: 1, nickname, city: validCity })).toMatchObject({
    ok: false,
  });
});

it("parses independent ready and unavailable pair-weather entries", () => {
  expect(readPairWeatherResponse({
    self: { status: "ready", profile: selfProfile, weather: liveWeather },
    peer: { status: "unavailable", profile: peerProfile, reason: "provider_unavailable" },
  })).not.toBeNull();
});
```

- [ ] **Step 2: Run the new shared tests and observe missing-module failures**

Run: `pnpm exec vitest run shared/profileProtocol.test.ts shared/weatherProtocol.test.ts shared/syncProtocol.test.ts`

Expected: FAIL because `profileProtocol.ts`, `weatherProtocol.ts`, and profile capability exports do not exist.

- [ ] **Step 3: Implement stable shared types and strict parsers**

```ts
export const PROFILE_SYNC_CAPABILITY = "profile-v1" as const;
export type ProfileSyncCapability = typeof PROFILE_SYNC_CAPABILITY;

export interface ProfileUpdateV1 {
  version: 1;
  nickname: string;
  city: CityLocationV1;
}

export interface DeviceProfileV1 {
  version: 1;
  nickname: string;
  city: CityLocationV1 | null;
  updatedAt: string;
}

export type PairWeatherEntry =
  | { status: "ready"; profile: DeviceProfileV1; weather: WeatherSnapshotV1 }
  | { status: "unavailable"; profile: DeviceProfileV1; reason: WeatherUnavailableReason };
```

Use `Array.from(value).length` for user-visible character limits. Reject unknown condition, source, reason, provider, and version values. Extend `SyncErrorCode` with `profile_incomplete`, `weather_not_configured`, `provider_unavailable`, and `quota_exhausted`; keep `rate_limited` as the existing shared code.

Generalize `AuthClientMessage.capabilities` and `readSupportedCapabilities()` to preserve both `activity-status-v1` and `profile-v1`. Extend create/accept requests with optional `profile`, paired responses with `peerProfile?: DeviceProfileV1` so old Relay responses remain parseable, and `parseServerToClientMessage()` with `peer.profile`.

- [ ] **Step 4: Run shared protocol tests**

Run: `pnpm exec vitest run shared/profileProtocol.test.ts shared/weatherProtocol.test.ts shared/syncProtocol.test.ts`

Expected: PASS, including old messages without `profile` or `capabilities`.

- [ ] **Step 5: Commit only shared contracts**

```powershell
git add shared/profileProtocol.ts shared/profileProtocol.test.ts shared/weatherProtocol.ts shared/weatherProtocol.test.ts shared/syncProtocol.ts shared/syncProtocol.test.ts
git commit -m "feat: define profile and weather protocols"
```

### Task 2: Persist Local And Peer Profile Settings

**Files:**
- Modify: `src/settings/settingsTypes.ts`
- Modify: `src/settings/defaultSettings.ts`
- Modify: `src/settings/settingsStore.ts`
- Modify: `src/settings/settingsStore.test.ts`

**Interfaces:**
- Consumes: `ProfileUpdateV1`, `DeviceProfileV1` from Task 1.
- Produces: `ProfileSettings`, persisted as `PetSettings.profile`.
- Consumed by: `useProfileSync`, pairing guards, and weather UI.

- [ ] **Step 1: Add failing settings migration tests**

```ts
it("adds empty profile state to legacy settings", () => {
  const settings = mergeSettings({ scale: 1, sync: legacySync });
  expect(settings.profile).toEqual({
    local: null,
    peerByDeviceId: {},
    syncState: "idle",
  });
});

it("keeps valid local and peer profiles", () => {
  const settings = mergeSettings({
    profile: { local: localProfile, peerByDeviceId: { dev_b: peerProfile }, syncState: "synced" },
  });
  expect(settings.profile.local?.nickname).toBe("小满");
  expect(settings.profile.peerByDeviceId.dev_b.nickname).toBe("阿岚");
});

it.each(["saving", "error"])("normalizes transient %s state to pending", (syncState) => {
  expect(mergeSettings({ profile: { local: localProfile, peerByDeviceId: {}, syncState } }).profile.syncState)
    .toBe("pending");
});
```

- [ ] **Step 2: Run the settings store test and verify red state**

Run: `pnpm exec vitest run src/settings/settingsStore.test.ts`

Expected: FAIL because `PetSettings.profile` does not exist.

- [ ] **Step 3: Implement profile defaults and defensive merge logic**

```ts
export interface ProfileSettings {
  local: ProfileUpdateV1 | null;
  peerByDeviceId: Record<string, DeviceProfileV1>;
  syncState: "idle" | "saving" | "synced" | "pending" | "error";
}

export interface PetSettings {
  // existing fields stay unchanged
  profile: ProfileSettings;
}
```

`readProfileSettings()` must call the shared validators, drop malformed peer entries individually, and normalize persisted `saving`/`error` to `pending`. Do not alter relay migration behavior or current click-through fields.

- [ ] **Step 4: Run settings tests**

Run: `pnpm exec vitest run src/settings/settingsStore.test.ts src/settings/AppearancePanel.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit settings persistence**

```powershell
git add src/settings/settingsTypes.ts src/settings/defaultSettings.ts src/settings/settingsStore.ts src/settings/settingsStore.test.ts
git commit -m "feat: persist local and peer profiles"
```

### Task 3: Add Relay Profile Storage And Pairing Synchronization

**Files:**
- Modify: `server/src/database.ts`
- Modify: `server/src/repository.ts`
- Modify: `server/src/repository.test.ts`
- Modify: `server/src/pairingApi.ts`
- Modify: `server/src/pairingApi.test.ts`

**Interfaces:**
- Consumes: Task 1 profile and pairing contracts.
- Produces: `RelayRepository.ensureDeviceIdentity()`, `saveProfile()`, `getDeviceProfile()`, `getPairProfiles()`.
- Produces: pair-code acceptance/status responses containing optional `peerProfile?: DeviceProfileV1` when available.
- Consumed by: HTTP weather/profile routes and WebSocket profile delivery.

- [ ] **Step 1: Write failing migration and repository profile tests**

```ts
it("adds device_locations without changing existing pair data", () => {
  initializeRelayDatabase(db);
  initializeRelayDatabase(db);
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  expect(names).toContainEqual({ name: "device_locations" });
});

it("saves and reads a normalized device profile", () => {
  repository.ensureDeviceIdentity({ deviceId: "dev_a", deviceSecret: "secret_a" });
  const saved = repository.saveProfile({
    deviceId: "dev_a",
    deviceSecret: "secret_a",
    profile: profileUpdateA,
  });
  expect(saved).toEqual(expect.objectContaining({ nickname: "小满", city: cityA }));
});

it("returns each peer profile after pairing", () => {
  const pair = createPairWithProfiles(repository, profileUpdateA, profileUpdateB);
  expect(pair.accept.peerProfile?.nickname).toBe("小满");
  expect(pair.status.peerProfile?.nickname).toBe("阿岚");
});
```

- [ ] **Step 2: Run Relay repository and pairing tests**

Run: `pnpm --dir server exec vitest run src/repository.test.ts src/pairingApi.test.ts`

Expected: FAIL because the table and repository methods are absent.

- [ ] **Step 3: Add the additive table migration**

```sql
CREATE TABLE IF NOT EXISTS device_locations (
  device_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_location_id INTEGER NOT NULL,
  city_name TEXT NOT NULL,
  region_name TEXT NOT NULL,
  country_name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(device_id)
);
```

Keep `devices.display_name` nullable so city search can register credentials without prematurely saving a nickname.

- [ ] **Step 4: Implement profile repository methods and pairing joins**

```ts
saveProfile(input: SaveProfileInput): DeviceProfileV1;
getDeviceProfile(deviceId: string): DeviceProfileV1 | null;
getPairProfiles(input: AuthenticateInput): {
  selfProfile: DeviceProfileV1 | null;
  peerProfile: DeviceProfileV1 | null;
};
```

Use one SQLite transaction to authenticate and update `devices.display_name` plus `device_locations`. `ensureDeviceIdentity()` inserts unknown credentials with `display_name = NULL` and never changes a saved nickname. `createPairCode()` and `acceptPairCode()` upsert optional new-client profiles before pairing checks; preserve legacy `displayName` support.

- [ ] **Step 5: Extend pairing request readers and responses**

In `pairingApi.ts`, parse optional `profile` through `validateProfileUpdate()`. Return `peerProfile` from accept and paired-status calls without changing pending, expired, consumed, unpair, or typed error behavior.

- [ ] **Step 6: Run Relay profile suites**

Run: `pnpm --dir server exec vitest run src/repository.test.ts src/pairingApi.test.ts`

Expected: PASS for both new profile-aware requests and legacy display-name-only requests.

- [ ] **Step 7: Commit profile persistence**

```powershell
git add server/src/database.ts server/src/repository.ts server/src/repository.test.ts server/src/pairingApi.ts server/src/pairingApi.test.ts
git commit -m "feat: persist paired device profiles"
```

### Task 4: Implement The WeatherAPI Provider Adapter

**Files:**
- Create: `server/src/weather/weatherProvider.ts`
- Create: `server/src/weather/weatherCondition.ts`
- Create: `server/src/weather/weatherCondition.test.ts`
- Create: `server/src/weather/weatherApiProvider.ts`
- Create: `server/src/weather/weatherApiProvider.test.ts`
- Modify: `server/src/config.ts`
- Create: `server/src/config.test.ts`

**Interfaces:**
- Consumes: `CityLocationV1`, `WeatherConditionV1`.
- Produces: `WeatherProvider.searchLocations(query)` and `getCurrentDay(city)`.
- Produces: `WeatherProviderError` with `not-configured`, `quota-exhausted`, `unavailable`, and `invalid-response` kinds.
- Consumed by: `WeatherService`.

- [ ] **Step 1: Add failing condition and provider tests with fake fetch**

```ts
it.each([
  [1000, "clear"],
  [1003, "partly-cloudy"],
  [1030, "fog"],
  [1183, "rain"],
  [1213, "snow"],
  [1276, "thunder"],
])("maps WeatherAPI code %i to %s", (code, condition) => {
  expect(mapWeatherApiCondition(code)).toBe(condition);
});

it("requests one-day Chinese forecast without leaking the key in its output", async () => {
  const provider = new WeatherApiProvider({ apiKey: "secret-key", timeoutMs: 3000, fetchImpl });
  const weather = await provider.getCurrentDay(cityA);
  expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining("days=1"), expect.any(Object));
  expect(JSON.stringify(weather)).not.toContain("secret-key");
  expect(weather).toMatchObject({ currentTemperatureC: 26, rainChancePercent: 20 });
});

it("classifies HTTP 403 quota responses", async () => {
  fetchImpl.mockResolvedValue(response(403, { error: { code: 2007, message: "quota" } }));
  await expect(provider.getCurrentDay(cityA)).rejects.toMatchObject({ kind: "quota-exhausted" });
});
```

- [ ] **Step 2: Run adapter tests and confirm missing implementations**

Run: `pnpm --dir server exec vitest run src/weather/weatherCondition.test.ts src/weather/weatherApiProvider.test.ts src/config.test.ts`

Expected: FAIL because provider modules and weather config fields do not exist.

- [ ] **Step 3: Define provider boundaries and normalized data**

```ts
export interface ProviderWeather {
  condition: WeatherConditionV1;
  conditionText: string;
  currentTemperatureC: number;
  maxTemperatureC: number;
  minTemperatureC: number;
  rainChancePercent: number;
}

export interface WeatherProvider {
  searchLocations(query: string): Promise<CityLocationV1[]>;
  getCurrentDay(city: CityLocationV1): Promise<ProviderWeather>;
}
```

Validate every required supplier field before returning. Clamp rain chance to `0..100`, round displayed temperatures to one decimal at the adapter boundary, and map all documented condition codes into the eight stable categories.

- [ ] **Step 4: Implement HTTPS requests, timeout, and error classification**

Use `AbortController` with `WEATHER_REQUEST_TIMEOUT_MS`. Call:

```text
https://api.weatherapi.com/v1/search.json?key=<server-only>&q=<encoded-query>
https://api.weatherapi.com/v1/forecast.json?key=<server-only>&q=<lat,lon>&days=1&aqi=no&alerts=no&lang=zh
```

Never include complete supplier URLs in thrown/logged messages because the query string contains the key.

- [ ] **Step 5: Extend Relay config parsing**

```ts
export interface RelayConfig {
  host: string;
  port: number;
  databasePath: string;
  weatherApiKey: string | null;
  weatherRequestTimeoutMs: number;
}
```

Read `WEATHER_API_KEY` as trimmed nullable text. Accept timeout values from 1000 through 30000 ms and default to 5000 ms.

- [ ] **Step 6: Run provider/config tests**

Run: `pnpm --dir server exec vitest run src/weather/weatherCondition.test.ts src/weather/weatherApiProvider.test.ts src/config.test.ts`

Expected: PASS with no real network calls.

- [ ] **Step 7: Commit provider adapter**

```powershell
git add server/src/weather server/src/config.ts server/src/config.test.ts
git commit -m "feat: add WeatherAPI provider adapter"
```

### Task 5: Add Weather Caches, Request Deduplication, And Rate Limits

**Files:**
- Create: `server/src/weather/weatherService.ts`
- Create: `server/src/weather/weatherService.test.ts`
- Create: `server/src/requestRateLimiter.ts`
- Create: `server/src/requestRateLimiter.test.ts`

**Interfaces:**
- Consumes: `WeatherProvider` from Task 4.
- Produces: `WeatherService.searchLocations(query)` and `getWeather(city)`.
- Produces: `FixedWindowRateLimiter.consume(key, limit, windowMs)`.
- Consumed by: HTTP routes.

- [ ] **Step 1: Write failing clock-driven cache tests**

```ts
it("returns cached weather for one hour and refreshes after expiry", async () => {
  const first = await service.getWeather(cityA);
  now += 59 * 60 * 1000;
  const cached = await service.getWeather(cityA);
  now += 2 * 60 * 1000;
  const refreshed = await service.getWeather(cityA);
  expect([first.source, cached.source, refreshed.source]).toEqual(["live", "cache", "live"]);
  expect(provider.getCurrentDay).toHaveBeenCalledTimes(2);
});

it("uses at most six-hour stale weather when refresh fails", async () => {
  await service.getWeather(cityA);
  now += 2 * 60 * 60 * 1000;
  provider.getCurrentDay.mockRejectedValue(providerUnavailable());
  expect(await service.getWeather(cityA)).toMatchObject({ source: "stale-cache" });
  now += 5 * 60 * 60 * 1000;
  await expect(service.getWeather(cityA)).rejects.toMatchObject({ kind: "unavailable" });
});

it("deduplicates concurrent misses for the same coordinate", async () => {
  await Promise.all([service.getWeather(cityA), service.getWeather(cityA)]);
  expect(provider.getCurrentDay).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run cache and limiter tests**

Run: `pnpm --dir server exec vitest run src/weather/weatherService.test.ts src/requestRateLimiter.test.ts`

Expected: FAIL because the service and limiter do not exist.

- [ ] **Step 3: Implement exact cache policy**

```ts
const WEATHER_FRESH_MS = 60 * 60 * 1000;
const WEATHER_STALE_MAX_MS = 6 * 60 * 60 * 1000;
const LOCATION_SEARCH_MS = 24 * 60 * 60 * 1000;

function weatherKey(city: CityLocationV1): string {
  return `${city.latitude.toFixed(4)},${city.longitude.toFixed(4)}`;
}
```

Use separate Maps for search cache, weather cache, and in-flight promises. Delete an in-flight entry in `finally`. Supplier errors may produce stale cache; parser/programming errors must not silently reuse stale data unless they are classified as provider unavailability.

- [ ] **Step 4: Implement deterministic fixed-window limits**

`consume()` returns `{ allowed: true, remaining }` or `{ allowed: false, retryAfterMs }`. Tests must cover boundary reset exactly at `windowStartedAt + windowMs`. The HTTP layer will use keys `search:device:<id>`, `search:ip:<ip>`, `profile:device:<id>`, and `weather:device:<id>`.

- [ ] **Step 5: Run service and limiter tests**

Run: `pnpm --dir server exec vitest run src/weather/weatherService.test.ts src/requestRateLimiter.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit caching and limiting**

```powershell
git add server/src/weather/weatherService.ts server/src/weather/weatherService.test.ts server/src/requestRateLimiter.ts server/src/requestRateLimiter.test.ts
git commit -m "feat: cache and limit weather requests"
```

### Task 6: Expose Authenticated Profile, Search, And Pair-Weather HTTP Routes

**Files:**
- Create: `server/src/profileEvents.ts`
- Create: `server/src/profileEvents.test.ts`
- Modify: `server/src/pairingApi.ts`
- Modify: `server/src/pairingApi.test.ts`
- Modify: `server/src/server.ts`
- Modify: `server/src/index.ts`
- Modify: `server/src/devLan.ts`
- Modify: `deploy/couple-pet-relay/.env.example`
- Modify: `deploy/couple-pet-relay/compose.yaml`
- Modify: `deploy/couple-pet-relay/README.md`

**Interfaces:**
- Consumes: repository profile methods, `WeatherService`, `FixedWindowRateLimiter`.
- Produces: `ProfileEventHub.publish()`/`subscribe()` for WebSocket Task 7.
- Produces: `POST /locations/search`, `PUT /devices/profile`, `POST /pairs/weather`.

- [ ] **Step 1: Add failing end-to-end HTTP tests with an injected fake provider**

```ts
it("saves a profile and publishes one update", async () => {
  const response = await putJson(`${baseUrl}/devices/profile`, authWith(profileUpdateA));
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({ profile: { nickname: "小满" } });
  expect(profileEvents).toEqual([expect.objectContaining({ deviceId: "dev_a" })]);
});

it("returns both pair members without accepting arbitrary coordinates", async () => {
  const response = await postJson(`${baseUrl}/pairs/weather`, pairAuthA);
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    self: { status: "ready", profile: { nickname: "小满" } },
    peer: { status: "ready", profile: { nickname: "阿岚" } },
  });
  expect(fakeProvider.getCurrentDay).toHaveBeenCalledWith(cityA);
  expect(fakeProvider.getCurrentDay).toHaveBeenCalledWith(cityB);
});

it("reports configured weather without exposing the key", async () => {
  await expect((await fetch(`${baseUrl}/health`)).json()).resolves.toEqual({
    ok: true,
    weatherConfigured: true,
  });
});
```

- [ ] **Step 2: Run HTTP tests and verify route failures**

Run: `pnpm --dir server exec vitest run src/profileEvents.test.ts src/pairingApi.test.ts`

Expected: FAIL with route-not-found or missing dependency errors.

- [ ] **Step 3: Implement the profile event hub**

```ts
export interface ProfileUpdatedEvent {
  deviceId: string;
  profile: DeviceProfileV1;
  changedAt: string;
}

export class ProfileEventHub {
  publish(event: ProfileUpdatedEvent): void;
  subscribe(listener: (event: ProfileUpdatedEvent) => void): () => void;
}
```

Listeners are synchronous and isolated: one listener failure must not prevent other listeners or the successful HTTP response.

- [ ] **Step 4: Implement route parsing, authentication, and independent weather entries**

- `POST /locations/search`: ensure identity, apply 10/min device and IP limits, normalize query, return five or fewer results.
- `PUT /devices/profile`: apply 10/hour device limit, validate `ProfileUpdateV1`, save transactionally, publish after commit.
- `POST /pairs/weather`: apply 30/min device HTTP limit, authenticate active pair, read both profiles, query each complete city independently with `Promise.allSettled`, and map failures to stable reasons.
- `/health`: return `{ ok: true, weatherConfigured: boolean }`.

The weather HTTP rate limit controls request load only; provider load remains bounded by the one-hour city cache.

- [ ] **Step 5: Compose production and fakeable server dependencies**

```ts
export interface RelayServerOptions {
  host: string;
  port: number;
  databasePath: string;
  now?: () => Date;
  weatherProvider?: WeatherProvider;
  weatherConfigured?: boolean;
}
```

Production construction creates `WeatherApiProvider` from config. Tests pass a fake provider and fake clock. Missing key creates a provider that returns `weather_not_configured`; it must not prevent pairing/message service startup.

- [ ] **Step 6: Add deployment configuration and no-cost documentation**

Add empty `WEATHER_API_KEY=` and `WEATHER_REQUEST_TIMEOUT_MS=5000` to `.env.example`; pass both through Compose. Document the WeatherAPI free account, `100,000` monthly-call figure as of 2026-08-18, the no-paid-fallback behavior, and a health check showing `weatherConfigured`.

- [ ] **Step 7: Run Relay HTTP tests and typecheck**

Run: `pnpm --dir server exec vitest run src/profileEvents.test.ts src/pairingApi.test.ts`

Run: `pnpm server:typecheck`

Expected: both PASS.

- [ ] **Step 8: Commit HTTP and deployment behavior**

```powershell
git add server/src/profileEvents.ts server/src/profileEvents.test.ts server/src/pairingApi.ts server/src/pairingApi.test.ts server/src/server.ts server/src/index.ts server/src/devLan.ts deploy/couple-pet-relay/.env.example deploy/couple-pet-relay/compose.yaml deploy/couple-pet-relay/README.md
git commit -m "feat: expose profile and paired weather APIs"
```

### Task 7: Push Current And Updated Peer Profiles Over WebSocket

**Files:**
- Modify: `server/src/connectionRegistry.ts`
- Modify: `server/src/websocketRelay.ts`
- Modify: `server/src/websocketRelay.test.ts`
- Modify: `server/src/server.ts`

**Interfaces:**
- Consumes: `ProfileEventHub`, repository `getDeviceProfile()`, `PROFILE_SYNC_CAPABILITY`.
- Produces: initial and live `peer.profile` delivery to capable clients.
- Consumed by: desktop `RealtimeClient` in Task 8.

- [ ] **Step 1: Add failing WebSocket capability tests**

```ts
it("sends the persisted peer profile after auth", async () => {
  const socket = await connectAuthenticated({
    deviceId: "dev_a",
    capabilities: [ACTIVITY_STATUS_CAPABILITY, PROFILE_SYNC_CAPABILITY],
  });
  await expect(nextMessage(socket, "peer.profile")).resolves.toMatchObject({
    peerDeviceId: "dev_b",
    profile: { nickname: "阿岚" },
  });
});

it("pushes one peer.profile after an HTTP profile save", async () => {
  const socket = await connectAuthenticated(profileCapableDeviceA);
  await saveProfileForDeviceB(updatedProfileB);
  await expect(nextMessage(socket, "peer.profile")).resolves.toMatchObject({
    profile: { nickname: "阿岚的新昵称" },
  });
});

it("does not send profile events to legacy clients", async () => {
  const socket = await connectAuthenticated({ deviceId: "dev_a", capabilities: [] });
  await saveProfileForDeviceB(updatedProfileB);
  await expectNoMessage(socket, "peer.profile", 150);
});
```

- [ ] **Step 2: Run WebSocket tests and observe missing profile messages**

Run: `pnpm --dir server exec vitest run src/websocketRelay.test.ts`

Expected: FAIL on profile expectations while existing presence/status/message tests remain green.

- [ ] **Step 3: Track profile capability and subscribe to committed updates**

Add `supportsProfileSync: boolean` to `AuthenticatedConnection`. Include both supported capabilities in `auth.ok`. After authentication, send the current peer profile only to clients declaring `profile-v1`.

Subscribe `attachWebSocketRelay()` to `ProfileEventHub`; when a saved device has an active pair and its peer is connected/capable, send exactly one `peer.profile`. Unsubscribe when the WebSocket server closes.

- [ ] **Step 4: Run complete WebSocket relay tests**

Run: `pnpm --dir server exec vitest run src/websocketRelay.test.ts`

Expected: PASS for profile-aware and legacy clients.

- [ ] **Step 5: Commit WebSocket profile delivery**

```powershell
git add server/src/connectionRegistry.ts server/src/websocketRelay.ts server/src/websocketRelay.test.ts server/src/server.ts
git commit -m "feat: sync peer profiles over websocket"
```

### Task 8: Add Client Profile And Weather Transport State

**Files:**
- Modify: `src/sync/relayHttpClient.ts`
- Modify: `src/sync/relayHttpClient.test.ts`
- Modify: `src/sync/realtimeClient.ts`
- Modify: `src/sync/realtimeClient.test.ts`
- Modify: `src/sync/useRealtimeSync.ts`
- Modify: `src/sync/useRealtimeSync.test.tsx`
- Modify: `src/sync/syncTypes.ts`
- Create: `src/profile/useProfileSync.ts`
- Create: `src/profile/useProfileSync.test.tsx`

**Interfaces:**
- Consumes: Task 1 contracts and `PetSettings.profile`.
- Produces: `RelayHttpClient.searchLocations()`, `saveProfile()`, `getPairWeather()`.
- Produces: realtime `peerProfile` event and `UseRealtimeSyncCallbacks.onPeerProfile()`.
- Produces: `useProfileSync()` commands/state for `App` and `ProfilePanel`.

- [ ] **Step 1: Write failing transport tests**

```ts
it("uses PUT for profile saves", async () => {
  await client.saveProfile({ deviceId: "dev_a", deviceSecret: "secret", profile: profileUpdateA });
  expect(fetchMock).toHaveBeenCalledWith(
    "http://127.0.0.1:8787/devices/profile",
    expect.objectContaining({ method: "PUT" }),
  );
});

it("advertises profile-v1 and emits peer profiles", () => {
  realtime.connect();
  socket.open();
  expect(lastSent(socket)).toMatchObject({
    type: "auth",
    capabilities: expect.arrayContaining([PROFILE_SYNC_CAPABILITY]),
  });
  socket.receive(peerProfileMessage);
  expect(events).toContainEqual(expect.objectContaining({ type: "peerProfile" }));
});
```

- [ ] **Step 2: Run focused transport tests**

Run: `pnpm exec vitest run src/sync/relayHttpClient.test.ts src/sync/realtimeClient.test.ts src/sync/useRealtimeSync.test.tsx src/profile/useProfileSync.test.tsx`

Expected: FAIL because the methods, event, callback, and hook are missing.

- [ ] **Step 3: Generalize the HTTP client for POST and PUT**

```ts
searchLocations(request: LocationSearchRequest): Promise<RelayResult<LocationSearchResponse>>;
saveProfile(request: SaveProfileRequest): Promise<RelayResult<SaveProfileResponse>>;
getPairWeather(request: PairWeatherRequest): Promise<RelayResult<PairWeatherResponse>>;
```

Parse successful profile/weather responses with shared runtime readers instead of casting unknown JSON. Preserve existing typed relay-error behavior.

- [ ] **Step 4: Add peer-profile realtime projection**

Add:

```ts
| { type: "peerProfile"; peerDeviceId: string; profile: DeviceProfileV1; changedAt: string }
```

to `RealtimeClientEvent`. Advertise both capabilities, parse `peer.profile`, and call `onPeerProfile` from `useRealtimeSync` without rebuilding the realtime client when only cached profile state changes.

- [ ] **Step 5: Implement `useProfileSync`**

```ts
interface UseProfileSyncResult {
  isComplete: boolean;
  searchState: "idle" | "searching" | "error";
  searchResults: CityLocationV1[];
  saveState: ProfileSettings["syncState"];
  searchCities(query: string): Promise<void>;
  saveLocalProfile(profile: ProfileUpdateV1): Promise<{ ok: boolean; message?: string }>;
  rememberPeer(deviceId: string, profile: DeviceProfileV1): void;
}
```

Generate device identity before search/save by reusing `ensureDeviceIdentity`. Save local data immediately; mark `synced` after HTTP success and `pending` after Relay failure. A newer server `updatedAt` replaces cached peer data; an older event is ignored.

- [ ] **Step 6: Run client transport/profile-hook tests**

Run: `pnpm exec vitest run src/sync/relayHttpClient.test.ts src/sync/realtimeClient.test.ts src/sync/useRealtimeSync.test.tsx src/profile/useProfileSync.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit client transport state**

```powershell
git add src/sync/relayHttpClient.ts src/sync/relayHttpClient.test.ts src/sync/realtimeClient.ts src/sync/realtimeClient.test.ts src/sync/syncTypes.ts src/profile/useProfileSync.ts src/profile/useProfileSync.test.tsx
git add -p -- src/sync/useRealtimeSync.ts src/sync/useRealtimeSync.test.tsx
git diff --cached --stat
git diff --cached
git commit -m "feat: add client profile and weather transport"
```

### Task 9: Build The Basic Information Settings Flow

**Files:**
- Create: `src/settings/ProfilePanel.tsx`
- Create: `src/settings/ProfilePanel.test.tsx`
- Modify: `src/sync/SyncPanel.tsx`
- Modify: `src/sync/SyncPanel.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
- Consumes: `useProfileSync()` from Task 8.
- Produces: approved nickname/city form and a hard pairing-completeness gate.
- Produces: pairing requests containing local profile and peer cache updates from accept/poll responses.

- [ ] **Step 1: Write failing profile-panel interaction tests**

```tsx
it("searches only on explicit search or Enter", async () => {
  const onSearch = vi.fn().mockResolvedValue(undefined);
  render(<ProfilePanel {...props} onSearch={onSearch} />);
  fireEvent.change(screen.getByLabelText("所在城市"), { target: { value: "杭州" } });
  expect(onSearch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "搜索城市" }));
  expect(onSearch).toHaveBeenCalledWith("杭州");
});

it("requires a selected result before save", async () => {
  render(<ProfilePanel {...props} />);
  fireEvent.change(screen.getByLabelText("昵称"), { target: { value: "小满" } });
  fireEvent.click(screen.getByRole("button", { name: "保存资料" }));
  expect(screen.getByText("请先从搜索结果中选择城市")).toBeVisible();
  expect(props.onSave).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Add failing App/SyncPanel pairing guard tests**

Assert that incomplete profiles disable or reject both `生成绑定码` and binding submit with `请先完成基本信息`, and that complete profiles are included in create/accept requests. Assert that `peerProfile` from both accept and poll paths is stored under the returned `peerDeviceId`.

- [ ] **Step 3: Run settings/App tests**

Run: `pnpm exec vitest run src/settings/ProfilePanel.test.tsx src/sync/SyncPanel.test.tsx src/app/App.test.tsx`

Expected: FAIL because the profile panel and App integration are absent.

- [ ] **Step 4: Implement the approved settings panel**

Use the confirmed copy and controls:

```tsx
<section className="profile-panel" aria-label="基本信息">
  <h2>基本信息</h2>
  <p>设置你希望对方看到的昵称和城市</p>
  <input aria-label="昵称" maxLength={20} />
  <div className="profile-city-search">
    <input aria-label="所在城市" />
    <button type="button" aria-label="搜索城市"><Search /></button>
  </div>
  <p className="profile-privacy"><ShieldCheck />仅同步城市，不读取或上传精确定位</p>
</section>
```

Render at most five results; selected result uses near-black background, white text, and red `Check`. Keep button/input dimensions fixed during searching and saving.

- [ ] **Step 5: Wire profile state and pairing guards in App**

Render `ProfilePanel` between `SettingsPanel` and `SyncPanel`. Pass `profileComplete` to `SyncPanel`. Before create/accept, guard incomplete state, then include `profile: settingsRef.current.profile.local`. Store `peerProfile` on accept and pair-code poll. Feed realtime `onPeerProfile` into `rememberPeer()`.

- [ ] **Step 6: Add exact profile-panel CSS without disturbing current settings layout**

Use 1px borders, 5px control radius, black search button, red selection mark, and stable 40px field height. Do not nest a decorative card inside another settings card; the profile section remains a full-width sibling in `.settings-dock-body`.

- [ ] **Step 7: Run profile/settings/App tests**

Run: `pnpm exec vitest run src/settings/ProfilePanel.test.tsx src/sync/SyncPanel.test.tsx src/app/App.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit basic-information flow**

```powershell
git add src/settings/ProfilePanel.tsx src/settings/ProfilePanel.test.tsx src/sync/SyncPanel.tsx src/sync/SyncPanel.test.tsx
git add -p -- src/app/App.tsx src/app/App.test.tsx src/app/app.css
git diff --cached --stat
git diff --cached
git commit -m "feat: add basic profile settings"
```

### Task 10: Build Weather Presentation, Icons, And Panel States

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/weather/weatherPresentation.ts`
- Create: `src/weather/weatherPresentation.test.ts`
- Create: `src/weather/WeatherIcon.tsx`
- Create: `src/weather/WeatherIcon.test.tsx`
- Create: `src/weather/usePairWeather.ts`
- Create: `src/weather/usePairWeather.test.tsx`
- Create: `src/weather/WeatherPanel.tsx`
- Create: `src/weather/WeatherPanel.test.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
- Consumes: `PairWeatherResponse`, `RelayHttpClient.getPairWeather()`.
- Produces: `usePairWeather.open()` and complete panel render states.
- Consumed by: App weather surface in Task 11.

- [ ] **Step 1: Add the locally bundled Lucide dependency**

Run: `pnpm add lucide-react`

Expected: `package.json` and `pnpm-lock.yaml` contain `lucide-react`; no CDN or runtime remote icon request is introduced.

- [ ] **Step 2: Write failing presentation and hook tests**

```ts
it.each([
  [{ rainChancePercent: 50, currentTemperatureC: 20 }, "TA 那边可能会下雨，今天记得提醒 TA 带伞。"],
  [{ rainChancePercent: 49, currentTemperatureC: 30 }, "TA 那边有点热，记得提醒 TA 多喝水。"],
  [{ rainChancePercent: 0, currentTemperatureC: 10 }, "TA 那边有点凉，记得让 TA 多穿一点。"],
  [{ rainChancePercent: 0, currentTemperatureC: 22 }, "今天也在同一片天空下。"],
])("selects deterministic care copy", (weather, copy) => {
  expect(getPeerCareCopy(readyPeer(weather))).toBe(copy);
});

it("requests once for every open call even when Relay returns cache", async () => {
  await result.current.open(auth);
  await result.current.open(auth);
  expect(client.getPairWeather).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 3: Write failing component state tests**

Cover exact visible states: loading skeletons; both ready; one unavailable; both unavailable; `stale-cache`; missing peer city; unpaired with `进入绑定设置`; and close via Escape/close button. Assert every local icon renders an SVG and no emoji or remote supplier image exists.

- [ ] **Step 4: Run weather tests and observe missing modules**

Run: `pnpm exec vitest run src/weather/weatherPresentation.test.ts src/weather/WeatherIcon.test.tsx src/weather/usePairWeather.test.tsx src/weather/WeatherPanel.test.tsx`

Expected: FAIL because the weather frontend modules do not exist.

- [ ] **Step 5: Implement presentation mapping and request state**

```ts
export type PairWeatherUiState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; response: PairWeatherResponse }
  | { status: "failed"; message: string };
```

Round temperatures for display with `Math.round`, format update time from each snapshot's `fetchedAt`, and show `天气暂时没有更新` when either visible entry uses `stale-cache`.

- [ ] **Step 6: Implement stable local icon mapping**

Map `clear -> Sun`, `partly-cloudy -> CloudSun`, `cloudy -> Cloud`, `fog -> CloudFog`, `rain -> CloudRain`, `snow -> CloudSnow`, `thunder -> CloudLightning`, and `other -> Cloud`. Use `aria-hidden` for decorative weather symbols and preserve textual condition labels.

- [ ] **Step 7: Implement exact approved panel markup and degradation copy**

The root content panel is `424 x 466`. Use two fixed weather rows with tracks `86px 1fr 112px`; preserve dimensions in loading/error states. Include:

```text
两座城 · 一份牵挂
今天也在同一片天空下
天气暂时走神了，晚点再一起看看。
WeatherAPI.com
```

Only the close button and explicit settings/binding commands are interactive. The care note uses a 3px red left border rather than a nested card.

- [ ] **Step 8: Add exact weather CSS and responsive text protection**

Set explicit widths/heights, `min-width: 0`, wrapping rules for long city names, and no viewport-scaled font sizes. At narrow internal widths, truncate city with ellipsis while temperature and metrics retain fixed tracks.

- [ ] **Step 9: Run weather component tests**

Run: `pnpm exec vitest run src/weather/weatherPresentation.test.ts src/weather/WeatherIcon.test.tsx src/weather/usePairWeather.test.tsx src/weather/WeatherPanel.test.tsx`

Expected: PASS.

- [ ] **Step 10: Commit weather UI modules**

```powershell
git add package.json pnpm-lock.yaml src/weather
git add -p -- src/app/app.css
git diff --cached --stat
git diff --cached
git commit -m "feat: add paired weather panel"
```

### Task 11: Replace The Radial Entry And Integrate The Tauri Weather Surface

**Files:**
- Create: `src/assets/ui/interaction-buttons/new-tea-weather.png`
- Modify: `src/assets/README.md`
- Modify: `src/assets/builtInPetManifest.ts`
- Modify: `src/assets/builtInPetManifest.test.ts`
- Modify: `src/interaction/InteractionMenu.tsx`
- Modify: `src/interaction/InteractionMenu.test.tsx`
- Modify: `src/desktop/windowCommands.ts`
- Modify: `src/desktop/windowCommands.test.ts`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

**Interfaces:**
- Consumes: WeatherPanel/usePairWeather from Task 10 and profile/pair state from Tasks 8-9.
- Produces: `open-weather` menu selection and `weather` composer surface.
- Produces: final six-button menu and full open/close/settings handoff lifecycle.

- [ ] **Step 1: Update failing menu and native geometry tests first**

```ts
expect(interactionOptions.map((option) => option.id)).toEqual([
  "open-weather",
  "send-message",
  "open-focus-timer",
  "act-hug",
  "send-surprise",
  "open-status",
]);
expect(interactionOptions[0]).toMatchObject({ label: "双方天气", iconName: "weather" });
```

Add Rust cases:

```rust
(ComposerSurface::Weather, 1.0, 460, 504),
(ComposerSurface::Weather, 1.25, 575, 630),
(ComposerSurface::Weather, 1.5, 690, 756),
```

Assert close restores the saved pet geometry and weather open does not change click-through preference.

- [ ] **Step 2: Run menu and Rust tests in red state**

Run: `pnpm exec vitest run src/assets/builtInPetManifest.test.ts src/interaction/InteractionMenu.test.tsx src/desktop/windowCommands.test.ts src/app/App.test.tsx`

Run: `cargo test --manifest-path src-tauri/Cargo.toml composer_surfaces_scale_logical_sizes_for_physical_centering`

Expected: FAIL because `open-weather`, `weather` icon, and native surface do not exist.

- [ ] **Step 3: Generate and inspect the custom transparent radial icon**

Invoke image generation with this exact brief:

```text
Create one square transparent-background UI illustration for a couple desktop-pet radial menu. Contemporary minimalist tea-brand editorial style, black and white with one restrained vermilion-red accent. A small cloud and sun represent weather, joined to two tiny location dots by one red curved line to suggest two cities. Rounded hand-inked contours, clean flat fills, no yellow palette, no text, no letters, no logo, no border, no shadow, no background shape. Center the subject with 12% transparent padding. Export as a crisp 1024x1024 PNG with true alpha.
```

Save as `new-tea-weather.png`, inspect with `view_image`, and reject/regenerate if any text, opaque corner, yellow block, logo, or nontransparent background appears. Record it as project-generated in `src/assets/README.md`.

- [ ] **Step 4: Change the menu contract and resource map**

Add `weather` to `InteractionMenuIconName`, add `open-weather` to `InteractionMenuSelection`, replace only the first option, import the new PNG in `InteractionMenu.tsx`, and verify all six icon URLs resolve to bundled nonempty assets.

- [ ] **Step 5: Add native weather surface geometry**

Add `Weather` to Rust `ComposerSurface` and `weather` to TypeScript `ComposerSurface`. Define:

```rust
const WEATHER_COMPOSER_SURFACE_WIDTH_LOGICAL_PX: f64 = 460.0;
const WEATHER_COMPOSER_SURFACE_HEIGHT_LOGICAL_PX: f64 = 504.0;
```

Reuse the existing save/center/show/restore path; do not introduce a second window-state store.

- [ ] **Step 6: Integrate weather lifecycle into App**

Add `"weather"` to `ComposerMode`. Selecting `open-weather` always opens the panel even if the peer is offline; unpaired state is rendered inside the panel. On open, call `usePairWeather.open()` when complete pair credentials exist. On `进入绑定设置`, close the composer surface first, await geometry restoration, then open settings. Close/Escape uses the existing `closeComposerPanel()` path.

Do not add weather to `sendable`, because persisted pair weather must work while the peer is offline.

- [ ] **Step 7: Run menu, App, desktop, and Rust tests**

Run: `pnpm exec vitest run src/assets/builtInPetManifest.test.ts src/interaction/InteractionMenu.test.tsx src/desktop/windowCommands.test.ts src/app/App.test.tsx`

Run: `cargo test --manifest-path src-tauri/Cargo.toml composer`

Expected: PASS.

- [ ] **Step 8: Commit menu asset and native integration**

```powershell
git add src/assets/ui/interaction-buttons/new-tea-weather.png
git add -p -- src/assets/README.md src/assets/builtInPetManifest.ts src/assets/builtInPetManifest.test.ts src/interaction/InteractionMenu.tsx src/interaction/InteractionMenu.test.tsx src/desktop/windowCommands.ts src/desktop/windowCommands.test.ts src-tauri/src/commands.rs src/app/App.tsx src/app/App.test.tsx
git diff --cached --stat
git diff --cached
git commit -m "feat: integrate paired weather surface"
```

### Task 12: Add Deterministic E2E Fixtures, Visual QA, Deployment Verification, And Debug EXE

**Files:**
- Modify: `src/sync/e2eRealtimeOverride.ts`
- Modify: `src/sync/e2eRealtimeOverride.test.ts`
- Modify: `e2e/support/realtimeOverride.ts`
- Create: `e2e/interop/specs/couple-weather.e2e.ts`
- Modify: `e2e/interop/wdio.windows.conf.ts`
- Modify: `e2e/interop/wdio.macos.conf.ts`
- Create: `docs/manual-verification/couple-weather.md`
- Modify: `design-qa.md`

**Interfaces:**
- Consumes: all completed feature boundaries.
- Produces: deterministic paired profiles/weather for browser/native QA, verification evidence, and debug EXE.

- [ ] **Step 1: Add failing E2E override tests**

Define an E2E-only weather fixture containing Hangzhou and Shenzhen profiles, one `partly-cloudy` snapshot and one `rain` snapshot. Assert production builds ignore it unless `VITE_TAURI_E2E === "1"`.

```ts
expect(readE2ePairWeatherOverride()).toMatchObject({
  self: { status: "ready", profile: { city: { name: "杭州" } } },
  peer: { status: "ready", profile: { city: { name: "深圳" } } },
});
```

- [ ] **Step 2: Run E2E override tests in red state**

Run: `pnpm exec vitest run src/sync/e2eRealtimeOverride.test.ts`

Expected: FAIL because profile/weather fixture support is absent.

- [ ] **Step 3: Implement deterministic E2E profile/weather overrides**

Expose only test-build setters/subscribers. Wire `usePairWeather` to the override in the same guarded pattern as existing realtime messages. Do not add production query parameters or local-storage shortcuts.

- [ ] **Step 4: Add native interoperability assertions**

Register `weather: ["./specs/couple-weather.e2e.ts"]` in both WDIO suite maps. The `couple-weather.e2e.ts` flow must:

1. Open the six-button menu and assert `双方天气` is first.
2. Open weather and assert both cities, temperatures, high/low, rain chance, care copy, and provider attribution.
3. Close weather and assert pet geometry is restored.
4. Open settings, update nickname/city fixture, and assert peer profile projection changes.
5. Capture the automated `weather-panel-100.png` baseline at 100% display scaling.

- [ ] **Step 5: Write manual verification instructions**

Document free-key configuration, Relay restart persistence, two-device binding, online profile update, offline/reconnect update, cache hit within one hour, forced expiry, stale fallback, missing key, quota failure, transparent gutters, click-through preservation, and exact mockup comparison. Require manual Windows captures named `weather-panel-125.png` and `weather-panel-150.png` at 125% and 150% display scaling; all three scales are mandatory before release sign-off.

- [ ] **Step 6: Run all frontend and Relay verification**

Run: `pnpm test`

Run: `pnpm typecheck`

Run: `pnpm build`

Run: `pnpm server:test`

Run: `pnpm server:typecheck`

Run: `pnpm server:build`

Expected: every command exits 0. Record test counts in `design-qa.md` from the actual outputs; do not reuse earlier counts.

- [ ] **Step 7: Run Rust formatting and tests**

Run: `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: both exit 0.

- [ ] **Step 8: Launch the real app and compare against the approved design**

Start a local Relay with deterministic provider injection or E2E fixture, then run: `pnpm tauri dev`.

Capture the real Tauri profile settings and weather panel. Compare all items from the spec: `424 x 466` content, font scale, `#fffefa/#171717/#d52820` colors, dividers, 7px radius, both line icons, care note, `WeatherAPI.com`, transparent outer gutter, and no square background. Fix and repeat focused tests for every mismatch before proceeding.

- [ ] **Step 9: Build the debug EXE**

Run: `pnpm tauri build --debug --no-bundle`

Expected artifact: `src-tauri/target/debug/couple-desktop-pet.exe`.

Run: `Get-FileHash src-tauri\target\debug\couple-desktop-pet.exe -Algorithm SHA256`

Record the actual hash and build time in `design-qa.md`.

- [ ] **Step 10: Request two-stage code review and fix findings**

Use the repository's fixed background review task when available. First review spec compliance, then code quality/cross-platform/security. Require explicit checks for API-key leakage, arbitrary-coordinate proxying, legacy protocol compatibility, cache timing, transparent input regions, and unrelated dirty-worktree changes. Send fixes back to the same development task and rerun affected tests.

- [ ] **Step 11: Commit QA artifacts and documentation**

```powershell
git add e2e/interop/specs/couple-weather.e2e.ts docs/manual-verification/couple-weather.md
git add -p -- src/sync/e2eRealtimeOverride.ts src/sync/e2eRealtimeOverride.test.ts e2e/support/realtimeOverride.ts e2e/interop/wdio.windows.conf.ts e2e/interop/wdio.macos.conf.ts design-qa.md
git diff --cached --stat
git diff --cached
git commit -m "test: verify paired weather experience"
```

Do not commit the built EXE, API Key, `.env`, runtime SQLite database, screenshots containing unrelated personal desktop content, or `.superpowers/` session files.
