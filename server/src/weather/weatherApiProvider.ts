import type { CityLocationV1 } from "../../../shared/profileProtocol.js";
import { mapWeatherApiCondition } from "./weatherCondition.js";
import {
  WeatherProviderError,
  type ProviderWeather,
  type WeatherProvider,
} from "./weatherProvider.js";

const WEATHER_API_BASE_URL = "https://api.weatherapi.com/v1/";
const CITY_TEXT_MAX_LENGTH = 80;

export interface WeatherApiProviderOptions {
  apiKey: string | null;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export class WeatherApiProvider implements WeatherProvider {
  readonly #apiKey: string | null;
  readonly #timeoutMs: number;
  readonly #fetchImpl: typeof fetch;

  constructor(options: WeatherApiProviderOptions) {
    this.#apiKey = normalizeApiKey(options.apiKey);
    this.#timeoutMs = options.timeoutMs;
    this.#fetchImpl = options.fetchImpl ?? fetch;
  }

  async searchLocations(query: string): Promise<CityLocationV1[]> {
    const payload = await this.#request("search.json", { q: query.trim() });
    if (!Array.isArray(payload)) {
      throw new WeatherProviderError("invalid-response");
    }

    return payload.map(readLocation);
  }

  async getCurrentDay(city: CityLocationV1): Promise<ProviderWeather> {
    const payload = await this.#request("forecast.json", {
      q: `${city.latitude},${city.longitude}`,
      days: "1",
      aqi: "no",
      alerts: "no",
      lang: "zh",
    });

    return readCurrentDay(payload);
  }

  async #request(path: string, parameters: Record<string, string>): Promise<unknown> {
    if (this.#apiKey === null) {
      throw new WeatherProviderError("not-configured");
    }

    const url = new URL(path, WEATHER_API_BASE_URL);
    url.searchParams.set("key", this.#apiKey);
    for (const [name, value] of Object.entries(parameters)) {
      url.searchParams.set(name, value);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);

    try {
      const response = await this.#fetchImpl(url.toString(), { signal: controller.signal });
      const payload = await readJson(response);

      if (!response.ok) {
        throw classifyHttpError(payload);
      }

      return payload;
    } catch (error) {
      if (error instanceof WeatherProviderError) {
        throw error;
      }

      throw new WeatherProviderError("unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    if (response.ok) {
      throw new WeatherProviderError("invalid-response");
    }

    throw new WeatherProviderError("unavailable");
  }
}

function classifyHttpError(payload: unknown): WeatherProviderError {
  const providerCode = readProviderErrorCode(payload);
  if (providerCode === 2007) {
    return new WeatherProviderError("quota-exhausted");
  }

  if (
    providerCode === 1002 ||
    providerCode === 2006 ||
    providerCode === 2008 ||
    providerCode === 2009
  ) {
    return new WeatherProviderError("not-configured");
  }

  return new WeatherProviderError("unavailable");
}

function readProviderErrorCode(payload: unknown): number | null {
  if (!isRecord(payload) || !isRecord(payload.error)) {
    return null;
  }

  return Number.isInteger(payload.error.code) ? (payload.error.code as number) : null;
}

function readLocation(input: unknown): CityLocationV1 {
  if (
    !isRecord(input) ||
    !Number.isInteger(input.id) ||
    (input.id as number) <= 0 ||
    !isBoundedText(input.name, 1) ||
    !isBoundedText(input.region, 0) ||
    !isBoundedText(input.country, 1) ||
    !isFiniteInRange(input.lat, -90, 90) ||
    !isFiniteInRange(input.lon, -180, 180)
  ) {
    throw new WeatherProviderError("invalid-response");
  }

  return {
    provider: "weatherapi",
    providerLocationId: input.id as number,
    name: input.name.trim(),
    region: input.region.trim(),
    country: input.country.trim(),
    latitude: input.lat,
    longitude: input.lon,
  };
}

function readCurrentDay(input: unknown): ProviderWeather {
  if (!isRecord(input) || !isRecord(input.current) || !isRecord(input.forecast)) {
    throw new WeatherProviderError("invalid-response");
  }

  const current = input.current;
  const forecastDays = input.forecast.forecastday;
  const firstForecast = Array.isArray(forecastDays) ? forecastDays[0] : null;
  const day = isRecord(firstForecast) ? firstForecast.day : null;
  const condition = current.condition;

  if (
    !isFiniteNumber(current.temp_c) ||
    !isRecord(condition) ||
    !isNonEmptyText(condition.text) ||
    !Number.isInteger(condition.code) ||
    !isRecord(day) ||
    !isFiniteNumber(day.maxtemp_c) ||
    !isFiniteNumber(day.mintemp_c) ||
    !isFiniteNumber(day.daily_chance_of_rain)
  ) {
    throw new WeatherProviderError("invalid-response");
  }

  return {
    condition: mapWeatherApiCondition(condition.code as number),
    conditionText: condition.text.trim(),
    currentTemperatureC: roundToOneDecimal(current.temp_c),
    maxTemperatureC: roundToOneDecimal(day.maxtemp_c),
    minTemperatureC: roundToOneDecimal(day.mintemp_c),
    rainChancePercent: Math.min(100, Math.max(0, day.daily_chance_of_rain)),
  };
}

function normalizeApiKey(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function roundToOneDecimal(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isBoundedText(value: unknown, minimumLength: number): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const length = Array.from(value.trim()).length;
  return length >= minimumLength && length <= CITY_TEXT_MAX_LENGTH;
}

function isFiniteInRange(value: unknown, minimum: number, maximum: number): value is number {
  return isFiniteNumber(value) && value >= minimum && value <= maximum;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
