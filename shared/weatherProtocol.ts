import { readDeviceProfile, type DeviceProfileV1 } from "./profileProtocol.js";

export const WEATHER_CONDITIONS = [
  "clear",
  "partly-cloudy",
  "cloudy",
  "fog",
  "rain",
  "snow",
  "thunder",
  "other",
] as const;

export const WEATHER_SOURCES = ["live", "cache", "stale-cache"] as const;

export const WEATHER_UNAVAILABLE_REASONS = [
  "profile_incomplete",
  "weather_not_configured",
  "provider_unavailable",
  "quota_exhausted",
] as const;

export type WeatherConditionV1 = (typeof WEATHER_CONDITIONS)[number];
export type WeatherSource = (typeof WEATHER_SOURCES)[number];
export type WeatherUnavailableReason = (typeof WEATHER_UNAVAILABLE_REASONS)[number];

export interface WeatherSnapshotV1 {
  version: 1;
  condition: WeatherConditionV1;
  conditionText: string;
  currentTemperatureC: number;
  maxTemperatureC: number;
  minTemperatureC: number;
  rainChancePercent: number;
  fetchedAt: string;
  source: WeatherSource;
}

export type PairWeatherEntry =
  | { status: "ready"; profile: DeviceProfileV1; weather: WeatherSnapshotV1 }
  | {
      status: "unavailable";
      profile: DeviceProfileV1;
      reason: WeatherUnavailableReason;
    };

export interface PairWeatherResponse {
  self: PairWeatherEntry;
  peer: PairWeatherEntry;
}

const WEATHER_CONDITION_SET = new Set<string>(WEATHER_CONDITIONS);
const WEATHER_SOURCE_SET = new Set<string>(WEATHER_SOURCES);
const WEATHER_UNAVAILABLE_REASON_SET = new Set<string>(WEATHER_UNAVAILABLE_REASONS);

export function readPairWeatherResponse(input: unknown): PairWeatherResponse | null {
  if (!isRecord(input)) {
    return null;
  }

  const self = readPairWeatherEntry(input.self);
  const peer = readPairWeatherEntry(input.peer);
  return self === null || peer === null ? null : { self, peer };
}

function readPairWeatherEntry(input: unknown): PairWeatherEntry | null {
  if (!isRecord(input)) {
    return null;
  }

  const profile = readDeviceProfile(input.profile);
  if (profile === null) {
    return null;
  }

  if (input.status === "ready") {
    const weather = readWeatherSnapshot(input.weather);
    return weather === null ? null : { status: "ready", profile, weather };
  }

  if (
    input.status === "unavailable" &&
    typeof input.reason === "string" &&
    WEATHER_UNAVAILABLE_REASON_SET.has(input.reason)
  ) {
    return {
      status: "unavailable",
      profile,
      reason: input.reason as WeatherUnavailableReason,
    };
  }

  return null;
}

function readWeatherSnapshot(input: unknown): WeatherSnapshotV1 | null {
  if (
    !isRecord(input) ||
    input.version !== 1 ||
    typeof input.condition !== "string" ||
    !WEATHER_CONDITION_SET.has(input.condition) ||
    typeof input.conditionText !== "string" ||
    !isFiniteNumber(input.currentTemperatureC) ||
    !isFiniteNumber(input.maxTemperatureC) ||
    !isFiniteNumber(input.minTemperatureC) ||
    !isFiniteInRange(input.rainChancePercent, 0, 100) ||
    typeof input.fetchedAt !== "string" ||
    input.fetchedAt.length === 0 ||
    typeof input.source !== "string" ||
    !WEATHER_SOURCE_SET.has(input.source)
  ) {
    return null;
  }

  return {
    version: 1,
    condition: input.condition as WeatherConditionV1,
    conditionText: input.conditionText,
    currentTemperatureC: input.currentTemperatureC,
    maxTemperatureC: input.maxTemperatureC,
    minTemperatureC: input.minTemperatureC,
    rainChancePercent: input.rainChancePercent,
    fetchedAt: input.fetchedAt,
    source: input.source as WeatherSource,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFiniteInRange(value: unknown, minimum: number, maximum: number): value is number {
  return isFiniteNumber(value) && value >= minimum && value <= maximum;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
