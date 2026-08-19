import { browser } from "@wdio/globals";

type SparkTier =
  | "unlit"
  | "glimmer"
  | "warm"
  | "heartflame"
  | "blaze"
  | "everbright"
  | "stellar";
type SparkCalendarState =
  | "qualified_today"
  | "pending_today"
  | "weekend_protected";
interface SparkStreakSnapshotV1 {
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
interface SparkLeaderboardEntryV1 {
  rank: number;
  displayNames: [string, string];
  cities: [string, string];
  streakDays: number;
  tier: SparkTier;
}
interface SparkLeaderboardResponseV1 {
  version: 1;
  snapshot: SparkStreakSnapshotV1;
  top20: SparkLeaderboardEntryV1[];
  self: {
    rank: number | null;
    displayNames: [string, string];
    cities: [string, string];
    streakDays: number;
    tier: SparkTier;
  };
  asOf: string;
}

type E2eRealtimeOverrideState = {
  status: "disabled" | "connecting" | "connected" | "disconnected" | "authFailed";
  peerPresence: "unknown" | "online" | "offline";
  peerActivityStatus: "slacking" | "dazing" | "overtime" | null;
  peerPresenceChangedAt: string | null;
  peerLastSeenAt: string | null;
  lastError: string | null;
};

type E2eIncomingMessage = {
  id: string;
  fromDeviceId: string;
  text: string;
  at: string;
  content?: Record<string, unknown>;
};

const e2eRealtimeOverrideWindowKey = "__COUPLE_PET_E2E_REALTIME_OVERRIDE__";
const e2eRealtimeOverrideEvent = "couple-pet:e2e-realtime-override:wdio:default";
const e2eIncomingMessageEvent = "couple-pet:e2e-incoming-message:wdio:default";
const e2ePairWeatherOverrideWindowKey =
  "__COUPLE_PET_E2E_PAIR_WEATHER_OVERRIDE__";
const e2ePairWeatherOverrideEvent =
  "couple-pet:e2e-pair-weather-override:wdio:default";
const e2eSparkLeaderboardOverrideWindowKey =
  "__COUPLE_PET_E2E_SPARK_LEADERBOARD_OVERRIDE__";
const e2eSparkLeaderboardOverrideEvent =
  "couple-pet:e2e-spark-leaderboard-override:wdio:default";

export type E2eSparkLeaderboardOverride =
  | { status: "loading" }
  | { status: "ready"; response: SparkLeaderboardResponseV1 }
  | {
      status: "failed";
      code: "auth_failed" | "pair_not_found" | "rate_limited" | "relay_unavailable";
    };

export async function setE2eRealtimeOverride(
  state: E2eRealtimeOverrideState,
): Promise<void> {
  await browser.execute(
    (key, eventName, nextState) => {
      Object.defineProperty(window, key, {
        configurable: true,
        enumerable: false,
        value: nextState,
        writable: true,
      });
      window.dispatchEvent(new Event(eventName));
    },
    e2eRealtimeOverrideWindowKey,
    e2eRealtimeOverrideEvent,
    state,
  );
}

export async function clearE2eRealtimeOverride(): Promise<void> {
  await browser.execute(
    (key, eventName) => {
      Reflect.deleteProperty(window, key);
      window.dispatchEvent(new Event(eventName));
    },
    e2eRealtimeOverrideWindowKey,
    e2eRealtimeOverrideEvent,
  ).catch(() => undefined);
}

export async function dispatchE2eIncomingMessage(
  message: E2eIncomingMessage,
): Promise<void> {
  await browser.execute(
    (eventName, detail) => {
      window.dispatchEvent(new CustomEvent(eventName, { detail }));
    },
    e2eIncomingMessageEvent,
    message,
  );
}

export interface E2eProjectedPeerProfile {
  nickname: string;
  cityName: string;
  region: string;
  providerLocationId: number;
  latitude: number;
  longitude: number;
}

export function createE2ePairWeatherFixture(
  projectedPeerProfile: E2eProjectedPeerProfile = {
    nickname: "阿岚",
    cityName: "深圳",
    region: "广东",
    providerLocationId: 1_014_073,
    latitude: 22.5431,
    longitude: 114.0579,
  },
) {
  return {
    self: {
      status: "ready",
      profile: {
        version: 1,
        nickname: "小满",
        city: {
          provider: "weatherapi",
          providerLocationId: 1_014_011,
          name: "杭州",
          region: "浙江",
          country: "中国",
          latitude: 30.2741,
          longitude: 120.1551,
        },
        updatedAt: "2026-08-18T08:00:00.000Z",
      },
      weather: {
        version: 1,
        condition: "partly-cloudy",
        conditionText: "晴间多云",
        currentTemperatureC: 26,
        maxTemperatureC: 31,
        minTemperatureC: 22,
        rainChancePercent: 20,
        fetchedAt: "2026-08-18T08:05:00.000Z",
        source: "live",
      },
    },
    peer: {
      status: "ready",
      profile: {
        version: 1,
        nickname: projectedPeerProfile.nickname,
        city: {
          provider: "weatherapi",
          providerLocationId: projectedPeerProfile.providerLocationId,
          name: projectedPeerProfile.cityName,
          region: projectedPeerProfile.region,
          country: "中国",
          latitude: projectedPeerProfile.latitude,
          longitude: projectedPeerProfile.longitude,
        },
        updatedAt: "2026-08-18T08:10:00.000Z",
      },
      weather: {
        version: 1,
        condition: "rain",
        conditionText: "小雨",
        currentTemperatureC: 23,
        maxTemperatureC: 27,
        minTemperatureC: 20,
        rainChancePercent: 80,
        fetchedAt: "2026-08-18T08:05:00.000Z",
        source: "cache",
      },
    },
  };
}

export async function setE2ePairWeatherOverride(
  response: ReturnType<typeof createE2ePairWeatherFixture>,
): Promise<void> {
  await browser.execute(
    (key, eventName, nextResponse) => {
      Object.defineProperty(window, key, {
        configurable: true,
        enumerable: false,
        value: nextResponse,
        writable: true,
      });
      window.dispatchEvent(new Event(eventName));
    },
    e2ePairWeatherOverrideWindowKey,
    e2ePairWeatherOverrideEvent,
    response,
  );
}

export async function clearE2ePairWeatherOverride(): Promise<void> {
  await browser.execute(
    (key, eventName) => {
      Reflect.deleteProperty(window, key);
      window.dispatchEvent(new Event(eventName));
    },
    e2ePairWeatherOverrideWindowKey,
    e2ePairWeatherOverrideEvent,
  ).catch(() => undefined);
}

export function createE2eSparkLeaderboardFixture(
  variant: "loaded" | "weekend" | "zero" = "loaded",
): E2eSparkLeaderboardOverride {
  const calendarState: SparkCalendarState =
    variant === "weekend" ? "weekend_protected" : "qualified_today";
  const streakDays = variant === "zero" ? 0 : 28;
  const snapshot: SparkStreakSnapshotV1 = {
    version: 1,
    pairId: "e2e-spark-pair",
    streakDays,
    tier: variant === "zero" ? "unlit" : "heartflame",
    calendarState,
    lastQualifiedDate: variant === "zero" ? null : "2026-08-21",
    timezone: "Asia/Shanghai",
    asOf:
      variant === "weekend"
        ? "2026-08-22T04:00:00.000Z"
        : "2026-08-19T08:00:00.000Z",
    refreshAt:
      variant === "weekend"
        ? "2026-08-23T16:00:00.000Z"
        : "2026-08-19T16:00:00.000Z",
  };
  return {
    status: "ready",
    response: {
      version: 1,
      snapshot,
      top20: variant === "zero" ? [] : sparkPublicRows,
      self: {
        rank: variant === "zero" ? null : 27,
        displayNames: ["小满", "阿岚"],
        cities: ["杭州", "深圳"],
        streakDays,
        tier: snapshot.tier,
      },
      asOf: snapshot.asOf,
    },
  };
}

export async function setE2eSparkLeaderboardOverride(
  override: E2eSparkLeaderboardOverride,
): Promise<void> {
  await browser.execute(
    (key, eventName, nextOverride) => {
      Object.defineProperty(window, key, {
        configurable: true,
        enumerable: false,
        value: nextOverride,
        writable: true,
      });
      window.dispatchEvent(new Event(eventName));
    },
    e2eSparkLeaderboardOverrideWindowKey,
    e2eSparkLeaderboardOverrideEvent,
    override,
  );
}

export async function clearE2eSparkLeaderboardOverride(): Promise<void> {
  await browser.execute(
    (key, eventName) => {
      Reflect.deleteProperty(window, key);
      window.dispatchEvent(new Event(eventName));
    },
    e2eSparkLeaderboardOverrideWindowKey,
    e2eSparkLeaderboardOverrideEvent,
  ).catch(() => undefined);
}

const sparkPublicRows: SparkLeaderboardEntryV1[] = [
  sparkRow(1, ["小*", "阿*"], ["北京", "上海"], 128),
  sparkRow(2, ["星*", "林*"], ["广州", "深圳"], 93),
  sparkRow(3, ["安*", "言*"], ["成都", "杭州"], 64),
  sparkRow(4, ["冬*", "夏*"], ["武汉", "长沙"], 45),
  sparkRow(5, ["朝*", "暮*"], ["南京", "苏州"], 30),
  sparkRow(6, ["山*", "海*"], ["厦门", "青岛"], 28),
  sparkRow(7, ["南*", "北*"], ["西安", "重庆"], 20),
  sparkRow(8, ["晴*", "雨*"], ["昆明", "拉萨"], 16),
];

function sparkRow(
  rank: number,
  displayNames: [string, string],
  cities: [string, string],
  streakDays: number,
): SparkLeaderboardEntryV1 {
  const tier =
    streakDays >= 100
      ? "stellar"
      : streakDays >= 60
        ? "everbright"
        : streakDays >= 30
          ? "blaze"
          : "heartflame";
  return { rank, displayNames, cities, streakDays, tier };
}
