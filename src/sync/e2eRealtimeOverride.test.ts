import { afterEach, describe, expect, it } from "vitest";
import {
  E2E_INCOMING_MESSAGE_EVENT,
  E2E_PAIR_WEATHER_OVERRIDE_EVENT,
  E2E_PAIR_WEATHER_OVERRIDE_WINDOW_KEY,
  E2E_REALTIME_OVERRIDE_EVENT,
  E2E_REALTIME_OVERRIDE_WINDOW_KEY,
  E2E_SPARK_LEADERBOARD_OVERRIDE_EVENT,
  E2E_SPARK_LEADERBOARD_OVERRIDE_WINDOW_KEY,
  parseE2eIncomingMessage,
  parseE2ePairWeatherOverride,
  parseE2eRealtimeOverride,
  parseE2eSparkLeaderboardOverride,
  readE2ePairWeatherOverride,
  readE2eSparkLeaderboardOverride,
} from "./e2eRealtimeOverride";

describe("E2E realtime override", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, E2E_PAIR_WEATHER_OVERRIDE_WINDOW_KEY);
    Reflect.deleteProperty(window, E2E_SPARK_LEADERBOARD_OVERRIDE_WINDOW_KEY);
  });

  it("accepts only a complete safe connected peer-online runtime state", () => {
    expect(E2E_REALTIME_OVERRIDE_WINDOW_KEY).toBe(
      "__COUPLE_PET_E2E_REALTIME_OVERRIDE__",
    );
    expect(E2E_REALTIME_OVERRIDE_EVENT).toBe(
      "couple-pet:e2e-realtime-override:wdio:default",
    );

    expect(
      parseE2eRealtimeOverride({
        status: "connected",
        peerPresence: "online",
        peerActivityStatus: null,
        peerPresenceChangedAt: "2026-08-08T00:00:00.000Z",
        peerLastSeenAt: null,
        lastError: null,
      }),
    ).toEqual({
      status: "connected",
      peerPresence: "online",
      peerActivityStatus: null,
      peerPresenceChangedAt: "2026-08-08T00:00:00.000Z",
      peerLastSeenAt: null,
      lastError: null,
    });
  });

  it("rejects malformed override state instead of relaxing product sendability", () => {
    for (const value of [
      null,
      [],
      { status: "connected", peerPresence: "online" },
      {
        status: "connected",
        peerPresence: "available",
        peerActivityStatus: null,
        peerPresenceChangedAt: null,
        peerLastSeenAt: null,
        lastError: null,
      },
      {
        status: "ready",
        peerPresence: "online",
        peerActivityStatus: null,
        peerPresenceChangedAt: null,
        peerLastSeenAt: null,
        lastError: null,
      },
    ]) {
      expect(parseE2eRealtimeOverride(value)).toBeNull();
    }
  });

  it("accepts only complete incoming-message fixtures for the E2E callback path", () => {
    expect(E2E_INCOMING_MESSAGE_EVENT).toBe(
      "couple-pet:e2e-incoming-message:wdio:default",
    );

    expect(
      parseE2eIncomingMessage({
        id: "task7-message-1",
        fromDeviceId: "task7-peer",
        text: "有一份小心意",
        at: "2026-08-14T05:00:00.000Z",
        content: {
          kind: "surprise",
          version: 1,
          theme: "general",
          secret: "7482",
          note: "完整卡片备注",
        },
      }),
    ).toEqual({
      id: "task7-message-1",
      fromDeviceId: "task7-peer",
      text: "有一份小心意",
      at: "2026-08-14T05:00:00.000Z",
      content: {
        kind: "surprise",
        version: 1,
        theme: "general",
        secret: "7482",
        note: "完整卡片备注",
      },
    });

    for (const value of [
      null,
      {},
      { id: "missing-fields" },
      {
        id: "task7-message-2",
        fromDeviceId: "task7-peer",
        text: "bad content",
        at: "2026-08-14T05:00:00.000Z",
        content: { kind: "surprise", secret: 7482 },
      },
    ]) {
      expect(parseE2eIncomingMessage(value)).toBeNull();
    }
  });

  it("reads the deterministic Hangzhou and Shenzhen pair-weather fixture", () => {
    expect(E2E_PAIR_WEATHER_OVERRIDE_WINDOW_KEY).toBe(
      "__COUPLE_PET_E2E_PAIR_WEATHER_OVERRIDE__",
    );
    expect(E2E_PAIR_WEATHER_OVERRIDE_EVENT).toBe(
      "couple-pet:e2e-pair-weather-override:wdio:default",
    );

    Object.defineProperty(window, E2E_PAIR_WEATHER_OVERRIDE_WINDOW_KEY, {
      configurable: true,
      value: pairWeatherFixture(),
      writable: true,
    });

    expect(readE2ePairWeatherOverride()).toMatchObject({
      self: {
        status: "ready",
        profile: { city: { name: "杭州" } },
        weather: { condition: "partly-cloudy" },
      },
      peer: {
        status: "ready",
        profile: { city: { name: "深圳" } },
        weather: { condition: "rain" },
      },
    });
  });

  it("rejects malformed pair-weather fixtures", () => {
    expect(parseE2ePairWeatherOverride(null)).toBeNull();
    expect(
      parseE2ePairWeatherOverride({
        ...pairWeatherFixture(),
        peer: {
          ...pairWeatherFixture().peer,
          weather: {
            ...pairWeatherFixture().peer.weather,
            rainChancePercent: 101,
          },
        },
      }),
    ).toBeNull();
  });

  it("reads only strict ready or fixed-error spark leaderboard fixtures", () => {
    expect(E2E_SPARK_LEADERBOARD_OVERRIDE_WINDOW_KEY).toBe(
      "__COUPLE_PET_E2E_SPARK_LEADERBOARD_OVERRIDE__",
    );
    expect(E2E_SPARK_LEADERBOARD_OVERRIDE_EVENT).toBe(
      "couple-pet:e2e-spark-leaderboard-override:wdio:default",
    );

    const response = sparkLeaderboardFixture();
    Object.defineProperty(window, E2E_SPARK_LEADERBOARD_OVERRIDE_WINDOW_KEY, {
      configurable: true,
      value: { status: "ready", response },
      writable: true,
    });
    expect(readE2eSparkLeaderboardOverride()).toEqual({
      status: "ready",
      response,
    });
    expect(
      parseE2eSparkLeaderboardOverride({
        status: "failed",
        code: "relay_unavailable",
      }),
    ).toEqual({ status: "failed", code: "relay_unavailable" });
    expect(parseE2eSparkLeaderboardOverride({ status: "loading" })).toEqual({
      status: "loading",
    });

    for (const value of [
      null,
      { status: "ready", response: { version: 1 } },
      { status: "failed", code: "weather_not_configured" },
      { status: "failed", code: "secret-output" },
    ]) {
      expect(parseE2eSparkLeaderboardOverride(value)).toBeNull();
    }
  });
});

