# Realtime Pairing And Message MVP Design

## Status

Approved direction for first realtime MVP.

Date: 2026-08-03

## Scope

This design adds the first remote capability for the desktop pet: one-to-one directed pairing and simple online text messages.

The realtime layer must stay separate from the local desktop pet core. Local pet rendering, state machine, window control, settings storage, and assets continue to work without a network connection.

## Decisions

- Use a lightweight cloud relay service.
- Support one fixed pair only in the first version.
- Implement the relay as a Node.js + TypeScript WebSocket service.
- Persist devices and pair bindings in SQLite.
- Do not store message content.
- Do not support offline messages in the first version.
- Use WSS/TLS transport encryption in deployment.
- Do not implement end-to-end encryption in the first version.
- Do not implement public random matching, remote computer control, voice, account login, payments, or creator/social features.

## Goals

- User A can create a short-lived pairing code.
- User B can enter the pairing code and bind to User A.
- Both desktop pets can connect to the relay and see peer online/offline status.
- Either user can send a short text message while both are online.
- The receiver sees the message as a desktop pet bubble and in a minimal message panel/history for the current session.
- The system can survive relay service restarts without losing the pair binding.

## Non-Goals

- No offline message inbox.
- No multi-friend or group chat.
- No account/password login.
- No device migration UX.
- No moderation tooling for public discovery.
- No E2EE key exchange.
- No remote desktop, screen capture, microphone, camera, or file transfer.

## Architecture

The feature is split into three layers:

1. `server/`
   - Node.js + TypeScript relay service.
   - HTTP endpoints for pairing code creation, pairing acceptance, and health check.
   - WebSocket endpoint for authentication, presence, and online message forwarding.
   - SQLite database for devices, pairing codes, and pair bindings.

2. `src/sync/`
   - Desktop client realtime module.
   - Owns device identity, relay connection, reconnect behavior, auth handshake, protocol parsing, and send/receive methods.
   - Does not call desktop window APIs directly.
   - Does not mutate pet state directly; it emits typed sync events for app/UI code.

3. UI integration
   - Settings or a small sync panel adds pairing controls.
   - App layer maps received message events to current-session message history and pet bubbles.
   - Existing pet state machine remains local-first. Remote events are displayed as bubbles first; later versions may map remote events into pet interactions.

## User Flow

### First Device Setup

On first use of realtime features, the app generates and stores:

- `deviceId`: random stable public id.
- `deviceSecret`: random local secret used to authenticate the device.

These values are stored locally with settings, not hard-coded.

### Create Pairing Code

1. User A opens pairing UI.
2. App ensures local device identity exists.
3. App calls `POST /pair-codes`.
4. Server creates a short-lived pairing code, for example 6 to 8 characters, valid for 10 minutes.
5. UI displays the code.

### Accept Pairing Code

1. User B opens pairing UI.
2. User B enters A's code.
3. App ensures local device identity exists.
4. App calls `POST /pairs/accept`.
5. Server validates the code and creates a `pairId` for the two device ids.
6. Both apps store the returned `pairId`.
7. The code is consumed and cannot be reused.

### Connect Realtime

1. App opens WebSocket to the relay.
2. App sends an `auth` message with `deviceId`, `deviceSecret`, and `pairId`.
3. Server validates that the device belongs to the pair.
4. Server marks the device online.
5. Server sends peer presence updates to both devices.

### Send Online Message

1. User types a short message.
2. App sends `message.send` over WebSocket.
3. Server validates sender membership in `pairId`.
4. Server forwards the message to the online peer.
5. Receiver app shows a desktop pet bubble and appends the message to current-session history.
6. Server may send `message.delivered` to the sender when the peer connection accepted the message.

If the peer is offline, the server rejects the send with a typed error. It does not store the message.

## HTTP API

All request and response bodies are JSON.

### `GET /health`

Returns service health.

Response:

```json
{
  "ok": true
}
```

### `POST /pair-codes`

Creates a short-lived code for the local device.

Request:

```json
{
  "deviceId": "dev_...",
  "deviceSecret": "random-local-secret",
  "displayName": "星星桌宠"
}
```

Response:

```json
{
  "code": "839241",
  "expiresAt": "2026-08-03T12:10:00.000Z"
}
```

Rules:

- A device can have only one active code at a time.
- Creating a new code invalidates the previous active code for that device.
- Codes expire automatically.

### `POST /pairs/accept`

Accepts a code and creates a one-to-one pair.

Request:

```json
{
  "deviceId": "dev_...",
  "deviceSecret": "random-local-secret",
  "code": "839241",
  "displayName": "星星桌宠"
}
```

Response:

```json
{
  "pairId": "pair_...",
  "peerDeviceId": "dev_..."
}
```

Rules:

- The code must exist, be unexpired, and not be consumed.
- A device cannot accept its own code.
- First version supports only one active pair per device.
- If either device is already paired, return an explicit error.

## WebSocket Protocol

All WebSocket messages are JSON with `type`, `requestId` where relevant, and a typed payload.

### Client To Server

`auth`

```json
{
  "type": "auth",
  "requestId": "req_1",
  "deviceId": "dev_...",
  "deviceSecret": "random-local-secret",
  "pairId": "pair_..."
}
```

`message.send`

```json
{
  "type": "message.send",
  "requestId": "req_2",
  "pairId": "pair_...",
  "clientMessageId": "msg_local_...",
  "text": "想你啦"
}
```

`ping`

```json
{
  "type": "ping"
}
```

### Server To Client

`auth.ok`

```json
{
  "type": "auth.ok",
  "requestId": "req_1",
  "pairId": "pair_..."
}
```

`peer.online`

