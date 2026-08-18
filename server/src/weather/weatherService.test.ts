import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CityLocationV1 } from "../../../shared/profileProtocol.js";
import { WeatherProviderError, type ProviderWeather, type WeatherProvider } from "./weatherProvider.js";
import { WeatherService } from "./weatherService.js";

const HOUR_MS = 60 * 60 * 1000;

const cityA: CityLocationV1 = {
  provider: "weatherapi",
  providerLocationId: 1785728,
  name: "杭州",
  region: "浙江",
  country: "中国",
  latitude: 30.2741,
  longitude: 120.1551,
};

const sameCoordinateKeyCity: CityLocationV1 = {
  ...cityA,
  providerLocationId: 999999,
  name: "杭州同坐标",
  latitude: 30.27411,
  longitude: 120.15509,
};

const weather: ProviderWeather = {
  condition: "partly-cloudy",
  conditionText: "局部多云",
  currentTemperatureC: 26,
  maxTemperatureC: 31.3,
  minTemperatureC: 20,
  rainChancePercent: 20,
};

const locations: CityLocationV1[] = [cityA];

let now: number;
let getCurrentDay: ReturnType<typeof vi.fn<WeatherProvider["getCurrentDay"]>>;
let searchLocations: ReturnType<typeof vi.fn<WeatherProvider["searchLocations"]>>;
let service: WeatherService;

beforeEach(() => {
  now = Date.parse("2026-08-18T04:00:00.000Z");
  getCurrentDay = vi.fn<WeatherProvider["getCurrentDay"]>().mockResolvedValue(weather);
  searchLocations = vi
    .fn<WeatherProvider["searchLocations"]>()
    .mockResolvedValue(locations);
  service = new WeatherService({ getCurrentDay, searchLocations }, () => now);
});

