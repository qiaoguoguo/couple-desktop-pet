import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  PairWeatherEntry,
  PairWeatherResponse,
  WeatherSource,
  WeatherUnavailableReason,
} from "../../shared/weatherProtocol";
import { WeatherPanel, type WeatherPanelProps } from "./WeatherPanel";

describe("WeatherPanel", () => {
  it("keeps two fixed weather rows in the loading state", () => {
    const { container } = renderPanel({ state: { status: "loading" } });

    expect(screen.getByText("两座城 · 一份牵挂")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "今天也在同一片天空下" })).toBeTruthy();
    expect(container.querySelectorAll(".weather-person-row")).toHaveLength(2);
    expect(container.querySelectorAll(".weather-skeleton").length).toBeGreaterThan(1);
    expect(screen.getByText("WeatherAPI.com")).toBeTruthy();
  });

  it("shows both ready rows with exact metrics, local icons, and care copy", () => {
    const { container } = renderPanel({
      state: { status: "loaded", response: bothReady() },
    });

    expect(screen.getByText("杭州 · 苏州")).toBeTruthy();
    expect(screen.getByText("24°")).toBeTruthy();
    expect(screen.getByText("19°")).toBeTruthy();
    expect(screen.getByText("最高 29° · 最低 17°")).toBeTruthy();
    expect(screen.getByText("降雨 20%")).toBeTruthy();
    expect(screen.getByText("TA 那边可能会下雨，今天记得提醒 TA 带伞。")).toBeTruthy();
    expect(container.querySelectorAll(".weather-person-row svg")).toHaveLength(2);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('use[href^="http"]')).toBeNull();
    expect(container.textContent).not.toMatch(/[☀☁🌤🌧🌨⛈]/u);
  });

  it("keeps a failed peer in place while rendering self weather", () => {
    const response = bothReady();
    response.peer = unavailableEntry("TA", "苏州", "provider_unavailable");
    renderPanel({ state: { status: "loaded", response } });

    expect(screen.getByText("24°")).toBeTruthy();
    expect(screen.getByText("天气暂时不可用")).toBeTruthy();
    expect(screen.getByText("等天气更新好，再一起看看 TA 那边。")).toBeTruthy();
  });

  it("shows the fixed failure copy when both weather rows are unavailable", () => {
    renderPanel({
      state: {
        status: "loaded",
        response: {
          self: unavailableEntry("小满", "杭州", "provider_unavailable"),
          peer: unavailableEntry("阿屿", "苏州", "quota_exhausted"),
        },
      },
    });

    expect(screen.getAllByText("天气暂时不可用")).toHaveLength(2);
    expect(screen.getByText("天气暂时走神了，晚点再一起看看。")).toBeTruthy();
  });

  it("marks stale weather beside its update time without replacing data", () => {
    const response = bothReady();
    response.peer = readyEntry("阿屿", "苏州", "stale-cache", {
      currentTemperatureC: 18.6,
    });
    renderPanel({ state: { status: "loaded", response } });

    expect(screen.getByText("19°")).toBeTruthy();
    expect(screen.getByText("天气暂时没有更新")).toBeTruthy();
    expect(screen.getByText(/我 \d{2}:\d{2}/)).toBeTruthy();
    expect(screen.getByText(/TA \d{2}:\d{2}/)).toBeTruthy();
  });

  it("keeps a peer without a city in its row", () => {
    const response = bothReady();
    response.peer = unavailableEntry("阿屿", null, "profile_incomplete");
    renderPanel({ state: { status: "loaded", response } });

    const peerRow = screen.getByTestId("weather-row-peer");
    expect(within(peerRow).getByText("等待 TA 设置城市")).toBeTruthy();
    expect(screen.getByText("24°")).toBeTruthy();
  });

  it("renders unpaired and incomplete-profile commands without requesting behavior", () => {
    const onOpenBinding = vi.fn();
    const first = renderPanel({ paired: false, onOpenBinding });
    expect(screen.getByText("还没有可以一起看天气的 TA")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "进入绑定设置" }));
    expect(onOpenBinding).toHaveBeenCalledTimes(1);

    first.unmount();
    const onOpenSettings = vi.fn();
    renderPanel({ profileComplete: false, onOpenSettings });
    expect(screen.getByText("请先完成基本信息")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "进入基本信息设置" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["weather_not_configured", "天气服务暂时未配置", false],
    ["rate_limited", "看天气的次数有点多，请稍后再试", true],
    ["provider_unavailable", "天气暂时走神了，晚点再一起看看。", true],
  ] as const)("renders %s failure and its retry policy", (code, copy, canRetry) => {
    const onRetry = vi.fn();
    renderPanel({
      state: { status: "failed", code, message: "supplier detail" },
      onRetry,
    });

    expect(screen.getByText(copy)).toBeTruthy();
    const retry = screen.queryByRole("button", { name: "重试" });
    expect(Boolean(retry)).toBe(canRetry);
    if (retry) {
      fireEvent.click(retry);
      expect(onRetry).toHaveBeenCalledTimes(1);
    }
    expect(screen.queryByText("supplier detail")).toBeNull();
  });

  it("closes from the button and Escape while exposing no implicit controls", () => {
    const onClose = vi.fn();
    const { container } = renderPanel({
      state: { status: "loaded", response: bothReady() },
      onClose,
    });

    fireEvent.click(screen.getByRole("button", { name: "关闭双方天气" }));
    fireEvent.keyDown(container.querySelector(".weather-panel") as HTMLElement, {
      key: "Escape",
    });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(container.querySelector("a")).toBeNull();
  });

  it("contains long city and nickname text inside fixed identity tracks", () => {
    const response = bothReady();
    response.peer = readyEntry(
      "这是一个非常非常长但仍需被可靠限制的昵称",
      "这是一个非常非常长且必须截断的城市名称",
      "cache",
    );
    renderPanel({ state: { status: "loaded", response } });

    const peerRow = screen.getByTestId("weather-row-peer");
    expect(
      within(peerRow)
        .getByText(response.peer.profile.nickname)
        .classList.contains("weather-person-name"),
    ).toBe(true);
    expect(
      within(peerRow)
        .getByText(response.peer.profile.city?.name ?? "")
        .classList.contains("weather-city-name"),
    ).toBe(true);
  });
});

