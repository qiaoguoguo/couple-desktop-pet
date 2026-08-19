import { useCallback, useEffect, useRef, useState } from "react";
import {
  readSparkLeaderboardResponse,
  readSparkStreakSnapshot,
  type PairSparkRequest,
  type SparkLeaderboardResponseV1,
  type SparkStreakSnapshotV1,
} from "../../shared/sparkProtocol";
import type { SyncErrorCode } from "../../shared/syncProtocol";
import type { SyncSettings } from "../settings/settingsTypes";
import type { RelayHttpClient } from "../sync/relayHttpClient";
import type { SyncConnectionStatus } from "../sync/syncTypes";

export type SparkSnapshotState =
  | { status: "idle" }
  | { status: "loading"; snapshot?: SparkStreakSnapshotV1 }
  | { status: "ready"; snapshot: SparkStreakSnapshotV1 }
  | {
      status: "failed";
      code: SyncErrorCode;
      snapshot?: SparkStreakSnapshotV1;
    };

export type SparkLeaderboardState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; response: SparkLeaderboardResponseV1 }
  | { status: "failed"; code: SyncErrorCode };

export interface SparkStreakController {
  snapshotState: SparkSnapshotState;
  leaderboardState: SparkLeaderboardState;
  acceptSnapshot(snapshot: SparkStreakSnapshotV1): void;
  refreshSnapshot(): Promise<void>;
  requestLeaderboard(): Promise<void>;
  clearLeaderboard(): void;
}

type SparkRelayClient = Pick<
  RelayHttpClient,
  "getSparkSnapshot" | "getSparkLeaderboard"
>;

interface PairOwnedState<State> {
  pairId: string | null;
  state: State;
}

