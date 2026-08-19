import { $, browser, expect } from "@wdio/globals";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { openInteractionMenu } from "../../support/interactionMenu";
import {
  clearE2eRealtimeOverride,
  clearE2eSparkLeaderboardOverride,
  createE2eSparkLeaderboardFixture,
  setE2eRealtimeOverride,
  setE2eSparkLeaderboardOverride,
} from "../../support/realtimeOverride";
import {
  assertDedicatedE2eAppDataPaths,
  type E2eAppDataPaths,
} from "../support/env";
import { invokeTauri } from "../../support/tauri";

interface WindowState {
  scale_factor: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

const panelSelector = 'section[aria-label="全服火花榜"]';
const screenshotDirectory =
  process.env.INTEROP_SCREENSHOT_DIR ??
  resolve(process.cwd(), ".superpowers/visual-qa/spark-leaderboard/native");
let originalSettings: Record<string, unknown> | null = null;

describe("spark leaderboard native experience", () => {
  before(async () => {
    originalSettings = await invokeTauri<Record<string, unknown>>("read_settings");
    await writeE2eSettingsSafely(createPairedSparkSettings(originalSettings));
    await browser.refresh();
    await setE2eRealtimeOverride({
      status: "connected",
      peerPresence: "online",
      peerActivityStatus: null,
      peerPresenceChangedAt: "2026-08-19T08:00:00.000Z",
      peerLastSeenAt: null,
      lastError: null,
    });
  });

  after(async () => {
    await clearE2eSparkLeaderboardOverride();
    await clearE2eRealtimeOverride();
    if (originalSettings !== null) {
      await writeE2eSettingsSafely(originalSettings);
      await browser.refresh();
    }
  });

  it("captures deterministic loading, loaded, weekend, zero, and unavailable states", async () => {
    mkdirSync(screenshotDirectory, { recursive: true });
    const petGeometry = await invokeTauri<WindowState>("e2e_window_state");
    await setE2eSparkLeaderboardOverride(
      createE2eSparkLeaderboardFixture("loaded"),
    );
    const menu = await openInteractionMenu();
    const menuItems = await menu.$$('[role="menuitem"]');
    expect(menuItems).toHaveLength(6);
    await menuItems[3].click();

    const panel = await $(panelSelector);
    await expect(panel).toBeDisplayed();
    await expect($(".spark-panel-header")).toBeDisplayed();
    await setE2eSparkLeaderboardOverride({ status: "loading" });
    await expect($("[aria-label='火花榜加载中']")).toBeDisplayed();
    const sparkGeometry = await invokeTauri<WindowState>("e2e_window_state");
    expect(sparkGeometry.size.width).toBe(Math.round(460 * sparkGeometry.scale_factor));
    expect(sparkGeometry.size.height).toBe(Math.round(638 * sparkGeometry.scale_factor));
    await capture("spark-loading", sparkGeometry.scale_factor);

    await setE2eSparkLeaderboardOverride(
      createE2eSparkLeaderboardFixture("loaded"),
    );
    await expect(panel).toHaveText(expect.stringContaining("看看哪一对把心意守得最久"));
    await expect(panel).toHaveText(expect.stringContaining("小满 & 阿岚"));
    await expect(panel).toHaveText(expect.stringContaining("我的排名"));
    await expect(panel).toHaveText(expect.stringContaining("27"));
    await expect(panel).toHaveText(expect.stringContaining("28天"));
    expect(await $$(".spark-podium-entry")).toHaveLength(3);
    expect(await $$(".spark-ranking-row")).toHaveLength(5);
    await assertVisualContract();
    await capture("spark-loaded-28-day-rank-27", sparkGeometry.scale_factor);

    await setE2eSparkLeaderboardOverride(
      createE2eSparkLeaderboardFixture("weekend"),
    );
    await expect(panel).toHaveText(
      expect.stringContaining("周末休息，火花会替你们守到周一"),
    );
    await capture("spark-weekend", sparkGeometry.scale_factor);

    await setE2eSparkLeaderboardOverride(
      createE2eSparkLeaderboardFixture("zero"),
    );
    await expect(panel).toHaveText(expect.stringContaining("还没有上榜火花"));
    await expect(panel).toHaveText(expect.stringContaining("暂未上榜"));
    await capture("spark-zero-day", sparkGeometry.scale_factor);

    await setE2eSparkLeaderboardOverride({
      status: "failed",
      code: "relay_unavailable",
    });
    await expect(panel).toHaveText(expect.stringContaining("火花榜暂时不可用"));
    await capture("spark-server-unavailable", sparkGeometry.scale_factor);

    await $("button[aria-label='关闭火花榜']").click();
    await waitForWindowGeometry(petGeometry);
  });
});

async function assertVisualContract(): Promise<void> {
  const metrics = (await browser.execute(() => {
    const panel = document.querySelector<HTMLElement>(".spark-panel");
    const composer = document.querySelector<HTMLElement>(".composer-surface");
    const region = document.querySelector<HTMLElement>(".spark-composer-region");
    const self = document.querySelector<HTMLElement>(".spark-self-strip");
    const header = document.querySelector<HTMLElement>(".spark-panel-header");
    const firstPodiumContent = document.querySelector<HTMLElement>(
      ".spark-podium-entry:first-child .spark-podium-rank",
    );
    if (
      !panel ||
      !composer ||
      !region ||
      !self ||
      !header ||
      !firstPodiumContent
    ) {
      throw new Error("missing spark visual QA element");
    }
    const panelStyle = getComputedStyle(panel);
    const panelRect = panel.getBoundingClientRect();
    return {
      background: panelStyle.backgroundColor,
      borderColor: panelStyle.borderTopColor,
      borderRadius: panelStyle.borderRadius,
      borderWidth: panelStyle.borderTopWidth,
      color: panelStyle.color,
      height: panelRect.height,
      letterSpacing: panelStyle.letterSpacing,
      width: panelRect.width,
      composerPointerEvents: getComputedStyle(composer).pointerEvents,
      firstPodiumTop: firstPodiumContent.getBoundingClientRect().top,
      headerBottom: header.getBoundingClientRect().bottom,
      regionPointerEvents: getComputedStyle(region).pointerEvents,
      selfBackground: getComputedStyle(self).backgroundColor,
    };
  })) as Record<string, string | number>;
  if (
    Number(metrics.firstPodiumTop) < Number(metrics.headerBottom)
  ) {
    throw new Error(
      `spark podium overlaps header: ${metrics.firstPodiumTop} < ${metrics.headerBottom}`,
    );
  }
  expect(metrics).toMatchObject({
    background: "rgb(255, 254, 250)",
    borderColor: "rgb(23, 23, 23)",
    borderRadius: "7px",
    borderWidth: "1px",
    color: "rgb(23, 23, 23)",
    height: 600,
    letterSpacing: "normal",
    width: 424,
    composerPointerEvents: "none",
    regionPointerEvents: "auto",
    selfBackground: "rgb(23, 23, 23)",
  });
}

async function capture(name: string, scaleFactor: number): Promise<void> {
  const scale = Math.round(scaleFactor * 100);
  await browser.execute(
    () =>
      new Promise<void>((resolveFrame) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()));
      }),
  );
  await browser.pause(100);
  await browser.saveScreenshot(
    join(screenshotDirectory, `${name}-${process.platform}-${scale}.png`),
  );
}

function createPairedSparkSettings(
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
      deviceId: "e2e-spark-self",
      deviceSecret: "e2e-spark-secret",
      pairId: "e2e-spark-pair",
      peerDeviceId: "e2e-spark-peer",
      activityStatus: null,
    },
  };
}

async function writeE2eSettingsSafely(
  settings: Record<string, unknown>,
): Promise<void> {
  const paths = await invokeTauri<E2eAppDataPaths>("e2e_app_data_paths");
  assertDedicatedE2eAppDataPaths(paths);
  await invokeTauri("write_settings", { settings });
}

async function waitForWindowGeometry(expected: WindowState): Promise<void> {
  await browser.waitUntil(
    async () => {
      const current = await invokeTauri<WindowState>("e2e_window_state");
      return (
        current.position.x === expected.position.x &&
        current.position.y === expected.position.y &&
        current.size.width === expected.size.width &&
        current.size.height === expected.size.height
      );
    },
    { timeout: 10000, timeoutMsg: "spark composer did not restore pet geometry" },
  );
}
