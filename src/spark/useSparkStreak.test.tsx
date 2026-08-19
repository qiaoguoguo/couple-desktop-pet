import { act, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  SparkLeaderboardResponseV1,
  SparkStreakSnapshotV1,
} from "../../shared/sparkProtocol";
import { defaultSettings } from "../settings/defaultSettings";
import type { SyncSettings } from "../settings/settingsTypes";
import type { RelayHttpClient } from "../sync/relayHttpClient";
import type { SyncConnectionStatus } from "../sync/syncTypes";
import {
  E2E_SPARK_LEADERBOARD_OVERRIDE_EVENT,
  E2E_SPARK_LEADERBOARD_OVERRIDE_WINDOW_KEY,
} from "../sync/e2eRealtimeOverride";
import {
  useSparkStreak,
  type SparkStreakController,
} from "./useSparkStreak";

const snapshot = sparkSnapshot();
const leaderboard: SparkLeaderboardResponseV1 = {
  version: 1,
  snapshot,
  top20: [],
  self: {
    rank: 27,
    displayNames: ["小满", "阿岚"],
    cities: ["杭州", "上海"],
    streakDays: 28,
    tier: "heartflame",
  },
  asOf: snapshot.asOf,
};

describe("useSparkStreak", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, E2E_SPARK_LEADERBOARD_OVERRIDE_WINDOW_KEY);
  });

  it("stays idle while unpaired and uses HTTP as the paired initial fallback", async () => {
    const client = sparkClient();
    const unpaired = { ...pairedSync(), pairId: null, peerDeviceId: null };
    const { result, rerender } = renderHook(
      ({ sync }: { sync: SyncSettings }) => useSparkStreak(sync, client),
      { initialProps: { sync: unpaired as SyncSettings } },
    );
    expect(result.current.snapshotState).toEqual({ status: "idle" });
    expect(client.getSparkSnapshot).not.toHaveBeenCalled();

    rerender({ sync: pairedSync() });
    await waitFor(() => expect(result.current.snapshotState.status).toBe("ready"));
    expect(client.getSparkSnapshot).toHaveBeenCalledWith(credentials());
    expect(result.current.snapshotState).toEqual({ status: "ready", snapshot });
  });

  it("accepts valid realtime snapshots and rejects malformed local projections", async () => {
    const client = sparkClient();
    const { result } = renderHook(() => useSparkStreak(pairedSync(), client));
    await waitFor(() => expect(result.current.snapshotState.status).toBe("ready"));
    const newer = sparkSnapshot({ streakDays: 30, tier: "blaze" });

    act(() => result.current.acceptSnapshot(newer));
    expect(result.current.snapshotState).toEqual({ status: "ready", snapshot: newer });
    act(() => result.current.acceptSnapshot({ ...newer, tier: "unlit" }));
    expect(result.current.snapshotState).toEqual({ status: "ready", snapshot: newer });
  });

  it("keeps a newer realtime snapshot when an older leaderboard request resolves later", async () => {
    const pending = deferred<{ ok: true } & SparkLeaderboardResponseV1>();
    const client = sparkClient();
    client.getSparkLeaderboard.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useSparkStreak(pairedSync(), client));
    await waitFor(() => expect(result.current.snapshotState.status).toBe("ready"));
    const olderLeaderboard = sparkLeaderboard(
      sparkSnapshot({ asOf: "2026-08-19T09:00:00.000Z", streakDays: 29 }),
    );
    const newerRealtime = sparkSnapshot({
      asOf: "2026-08-19T10:00:00.000Z",
      streakDays: 30,
      tier: "blaze",
    });

    let request!: Promise<void>;
    act(() => {
      request = result.current.requestLeaderboard();
    });
    act(() => result.current.acceptSnapshot(newerRealtime));
    await act(async () => {
      pending.resolve({ ok: true, ...olderLeaderboard });
      await request;
    });

    expect(result.current.leaderboardState).toEqual({
      status: "ready",
      response: olderLeaderboard,
    });
    expect(result.current.snapshotState).toEqual({
      status: "ready",
      snapshot: newerRealtime,
    });
  });

  it("ignores an older realtime snapshot after a newer HTTP snapshot", async () => {
    const newerHttp = sparkSnapshot({
      asOf: "2026-08-19T10:00:00.000Z",
      streakDays: 30,
      tier: "blaze",
    });
    const client = sparkClient(newerHttp);
    const { result } = renderHook(() => useSparkStreak(pairedSync(), client));
    await waitFor(() =>
      expect(result.current.snapshotState).toEqual({
        status: "ready",
        snapshot: newerHttp,
      }),
    );

    act(() =>
      result.current.acceptSnapshot(
        sparkSnapshot({ asOf: "2026-08-19T09:00:00.000Z", streakDays: 29 }),
      ),
    );

    expect(result.current.snapshotState).toEqual({
      status: "ready",
      snapshot: newerHttp,
    });
  });

  it("requests a fresh leaderboard on every open and exposes retry failures", async () => {
    const client = sparkClient();
    client.getSparkLeaderboard
      .mockResolvedValueOnce({ ok: true, ...leaderboard })
      .mockResolvedValueOnce({
        ok: false,
        code: "rate_limited",
        message: "Too many requests",
      })
      .mockResolvedValueOnce({ ok: true, ...leaderboard });
    const { result } = renderHook(() => useSparkStreak(pairedSync(), client));
    await waitFor(() => expect(result.current.snapshotState.status).toBe("ready"));

    await act(async () => result.current.requestLeaderboard());
    expect(result.current.leaderboardState).toEqual({ status: "ready", response: leaderboard });
    act(() => result.current.clearLeaderboard());
    expect(result.current.leaderboardState).toEqual({ status: "idle" });
    await act(async () => result.current.requestLeaderboard());
    expect(result.current.leaderboardState).toEqual({
      status: "failed",
      code: "rate_limited",
    });
    await act(async () => result.current.requestLeaderboard());
    expect(client.getSparkLeaderboard).toHaveBeenCalledTimes(3);
    expect(result.current.leaderboardState.status).toBe("ready");
  });

  it("refreshes exactly at refreshAt and cancels the stale timer on pair change", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-08-19T08:00:00.000Z");
    const timed = sparkSnapshot({ refreshAt: "2026-08-19T09:00:00.000Z" });
    const client = sparkClient(timed);
    const { result, rerender } = renderHook(
      ({ sync }: { sync: SyncSettings }) => useSparkStreak(sync, client),
      { initialProps: { sync: pairedSync() as SyncSettings } },
    );
    await act(async () => Promise.resolve());
    expect(result.current.snapshotState.status).toBe("ready");
    client.getSparkSnapshot.mockClear();

    await act(async () => vi.advanceTimersByTimeAsync(3_599_999));
    expect(client.getSparkSnapshot).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(client.getSparkSnapshot).toHaveBeenCalledTimes(1);

    rerender({ sync: { ...pairedSync(), pairId: null, peerDeviceId: null } });
    client.getSparkSnapshot.mockClear();
    await act(async () => vi.advanceTimersByTimeAsync(24 * 60 * 60_000));
    expect(client.getSparkSnapshot).not.toHaveBeenCalled();
    expect(result.current.snapshotState).toEqual({ status: "idle" });
  });

  it("refreshes after reconnect and when the document becomes visible", async () => {
    const client = sparkClient();
    const { rerender } = renderHook(
      ({ status }: { status: SyncConnectionStatus }) =>
        useSparkStreak(pairedSync(), client, status),
      {
        initialProps: {
          status: "disconnected" as SyncConnectionStatus,
        },
      },
    );
    await waitFor(() => expect(client.getSparkSnapshot).toHaveBeenCalledTimes(1));

    rerender({ status: "connected" as const });
    await waitFor(() => expect(client.getSparkSnapshot).toHaveBeenCalledTimes(2));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(client.getSparkSnapshot).toHaveBeenCalledTimes(3));
  });

  it("retains the last accepted snapshot while a refresh loads, fails, and later recovers", async () => {
    const failedRefresh = deferred<{
      ok: false;
      code: "relay_unavailable";
      message: string;
    }>();
    const recovered = sparkSnapshot({
      asOf: "2026-08-19T10:00:00.000Z",
      streakDays: 29,
      tier: "heartflame",
    });
    const client = sparkClient();
    client.getSparkSnapshot
      .mockResolvedValueOnce({ ok: true, ...snapshot })
      .mockReturnValueOnce(failedRefresh.promise)
      .mockResolvedValueOnce({ ok: true, ...recovered });
    const { result } = renderHook(() => useSparkStreak(pairedSync(), client));
    await waitFor(() =>
      expect(result.current.snapshotState).toEqual({
        status: "ready",
        snapshot,
      }),
    );

    let refresh!: Promise<void>;
    act(() => {
      refresh = result.current.refreshSnapshot();
    });
    expect(result.current.snapshotState).toEqual({
      status: "loading",
      snapshot,
    });

    await act(async () => {
      failedRefresh.resolve({
        ok: false,
        code: "relay_unavailable",
        message: "Relay unavailable",
      });
      await refresh;
    });
    expect(result.current.snapshotState).toEqual({
      status: "failed",
      code: "relay_unavailable",
      snapshot,
    });

    await act(async () => result.current.refreshSnapshot());
    expect(result.current.snapshotState).toEqual({
      status: "ready",
      snapshot: recovered,
    });
  });

  it("keeps an initial refresh failure unavailable without inventing a snapshot", async () => {
    const client = sparkClient();
    client.getSparkSnapshot.mockResolvedValueOnce({
      ok: false,
      code: "relay_unavailable",
      message: "Relay unavailable",
    });
    const { result } = renderHook(() => useSparkStreak(pairedSync(), client));

    await waitFor(() =>
      expect(result.current.snapshotState).toEqual({
        status: "failed",
        code: "relay_unavailable",
      }),
    );
  });

  it("does not mark a newer realtime snapshot unavailable when an older refresh fails", async () => {
    const failedRefresh = deferred<{
      ok: false;
      code: "relay_unavailable";
      message: string;
    }>();
    const client = sparkClient();
    client.getSparkSnapshot
      .mockResolvedValueOnce({ ok: true, ...snapshot })
      .mockReturnValueOnce(failedRefresh.promise);
    const { result } = renderHook(() => useSparkStreak(pairedSync(), client));
    await waitFor(() => expect(result.current.snapshotState.status).toBe("ready"));

    let refresh!: Promise<void>;
    act(() => {
      refresh = result.current.refreshSnapshot();
    });
    const realtime = sparkSnapshot({
      asOf: "2026-08-19T11:00:00.000Z",
      streakDays: 30,
      tier: "blaze",
    });
    act(() => result.current.acceptSnapshot(realtime));
    await act(async () => {
      failedRefresh.resolve({
        ok: false,
        code: "relay_unavailable",
        message: "Relay unavailable",
      });
      await refresh;
    });

    expect(result.current.snapshotState).toEqual({
      status: "ready",
      snapshot: realtime,
    });
  });

  it("ignores stale completions after pair changes", async () => {
    const pending = deferred<{ ok: true } & SparkStreakSnapshotV1>();
    const client = sparkClient();
    client.getSparkSnapshot.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(
      ({ sync }: { sync: SyncSettings }) => useSparkStreak(sync, client),
      { initialProps: { sync: pairedSync() as SyncSettings } },
    );
    expect(result.current.snapshotState.status).toBe("loading");

    rerender({ sync: { ...pairedSync(), pairId: null, peerDeviceId: null } });
    await act(async () => pending.resolve({ ok: true, ...snapshot }));
    expect(result.current.snapshotState).toEqual({ status: "idle" });
  });

  it("rejects an old-pair HTTP completion across a paired render transition", async () => {
    const oldPairPending = deferred<{ ok: true } & SparkStreakSnapshotV1>();
    const newPairPending = deferred<{ ok: true } & SparkStreakSnapshotV1>();
    const client = sparkClient();
    client.getSparkSnapshot
      .mockReturnValueOnce(oldPairPending.promise)
      .mockReturnValueOnce(newPairPending.promise);
    const { result, rerender } = renderHook(
      ({ sync }: { sync: SyncSettings }) => useSparkStreak(sync, client),
      { initialProps: { sync: pairedSync() as SyncSettings } },
    );

    rerender({
      sync: {
        ...pairedSync(),
        pairId: "pair_2",
        peerDeviceId: "dev_c",
      },
    });
    await act(async () => {
      oldPairPending.resolve({
        ok: true,
        ...sparkSnapshot({ asOf: "2026-08-19T12:00:00.000Z" }),
      });
      await Promise.resolve();
    });
    expect(result.current.snapshotState).not.toEqual({
      status: "ready",
      snapshot: expect.objectContaining({ pairId: "pair_1" }),
    });

    const pairTwoSnapshot = sparkSnapshot({
      pairId: "pair_2",
      asOf: "2026-08-19T11:00:00.000Z",
    });
    await act(async () => {
      newPairPending.resolve({ ok: true, ...pairTwoSnapshot });
      await Promise.resolve();
    });
    expect(result.current.snapshotState).toEqual({
      status: "ready",
      snapshot: pairTwoSnapshot,
    });
  });

  it("projects pair changes and unpairing before their effects can expose old payloads", async () => {
    const pairTwoPending = deferred<{ ok: true } & SparkStreakSnapshotV1>();
    const client = sparkClient();
    client.getSparkSnapshot
      .mockResolvedValueOnce({ ok: true, ...snapshot })
      .mockReturnValueOnce(pairTwoPending.promise);
    const renders: Array<{
      snapshotState: SparkStreakController["snapshotState"];
      leaderboardState: SparkStreakController["leaderboardState"];
    }> = [];
    let controller: SparkStreakController | null = null;
    function Probe({ sync }: { sync: SyncSettings }) {
      controller = useSparkStreak(sync, client);
      renders.push({
        snapshotState: controller.snapshotState,
        leaderboardState: controller.leaderboardState,
      });
      return null;
    }
    const view = render(<Probe sync={pairedSync()} />);
    await waitFor(() => expect(controller?.snapshotState.status).toBe("ready"));
    await act(async () => controller?.requestLeaderboard());
    expect(
      (controller as SparkStreakController | null)?.leaderboardState.status,
    ).toBe("ready");

    renders.length = 0;
    view.rerender(
      <Probe
        sync={{
          ...pairedSync(),
          pairId: "pair_2",
          peerDeviceId: "dev_c",
        }}
      />,
    );
    expect(renders[0]).toEqual({
      snapshotState: { status: "loading" },
      leaderboardState: { status: "loading" },
    });
    expect(JSON.stringify(renders)).not.toContain("pair_1");
    expect(JSON.stringify(renders)).not.toContain("小满");
    expect(JSON.stringify(renders)).not.toContain("杭州");

    renders.length = 0;
    view.rerender(
      <Probe
        sync={{
          ...pairedSync(),
          pairId: null,
          peerDeviceId: null,
        }}
      />,
    );
    expect(renders[0]).toEqual({
      snapshotState: { status: "idle" },
      leaderboardState: { status: "idle" },
    });
    expect(JSON.stringify(renders)).not.toContain("pair_1");

    await act(async () => {
      pairTwoPending.resolve({
        ok: true,
        ...sparkSnapshot({ pairId: "pair_2" }),
      });
      await Promise.resolve();
    });
    view.unmount();
  });

  it("uses and subscribes to strict spark fixtures only in guarded E2E builds", async () => {
    vi.stubEnv("VITE_TAURI_E2E", "1");
    setSparkOverride({ status: "ready", response: leaderboard });
    const client = sparkClient();
    const view = renderHook(() => useSparkStreak(pairedSync(), client));

    await waitFor(() => expect(view.result.current.snapshotState.status).toBe("ready"));
    expect(client.getSparkSnapshot).not.toHaveBeenCalled();
    await act(async () => view.result.current.requestLeaderboard());
    expect(client.getSparkLeaderboard).not.toHaveBeenCalled();
    expect(view.result.current.leaderboardState).toEqual({
      status: "ready",
      response: leaderboard,
    });

    await act(async () => {
      setSparkOverride({ status: "loading" });
      window.dispatchEvent(new Event(E2E_SPARK_LEADERBOARD_OVERRIDE_EVENT));
    });
    expect(view.result.current.leaderboardState).toEqual({ status: "loading" });

    await act(async () => {
      setSparkOverride({ status: "failed", code: "relay_unavailable" });
      window.dispatchEvent(new Event(E2E_SPARK_LEADERBOARD_OVERRIDE_EVENT));
    });
    expect(view.result.current.leaderboardState).toEqual({
      status: "failed",
      code: "relay_unavailable",
    });
  });

  it("ignores fixtures outside E2E and falls through to Relay when E2E has none", async () => {
    setSparkOverride({ status: "ready", response: leaderboard });
    vi.stubEnv("VITE_TAURI_E2E", "0");
    const productionClient = sparkClient();
    const production = renderHook(() =>
      useSparkStreak(pairedSync(), productionClient),
    );
    await waitFor(() =>
      expect(productionClient.getSparkSnapshot).toHaveBeenCalledTimes(1),
    );
    await act(async () => production.result.current.requestLeaderboard());
    expect(productionClient.getSparkLeaderboard).toHaveBeenCalledTimes(1);
    production.unmount();

    Reflect.deleteProperty(window, E2E_SPARK_LEADERBOARD_OVERRIDE_WINDOW_KEY);
    vi.stubEnv("VITE_TAURI_E2E", "1");
    const fallbackClient = sparkClient();
    const fallback = renderHook(() =>
      useSparkStreak(pairedSync(), fallbackClient),
    );
    await waitFor(() =>
      expect(fallbackClient.getSparkSnapshot).toHaveBeenCalledTimes(1),
    );
    await act(async () => fallback.result.current.requestLeaderboard());
    expect(fallbackClient.getSparkLeaderboard).toHaveBeenCalledTimes(1);
  });

  it("replaces spark fixture listeners and removes the latest listener on close and unmount", async () => {
    vi.stubEnv("VITE_TAURI_E2E", "1");
    setSparkOverride({ status: "ready", response: leaderboard });
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const client = sparkClient();
    const view = renderHook(() => useSparkStreak(pairedSync(), client));
    await waitFor(() => expect(view.result.current.snapshotState.status).toBe("ready"));

    await act(async () => view.result.current.requestLeaderboard());
    const firstListener = sparkOverrideListeners(addEventListener)[0];
    await act(async () => view.result.current.requestLeaderboard());
    const secondListener = sparkOverrideListeners(addEventListener)[1];
    expect(firstListener).toBeTypeOf("function");
    expect(secondListener).toBeTypeOf("function");
    expect(removeEventListener).toHaveBeenCalledWith(
      E2E_SPARK_LEADERBOARD_OVERRIDE_EVENT,
      firstListener,
    );

    act(() => view.result.current.clearLeaderboard());
    expect(removeEventListener).toHaveBeenCalledWith(
      E2E_SPARK_LEADERBOARD_OVERRIDE_EVENT,
      secondListener,
    );
    await act(async () => view.result.current.requestLeaderboard());
    const latestListener = sparkOverrideListeners(addEventListener)[2];
    view.unmount();
    expect(removeEventListener).toHaveBeenCalledWith(
      E2E_SPARK_LEADERBOARD_OVERRIDE_EVENT,
      latestListener,
    );
  });
});

