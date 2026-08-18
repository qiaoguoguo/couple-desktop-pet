import { $, browser, expect } from "@wdio/globals";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { openPetContextMenu } from "../../support/contextMenu";
import { openInteractionMenu } from "../../support/interactionMenu";
import {
  assertDedicatedE2eAppDataPaths,
  resolveNativeEvidenceStem,
  type E2eAppDataPaths,
} from "../support/env";
import {
  clearE2ePairWeatherOverride,
  clearE2eRealtimeOverride,
  createE2ePairWeatherFixture,
  setE2ePairWeatherOverride,
  setE2eRealtimeOverride,
} from "../../support/realtimeOverride";
import { invokeTauri } from "../../support/tauri";

interface WindowState {
  scale_factor: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

interface WeatherVisualMetrics {
  panel: {
    backgroundColor: string;
    borderRadius: string;
    borderTopColor: string;
    borderTopWidth: string;
    color: string;
    height: number;
    letterSpacing: string;
    width: number;
  };
  care: {
    backgroundColor: string;
    borderLeftColor: string;
    borderLeftWidth: string;
  };
  composerPointerEvents: string;
  headingFontSize: string;
  iconColor: string;
  iconHeight: number;
  iconWidth: number;
  regionPointerEvents: string;
  rowsBorderColor: string;
  temperatureFontSize: string;
}

const weatherPanelSelector = 'section[aria-label="双方天气"]';
const settingsSelector = 'section[aria-label="桌宠设置"]';
const profileSelector = 'section[aria-label="基本信息"]';
const screenshotDirectory =
  process.env.INTEROP_SCREENSHOT_DIR ??
  resolve(
    process.cwd(),
    ".superpowers/sdd/2026-08-18-couple-weather-profile/task-12-evidence/native",
  );

let originalSettings: Record<string, unknown> | null = null;

describe("paired weather native experience", () => {
  before(async () => {
    originalSettings = await invokeTauri<Record<string, unknown>>("read_settings");
    await writeE2eSettingsSafely(createPairedWeatherSettings(originalSettings));
    await browser.refresh();
    await setConnectedE2eState();
    await setE2ePairWeatherOverride(createE2ePairWeatherFixture());
  });

  after(async () => {
    await clearE2ePairWeatherOverride();
    await clearE2eRealtimeOverride();
    if (originalSettings !== null) {
      await writeE2eSettingsSafely(originalSettings);
      await browser.refresh();
    }
  });

  it("renders, restores, and projects deterministic paired weather", async () => {
    const petGeometry = await invokeTauri<WindowState>("e2e_window_state");
    const menu = await openInteractionMenu();
    const menuItems = await menu.$$('[role="menuitem"]');
    expect(menuItems).toHaveLength(6);
    expect((await menuItems[0].getText()).trim()).toBe("双方天气");

    await menuItems[0].click();
    const panel = await $(weatherPanelSelector);
    await expect(panel).toBeDisplayed();

    const panelText = await panel.getText();
    for (const expectedCopy of [
      "两座城 · 一份牵挂",
      "今天也在同一片天空下",
      "杭州 · 深圳",
      "TA 那边可能会下雨，今天记得提醒 TA 带伞。",
      "WeatherAPI.com",
    ]) {
      expect(panelText).toContain(expectedCopy);
    }
    await assertReadyWeatherRow('[data-testid="weather-row-self"]', [
      "小满",
      "杭州",
      "晴间多云",
      "26°",
      "最高 31° · 最低 22°",
      "降雨 20%",
    ]);
    await assertReadyWeatherRow('[data-testid="weather-row-peer"]', [
      "阿岚",
      "深圳",
      "小雨",
      "23°",
      "最高 27° · 最低 20°",
      "降雨 80%",
    ]);
    await expect($$(".weather-condition-icon")).toBeElementsArrayOfSize(2);

    const weatherGeometry = await invokeTauri<WindowState>("e2e_window_state");
    const panelSize = await panel.getSize();
    const panelLocation = await panel.getLocation();
    expect(Math.round(panelSize.width)).toBe(424);
    expect(Math.round(panelSize.height)).toBe(466);
    expect(panelLocation.x).toBeGreaterThan(0);
    expect(panelLocation.y).toBeGreaterThan(0);
    if (process.platform === "win32") {
      expect(weatherGeometry.scale_factor).toBe(1);
      expect(weatherGeometry.size).toEqual({ width: 460, height: 504 });
    }

    const visualMetrics = await readWeatherVisualMetrics();
    expect(visualMetrics.panel).toEqual({
      backgroundColor: "rgb(255, 254, 250)",
      borderRadius: "7px",
      borderTopColor: "rgb(23, 23, 23)",
      borderTopWidth: "1px",
      color: "rgb(23, 23, 23)",
      height: 466,
      letterSpacing: "normal",
      width: 424,
    });
    expect(visualMetrics.care).toEqual({
      backgroundColor: "rgb(242, 240, 235)",
      borderLeftColor: "rgb(213, 40, 32)",
      borderLeftWidth: "3px",
    });
    expect(visualMetrics.rowsBorderColor).toBe("rgb(218, 214, 207)");
    expect(visualMetrics.headingFontSize).toBe("21px");
    expect(visualMetrics.temperatureFontSize).toBe("30px");
    expect(visualMetrics.iconColor).toBe("rgb(213, 40, 32)");
    expect(visualMetrics.iconWidth).toBe(34);
    expect(visualMetrics.iconHeight).toBe(34);
    expect(visualMetrics.composerPointerEvents).toBe("none");
    expect(visualMetrics.regionPointerEvents).toBe("auto");

    mkdirSync(screenshotDirectory, { recursive: true });
    const weatherEvidenceStem = resolveNativeEvidenceStem(
      "weather-panel",
      process.platform,
      weatherGeometry.scale_factor,
    );
    await panel.saveScreenshot(
      join(screenshotDirectory, `${weatherEvidenceStem}.png`),
    );
    writeFileSync(
      join(screenshotDirectory, `${weatherEvidenceStem}-metrics.json`),
      `${JSON.stringify({ visualMetrics, weatherGeometry }, null, 2)}\n`,
      "utf8",
    );

    await $('button[aria-label="关闭双方天气"]').click();
    await expect(panel).not.toBeDisplayed();
    const restoredGeometry = await waitForWindowGeometry(petGeometry);
    expect(restoredGeometry.position).toEqual(petGeometry.position);
    expect(restoredGeometry.size).toEqual(petGeometry.size);

    const contextMenu = await openPetContextMenu();
    await contextMenu.$('button=设置').click();
    await expect($(settingsSelector)).toBeDisplayed();
    const profilePanel = await $(profileSelector);
    await expect(profilePanel).toBeDisplayed();
    await expect($('input[aria-label="昵称"]')).toHaveValue("小满");
    await expect($('input[aria-label="所在城市"]')).toHaveValue("杭州");
    const settingsGeometry = await invokeTauri<WindowState>("e2e_window_state");
    const settingsEvidenceStem = resolveNativeEvidenceStem(
      "basic-information-settings",
      process.platform,
      settingsGeometry.scale_factor,
    );
    await profilePanel.saveScreenshot(
      join(screenshotDirectory, `${settingsEvidenceStem}.png`),
    );

    const projectedPeerProfile = {
      nickname: "阿岚·已更新",
      cityName: "珠海",
      region: "广东",
      providerLocationId: 1_014_074,
      latitude: 22.271,
      longitude: 113.5767,
    };
    await setE2ePairWeatherOverride(
      createE2ePairWeatherFixture(projectedPeerProfile),
    );
    await $('button[aria-label="关闭设置"]').click();
    await expect($(settingsSelector)).not.toBeDisplayed();

    const projectedMenu = await openInteractionMenu();
    await projectedMenu.$('button=双方天气').click();
    const projectedPanel = await $(weatherPanelSelector);
    await expect(projectedPanel).toBeDisplayed();
    const projectedText = await projectedPanel.getText();
    expect(projectedText).toContain(projectedPeerProfile.nickname);
    expect(projectedText).toContain(projectedPeerProfile.cityName);
    expect(projectedText).not.toContain("深圳");
    await $('button[aria-label="关闭双方天气"]').click();
    await waitForWindowGeometry(petGeometry);
  });
});

async function writeE2eSettingsSafely(
  settings: Record<string, unknown>,
): Promise<void> {
  const paths = await invokeTauri<E2eAppDataPaths>("e2e_app_data_paths");
  assertDedicatedE2eAppDataPaths(paths, process.platform);
  await invokeTauri("write_settings", { settings });
}

async function assertReadyWeatherRow(
  selector: string,
  expectedFields: string[],
): Promise<void> {
  const row = await $(selector);
  await expect(row).toBeDisplayed();
  const rowText = await row.getText();
  for (const field of expectedFields) {
    expect(rowText).toContain(field);
  }
}

function createPairedWeatherSettings(
  existing: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...existing,
    autoMoveEnabled: false,
    clickThrough: false,
    profile: {
      local: {
        version: 1,
        nickname: "小满",
        city: {
          provider: "weatherapi",
          providerLocationId: 1_014_011,
          name: "杭州",
          region: "浙江",
          country: "中国",
          latitude: 30.2741,
          longitude: 120.1551,
        },
      },
      peerByDeviceId: {},
      syncState: "synced",
    },
    sync: {
      enabled: true,
      relayUrl: "https://relay.e2e.invalid",
      deviceId: "e2e-weather-self",
      deviceSecret: "e2e-weather-secret",
      pairId: "e2e-weather-pair",
      peerDeviceId: "e2e-weather-peer",
      activityStatus: null,
    },
  };
}