function sparkLeaderboardFixture() {
  const snapshot = {
    version: 1 as const,
    pairId: "pair_1",
    streakDays: 28,
    tier: "heartflame" as const,
    calendarState: "qualified_today" as const,
    lastQualifiedDate: "2026-08-19",
    timezone: "Asia/Shanghai" as const,
    asOf: "2026-08-19T08:00:00.000Z",
    refreshAt: "2026-08-19T16:00:00.000Z",
  };
  return {
    version: 1 as const,
    snapshot,
    top20: [
      {
        rank: 1,
        displayNames: ["小*", "阿*"] as [string, string],
        cities: ["杭州", "上海"] as [string, string],
        streakDays: 128,
        tier: "stellar" as const,
      },
    ],
    self: {
      rank: 27,
      displayNames: ["小满", "阿岚"] as [string, string],
      cities: ["杭州", "上海"] as [string, string],
      streakDays: 28,
      tier: "heartflame" as const,
    },
    asOf: snapshot.asOf,
  };
}

function pairWeatherFixture() {
  return {
    self: readyWeatherEntry({
      nickname: "小满",
      cityName: "杭州",
      region: "浙江",
      locationId: 1_014_011,
      condition: "partly-cloudy" as const,
      conditionText: "晴间多云",
      currentTemperatureC: 26,
      maxTemperatureC: 31,
      minTemperatureC: 22,
      rainChancePercent: 20,
      source: "live" as const,
    }),
    peer: readyWeatherEntry({
      nickname: "阿岚",
      cityName: "深圳",
      region: "广东",
      locationId: 1_014_073,
      condition: "rain" as const,
      conditionText: "小雨",
      currentTemperatureC: 23,
      maxTemperatureC: 27,
      minTemperatureC: 20,
      rainChancePercent: 80,
      source: "cache" as const,
    }),
  };
}

function readyWeatherEntry(options: {
  nickname: string;
  cityName: string;
  region: string;
  locationId: number;
  condition: "partly-cloudy" | "rain";
  conditionText: string;
  currentTemperatureC: number;
  maxTemperatureC: number;
  minTemperatureC: number;
  rainChancePercent: number;
  source: "live" | "cache";
}) {
  return {
    status: "ready" as const,
    profile: {
      version: 1 as const,
      nickname: options.nickname,
      city: {
        provider: "weatherapi" as const,
        providerLocationId: options.locationId,
        name: options.cityName,
        region: options.region,
        country: "中国",
        latitude: options.cityName === "杭州" ? 30.2741 : 22.5431,
        longitude: options.cityName === "杭州" ? 120.1551 : 114.0579,
      },
      updatedAt: "2026-08-18T08:00:00.000Z",
    },
    weather: {
      version: 1 as const,
      condition: options.condition,
      conditionText: options.conditionText,
      currentTemperatureC: options.currentTemperatureC,
      maxTemperatureC: options.maxTemperatureC,
      minTemperatureC: options.minTemperatureC,
      rainChancePercent: options.rainChancePercent,
      fetchedAt: "2026-08-18T08:05:00.000Z",
      source: options.source,
    },
  };
}
