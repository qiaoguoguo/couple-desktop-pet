import { afterEach, describe, expect, it, vi } from "vitest";
import type { CityLocationV1 } from "../../../shared/profileProtocol.js";
import { WeatherApiProvider } from "./weatherApiProvider.js";

const cityA: CityLocationV1 = {
  provider: "weatherapi",
  providerLocationId: 1785728,
  name: "杭州",
  region: "浙江",
  country: "中国",
  latitude: 30.27,
  longitude: 120.15,
};

const validForecast = {
  current: {
    temp_c: 25.96,
    condition: { text: "局部多云", code: 1003 },
  },
  forecast: {
    forecastday: [
      {
        day: {
          maxtemp_c: 31.26,
          mintemp_c: 20.04,
          daily_chance_of_rain: 20,
        },
      },
    ],
  },
};

afterEach(() => {
  vi.useRealTimers();
});

describe("WeatherApiProvider", () => {
  it("requests one-day Chinese forecast without leaking the key in its output", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(200, validForecast));
    const provider = new WeatherApiProvider({
      apiKey: "secret-key",
      timeoutMs: 3000,
      fetchImpl,
    });

    const weather = await provider.getCurrentDay(cityA);

    expect(fetchImpl).toHaveBeenCalledOnce();
    const url = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://api.weatherapi.com/v1/forecast.json",
    );
    expect(url.searchParams.get("key")).toBe("secret-key");
    expect(url.searchParams.get("q")).toBe("30.27,120.15");
    expect(url.searchParams.get("days")).toBe("1");
    expect(url.searchParams.get("aqi")).toBe("no");
    expect(url.searchParams.get("alerts")).toBe("no");
    expect(url.searchParams.get("lang")).toBe("zh");
    expect(JSON.stringify(weather)).not.toContain("secret-key");
    expect(weather).toEqual({
      condition: "partly-cloudy",
      conditionText: "局部多云",
      currentTemperatureC: 26,
      maxTemperatureC: 31.3,
      minTemperatureC: 20,
      rainChancePercent: 20,
    });
  });

  it("normalizes location search results and encodes the query", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      response(200, [
        {
          id: 1785728,
          name: "Hangzhou",
          region: "Zhejiang",
          country: "China",
          lat: 30.27,
          lon: 120.15,
          url: "hangzhou-zhejiang-china",
        },
      ]),
    );
    const provider = new WeatherApiProvider({
      apiKey: "secret-key",
      timeoutMs: 3000,
      fetchImpl,
    });

    await expect(provider.searchLocations(" 杭 州 ")).resolves.toEqual([
      {
        provider: "weatherapi",
        providerLocationId: 1785728,
        name: "Hangzhou",
        region: "Zhejiang",
        country: "China",
        latitude: 30.27,
        longitude: 120.15,
      },
    ]);

    const url = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://api.weatherapi.com/v1/search.json",
    );
    expect(url.searchParams.get("q")).toBe("杭 州");
  });

  it("clamps rain chance and rounds temperatures at the boundary", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      response(200, {
        ...validForecast,
        current: { ...validForecast.current, temp_c: -3.25 },
        forecast: {
          forecastday: [
            {
              day: {
                maxtemp_c: 4.44,
                mintemp_c: -6.66,
                daily_chance_of_rain: 140,
              },
            },
          ],
        },
      }),
    );
    const provider = new WeatherApiProvider({
      apiKey: "secret-key",
      timeoutMs: 3000,
      fetchImpl,
    });

    await expect(provider.getCurrentDay(cityA)).resolves.toMatchObject({
      currentTemperatureC: -3.2,
      maxTemperatureC: 4.4,
      minTemperatureC: -6.7,
      rainChancePercent: 100,
    });
  });

  it("classifies HTTP 403 quota responses", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response(403, { error: { code: 2007, message: "quota" } }));
    const provider = new WeatherApiProvider({
      apiKey: "secret-key",
      timeoutMs: 3000,
      fetchImpl,
    });

    await expect(provider.getCurrentDay(cityA)).rejects.toMatchObject({
      kind: "quota-exhausted",
    });
  });

  it("fails before fetching when the provider is not configured", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const provider = new WeatherApiProvider({ apiKey: null, timeoutMs: 3000, fetchImpl });

    await expect(provider.getCurrentDay(cityA)).rejects.toMatchObject({
      kind: "not-configured",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["forecast", { current: validForecast.current, forecast: { forecastday: [] } }],
    [
      "condition code",
      {
        ...validForecast,
        current: { ...validForecast.current, condition: { text: "晴", code: "1000" } },
      },
    ],
    [
      "rain chance",
      {
        ...validForecast,
        forecast: {
          forecastday: [
            { day: { maxtemp_c: 31, mintemp_c: 20, daily_chance_of_rain: "20" } },
          ],
        },
      },
    ],
  ])("rejects a response with malformed %s", async (_field, body) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(200, body));
    const provider = new WeatherApiProvider({
      apiKey: "secret-key",
      timeoutMs: 3000,
      fetchImpl,
    });

    await expect(provider.getCurrentDay(cityA)).rejects.toMatchObject({
      kind: "invalid-response",
    });
  });

  it("rejects malformed location records", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      response(200, [
        {
          id: 1785728,
          name: "Hangzhou",
          region: "Zhejiang",
          country: "China",
          lat: 91,
          lon: 120.15,
        },
      ]),
    );
    const provider = new WeatherApiProvider({
      apiKey: "secret-key",
      timeoutMs: 3000,
      fetchImpl,
    });

    await expect(provider.searchLocations("Hangzhou")).rejects.toMatchObject({
      kind: "invalid-response",
    });
  });

  it("classifies network and HTTP failures without exposing the supplier URL", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("network down"));
    const provider = new WeatherApiProvider({
      apiKey: "secret-key",
      timeoutMs: 3000,
      fetchImpl,
    });

    const error = await provider.getCurrentDay(cityA).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ kind: "unavailable" });
    expect(String(error)).not.toContain("secret-key");
    expect(String(error)).not.toContain("api.weatherapi.com");
  });

  it("aborts requests that exceed the configured timeout", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    });
    const provider = new WeatherApiProvider({
      apiKey: "secret-key",
      timeoutMs: 1000,
      fetchImpl,
    });

    const rejection = expect(provider.getCurrentDay(cityA)).rejects.toMatchObject({
      kind: "unavailable",
    });
    await vi.advanceTimersByTimeAsync(1000);
    await rejection;
    expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