export function useSparkStreak(
  sync: SyncSettings,
  client: SparkRelayClient,
  connectionStatus: SyncConnectionStatus = "disconnected",
): SparkStreakController {
  const [snapshotRecord, setSnapshotRecord] = useState<
    PairOwnedState<SparkSnapshotState>
  >({ pairId: null, state: { status: "idle" } });
  const [leaderboardRecord, setLeaderboardRecord] = useState<
    PairOwnedState<SparkLeaderboardState>
  >({ pairId: null, state: { status: "idle" } });
  const snapshotSequence = useRef(0);
  const leaderboardSequence = useRef(0);
  const latestSnapshot = useRef<SparkStreakSnapshotV1 | null>(null);
  const mounted = useRef(true);
  const unsubscribeE2eOverride = useRef<() => void>(() => {});
  const auth = readSparkAuth(sync);
  const authKey = auth
    ? `${auth.deviceId}\u0000${auth.deviceSecret}\u0000${auth.pairId}`
    : null;
  const authRef = useRef<PairSparkRequest | null>(auth);
  authRef.current = auth;

  const acceptCurrentSnapshot = useCallback(
    (candidate: SparkStreakSnapshotV1): boolean => {
      const parsed = readSparkStreakSnapshot(candidate);
      const currentPairId = authRef.current?.pairId;
      if (
        !mounted.current ||
        parsed === null ||
        currentPairId === undefined ||
        parsed.pairId !== currentPairId
      ) {
        return false;
      }
      const previous = latestSnapshot.current;
      if (
        previous !== null &&
        previous.pairId === parsed.pairId &&
        parsed.asOf < previous.asOf
      ) {
        return false;
      }
      latestSnapshot.current = parsed;
      setSnapshotRecord({
        pairId: parsed.pairId,
        state: { status: "ready", snapshot: parsed },
      });
      return true;
    },
    [],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      snapshotSequence.current += 1;
      leaderboardSequence.current += 1;
      unsubscribeE2eOverride.current();
      unsubscribeE2eOverride.current = () => {};
    };
  }, []);

  const refreshSnapshot = useCallback(async () => {
    const request = authRef.current;
    if (request === null) {
      setSnapshotRecord({ pairId: null, state: { status: "idle" } });
      return;
    }

    const sequence = ++snapshotSequence.current;
    const snapshotAtStart = readPairSnapshot(
      latestSnapshot.current,
      request.pairId,
    );
    setSnapshotRecord({
      pairId: request.pairId,
      state: {
        status: "loading",
        ...(snapshotAtStart === null ? {} : { snapshot: snapshotAtStart }),
      },
    });
    const setRefreshFailure = (code: SyncErrorCode) => {
      const current = readPairSnapshot(latestSnapshot.current, request.pairId);
      if (
        current !== null &&
        (snapshotAtStart === null || current.asOf > snapshotAtStart.asOf)
      ) {
        setSnapshotRecord({
          pairId: request.pairId,
          state: { status: "ready", snapshot: current },
        });
        return;
      }
      setSnapshotRecord({
        pairId: request.pairId,
        state: {
          status: "failed",
          code,
          ...(current === null ? {} : { snapshot: current }),
        },
      });
    };
    if (import.meta.env.VITE_TAURI_E2E === "1") {
      const overrideModule = await import("../sync/e2eRealtimeOverride");
      if (
        !mounted.current ||
        sequence !== snapshotSequence.current ||
        request.pairId !== authRef.current?.pairId
      ) {
        return;
      }
      const fixture = overrideModule.readE2eSparkLeaderboardOverride();
      if (
        fixture?.status === "ready" &&
        fixture.response.snapshot.pairId === request.pairId
      ) {
        acceptCurrentSnapshot(fixture.response.snapshot);
        return;
      }
      if (fixture?.status === "failed") {
        setRefreshFailure(fixture.code);
        return;
      }
      if (fixture?.status === "loading") {
        return;
      }
    }
    const result = await client.getSparkSnapshot(request);
    if (
      !mounted.current ||
      sequence !== snapshotSequence.current ||
      request.pairId !== authRef.current?.pairId
    ) {
      return;
    }
    if (!result.ok) {
      setRefreshFailure(result.code);
      return;
    }

    const { ok: _ok, ...payload } = result;
    const parsed = readSparkStreakSnapshot(payload);
    if (parsed === null) {
      setRefreshFailure("relay_unavailable");
      return;
    }
    if (!acceptCurrentSnapshot(parsed)) {
      const current = latestSnapshot.current;
      if (current !== null && current.pairId === authRef.current?.pairId) {
        setSnapshotRecord({
          pairId: current.pairId,
          state: { status: "ready", snapshot: current },
        });
      }
    }
  }, [acceptCurrentSnapshot, client]);

  const requestLeaderboard = useCallback(async () => {
    const request = authRef.current;
    if (request === null) {
      setLeaderboardRecord({ pairId: null, state: { status: "idle" } });
      return;
    }

    const sequence = ++leaderboardSequence.current;
    unsubscribeE2eOverride.current();
    unsubscribeE2eOverride.current = () => {};
    setLeaderboardRecord({
      pairId: request.pairId,
      state: { status: "loading" },
    });
    if (import.meta.env.VITE_TAURI_E2E === "1") {
      const overrideModule = await import("../sync/e2eRealtimeOverride");
      if (
        !mounted.current ||
        sequence !== leaderboardSequence.current ||
        request.pairId !== authRef.current?.pairId
      ) {
        return;
      }
      const fixture = overrideModule.readE2eSparkLeaderboardOverride();
      if (
        fixture !== null &&
        (fixture.status !== "ready" ||
          fixture.response.snapshot.pairId === request.pairId)
      ) {
        applyE2eLeaderboardOverride(
          fixture,
          (state) =>
            setLeaderboardRecord({ pairId: request.pairId, state }),
          acceptCurrentSnapshot,
        );
        unsubscribeE2eOverride.current =
          overrideModule.subscribeToE2eSparkLeaderboardOverride((nextFixture) => {
            if (
              nextFixture === null ||
              !mounted.current ||
              sequence !== leaderboardSequence.current ||
              request.pairId !== authRef.current?.pairId ||
              (nextFixture.status === "ready" &&
                nextFixture.response.snapshot.pairId !== authRef.current?.pairId)
            ) {
              return;
            }
            applyE2eLeaderboardOverride(
              nextFixture,
              (state) =>
                setLeaderboardRecord({ pairId: request.pairId, state }),
              acceptCurrentSnapshot,
            );
          });
        return;
      }
    }
    const result = await client.getSparkLeaderboard(request);
    if (
      !mounted.current ||
      sequence !== leaderboardSequence.current ||
      request.pairId !== authRef.current?.pairId
    ) {
      return;
    }
    if (!result.ok) {
      setLeaderboardRecord({
        pairId: request.pairId,
        state: { status: "failed", code: result.code },
      });
      return;
    }

    const { ok: _ok, ...payload } = result;
    const parsed = readSparkLeaderboardResponse(payload);
    if (parsed === null || parsed.snapshot.pairId !== request.pairId) {
      setLeaderboardRecord({
        pairId: request.pairId,
        state: { status: "failed", code: "relay_unavailable" },
      });
      return;
    }
    setLeaderboardRecord({
      pairId: request.pairId,
      state: { status: "ready", response: parsed },
    });
    acceptCurrentSnapshot(parsed.snapshot);
  }, [acceptCurrentSnapshot, client]);

  const acceptSnapshot = useCallback((candidate: SparkStreakSnapshotV1) => {
    acceptCurrentSnapshot(candidate);
  }, [acceptCurrentSnapshot]);

  const clearLeaderboard = useCallback(() => {
    leaderboardSequence.current += 1;
    unsubscribeE2eOverride.current();
    unsubscribeE2eOverride.current = () => {};
    setLeaderboardRecord({
      pairId: authRef.current?.pairId ?? null,
      state: { status: "idle" },
    });
  }, []);

  useEffect(() => {
    snapshotSequence.current += 1;
    leaderboardSequence.current += 1;
    latestSnapshot.current = null;
    unsubscribeE2eOverride.current();
    unsubscribeE2eOverride.current = () => {};
    setLeaderboardRecord({
      pairId: authRef.current?.pairId ?? null,
      state: { status: "idle" },
    });
    if (authKey === null) {
      setSnapshotRecord({ pairId: null, state: { status: "idle" } });
      return;
    }
    void refreshSnapshot();
  }, [authKey, refreshSnapshot]);

  const currentPairId = auth?.pairId ?? null;
  const snapshotState = projectSnapshotState(snapshotRecord, currentPairId);
  const leaderboardState = projectLeaderboardState(
    leaderboardRecord,
    currentPairId,
  );
  const refreshAt =
    snapshotState.status === "ready" ? snapshotState.snapshot.refreshAt : null;
  useEffect(() => {
    if (refreshAt === null || authKey === null) {
      return undefined;
    }
    const delay = Math.max(0, Date.parse(refreshAt) - Date.now());
    const timer = window.setTimeout(() => {
      void refreshSnapshot();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [authKey, refreshAt, refreshSnapshot]);

  const previousConnectionStatus = useRef(connectionStatus);
  useEffect(() => {
    const previous = previousConnectionStatus.current;
    previousConnectionStatus.current = connectionStatus;
    if (
      authKey !== null &&
      connectionStatus === "connected" &&
      previous !== "connected"
    ) {
      void refreshSnapshot();
    }
  }, [authKey, connectionStatus, refreshSnapshot]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && authRef.current !== null) {
        void refreshSnapshot();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [refreshSnapshot]);

  return {
    snapshotState,
    leaderboardState,
    acceptSnapshot,
    refreshSnapshot,
    requestLeaderboard,
    clearLeaderboard,
  };
}

function readPairSnapshot(
  snapshot: SparkStreakSnapshotV1 | null,
  pairId: string,
): SparkStreakSnapshotV1 | null {
  return snapshot?.pairId === pairId ? snapshot : null;
}

function applyE2eLeaderboardOverride(
  fixture: import("../sync/e2eRealtimeOverride").E2eSparkLeaderboardOverride,
  setLeaderboardState: (state: SparkLeaderboardState) => void,
  acceptSnapshot: (snapshot: SparkStreakSnapshotV1) => boolean,
) {
  if (fixture.status === "failed") {
    setLeaderboardState({ status: "failed", code: fixture.code });
    return;
  }
  if (fixture.status === "loading") {
    setLeaderboardState({ status: "loading" });
    return;
  }
  setLeaderboardState({ status: "ready", response: fixture.response });
  acceptSnapshot(fixture.response.snapshot);
}

function projectSnapshotState(
  record: PairOwnedState<SparkSnapshotState>,
  currentPairId: string | null,
): SparkSnapshotState {
  if (currentPairId === null) {
    return { status: "idle" };
  }
  return record.pairId === currentPairId
    ? record.state
    : { status: "loading" };
}

function projectLeaderboardState(
  record: PairOwnedState<SparkLeaderboardState>,
  currentPairId: string | null,
): SparkLeaderboardState {
  if (currentPairId === null) {
    return { status: "idle" };
  }
  return record.pairId === currentPairId
    ? record.state
    : { status: "loading" };
}

function readSparkAuth(sync: SyncSettings): PairSparkRequest | null {
  if (
    !sync.enabled ||
    !sync.deviceId ||
    !sync.deviceSecret ||
    !sync.pairId ||
    !sync.peerDeviceId
  ) {
    return null;
  }
  return {
    deviceId: sync.deviceId,
    deviceSecret: sync.deviceSecret,
    pairId: sync.pairId,
  };
}