function setSparkOverride(value: unknown) {
  Object.defineProperty(window, E2E_SPARK_LEADERBOARD_OVERRIDE_WINDOW_KEY, {
    configurable: true,
    value,
    writable: true,
  });
}

function sparkOverrideListeners(addEventListener: {
  mock: { calls: unknown[][] };
}): EventListener[] {
  return addEventListener.mock.calls
    .filter((args) => args[0] === E2E_SPARK_LEADERBOARD_OVERRIDE_EVENT)
    .map((args) => args[1] as EventListener);
}

function pairedSync(): SyncSettings {
  return {
    ...defaultSettings.sync,
    enabled: true,
    relayUrl: "https://relay.example",
    deviceId: "dev_a",
    deviceSecret: "secret_a",
    pairId: "pair_1",
    peerDeviceId: "dev_b",
  };
}

function credentials() {
  return { deviceId: "dev_a", deviceSecret: "secret_a", pairId: "pair_1" };
}

function sparkClient(initialSnapshot = snapshot) {
  return {
    getSparkSnapshot: vi.fn().mockResolvedValue({ ok: true, ...initialSnapshot }),
    getSparkLeaderboard: vi.fn().mockResolvedValue({ ok: true, ...leaderboard }),
  } as unknown as Pick<RelayHttpClient, "getSparkSnapshot" | "getSparkLeaderboard"> & {
    getSparkSnapshot: ReturnType<typeof vi.fn>;
    getSparkLeaderboard: ReturnType<typeof vi.fn>;
  };
}

function sparkSnapshot(
  overrides: Partial<SparkStreakSnapshotV1> = {},
): SparkStreakSnapshotV1 {
  return {
    version: 1,
    pairId: "pair_1",
    streakDays: 28,
    tier: "heartflame",
    calendarState: "qualified_today",
    lastQualifiedDate: "2026-08-19",
    timezone: "Asia/Shanghai",
    asOf: "2026-08-19T08:00:00.000Z",
    refreshAt: "2026-08-19T16:00:00.000Z",
    ...overrides,
  };
}

function sparkLeaderboard(
  nextSnapshot: SparkStreakSnapshotV1,
): SparkLeaderboardResponseV1 {
  return {
    ...leaderboard,
    snapshot: nextSnapshot,
    self: {
      ...leaderboard.self,
      streakDays: nextSnapshot.streakDays,
      tier: nextSnapshot.tier,
    },
    asOf: nextSnapshot.asOf,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