function renderPanel(props: Partial<WeatherPanelProps> = {}) {
  return render(
    <WeatherPanel
      state={{ status: "idle" }}
      paired
      profileComplete
      onClose={vi.fn()}
      onRetry={vi.fn()}
      onOpenSettings={vi.fn()}
      onOpenBinding={vi.fn()}
      {...props}
    />,
  );
}

function bothReady(): PairWeatherResponse {
  return {
    self: readyEntry("小满", "杭州", "live", {
      condition: "partly-cloudy",
      conditionText: "晴间多云",
      currentTemperatureC: 23.6,
      maxTemperatureC: 29.2,
      minTemperatureC: 17.1,
      rainChancePercent: 19.7,
    }),
    peer: readyEntry("阿屿", "苏州", "cache", {
      condition: "rain",
      conditionText: "小雨",
      currentTemperatureC: 19.2,
      maxTemperatureC: 22.2,
      minTemperatureC: 15.8,
      rainChancePercent: 70,
    }),
  };
}

function readyEntry(
  nickname: string,
  cityName: string,
  source: WeatherSource,
  weather: Partial<Extract<PairWeatherEntry, { status: "ready" }>["weather"]> = {},
): Extract<PairWeatherEntry, { status: "ready" }> {
  return {
    status: "ready",
    profile: profile(nickname, cityName),
    weather: {
      version: 1,
      condition: "clear",
      conditionText: "晴",
      currentTemperatureC: 20,
      maxTemperatureC: 25,
      minTemperatureC: 15,
      rainChancePercent: 0,
      fetchedAt: "2026-08-18T08:05:00.000Z",
      source,
      ...weather,
    },
  };
}

function unavailableEntry(
  nickname: string,
  cityName: string | null,
  reason: WeatherUnavailableReason,
): Extract<PairWeatherEntry, { status: "unavailable" }> {
  return { status: "unavailable", profile: profile(nickname, cityName), reason };
}

function profile(nickname: string, cityName: string | null) {
  return {
    version: 1 as const,
    nickname,
    city: cityName === null ? null : {
      provider: "weatherapi" as const,
      providerLocationId: cityName.length + 1,
      name: cityName,
      region: "测试省",
      country: "中国",
      latitude: 30,
      longitude: 120,
    },
    updatedAt: "2026-08-18T08:00:00.000Z",
  };
}
