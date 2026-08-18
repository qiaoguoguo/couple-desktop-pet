import { describe, expect, it } from "vitest";
import { readPairWeatherResponse } from "./weatherProtocol";

const selfProfile = {
  version: 1,
  nickname: "小满",
  city: {
    provider: "weatherapi",
    providerLocationId: 1785728,
    name: "杭州",
    region: "浙江",
    country: "中国",
    latitude: 30.27,
    longitude: 120.15,
  },
  updatedAt: "2026-08-18T08:00:00.000Z",
} as const;

const peerProfile = {
  ...selfProfile,
  nickname: "阿岚",
  city: {
    ...selfProfile.city,
    providerLocationId: 1795565,
    name: "上海",
    region: "上海",
    latitude: 31.23,
    longitude: 121.47,
  },
} as const;

const liveWeather = {
  version: 1,
  condition: "partly-cloudy",
  conditionText: "局部多云",
  currentTemperatureC: 28.4,
  maxTemperatureC: 32,
  minTemperatureC: 24,
  rainChancePercent: 40,
  fetchedAt: "2026-08-18T08:30:00.000Z",
  source: "live",
} as const;

describe("readPairWeatherResponse", () => {
  it("parses independent ready and unavailable pair-weather entries", () => {
    expect(
      readPairWeatherResponse({
        self: { status: "ready", profile: selfProfile, weather: liveWeather },
        peer: {
          status: "unavailable",
          profile: peerProfile,
          reason: "provider_unavailable",
        },
      }),
    ).toEqual({
      self: { status: "ready", profile: selfProfile, weather: liveWeather },
      peer: {
        status: "unavailable",
        profile: peerProfile,
        reason: "provider_unavailable",
      },
    });
  });

  it.each([
    "profile_incomplete",
    "weather_not_configured",
    "provider_unavailable",
    "quota_exhausted",
  ])("accepts unavailable reason %s", (reason) => {
    expect(
      readPairWeatherResponse({
        self: { status: "unavailable", profile: selfProfile, reason },
        peer: { status: "unavailable", profile: peerProfile, reason },
      }),
    ).not.toBeNull();
  });

  it.each([
    "clear",
    "partly-cloudy",
    "cloudy",
    "fog",
    "rain",
    "snow",
    "thunder",
    "other",
  ])("accepts weather condition %s", (condition) => {
    expect(
      readPairWeatherResponse({
        self: {
          status: "ready",
          profile: selfProfile,
          weather: { ...liveWeather, condition },
        },
        peer: { status: "ready", profile: peerProfile, weather: liveWeather },
      }),
    ).not.toBeNull();
  });

  it.each(["live", "cache", "stale-cache"])(
    "accepts weather source %s",
    (source) => {
      expect(
        readPairWeatherResponse({
          self: {
            status: "ready",
            profile: selfProfile,
            weather: { ...liveWeather, source },
          },
          peer: { status: "ready", profile: peerProfile, weather: liveWeather },
        }),
      ).not.toBeNull();
    },
  );

  it.each([
    ["unknown condition", { condition: "windy" }],
    ["unknown source", { source: "provider" }],
    ["unknown version", { version: 2 }],
    ["invalid rain chance", { rainChancePercent: 101 }],
    ["non-finite temperature", { currentTemperatureC: Number.POSITIVE_INFINITY }],
  ])("rejects %s", (_name, weatherOverride) => {
    expect(
      readPairWeatherResponse({
        self: {
          status: "ready",
          profile: selfProfile,
          weather: { ...liveWeather, ...weatherOverride },
        },
        peer: { status: "ready", profile: peerProfile, weather: liveWeather },
      }),
    ).toBeNull();
  });

  it("rejects unknown reasons and entry statuses", () => {
    expect(
      readPairWeatherResponse({
        self: {
          status: "unavailable",
          profile: selfProfile,
          reason: "network_error",
        },
        peer: { status: "ready", profile: peerProfile, weather: liveWeather },
      }),
    ).toBeNull();
    expect(
      readPairWeatherResponse({
        self: { status: "loading", profile: selfProfile },
        peer: { status: "ready", profile: peerProfile, weather: liveWeather },
      }),
    ).toBeNull();
  });

  it("rejects missing entries and malformed profiles", () => {
    expect(
      readPairWeatherResponse({
        self: { status: "ready", profile: selfProfile, weather: liveWeather },
      }),
    ).toBeNull();
    expect(
      readPairWeatherResponse({
        self: {
          status: "ready",
          profile: { ...selfProfile, version: 2 },
          weather: liveWeather,
        },
        peer: { status: "ready", profile: peerProfile, weather: liveWeather },
      }),
    ).toBeNull();
  });
});
