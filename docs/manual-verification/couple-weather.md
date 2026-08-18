# Couple Profile And Weather Manual Verification

Date: 2026-08-18

This checklist verifies the production profile, pairing, weather, cache, and
desktop-window behavior. Never commit a WeatherAPI key, `.env`, Relay database,
or screenshot containing unrelated desktop content.

## Preconditions

- Use two isolated app-data directories and two real Tauri debug clients.
- Use an isolated Relay database and a WeatherAPI free-plan key created at
  `https://www.weatherapi.com/`.
- Set `WEATHER_API_KEY` only in the Relay process environment. Optionally set a
  valid `WEATHER_REQUEST_TIMEOUT_MS`; do not place either value in client files.
- Start Relay, confirm `/health` reports only weather configuration state and
  does not expose the key, then start both clients.
- Disable automatic movement during fixed visual captures.
- Record supplier-request counts from sanitized development instrumentation;
  logs must not contain the API key or full supplier URL query string.

## Profile, Persistence, And Pairing

1. On device A, open **设置 > 基本信息**. Search explicitly for `杭州`, select
   the normalized result, enter a nickname, and save.
2. On device B, repeat with `深圳`. Confirm neither client requests GPS,
   precise location, or IP-derived location.
3. Restart Relay with the same database. Reopen settings on both clients and
   confirm nickname/city persist.
4. Create a binding code on A and accept it on B. Confirm both clients retain
   their local profile and project the returned optional peer profile.
5. While both clients are online, change A's nickname and city. Confirm B
   receives the new peer profile without reconnecting and never displays its
   own profile as the peer.
6. Disconnect B, change A's profile again, reconnect B, and confirm B receives
   the latest profile once. Older `updatedAt` data must not overwrite it.
7. Verify incomplete basic information blocks both create and accept binding
   with `请先完成基本信息`.

## Weather Success And Cache Policy

1. Open the six-button interaction menu. Confirm exactly six entries and
   `双方天气` first.
2. Open weather. Confirm the request goes to Relay and coordinates are derived
   only from the stored pair profiles. No client-supplied latitude/longitude is
   accepted.
3. Confirm both fixed rows show nickname, city, stable local line icon, current
   temperature, today's high/low, and rain chance. Confirm the care note and
   `WeatherAPI.com` attribution.
4. Close and reopen within one hour. Confirm each open reaches Relay but the
   supplier count does not increase. The one-hour boundary is fresh through
   age `< 1h`; age `>= 1h` must revalidate with the supplier.
5. Forced expiry must use the existing fake-clock/fake-provider Relay tests or
   a process-local QA harness that constructs the same weather service. Do not
   add a production HTTP cache-control route. Advance to exactly one hour and
   confirm a supplier refresh occurs.
6. Make the supplier fail after the refresh and advance the cached age to
   exactly six hours. Confirm stale weather remains visible with
   `天气暂时没有更新`. Advance beyond six hours and confirm weather is unavailable.
7. Restart Relay during this matrix and repeat an open. In-memory cache loss may
   cause a supplier request; persisted profiles and binding must remain intact.

## Configuration, Quota, And Failure Cases

- **Missing key:** start Relay without `WEATHER_API_KEY`; startup stays healthy,
  city/weather calls return `weather_not_configured`, and the panel shows
  `天气服务暂时未配置` without a retry loop.
- **Quota exhausted:** inject/classify WeatherAPI quota responses in the Relay
  QA harness. Confirm graceful unavailable/stale behavior, no paid fallback,
  and no key or supplier payload in the response/log.
- **Authentication failure:** wrong device credentials must fail before profile
  reads, mutations, cache use, or supplier calls.
- **Rate limit:** verify device and trusted source-IP limits independently,
  `Retry-After` semantics, and no device-row creation from IP-rejected search
  traffic.
- **Partial supplier failure:** fail only one city and confirm the other row
  remains ready.
- **Peer offline:** disconnect the peer and confirm stored peer profile/weather
  remains available according to cache policy.
- **Unpaired/incomplete:** confirm the fixed panel renders the binding/basic-info
  command state without layout shift.

## Desktop Input And Geometry

1. Record the pet window position and size before opening weather.
2. Open weather and confirm the outer logical surface is `460 x 504` with one
   centered `424 x 466` panel. The transparent gutters have no painted square.
3. Confirm visible panel controls receive pointer input. Click the transparent
   gutter over a harmless test target and confirm the click reaches the window
   below; do not use an unrelated personal application for this check.
4. Repeat with persisted click-through both off and on. Interactive regions must
   temporarily win inside the panel, gutters must pass through, and the stored
   preference must remain unchanged.
5. Close by button and Escape. Confirm the previous pet position/size returns.
6. From weather, choose settings/binding. Confirm native restoration completes
   before settings opens; on forced restore failure, settings stays closed and
   a retry can restore from the retained geometry.

## Approved Visual Comparison

Compare the real Tauri panel against the approved design, not a browser-only
mock. Check every item:

- content size `424 x 466`, one-pixel `#171717` border, `7px` radius;
- `#fffefa` background, `#171717` text, `#d52820` accents,
  `#dad6cf` dividers, and `#f2f0eb` secondary surfaces;
- zero letter spacing and no viewport-scaled fonts;
- header `两座城 · 一份牵挂` and title `今天也在同一片天空下`;
- exactly two stable line-icon rows, no emoji, remote SVG, yellow block, or
  square window background;
- red-left-border care band, full attribution, and no nested decorative card;
- long nickname/city containment with no overlap or row-height shift;
- basic-information settings flow matches the same black/white/red system.

## Mandatory Native Release Evidence

All Windows rows below are required before release sign-off. Capture only the
app-owned surface or a dedicated harmless click target and place the files in
the Task 12 QA evidence folder.

| Display scale | Required evidence | Method |
| --- | --- | --- |
| 100% | `weather-panel-windows-100.png` | Automated real Tauri WDIO panel capture at verified scale factor `1` |
| 100% | `basic-information-settings-windows-100.png` | Real Tauri basic-information panel capture |
| 100% | 100% OS-level gutter click-through | Click a transparent gutter over a dedicated harmless target and record delivery |
| 125% | `weather-panel-windows-125.png` | Manual real Tauri capture at verified scale factor `1.25` |
| 125% | 125% OS-level gutter click-through | Repeat the dedicated-target click and record delivery |
| 150% | `weather-panel-windows-150.png` | Manual real Tauri capture at verified scale factor `1.5` |
| 150% | 150% OS-level gutter click-through | Repeat the dedicated-target click and record delivery |

At each scale, record native outer size (`460x504`, `575x630`, `690x756`
physical pixels respectively), panel content dimensions, display/OS version,
click result, restored geometry, and whether any text/icon overlap is visible.
Do not sign off with only unit tests or browser screenshots. If a physical scale
or platform is unavailable, mark the release gate blocked rather than relabeling
simulated evidence as native.

**Release sign-off is blocked if any item above is missing.** A settings-panel
capture does not replace a weather capture, and DOM/style pointer assertions do
not replace an OS-level click delivered to the dedicated window below.

## Release Record

Record in `design-qa.md`:

- exact commands, exit codes, test counts, and build counts from the final run;
- screenshot paths and SHA-256 hashes;
- real Tauri observations versus browser-only observations;
- Relay version/configuration state with secrets removed;
- debug EXE path, build duration, byte size, and SHA-256;
- every skipped case and residual platform risk.
