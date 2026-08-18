import type {
  PairWeatherEntry,
  PairWeatherResponse,
  WeatherConditionV1,
  WeatherSnapshotV1,
} from "../../shared/weatherProtocol";

const CONDITION_LABELS: Record<WeatherConditionV1, string> = {
  clear: "晴",
  "partly-cloudy": "晴间多云",
  cloudy: "多云",
  fog: "雾",
  rain: "雨",
  snow: "雪",
  thunder: "雷暴",
  other: "其他",
};

export function getPeerCareCopy(peer: PairWeatherEntry): string {
  if (peer.status === "unavailable") {
    return "等天气更新好，再一起看看 TA 那边。";
  }

  if (peer.weather.rainChancePercent >= 50) {
    return "TA 那边可能会下雨，今天记得提醒 TA 带伞。";
  }

  if (peer.weather.currentTemperatureC >= 30) {
    return "TA 那边有点热，记得提醒 TA 多喝水。";
  }

  if (peer.weather.currentTemperatureC <= 10) {
    return "TA 那边有点凉，记得让 TA 多穿一点。";
  }

  return "今天也在同一片天空下。";
}

export function formatTemperature(value: number): string {
  return `${Math.round(value)}°`;
}

export function formatTemperatureRange(weather: WeatherSnapshotV1): string {
  return `最高 ${formatTemperature(weather.maxTemperatureC)} · 最低 ${formatTemperature(weather.minTemperatureC)}`;
}

export function formatRainChance(value: number): string {
  return `降雨 ${Math.round(value)}%`;
}

export function formatWeatherUpdateTime(fetchedAt: string): string {
  const value = new Date(fetchedAt);
  if (Number.isNaN(value.getTime())) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

export function getConditionLabel(condition: WeatherConditionV1): string {
  return CONDITION_LABELS[condition];
}

export function hasStaleWeather(response: PairWeatherResponse): boolean {
  return [response.self, response.peer].some(
    (entry) => entry.status === "ready" && entry.weather.source === "stale-cache",
  );
}