describe("WeatherService weather cache", () => {
  it("returns cached weather for one hour and refreshes after expiry", async () => {
    const first = await service.getWeather(cityA);
    now += 59 * 60 * 1000;
    const cached = await service.getWeather(cityA);
    now += 2 * 60 * 1000;
    const refreshed = await service.getWeather(cityA);

    expect([first.source, cached.source, refreshed.source]).toEqual([
      "live",
      "cache",
      "live",
    ]);
    expect(first.fetchedAt).toBe("2026-08-18T04:00:00.000Z");
    expect(cached.fetchedAt).toBe(first.fetchedAt);
    expect(refreshed.fetchedAt).toBe("2026-08-18T05:01:00.000Z");
    expect(getCurrentDay).toHaveBeenCalledTimes(2);
  });

  it("refreshes exactly at the one-hour boundary", async () => {
    await service.getWeather(cityA);
    now += HOUR_MS;

    await expect(service.getWeather(cityA)).resolves.toMatchObject({ source: "live" });
    expect(getCurrentDay).toHaveBeenCalledTimes(2);
  });

  it("uses stale weather through six hours when refresh is unavailable", async () => {
    const first = await service.getWeather(cityA);
    getCurrentDay.mockRejectedValue(providerError("unavailable"));

    now += 2 * HOUR_MS;
    await expect(service.getWeather(cityA)).resolves.toMatchObject({
      source: "stale-cache",
      fetchedAt: first.fetchedAt,
    });

    now += 4 * HOUR_MS;
    await expect(service.getWeather(cityA)).resolves.toMatchObject({
      source: "stale-cache",
    });

    now += 1;
    await expect(service.getWeather(cityA)).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("uses stale weather when the provider quota is exhausted", async () => {
    await service.getWeather(cityA);
    now += 2 * HOUR_MS;
    getCurrentDay.mockRejectedValue(providerError("quota-exhausted"));

    await expect(service.getWeather(cityA)).resolves.toMatchObject({
      source: "stale-cache",
    });
  });

  it.each(["invalid-response", "not-configured"] as const)(
    "does not hide %s errors with stale weather",
    async (kind) => {
      await service.getWeather(cityA);
      now += 2 * HOUR_MS;
      getCurrentDay.mockRejectedValue(providerError(kind));

      await expect(service.getWeather(cityA)).rejects.toMatchObject({ kind });
    },
  );

  it("does not hide programming errors with stale weather", async () => {
    await service.getWeather(cityA);
    now += 2 * HOUR_MS;
    const programmingError = new Error("unexpected failure");
    getCurrentDay.mockRejectedValue(programmingError);

    await expect(service.getWeather(cityA)).rejects.toBe(programmingError);
  });

  it("deduplicates concurrent misses for the same coordinate", async () => {
    const pending = deferred<ProviderWeather>();
    getCurrentDay.mockReturnValue(pending.promise);

    const first = service.getWeather(cityA);
    const second = service.getWeather(cityA);

    expect(getCurrentDay).toHaveBeenCalledTimes(1);
    pending.resolve(weather);
    await expect(Promise.all([first, second])).resolves.toMatchObject([
      { source: "live" },
      { source: "live" },
    ]);
  });

  it("uses coordinates rounded to four decimals as the cache key", async () => {
    await service.getWeather(cityA);

    await expect(service.getWeather(sameCoordinateKeyCity)).resolves.toMatchObject({
      source: "cache",
    });
    expect(getCurrentDay).toHaveBeenCalledTimes(1);
  });

  it("evicts unrelated weather entries only after the six-hour stale boundary", async () => {
    const cityB = cityAt(2, 31.2304, 121.4737);
    const cityC = cityAt(3, 22.5431, 114.0579);
    const cityD = cityAt(4, 39.9042, 116.4074);
    await service.getWeather(cityA);
    await service.getWeather(cityB);

    expect(service.getCacheEntryCounts().weather).toBe(2);

    now += 6 * HOUR_MS;
    await service.getWeather(cityC);
    expect(service.getCacheEntryCounts().weather).toBe(3);

    now += 1;
    await service.getWeather(cityD);
    expect(service.getCacheEntryCounts().weather).toBe(2);
  });

  it("does not sweep an active weather request", async () => {
    const cityB = cityAt(2, 31.2304, 121.4737);
    const pending = deferred<ProviderWeather>();
    getCurrentDay.mockImplementation((city) =>
      city.providerLocationId === cityA.providerLocationId
        ? pending.promise
        : Promise.resolve(weather),
    );

    const first = service.getWeather(cityA);
    now += 7 * HOUR_MS;
    await service.getWeather(cityB);
    const duplicate = service.getWeather(sameCoordinateKeyCity);

    expect(getCurrentDay).toHaveBeenCalledTimes(2);
    pending.resolve(weather);
    await expect(Promise.all([first, duplicate])).resolves.toMatchObject([
      { source: "live" },
      { source: "live" },
    ]);
  });

  it("does not cache failures and clears failed in-flight requests", async () => {
    getCurrentDay
      .mockRejectedValueOnce(providerError("unavailable"))
      .mockResolvedValueOnce(weather);

    await expect(service.getWeather(cityA)).rejects.toMatchObject({ kind: "unavailable" });
    await expect(service.getWeather(cityA)).resolves.toMatchObject({ source: "live" });
    expect(getCurrentDay).toHaveBeenCalledTimes(2);
  });

  it("clears an in-flight weather request after a synchronous provider failure", async () => {
    const programmingError = new Error("synchronous failure");
    getCurrentDay
      .mockImplementationOnce(() => {
        throw programmingError;
      })
      .mockResolvedValueOnce(weather);

    await expect(service.getWeather(cityA)).rejects.toBe(programmingError);
    await expect(service.getWeather(cityA)).resolves.toMatchObject({ source: "live" });
    expect(getCurrentDay).toHaveBeenCalledTimes(2);
  });
});

describe("WeatherService location search cache", () => {
  it("normalizes and caches searches for 24 hours", async () => {
    const first = await service.searchLocations("  HangZhou  ");
    now += 23 * HOUR_MS;
    const cached = await service.searchLocations("hangzhou");
    now += 2 * HOUR_MS;
    const refreshed = await service.searchLocations("HANGZHOU");

    expect(first).toEqual(locations);
    expect(cached).toEqual(locations);
    expect(refreshed).toEqual(locations);
    expect(searchLocations).toHaveBeenNthCalledWith(1, "HangZhou");
    expect(searchLocations).toHaveBeenNthCalledWith(2, "HANGZHOU");
    expect(searchLocations).toHaveBeenCalledTimes(2);
  });

  it("refreshes search results exactly at the 24-hour boundary", async () => {
    await service.searchLocations("Hangzhou");
    now += 24 * HOUR_MS;

    await service.searchLocations("hangzhou");
    expect(searchLocations).toHaveBeenCalledTimes(2);
  });

  it("evicts unrelated searches exactly at the 24-hour boundary", async () => {
    await service.searchLocations("alpha");
    await service.searchLocations("beta");

    expect(service.getCacheEntryCounts().search).toBe(2);

    now += 24 * HOUR_MS - 1;
    await service.searchLocations("gamma");
    expect(service.getCacheEntryCounts().search).toBe(3);

    now += 1;
    await service.searchLocations("delta");
    expect(service.getCacheEntryCounts().search).toBe(2);
  });

  it("does not sweep an active normalized search", async () => {
    const pending = deferred<CityLocationV1[]>();
    searchLocations.mockImplementation((query) =>
      query.toLowerCase() === "alpha" ? pending.promise : Promise.resolve(locations),
    );

    const first = service.searchLocations("Alpha");
    now += 25 * HOUR_MS;
    await service.searchLocations("beta");
    const duplicate = service.searchLocations("ALPHA");

    expect(searchLocations).toHaveBeenCalledTimes(2);
    pending.resolve(locations);
    await expect(Promise.all([first, duplicate])).resolves.toEqual([locations, locations]);
  });

  it("deduplicates concurrent searches by normalized query", async () => {
    const pending = deferred<CityLocationV1[]>();
    searchLocations.mockReturnValue(pending.promise);

    const first = service.searchLocations(" HangZhou ");
    const second = service.searchLocations("hangzhou");

    expect(searchLocations).toHaveBeenCalledTimes(1);
    pending.resolve(locations);
    await expect(Promise.all([first, second])).resolves.toEqual([locations, locations]);
  });

  it("does not cache failed searches and clears their in-flight requests", async () => {
    searchLocations
      .mockRejectedValueOnce(providerError("unavailable"))
      .mockResolvedValueOnce(locations);

    await expect(service.searchLocations("Hangzhou")).rejects.toMatchObject({
      kind: "unavailable",
    });
    await expect(service.searchLocations("hangzhou")).resolves.toEqual(locations);
    expect(searchLocations).toHaveBeenCalledTimes(2);
  });

  it("clears an in-flight search after a synchronous provider failure", async () => {
    const programmingError = new Error("synchronous failure");
    searchLocations
      .mockImplementationOnce(() => {
        throw programmingError;
      })
      .mockResolvedValueOnce(locations);

    await expect(service.searchLocations("Hangzhou")).rejects.toBe(programmingError);
    await expect(service.searchLocations("hangzhou")).resolves.toEqual(locations);
    expect(searchLocations).toHaveBeenCalledTimes(2);
  });
});

function providerError(
  kind: ConstructorParameters<typeof WeatherProviderError>[0],
): WeatherProviderError {
  return new WeatherProviderError(kind);
}

function cityAt(
  providerLocationId: number,
  latitude: number,
  longitude: number,
): CityLocationV1 {
  return {
    ...cityA,
    providerLocationId,
    name: `City ${providerLocationId}`,
    latitude,
    longitude,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
