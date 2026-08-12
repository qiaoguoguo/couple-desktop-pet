# Phase A Report

Status: DONE_WITH_CONCERNS

## Commits

- Task 1: `17d71af` `feat: define surprise message protocol`
- Task 2: `24ac59b` `feat: relay surprise message content`
- Task 3: `d7a9859` `feat: transport surprise messages`
- Task 4: `78e28f5` `feat: add surprise themes and queue states`

## Task 1: Shared Structured Message Contract

- RED command: `pnpm test -- shared/syncProtocol.test.ts`
- RED failure reason: valid received `content` was dropped, invalid `content` had no explicit fallback marker, and `validateStructuredMessageContent` was not exported.
- GREEN command: `pnpm exec vitest run shared/syncProtocol.test.ts`
- GREEN result: PASS, 1 file, 30 tests.
- Additional verification: `pnpm typecheck` PASS.
- Changed files: `shared/syncProtocol.ts`, `shared/syncProtocol.test.ts`.
- Compatibility: `text` remains required; received invalid or unknown structured content is ignored while preserving the fallback text message. Legacy extra server fields remain ignored.

## Task 2: Relay Validation And Forwarding

- RED command: `pnpm --dir server test websocketRelay.test.ts`
- RED failure reason: valid surprise content was not forwarded to the peer, and malformed content was treated as a delivered text message.
- GREEN command: `pnpm --dir server test websocketRelay.test.ts`
- GREEN result: PASS, 1 file, 12 tests.
- Additional verification: `pnpm server:typecheck` PASS.
- Changed files: `server/src/websocketRelay.ts`, `server/src/websocketRelay.test.ts`.
- Compatibility: pure text `message.send` continues to forward without a `content` property; malformed structured content returns `malformed_message` and is not forwarded. Relay does not log payload objects.

## Task 3: Realtime Transport And Callback

- RED command: `pnpm exec vitest run src/sync/realtimeClient.test.ts src/sync/useRealtimeSync.test.tsx`
- RED failure reason: `RealtimeClient.sendMessage` ignored the structured content argument, received message events omitted valid parsed content, and `useRealtimeSync` callbacks received text-only messages.
- GREEN command: `pnpm exec vitest run src/sync/realtimeClient.test.ts src/sync/useRealtimeSync.test.tsx`
- GREEN result: PASS, 2 files, 22 tests.
- Additional verification: `pnpm typecheck` PASS.
- Changed files: `src/sync/realtimeClient.ts`, `src/sync/realtimeClient.test.ts`, `src/sync/useRealtimeSync.ts`, `src/sync/useRealtimeSync.test.tsx`.
- Compatibility: text validation still runs before send; valid typed content is appended only when provided. Unknown received structured content is already downgraded by shared parsing and arrives as text-only behavior.

## Task 4: Theme Data And Joint FIFO Queue

- RED command: `pnpm exec vitest run src/surprise/surpriseThemes.test.ts src/sync/remoteMessageQueue.test.ts`
- RED failure reason: `src/surprise/surpriseThemes.ts` did not exist, surprise messages entered the queue as `visible` text, and `revealRemoteSurprise` was missing.
- GREEN command: `pnpm exec vitest run src/surprise/surpriseThemes.test.ts src/sync/remoteMessageQueue.test.ts`
- GREEN result: PASS, 2 files, 17 tests.
- Additional verification: `pnpm typecheck` PASS.
- Changed files: `src/surprise/surpriseThemes.ts`, `src/surprise/surpriseThemes.test.ts`, `src/sync/remoteMessageQueue.ts`, `src/sync/remoteMessageQueue.test.ts`.
- Compatibility: ordinary messages still start `visible`, still move through hover and dismissal, and queued text is promoted FIFO after an active surprise completes. Surprise messages start `collapsed`, ignore hover, and reveal only through `revealRemoteSurprise`.

## Final Scoped Verification

- `pnpm exec vitest run shared/syncProtocol.test.ts`: PASS, 30 tests.
- `pnpm --dir server test websocketRelay.test.ts`: PASS, 12 tests.
- `pnpm exec vitest run src/sync/realtimeClient.test.ts src/sync/useRealtimeSync.test.tsx`: PASS, 22 tests.
- `pnpm exec vitest run src/surprise/surpriseThemes.test.ts src/sync/remoteMessageQueue.test.ts`: PASS, 17 tests.
- `pnpm typecheck`: PASS.
- `pnpm server:typecheck`: PASS.

## Self-Review Issues

- The worktree started and remains dirty with pre-existing unrelated changes in app, status, renderer, design QA, Cargo, asset, and SDD paths. I did not stage or modify those files for Phase A.
- The worktree is a detached linked worktree. The four implementation commits exist on detached HEAD and may need branch handling by the main task or app controls.
- Task 1 RED used the plan command exactly; pnpm forwarded `--` through to Vitest in this workspace, causing a broader run. Subsequent focused test runs used `pnpm exec vitest run ...` for precise targeting.
- Phase A intentionally does not include Tasks 5-10 UI, Tauri geometry, PNG assets, composer/card rendering, App integration, native visual QA, full build, or Relay smoke.

## Phase A Review Fix Round

- Review source: `.superpowers/sdd/2026-08-12-heart-surprise-message-implementation/phase-a-review.md`.
- Fix commit: `fd11322` `fix: address phase a review findings`.

### Finding 1: Strict Structured Content Allowlist

- RED command: `pnpm exec vitest run shared/syncProtocol.test.ts`
- RED failure reason: validator accepted `content.displayText`, and `message.received` parsing attached normalized surprise content instead of omitting invalid structured content while keeping text.
- Relay RED command: `pnpm --dir server test websocketRelay.test.ts`
- Relay RED failure reason: a `message.send.content` object with extra key returned `message.delivered` and forwarded to the peer instead of returning `malformed_message`.
- Fix: added a strict `kind/version/theme/secret/note` key allowlist to `validateStructuredMessageContent()`. Top-level legacy extra fields remain ignored.
- GREEN result: `pnpm exec vitest run shared/syncProtocol.test.ts` PASS, 32 tests; `pnpm --dir server test websocketRelay.test.ts` PASS, 14 tests.

### Finding 2: Surprise Dismissal State Gate

- RED command: `pnpm exec vitest run src/sync/remoteMessageQueue.test.ts`
- RED failure reason: `markRemoteMessageDismissing()` changed a collapsed surprise to `dismissing`.
- Fix: gated surprise dismissal to active `revealed` only; ordinary text dismissal remains allowed from `visible` and `hovered`.
- GREEN result: `pnpm exec vitest run src/sync/remoteMessageQueue.test.ts` PASS, 10 tests.

### Finding 3: Relay Console Spy Cleanup

- RED command: `pnpm --dir server test websocketRelay.test.ts`
- RED failure reason: `console.error` remained a Vitest mock after the Relay log-safety test.
- Fix: restored mocks in the Relay test file `afterEach()`.
- GREEN result: `pnpm --dir server test websocketRelay.test.ts` PASS, 14 tests.

### Review Fix Verification

- `pnpm exec vitest run shared/syncProtocol.test.ts`: PASS, 32 tests.
- `pnpm --dir server test websocketRelay.test.ts`: PASS, 14 tests.
- `pnpm exec vitest run src/sync/remoteMessageQueue.test.ts`: PASS, 10 tests.
- `pnpm typecheck`: PASS.
- `pnpm server:typecheck`: PASS.