```json
{
  "type": "peer.online",
  "pairId": "pair_...",
  "peerDeviceId": "dev_..."
}
```

`peer.offline`

```json
{
  "type": "peer.offline",
  "pairId": "pair_...",
  "peerDeviceId": "dev_..."
}
```

`message.received`

```json
{
  "type": "message.received",
  "pairId": "pair_...",
  "serverMessageId": "msg_...",
  "fromDeviceId": "dev_...",
  "text": "想你啦",
  "sentAt": "2026-08-03T12:00:00.000Z"
}
```

`message.delivered`

```json
{
  "type": "message.delivered",
  "requestId": "req_2",
  "clientMessageId": "msg_local_...",
  "deliveredAt": "2026-08-03T12:00:00.000Z"
}
```

`error`

```json
{
  "type": "error",
  "requestId": "req_2",
  "code": "peer_offline",
  "message": "Peer is offline"
}
```

## SQLite Data Model

`devices`

- `device_id` text primary key
- `device_secret_hash` text not null
- `display_name` text
- `created_at` text not null
- `last_seen_at` text

`pair_codes`

- `code` text primary key
- `creator_device_id` text not null
- `expires_at` text not null
- `consumed_at` text
- `created_at` text not null

`pairs`

- `pair_id` text primary key
- `device_a_id` text not null
- `device_b_id` text not null
- `created_at` text not null
- `disabled_at` text

Message content is not stored. `message.delivered` is derived from current WebSocket delivery only.

## Client State

Local realtime settings store:

- `syncEnabled`: boolean, default false.
- `relayUrl`: string.
- `deviceId`: string.
- `deviceSecret`: string.
- `pairId`: string or null.
- `peerDeviceId`: string or null.

Runtime state in `src/sync/`:

- connection status: `disabled`, `connecting`, `connected`, `disconnected`, `authFailed`.
- peer presence: `unknown`, `online`, `offline`.
- reconnect attempt count.
- last error.

Current-session message history can stay in memory for MVP. It is cleared when the app restarts.

## Error Handling

Pairing errors:

- invalid or expired code.
- self-pair attempt.
- code already consumed.
- local device already paired.
- peer device already paired.
- relay unavailable.

WebSocket errors:

- auth failed.
- pair not found.
- peer offline.
- malformed message.
- message too long.
- rate limited.

Client behavior:

- Show short user-facing errors in the pairing/message UI.
- Keep local pet usable when sync fails.
- Reconnect with bounded backoff.
- Do not show repeated intrusive bubbles for connection churn.

## Limits

MVP limits:

- Message text max length: 300 characters.
- Pair code TTL: 10 minutes.
- One active pair per device.
- One active WebSocket connection per device is preferred. If a second connection authenticates with the same device, the server may close the older connection.
- Basic rate limit per device for pairing and messages.

## Security And Privacy

- Deployment should use HTTPS/WSS.
- `deviceSecret` must not be logged.
- Server stores a hash of `deviceSecret`, not the raw secret.
- Pair codes are short-lived and single-use.
- Message content is not persisted.
- No screen, microphone, camera, or file access is part of this feature.
- Remote events must be pet events only. They must not control the peer computer or invoke desktop APIs directly.
- Future E2EE can be added after the MVP protocol is stable.

## Module Boundaries

`server/` owns:

- HTTP API.
- WebSocket server.
- SQLite persistence.
- connection registry.
- pair membership validation.
- message forwarding.

`src/sync/` owns:

- sync client protocol types.
- device identity helper.
- HTTP client for pairing endpoints.
- WebSocket connection lifecycle.
- typed event emitter or callback adapter for app integration.

`src/app` owns:

- deciding when to display message bubbles.
- current-session message state.
- wiring sync events to UI.

`src/pet-core` remains local-first:

- It should not know about WebSocket, pair codes, relay URLs, or server errors.

`src/desktop` remains system-only:

- It should not know about remote users or message content.

## Testing Strategy

Server tests:

- creates and expires pair codes.
- rejects invalid, expired, consumed, and self-pair codes.
- enforces one active pair per device.
- authenticates WebSocket by device and pair.
- forwards messages only to the paired online peer.
- rejects offline peer sends without storing content.
- emits peer online/offline events.

Client tests:

- creates local device identity once and reuses it.
- maps pairing API success/errors to typed results.
- reconnects with backoff.
- parses message and presence events.
- rejects malformed incoming messages safely.

Integration tests:

- two simulated clients pair and exchange a message through the server.
- server restart preserves pair binding in SQLite.
- after restart, both clients can reconnect using stored `pairId`.

Manual verification:

- Run local relay service.
- Start two desktop pet clients with separate local data directories.
- Generate a code on A, accept on B.
- Confirm both show peer online.
- Send text from A to B.
- Confirm B shows desktop bubble.
- Close B and confirm A sees peer offline.
- Restart server and confirm pair still exists after reconnect.

## Implementation Order

1. Add protocol and data model design files.
2. Scaffold `server/` with TypeScript, WebSocket, SQLite, tests, and local dev scripts.
3. Implement pairing HTTP endpoints.
4. Implement WebSocket auth, presence, and online message forwarding.
5. Add `src/sync/` client module with typed protocol and reconnection.
6. Add minimal pairing/message UI.
7. Wire received messages to pet bubbles.
8. Add manual verification document.

## Open Risks

- No account system means device loss makes pair recovery manual.
- No offline messages means users must both be online for delivery.
- No E2EE means the relay can technically read message payloads while forwarding; the server should not store message content.
- Running a public relay later will require deployment, TLS, abuse limits, logs policy, and operational monitoring.
- The first UI must keep networking optional and non-disruptive so local desktop pet quality does not regress.
