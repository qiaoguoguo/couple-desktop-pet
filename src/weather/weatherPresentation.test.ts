import { describe, expect, it } from "vitest";
import {
  WEATHER_CONDITIONS,
  type PairWeatherEntry,
  type PairWeatherResponse,
  type WeatherSnapshotV1,
} from "../../shared/weatherProtocol";
import {
  formatRainChance,
  formatTemperature,
  formatTemperatureRange,
  formatWeatherUpdateTime,
  getConditionLabel,
  getPeerCareCopy,
  hasStaleWeather,
} from "./weatherPresentation";

const peerProfile = {
  version: 1 as const,
  nickname: "小满",
  city: {
    provider: "weatherapi" as const,
    providerLocationId: 1,
    name: "杭州",
    region: "浙江",
    country: "中国",
    latitude: 30.27,
    longitude: 120.15,
  },
  updatedAt: "2026-08-18T08:00:00.000Z",
};

function readyPeer(
  weather: Partial<WeatherSnapshotV1> = {},
): PairWeatherEntry {
  return {
    status: "ready",
    profile: peerProfile,
    weather: {
      version: 1,
      condition: "clear",
      conditionText: "晴",
      currentTemperatureC: 22,
      maxTemperatureC: 27,
      minTemperatureC: 18,
      rainChancePercent: 0,
      fetchedAt: "2026-08-18T08:05:00.000Z",
      source: "live",
      ...weather,
    },
  };
}

describe("weather presentation", () => {
  it.each([
    [
      { rainChancePercent: 50, currentTemperatureC: 20 },
      "TA 那边可能会下雨，今天记得提醒 TA 带伞。",
    ],
    [
      { rainChancePercent: 49, currentTemperatureC: 30 },
      "TA 那边有点热，记得提醒 TA 多喝水。",
    ],
    [
      { rainChancePercent: 0, currentTemperatureC: 10 },
      "TA 那边有点凉，记得让 TA 多穿一点。",
    ],
    [
      { rainChancePercent: 0, currentTemperatureC: 22 },
      "今天也在同一片天空下。",
    ],
  ])("selects deterministic care copy", (weather, copy) => {
    expect(getPeerCareCopy(readyPeer(weather))).toBe(copy);
  });

  it("uses neutral care copy when peer weather is unavailable", () => {
    expect(
      getPeerCareCopy({
        status: "unavailable",
        profile: peerProfile,
        reason: "provider_unavailable",
      }),
    ).toBe("等天气更新好，再一起看看 TA 那边。");
  });

  it("rounds exact metrics and provides stable condition labels", () => {
    const weather = (readyPeer({
      currentTemperatureC: 21.6,
      maxTemperatureC: 25.4,
      minTemperatureC: 16.7,
      rainChancePercent: 49.6,
    }) as Extract<PairWeatherEntry, { status: "ready" }>).weather;

    expect(formatTemperature(weather.currentTemperatureC)).toBe("22°");
    expect(formatTemperatureRange(weather)).toBe("最高 25° · 最低 17°");
    expect(formatRainChance(weather.rainChancePercent)).toBe("降雨 50%");
    expect(WEATHER_CONDITIONS.map(getConditionLabel)).toEqual([
      "晴",
      "晴间多云",
      "多云",
      "雾",
      "雨",
      "雪",
      "雷暴",
      "其他",
    ]);
  });

  it("formats each fetched time and detects a stale visible entry", () => {
    const response: PairWeatherResponse = {
      self: readyPeer({ fetchedAt: "2026-08-18T08:05:00.000Z" }),
      peer: readyPeer({
        fetchedAt: "2026-08-18T09:45:00.000Z",
        source: "stale-cache",
      }),
    };

    expect(
      formatWeatherUpdateTime(
        response.self.status === "ready" ? response.self.weather.fetchedAt : "",
      ),
    ).toMatch(/\d{2}:\d{2}/);
    expect(
      formatWeatherUpdateTime(
        response.peer.status === "ready" ? response.peer.weather.fetchedAt : "",
      ),
    ).toMatch(/\d{2}:\d{2}/);
    expect(hasStaleWeather(response)).toBe(true);
  });
});