async function setConnectedE2eState(): Promise<void> {
  await setE2eRealtimeOverride({
    status: "connected",
    peerPresence: "online",
    peerActivityStatus: null,
    peerPresenceChangedAt: "2026-08-18T08:00:00.000Z",
    peerLastSeenAt: null,
    lastError: null,
  });
}

async function readWeatherVisualMetrics(): Promise<WeatherVisualMetrics> {
  return browser.execute(() => {
    function required(selector: string): HTMLElement {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) {
        throw new Error(`missing weather QA element: ${selector}`);
      }
      return element;
    }

    const panel = required('.weather-panel');
    const care = required('.weather-care-note');
    const rows = required('.weather-rows');
    const heading = required('.weather-heading-copy h1');
    const temperature = required('.weather-temperature');
    const icon = required('.weather-condition-icon');
    const composer = required('.composer-surface');
    const region = required('.weather-composer-region');
    const panelStyle = getComputedStyle(panel);
    const careStyle = getComputedStyle(care);
    const iconStyle = getComputedStyle(icon);
    const panelRect = panel.getBoundingClientRect();
    const iconRect = icon.getBoundingClientRect();

    return {
      panel: {
        backgroundColor: panelStyle.backgroundColor,
        borderRadius: panelStyle.borderRadius,
        borderTopColor: panelStyle.borderTopColor,
        borderTopWidth: panelStyle.borderTopWidth,
        color: panelStyle.color,
        height: panelRect.height,
        letterSpacing: panelStyle.letterSpacing,
        width: panelRect.width,
      },
      care: {
        backgroundColor: careStyle.backgroundColor,
        borderLeftColor: careStyle.borderLeftColor,
        borderLeftWidth: careStyle.borderLeftWidth,
      },
      composerPointerEvents: getComputedStyle(composer).pointerEvents,
      headingFontSize: getComputedStyle(heading).fontSize,
      iconColor: iconStyle.color,
      iconHeight: iconRect.height,
      iconWidth: iconRect.width,
      regionPointerEvents: getComputedStyle(region).pointerEvents,
      rowsBorderColor: getComputedStyle(rows).borderTopColor,
      temperatureFontSize: getComputedStyle(temperature).fontSize,
    };
  }) as Promise<WeatherVisualMetrics>;
}

async function waitForWindowGeometry(expected: WindowState): Promise<WindowState> {
  let latest = await invokeTauri<WindowState>("e2e_window_state");
  await browser.waitUntil(
    async () => {
      latest = await invokeTauri<WindowState>("e2e_window_state");
      return (
        latest.position.x === expected.position.x &&
        latest.position.y === expected.position.y &&
        latest.size.width === expected.size.width &&
        latest.size.height === expected.size.height
      );
    },
    {
      timeout: 10000,
      timeoutMsg: "weather composer did not restore the original pet geometry",
    },
  );
  return latest;
}
