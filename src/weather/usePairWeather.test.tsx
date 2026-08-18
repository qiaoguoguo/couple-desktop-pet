import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PairWeatherResponse } from "../../shared/weatherProtocol";
import {
  E2E_PAIR_WEATHER_OVERRIDE_EVENT,
  E2E_PAIR_WEATHER_OVERRIDE_WINDOW_KEY,
} from "../sync/e2eRealtimeOverride";
import type { RelayHttpClient } from "../sync/relayHttpClient";
import { usePairWeather } from "./usePairWeather";

const auth = {
  relayUrl: "https://relay.example.test",
  deviceId: "device-a",
  deviceSecret: "secret-a",
  pairId: "pair-a",
};

const response = weatherResponse("杭州", "苏州");

describe("usePairWeather", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    Reflect.deleteProperty(window, E2E_PAIR_WEATHER_OVERRIDE_WINDOW_KEY);
  });

  it("requests once for every open call even when Relay returns cache", async () => {
    const getPairWeather = vi.fn().mockResolvedValue({ ok: true, ...response });
    const { result } = renderWeatherHook(getPairWeather);

    await act(async () => {
      await result.current.open(auth);
      await result.current.open(auth);
    });

    expect(getPairWeather).toHaveBeenCalledTimes(2);
    expect(getPairWeather).toHaveBeenNthCalledWith(1, {
      deviceId: "device-a",
      deviceSecret: "secret-a",
      pairId: "pair-a",
    });
    expect(result.current.state).toEqual({ status: "loaded", response });
  });

  it("suppresses a stale completion after close and reopen", async () => {
    const first = deferred<ReturnType<typeof successResult>>();
    const second = deferred<ReturnType<typeof successResult>>();
    const getPairWeather = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderWeatherHook(getPairWeather);

    act(() => {
      void result.current.open(auth);
    });
    expect(result.current.state.status).toBe("loading");

    act(() => {
      result.current.close();
      void result.current.open(auth);
    });
    expect(getPairWeather).toHaveBeenCalledTimes(2);

    const latestResponse = weatherResponse("北京", "上海");
    await act(async () => {
      second.resolve(successResult(latestResponse));
      await second.promise;
    });
    expect(result.current.state).toEqual({
      status: "loaded",
      response: latestResponse,
    });

    await act(async () => {
      first.resolve(successResult(response));
      await first.promise;
    });
    expect(result.current.state).toEqual({
      status: "loaded",
      response: latestResponse,
    });
  });

  it("retains typed Relay failures for panel degradation", async () => {
    const getPairWeather = vi.fn().mockResolvedValue({
      ok: false,
      code: "rate_limited",
      message: "Too many weather requests",
    });
    const { result } = renderWeatherHook(getPairWeather);

    await act(async () => {
      await result.current.open(auth);
    });

    expect(result.current.state).toEqual({
      status: "failed",
      code: "rate_limited",
      message: "Too many weather requests",
    });
  });

  it("returns to idle on close without polling", async () => {
    const getPairWeather = vi.fn().mockResolvedValue({ ok: true, ...response });
    const { result } = renderWeatherHook(getPairWeather);

    await act(async () => {
      await result.current.open(auth);
    });
    act(() => result.current.close());

    expect(result.current.state).toEqual({ status: "idle" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getPairWeather).toHaveBeenCalledTimes(1);
  });

  it("completes requests after StrictMode replays mount effects", async () => {
    const getPairWeather = vi.fn().mockResolvedValue({ ok: true, ...response });
    const client = { getPairWeather } as Pick<RelayHttpClient, "getPairWeather">;
    const { result } = renderHook(
      () => usePairWeather({ createClient: () => client }),
      { reactStrictMode: true },
    );

    await act(async () => {
      await result.current.open(auth);
    });

    expect(result.current.state).toEqual({ status: "loaded", response });
  });

  it("uses and subscribes to pair-weather fixtures only in guarded E2E builds", async () => {
    vi.stubEnv("VITE_TAURI_E2E", "1");
    setPairWeatherOverride(response);
    const getPairWeather = vi.fn();
    const { result } = renderWeatherHook(getPairWeather);

    await act(async () => {
      await result.current.open(auth);
    });

    expect(getPairWeather).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ status: "loaded", response });

    const projected = weatherResponse("杭州", "深圳");
    await act(async () => {
      setPairWeatherOverride(projected);
      window.dispatchEvent(new Event(E2E_PAIR_WEATHER_OVERRIDE_EVENT));
    });
    expect(result.current.state).toEqual({
      status: "loaded",
      response: projected,
    });

    act(() => result.current.close());
    await act(async () => {
      setPairWeatherOverride(weatherResponse("北京", "上海"));
      window.dispatchEvent(new Event(E2E_PAIR_WEATHER_OVERRIDE_EVENT));
    });
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("ignores the window fixture and calls Relay outside guarded E2E builds", async () => {
    vi.stubEnv("VITE_TAURI_E2E", "0");
    setPairWeatherOverride(weatherResponse("北京", "上海"));
    const getPairWeather = vi.fn().mockResolvedValue({ ok: true, ...response });
    const { result } = renderWeatherHook(getPairWeather);

    await act(async () => {
      await result.current.open(auth);
    });

    expect(getPairWeather).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({ status: "loaded", response });
  });
});

function setPairWeatherOverride(value: PairWeatherResponse) {
  Object.defineProperty(window, E2E_PAIR_WEATHER_OVERRIDE_WINDOW_KEY, {
    configurable: true,
    value,
    writable: true,
  });
}

function renderWeatherHook(getPairWeather: ReturnType<typeof vi.fn>) {
  const client = { getPairWeather } as Pick<RelayHttpClient, "getPairWeather">;
  return renderHook(() => usePairWeather({ createClient: () => client }));
}

function successResult(value = response) {
  return { ok: true as const, ...value };
}

function weatherResponse(selfCity: string, peerCity: string): PairWeatherResponse {
  return {
    self: readyEntry("我", selfCity, "live"),
    peer: readyEntry("TA", peerCity, "cache"),
  };
}

function readyEntry(
  nickname: string,
  cityName: string,
  source: "live" | "cache" | "stale-cache",
) {
  return {
    status: "ready" as const,
    profile: {
      version: 1 as const,
      nickname,
      city: {
        provider: "weatherapi" as const,
        providerLocationId: cityName.length + 1,
        name: cityName,
        region: "测试省",
        country: "中国",
        latitude: 30,
        longitude: 120,
      },
      updatedAt: "2026-08-18T08:00:00.000Z",
    },
    weather: {
      version: 1 as const,
      condition: "clear" as const,
      conditionText: "晴",
      currentTemperatureC: 23,
      maxTemperatureC: 28,
      minTemperatureC: 18,
      rainChancePercent: 10,
      fetchedAt: "2026-08-18T08:05:00.000Z",
      source,
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
