import type { CityLocationV1 } from "../../../shared/profileProtocol.js";
import type { WeatherSnapshotV1, WeatherSource } from "../../../shared/weatherProtocol.js";
import {
  WeatherProviderError,
  type ProviderWeather,
  type WeatherProvider,
} from "./weatherProvider.js";

const WEATHER_FRESH_MS = 60 * 60 * 1000;
const WEATHER_STALE_MAX_MS = 6 * 60 * 60 * 1000;
const LOCATION_SEARCH_MS = 24 * 60 * 60 * 1000;

interface WeatherCacheEntry {
  snapshot: WeatherSnapshotV1;
  fetchedAtMs: number;
}

interface LocationSearchCacheEntry {
  locations: CityLocationV1[];
  fetchedAtMs: number;
}

export class WeatherService {
  readonly #searchCache = new Map<string, LocationSearchCacheEntry>();
  readonly #weatherCache = new Map<string, WeatherCacheEntry>();
  readonly #searchInFlight = new Map<string, Promise<CityLocationV1[]>>();
  readonly #weatherInFlight = new Map<string, Promise<WeatherSnapshotV1>>();
  readonly #provider: WeatherProvider;
  readonly #now: () => number;

  constructor(provider: WeatherProvider, now: () => number = Date.now) {
    this.#provider = provider;
    this.#now = now;
  }

  async searchLocations(query: string): Promise<CityLocationV1[]> {
    const supplierQuery = query.trim();
    const key = supplierQuery.toLowerCase();
    const cached = this.#searchCache.get(key);
    if (cached && this.#now() - cached.fetchedAtMs < LOCATION_SEARCH_MS) {
      return cloneLocations(cached.locations);
    }

    let request = this.#searchInFlight.get(key);
    if (!request) {
      request = this.#refreshLocations(key, supplierQuery).finally(() => {
        this.#searchInFlight.delete(key);
      });
      this.#searchInFlight.set(key, request);
    }

    return cloneLocations(await request);
  }

  async getWeather(city: CityLocationV1): Promise<WeatherSnapshotV1> {
    const key = weatherKey(city);
    const cached = this.#weatherCache.get(key);
    if (cached && this.#now() - cached.fetchedAtMs < WEATHER_FRESH_MS) {
      return withSource(cached.snapshot, "cache");
    }

    let request = this.#weatherInFlight.get(key);
    if (!request) {
      request = this.#refreshWeather(key, city, cached).finally(() => {
        this.#weatherInFlight.delete(key);
      });
      this.#weatherInFlight.set(key, request);
    }

    return request;
  }

  async #refreshLocations(key: string, query: string): Promise<CityLocationV1[]> {
    const locations = cloneLocations(await this.#provider.searchLocations(query));
    this.#searchCache.set(key, {
      locations,
      fetchedAtMs: this.#now(),
    });
    return locations;
  }

  async #refreshWeather(
    key: string,
    city: CityLocationV1,
    cached: WeatherCacheEntry | undefined,
  ): Promise<WeatherSnapshotV1> {
    try {
      const weather = await this.#provider.getCurrentDay(city);
      const fetchedAtMs = this.#now();
      const snapshot = toSnapshot(weather, fetchedAtMs);
      this.#weatherCache.set(key, { snapshot, fetchedAtMs });
      return { ...snapshot };
    } catch (error) {
      if (
        cached &&
        this.#now() - cached.fetchedAtMs <= WEATHER_STALE_MAX_MS &&
        canUseStaleWeather(error)
      ) {
        return withSource(cached.snapshot, "stale-cache");
      }

      throw error;
    }
  }
}

function weatherKey(city: CityLocationV1): string {
  return `${city.latitude.toFixed(4)},${city.longitude.toFixed(4)}`;
}

function toSnapshot(weather: ProviderWeather, fetchedAtMs: number): WeatherSnapshotV1 {
  return {
    version: 1,
    ...weather,
    fetchedAt: new Date(fetchedAtMs).toISOString(),
    source: "live",
  };
}

function withSource(snapshot: WeatherSnapshotV1, source: WeatherSource): WeatherSnapshotV1 {
  return { ...snapshot, source };
}

function canUseStaleWeather(error: unknown): boolean {
  return (
    error instanceof WeatherProviderError &&
    (error.kind === "unavailable" || error.kind === "quota-exhausted")
  );
}

function cloneLocations(locations: CityLocationV1[]): CityLocationV1[] {
  return locations.map((location) => ({ ...location }));
}
