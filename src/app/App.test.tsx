import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PET_ACTION_DURATION_MS,
  PET_ACTION_FPS,
  PET_FRAMES_PER_ACTION,
  REQUIRED_PET_ACTIONS,
  type ImportedPetPackageSummary,
} from "../assets/petPackageContract";
import type { StructuredMessageContent } from "../../shared/syncProtocol";
import type {
  DeviceProfileV1,
  ProfileUpdateV1,
} from "../../shared/profileProtocol";
import type { SparkStreakSnapshotV1 } from "../../shared/sparkProtocol";
import type {
  SparkLeaderboardState,
  SparkSnapshotState,
} from "../spark/useSparkStreak";
import { App } from "./App";

const frameAlphaBoundsMock = vi.hoisted(() => ({
  resolveFrameAlphaBounds: vi.fn(),
}));

const windowCommandsMock = vi.hoisted(() => ({
  openSettingsHandler: undefined as (() => void) | undefined,
  openSettingsUnlisten: vi.fn(),
  clickThroughRecoveredHandler: undefined as
    | ((payload: { reason: "show" | "settings" }) => void)
    | undefined,
  clickThroughRecoveredUnlisten: vi.fn(),
  windowHiddenHandler: undefined as (() => void) | undefined,
  activeWindowHiddenHandlers: new Set<() => void>(),
  windowHiddenUnlisten: vi.fn(),
  setInteractiveRegions: vi.fn().mockResolvedValue(undefined),
  moveWindowForAutoStep: vi.fn().mockResolvedValue(undefined),
  moveWindowForPointerDrag: vi.fn().mockResolvedValue(undefined),
  openMessageComposerSurface: vi.fn().mockResolvedValue(undefined),
  closeMessageComposerSurface: vi.fn().mockResolvedValue(undefined),
  readFocusTimer: vi.fn().mockResolvedValue(null),
  writeFocusTimer: vi.fn().mockResolvedValue(undefined),
  readSettings: vi.fn().mockResolvedValue({}),
  hideWindow: vi.fn().mockResolvedValue(undefined),
  quitApp: vi.fn().mockResolvedValue(undefined),
  resetWindowPosition: vi.fn().mockResolvedValue(undefined),
  restoreWindowFromEdgePeek: vi.fn().mockResolvedValue(undefined),
  dockWindowAtEdge: vi.fn().mockResolvedValue(undefined),
  setClickThrough: vi.fn().mockResolvedValue(undefined),
  snapWindowToEdgeIfNeeded: vi.fn().mockResolvedValue(null),
  writeSettings: vi.fn().mockResolvedValue(undefined),
}));

const realtimeSyncMock = vi.hoisted(() => {
  const mock = {
    callbacks: undefined as
      | {
          onMessage(message: {
            id: string;
            fromDeviceId: string;
            text: string;
            at: string;
            content?: StructuredMessageContent;
          }): void;
          onPeerProfile?(deviceId: string, profile: DeviceProfileV1): void;
          onSparkSnapshot?(snapshot: SparkStreakSnapshotV1): void;
        }
      | undefined,
    client: {
      setActivityStatus: vi.fn((_status: "slacking" | "dazing" | "overtime" | null) => ({
        synced: true,
      })),
      sendMessage: vi.fn(
        (): { ok: true; clientMessageId: string } | { ok: false; message: string } => ({
          ok: true,
          clientMessageId: "local_test",
        }),
      ),
    },
    state: {
      status: "disabled" as
        | "disabled"
        | "connecting"
        | "connected"
        | "disconnected"
        | "authFailed",
      peerPresence: "unknown" as "unknown" | "online" | "offline",
      peerActivityStatus: null as "slacking" | "dazing" | "overtime" | null,
      peerPresenceChangedAt: null as string | null,
      peerLastSeenAt: null as string | null,
      lastError: null as string | null,
    },
    useRealtimeSync: vi.fn(
      (
        _sync: unknown,
        callbacks: {
          onMessage(message: {
            id: string;
            fromDeviceId: string;
            text: string;
            at: string;
            content?: StructuredMessageContent;
          }): void;
          onPeerProfile?(deviceId: string, profile: DeviceProfileV1): void;
          onSparkSnapshot?(snapshot: SparkStreakSnapshotV1): void;
        },
      ) => {
        mock.callbacks = callbacks;
        return { state: mock.state, client: mock.client };
      },
    ),
  };

  return mock;
});

const pairWeatherHookMock = vi.hoisted(() => {
  const mock = {
    state: { status: "idle" as const },
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
    usePairWeather: vi.fn(),
  };

  mock.usePairWeather.mockImplementation(() => ({
    state: mock.state,
    open: mock.open,
    close: mock.close,
  }));

  return mock;
});

const sparkStreakHookMock = vi.hoisted(() => {
  const snapshot = {
    version: 1 as const,
    pairId: "pair_1",
    streakDays: 28,
    tier: "heartflame" as const,
    calendarState: "qualified_today" as const,
    lastQualifiedDate: "2026-08-19",
    timezone: "Asia/Shanghai" as const,
    asOf: "2026-08-19T08:00:00.000Z",
    refreshAt: "2026-08-19T16:00:00.000Z",
  };
  const mock = {
    snapshot,
    snapshotState: { status: "ready", snapshot } as SparkSnapshotState,
    leaderboardResponse: {
      version: 1 as const,
      snapshot,
      top20: [
        {
          rank: 1,
          displayNames: ["小满", "阿岚"] as [string, string],
          cities: ["杭州", "上海"] as [string, string],
          streakDays: 28,
          tier: "heartflame" as const,
        },
      ],
      self: {
        rank: 1,
        displayNames: ["小满", "阿岚"] as [string, string],
        cities: ["杭州", "上海"] as [string, string],
        streakDays: 28,
        tier: "heartflame" as const,
      },
      asOf: snapshot.asOf,
    },
    leaderboardState: { status: "loading" } as SparkLeaderboardState,
    acceptSnapshot: vi.fn(),
    refreshSnapshot: vi.fn().mockResolvedValue(undefined),
    requestLeaderboard: vi.fn().mockResolvedValue(undefined),
    clearLeaderboard: vi.fn(),
    useSparkStreak: vi.fn(),
  };
  mock.useSparkStreak.mockImplementation(() => ({
    snapshotState: mock.snapshotState,
    leaderboardState: mock.leaderboardState,
    acceptSnapshot: mock.acceptSnapshot,
    refreshSnapshot: mock.refreshSnapshot,
    requestLeaderboard: mock.requestLeaderboard,
    clearLeaderboard: mock.clearLeaderboard,
  }));
  return mock;
});

const relayHttpClientMock = vi.hoisted(() => {
  const mock = {
    acceptPairCode: vi.fn(),
    createPairCode: vi.fn(),
    getPairCodeStatus: vi.fn(),
    saveProfile: vi.fn(),
    searchLocations: vi.fn(),
    unpair: vi.fn(),
    constructor: vi.fn(function RelayHttpClientMock() {
      return {
        acceptPairCode: mock.acceptPairCode,
        createPairCode: mock.createPairCode,
        getPairCodeStatus: mock.getPairCodeStatus,
        saveProfile: mock.saveProfile,
        searchLocations: mock.searchLocations,
        unpair: mock.unpair,
      };
    }),
  };

  return mock;
});

const petPackageCommandsMock = vi.hoisted(() => ({
  listPetPackages: vi.fn().mockResolvedValue([]),
  importPetPackage: vi.fn(),
  deletePetPackage: vi.fn(),
  convertFileSrc: vi.fn((path: string) => `asset://${path}`),
}));

const dialogOpenMock = vi.hoisted(() => vi.fn());
const edgeFramePreloaderMock = vi.hoisted(() => ({
  preloadEdgeFrames: vi.fn().mockResolvedValue(undefined),
}));
const edgeInteractionHookSpy = vi.hoisted(() => ({
  requestExitThen: vi.fn(),
}));

vi.mock("../desktop/windowCommands", () => ({
  readSettings: windowCommandsMock.readSettings,
  writeSettings: windowCommandsMock.writeSettings,
  readFocusTimer: windowCommandsMock.readFocusTimer,
  writeFocusTimer: windowCommandsMock.writeFocusTimer,
  setAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
  setClickThrough: windowCommandsMock.setClickThrough,
  setInteractiveRegions: windowCommandsMock.setInteractiveRegions,
  resetWindowPosition: windowCommandsMock.resetWindowPosition,
  restoreWindowFromEdgePeek: windowCommandsMock.restoreWindowFromEdgePeek,
  dockWindowAtEdge: windowCommandsMock.dockWindowAtEdge,
  moveWindowForAutoStep: windowCommandsMock.moveWindowForAutoStep,
  moveWindowForPointerDrag: windowCommandsMock.moveWindowForPointerDrag,
  openMessageComposerSurface: windowCommandsMock.openMessageComposerSurface,
  closeMessageComposerSurface: windowCommandsMock.closeMessageComposerSurface,
  hideWindow: windowCommandsMock.hideWindow,
  quitApp: windowCommandsMock.quitApp,
  snapWindowToEdgeIfNeeded: windowCommandsMock.snapWindowToEdgeIfNeeded,
  listenForOpenSettings: vi.fn((handler: () => void) => {
    windowCommandsMock.openSettingsHandler = handler;
    return Promise.resolve(windowCommandsMock.openSettingsUnlisten);
  }),
  listenForClickThroughRecovered: vi.fn(
    (handler: (payload: { reason: "show" | "settings" }) => void) => {
      windowCommandsMock.clickThroughRecoveredHandler = handler;
      return Promise.resolve(windowCommandsMock.clickThroughRecoveredUnlisten);
    },
  ),
  listenForWindowHidden: vi.fn((handler: () => void) => {
    windowCommandsMock.windowHiddenHandler = handler;
    windowCommandsMock.activeWindowHiddenHandlers.add(handler);
    return Promise.resolve(() => {
      windowCommandsMock.activeWindowHiddenHandlers.delete(handler);
      if (windowCommandsMock.windowHiddenHandler === handler) {
        windowCommandsMock.windowHiddenHandler = undefined;
      }
      windowCommandsMock.windowHiddenUnlisten();
    });
  }),
}));

vi.mock("../sync/useRealtimeSync", () => ({
  useRealtimeSync: realtimeSyncMock.useRealtimeSync,
}));

vi.mock("../weather/usePairWeather", () => ({
  usePairWeather: pairWeatherHookMock.usePairWeather,
}));

vi.mock("../spark/useSparkStreak", () => ({
  useSparkStreak: sparkStreakHookMock.useSparkStreak,
}));

vi.mock("../sync/relayHttpClient", () => ({
  RelayHttpClient: relayHttpClientMock.constructor,
}));

vi.mock("../assets/petPackageCommands", () => ({
  createPetPackageCommands: vi.fn(() => petPackageCommandsMock),
}));

vi.mock("../pet/edgeFramePreloader", () => ({
  preloadEdgeFrames: edgeFramePreloaderMock.preloadEdgeFrames,
}));

vi.mock("../pet/useEdgeInteraction", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../pet/useEdgeInteraction")>();
  const { useCallback } = await import("react");

  return {
    ...actual,
    useEdgeInteraction: (
      options: Parameters<typeof actual.useEdgeInteraction>[0],
    ) => {
      const interaction = actual.useEdgeInteraction(options);
      const requestExitThen = useCallback(
        (callback: () => void) => {
          edgeInteractionHookSpy.requestExitThen(callback);
          interaction.requestExitThen(callback);
        },
        [interaction.requestExitThen],
      );

      return {
        ...interaction,
        requestExitThen,
      };
    },
  };
});

vi.mock("../renderer/frameAlphaBounds", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../renderer/frameAlphaBounds")>();

  return {
    ...actual,
    resolveFrameAlphaBounds: frameAlphaBoundsMock.resolveFrameAlphaBounds,
  };
});

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: dialogOpenMock,
}));

function importedPackageSummary(
  manifestId = "moon-buddy",
  name = "月亮伙伴",
): ImportedPetPackageSummary {
  const actions = importedActions();
  const framePaths = importedFramePaths(manifestId);

  return {
    id: `imported:${manifestId}`,
    manifestId,
    formatVersion: 2,
    renderer: "frame-sequence",
    name,
    baseSize: { width: 256, height: 320 },
    frameSize: { width: 768, height: 960 },
    previewPath: `C:/app/pet-packages/${manifestId}/preview.png`,
    portraitPath: null,
    offlinePortraitPath: null,
    actions,
    scenes: importedScenes(),
    framePaths,
    defaultMotion: "idle-breathe",
    motions: importedMotions(actions),
    motionFramePaths: framePaths,
  };
}

function importedActions(): ImportedPetPackageSummary["actions"] {
  return Object.fromEntries(
    REQUIRED_PET_ACTIONS.map((action) => [
      action,
      {
        fps: PET_ACTION_FPS,
        loop:
          action.startsWith("idle") ||
          action === "walk" ||
          action === "drag" ||
          action === "sleep",
        frameCount: PET_FRAMES_PER_ACTION,
        durationMs: PET_ACTION_DURATION_MS,
        frames: `frames/${action}/`,
      },
    ]),
  ) as ImportedPetPackageSummary["actions"];
}

function importedScenes(): ImportedPetPackageSummary["scenes"] {
  return {
    "act-hug": {
      action: "act-hug",
      bubbleCues: [{ atMs: 2000, text: "可以抱一下吗？" }],
      returnTo: "idle-breathe",
    },
    "remote-message": {
      action: "act-wave",
      bubbleCues: [{ atMs: 1000, source: "remoteMessage" }],
      waitForAcknowledge: true,
      returnTo: "idle-breathe",
    },
  };
}

function importedFramePaths(
  manifestId: string,
): ImportedPetPackageSummary["framePaths"] {
  const framePaths = {} as ImportedPetPackageSummary["framePaths"];

  for (const action of REQUIRED_PET_ACTIONS) {
    framePaths[action] = Array.from(
      { length: PET_FRAMES_PER_ACTION },
      (_, index) =>
        `C:/app/pet-packages/${manifestId}/frames/${action}/${String(
          index + 1,
        ).padStart(4, "0")}.png`,
    );
  }

  return framePaths;
}

function importedMotions(
  actions: ImportedPetPackageSummary["actions"],
): ImportedPetPackageSummary["motions"] {
  return Object.fromEntries(
    Object.entries(actions).map(([action, config]) => [
      action,
      {
        fps: config.fps,
        loop: config.loop,
        frameCount: config.frameCount,
        durationMs: config.durationMs,
        frames: config.frames,
        weight: action.startsWith("idle-") ? 2 : 1,
        tags: ["idle", "legacy-action", action],
      },
    ]),
  );
}

function motionPoolPackageSummary(
  overrides: Partial<ImportedPetPackageSummary> = {},
): ImportedPetPackageSummary {
  return {
    id: "imported:motion-buddy",
    manifestId: "motion-buddy",
    formatVersion: 3,
    renderer: "motion-pool",
    name: "动作池小人",
    baseSize: { width: 256, height: 320 },
    frameSize: { width: 768, height: 960 },
    previewPath: "C:/app/pet-packages/motion-buddy/preview.png",
    portraitPath: null,
    offlinePortraitPath: null,
    actions: {} as ImportedPetPackageSummary["actions"],
    scenes: {},
    framePaths: {} as ImportedPetPackageSummary["framePaths"],
    defaultMotion: "motion-001",
    motions: {
      "motion-001": {
        fps: 5,
        loop: true,
        frameCount: 2,
        durationMs: 1000,
        frames: "motions/motion-001/",
        weight: 1,
        tags: ["idle"],
      },
      "motion-002": {
        fps: 5,
        loop: true,
        frameCount: 2,
        durationMs: 1000,
        frames: "motions/motion-002/",
        weight: 1,
        tags: ["idle"],
      },
    },
    motionFramePaths: {
      "motion-001": [
        "C:/app/pet-packages/motion-buddy/motions/motion-001/0001.png",
        "C:/app/pet-packages/motion-buddy/motions/motion-001/0002.png",
      ],
      "motion-002": [
        "C:/app/pet-packages/motion-buddy/motions/motion-002/0001.png",
        "C:/app/pet-packages/motion-buddy/motions/motion-002/0002.png",
      ],
    },
    ...overrides,
  };
}

function clientRect(left: number, top: number, width: number, height: number) {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

function taggedMotionPoolPackage(
  tagsByMotionId: Record<string, string[]>,
): ImportedPetPackageSummary {
  const motions = Object.fromEntries(
    Object.entries(tagsByMotionId).map(([motionId, tags]) => [
      motionId,
      {
        fps: 5,
        loop: true,
        frameCount: 2,
        durationMs: 1000,
        frames: `motions/${motionId}/`,
        weight: 1,
        tags,
      },
    ]),
  ) as ImportedPetPackageSummary["motions"];
  const motionFramePaths = Object.fromEntries(
    Object.keys(tagsByMotionId).map((motionId) => [
      motionId,
      [
        `C:/app/pet-packages/motion-buddy/motions/${motionId}/0001.png`,
        `C:/app/pet-packages/motion-buddy/motions/${motionId}/0002.png`,
      ],
    ]),
  ) as ImportedPetPackageSummary["motionFramePaths"];

  return motionPoolPackageSummary({
    defaultMotion: "motion-001",
    motions,
    motionFramePaths,
  });
}

async function flushAppEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function openSettingsFromContextMenu() {
  await flushAppEffects();
  const surface = screen.getByRole("region", { name: "情侣桌宠 MVP" });

  await act(async () => {
    fireEvent.contextMenu(surface, { clientX: 48, clientY: 52 });
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("menuitem", { name: "设置" }));
  });

  expect(document.getElementById("settings-panel")?.className).toBe(
    "settings-dock",
  );
  expect(screen.getByRole("button", { name: "设置" })).toBeTruthy();
}

function pairedSyncSettings() {
  return {
    sync: {
      enabled: true,
      relayUrl: "http://159.75.175.47:8787",
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId: "pair_1",
      peerDeviceId: "dev_b",
    },
  };
}

const localProfile: ProfileUpdateV1 = {
  version: 1,
  nickname: "小满",
  city: {
    provider: "weatherapi",
    providerLocationId: 1,
    name: "杭州",
    region: "浙江",
    country: "中国",
    latitude: 30.2741,
    longitude: 120.1551,
  },
};

const peerProfile: DeviceProfileV1 = {
  version: 1,
  nickname: "阿岚",
  city: {
    provider: "weatherapi",
    providerLocationId: 2,
    name: "苏州",
    region: "江苏",
    country: "中国",
    latitude: 31.2989,
    longitude: 120.5853,
  },
  updatedAt: "2026-08-18T08:00:00.000Z",
};

function completeProfileSettings() {
  return {
    profile: {
      local: localProfile,
      peerByDeviceId: {},
      syncState: "synced",
    },
  };
}

function arrangeOnlinePair() {
  realtimeSyncMock.state.status = "connected";
  realtimeSyncMock.state.peerPresence = "online";
  windowCommandsMock.readSettings.mockResolvedValueOnce(pairedSyncSettings());
}

async function openFocusTimerFromInteractionMenu() {
  await flushAppEffects();
  fireEvent.click(screen.getByRole("img", { name: "Q 版小人" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "专注一下" }));
  await flushAppEffects();
  expect(screen.getByRole("region", { name: "专注计时" })).toBeTruthy();
}

async function openComposerFromInteractionMenu(
  menuItemName: "发消息" | "外卖到啦",
  regionName: "发送消息" | "送一份小心意",
  petName: "Q 版小人" | "动作池小人" = "Q 版小人",
) {
  await flushAppEffects();
  fireEvent.click(screen.getByRole("img", { name: petName }));
  fireEvent.click(screen.getByRole("menuitem", { name: menuItemName }));
  await flushAppEffects();
  expect(screen.getByRole("region", { name: regionName })).toBeTruthy();
}

async function openWeatherFromInteractionMenu() {
  await flushAppEffects();
  fireEvent.click(screen.getByRole("img", { name: "Q 版小人" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "双方天气" }));
  await flushAppEffects();
  return screen.getByRole("region", { name: "双方天气" });
}

async function openSparkFromInteractionMenu() {
  await flushAppEffects();
  fireEvent.click(screen.getByRole("img", { name: "Q 版小人" }));
  fireEvent.click(screen.getByRole("menuitem", { name: /续火花/u }));
  await flushAppEffects();
  return screen.getByRole("region", { name: "全服火花榜" });
}

function dispatchContextMenuOnPetSurface(): boolean {
  const surface = document.querySelector<HTMLElement>(".pet-surface");
  if (!surface) {
    throw new Error("pet surface not found");
  }
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: 48,
    clientY: 52,
  });

  return surface.dispatchEvent(event);
}

function emitRemoteSurprise() {
  act(() => {
    realtimeSyncMock.callbacks?.onMessage({
      id: "surprise_1",
      fromDeviceId: "dev_b",
      text: "一份小心意在等你。惊喜暗号：A-1024。是我不好。",
      at: "2026-08-12T10:00:00.000Z",
      content: {
        kind: "surprise",
        version: 1,
        theme: "apology",
        secret: "A-1024",
        note: "是我不好。",
      },
    });
  });
}

function emitRemoteText(id: string, text: string) {
  act(() => {
    realtimeSyncMock.callbacks?.onMessage({
      id,
      fromDeviceId: "dev_b",
      text,
      at: "2026-08-14T10:00:00.000Z",
    });
  });
}

async function clearDragClickSuppression() {
  if (vi.isFakeTimers()) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    return;
  }

  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function withViewport<T>(
  width: number,
  height: number,
  callback: () => Promise<T>,
): Promise<T> {
  const previousWidth = window.innerWidth;
  const previousHeight = window.innerHeight;

  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
  });

  try {
    return await callback();
  } finally {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: previousWidth,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: previousHeight,
    });
  }
}

function readPixelVariable(element: HTMLElement, variableName: string) {
  return Number.parseFloat(element.style.getPropertyValue(variableName));
}

async function advanceTypewriterText(text: string) {
  for (let index = 1; index < Array.from(text).length; index += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(35);
    });
  }
}

async function dragPetPastThresholdAndRelease(container: HTMLElement) {
  const petStage = container.querySelector(".pet-frame-stage");

  if (!petStage) {
    throw new Error("pet stage missing");
  }

  fireEvent.pointerDown(petStage, {
    pointerId: 1,
    clientX: 10,
    clientY: 10,
    screenX: 100,
    screenY: 200,
  });
  fireEvent.pointerMove(petStage, {
    pointerId: 1,
    clientX: 18,
    clientY: 10,
    screenX: 108,
    screenY: 200,
  });
  fireEvent.pointerUp(petStage, {
    pointerId: 1,
    clientX: 18,
    clientY: 10,
    screenX: 108,
    screenY: 200,
  });
  await flushAppEffects();
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

describe("App", () => {
  beforeEach(() => {
    frameAlphaBoundsMock.resolveFrameAlphaBounds.mockReset();
    frameAlphaBoundsMock.resolveFrameAlphaBounds.mockResolvedValue({
      x: 0,
      y: 0,
      width: 768,
      height: 960,
      imageWidth: 768,
      imageHeight: 960,
    });
  });

  afterEach(() => {
    windowCommandsMock.openSettingsHandler = undefined;
    windowCommandsMock.openSettingsUnlisten.mockClear();
    windowCommandsMock.clickThroughRecoveredHandler = undefined;
    windowCommandsMock.clickThroughRecoveredUnlisten.mockClear();
    windowCommandsMock.windowHiddenHandler = undefined;
    windowCommandsMock.activeWindowHiddenHandlers.clear();
    windowCommandsMock.windowHiddenUnlisten.mockClear();
    windowCommandsMock.setInteractiveRegions.mockClear();
    windowCommandsMock.moveWindowForAutoStep.mockClear();
    windowCommandsMock.moveWindowForPointerDrag.mockClear();
    windowCommandsMock.openMessageComposerSurface.mockClear();
    windowCommandsMock.closeMessageComposerSurface.mockClear();
    windowCommandsMock.readFocusTimer.mockReset();
    windowCommandsMock.readFocusTimer.mockResolvedValue(null);
    windowCommandsMock.writeFocusTimer.mockClear();
    windowCommandsMock.readSettings.mockReset();
    windowCommandsMock.readSettings.mockResolvedValue({});
    windowCommandsMock.hideWindow.mockClear();
    windowCommandsMock.quitApp.mockClear();
    windowCommandsMock.resetWindowPosition.mockClear();
    windowCommandsMock.restoreWindowFromEdgePeek.mockClear();
    windowCommandsMock.dockWindowAtEdge.mockReset();
    windowCommandsMock.dockWindowAtEdge.mockResolvedValue(undefined);
    windowCommandsMock.setClickThrough.mockClear();
    windowCommandsMock.snapWindowToEdgeIfNeeded.mockReset();
    windowCommandsMock.snapWindowToEdgeIfNeeded.mockResolvedValue(null);
    windowCommandsMock.writeSettings.mockClear();
    realtimeSyncMock.callbacks = undefined;
    realtimeSyncMock.client.setActivityStatus.mockClear();
    realtimeSyncMock.client.sendMessage.mockReset();
    realtimeSyncMock.client.sendMessage.mockImplementation(
      ():
        | { ok: true; clientMessageId: string }
        | { ok: false; message: string } => ({
        ok: true,
        clientMessageId: "local_test",
      }),
    );
    realtimeSyncMock.state.status = "disabled";
    realtimeSyncMock.state.peerPresence = "unknown";
    realtimeSyncMock.state.peerActivityStatus = null;
    realtimeSyncMock.state.peerPresenceChangedAt = null;
    realtimeSyncMock.state.peerLastSeenAt = null;
    realtimeSyncMock.state.lastError = null;
    realtimeSyncMock.useRealtimeSync.mockClear();
    pairWeatherHookMock.open.mockReset();
    pairWeatherHookMock.open.mockResolvedValue(undefined);
    pairWeatherHookMock.close.mockClear();
    pairWeatherHookMock.usePairWeather.mockClear();
    sparkStreakHookMock.acceptSnapshot.mockClear();
    sparkStreakHookMock.refreshSnapshot.mockClear();
    sparkStreakHookMock.requestLeaderboard.mockClear();
    sparkStreakHookMock.clearLeaderboard.mockClear();
    sparkStreakHookMock.useSparkStreak.mockClear();
    sparkStreakHookMock.snapshotState = {
      status: "ready",
      snapshot: sparkStreakHookMock.snapshot,
    };
    sparkStreakHookMock.leaderboardState = { status: "loading" };
    relayHttpClientMock.acceptPairCode.mockReset();
    relayHttpClientMock.createPairCode.mockReset();
    relayHttpClientMock.getPairCodeStatus.mockReset();
    relayHttpClientMock.saveProfile.mockReset();
    relayHttpClientMock.saveProfile.mockImplementation(
      async ({ profile }: { profile: ProfileUpdateV1 }) => ({
        ok: true,
        profile: {
          ...profile,
          updatedAt: "2026-08-18T08:00:00.000Z",
        },
      }),
    );
    relayHttpClientMock.searchLocations.mockReset();
    relayHttpClientMock.unpair.mockReset();
    relayHttpClientMock.constructor.mockClear();
    petPackageCommandsMock.listPetPackages.mockReset();
    petPackageCommandsMock.listPetPackages.mockResolvedValue([]);
    petPackageCommandsMock.importPetPackage.mockReset();
    petPackageCommandsMock.deletePetPackage.mockReset();
    petPackageCommandsMock.convertFileSrc.mockReset();
    petPackageCommandsMock.convertFileSrc.mockImplementation(
      (path: string) => `asset://${path}`,
    );
    edgeFramePreloaderMock.preloadEdgeFrames.mockReset();
    edgeFramePreloaderMock.preloadEdgeFrames.mockResolvedValue(undefined);
    edgeInteractionHookSpy.requestExitThen.mockClear();
    dialogOpenMock.mockReset();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("renders the desktop pet shell", async () => {
    render(<App />);

    expect(
      await screen.findByRole("region", { name: "情侣桌宠 MVP" }),
    ).toBeTruthy();
    expect(screen.getByRole("img", { name: "Q 版小人" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "设置" })).toBeNull();
  });

  it("publishes the pet stage as a desktop interactive hit region", async () => {
    frameAlphaBoundsMock.resolveFrameAlphaBounds.mockResolvedValue({
      x: 192,
      y: 96,
      width: 384,
      height: 768,
      imageWidth: 768,
      imageHeight: 960,
    });
    const rectSpy = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function getBoundingClientRectMock(this: Element) {
        if (
          this instanceof Element &&
          this.classList.contains("pet-alpha-hit-region")
        ) {
          return clientRect(104, 56, 128, 256);
        }

        return clientRect(0, 0, 0, 0);
      });

    try {
      render(<App />);

      await waitFor(() =>
        expect(windowCommandsMock.setInteractiveRegions).toHaveBeenCalledWith(
          [{ x: 104, y: 56, width: 128, height: 256 }],
          expect.any(Number),
        ),
      );
      expect(
        document
          .querySelector(".pet-frame-stage")
          ?.hasAttribute("data-desktop-interactive-region"),
      ).toBe(false);
    } finally {
      rectSpy.mockRestore();
    }
  });

  it("falls back to the built-in pet package when selected imported package is missing", async () => {
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      appearance: {
        selectedPetPackageId: "imported:missing",
        peerPetPackageByDeviceId: {},
      },
    });
    render(<App />);

    expect(await screen.findByRole("img", { name: "Q 版小人" })).toBeTruthy();
  });

  it("renders an imported v3 package from its default motion frames", async () => {
    const motionPackage = motionPoolPackageSummary();
    petPackageCommandsMock.listPetPackages.mockResolvedValueOnce([motionPackage]);
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      appearance: {
        selectedPetPackageId: motionPackage.id,
        peerPetPackageByDeviceId: {},
      },
    });
    render(<App />);

    await flushAppEffects();
    const frameImage = screen.getByRole("img", { name: "动作池小人" });
    const stage = frameImage.closest("[data-motion-id]");

    expect(stage?.getAttribute("data-action")).toBe("idle-breathe");
    expect(stage?.getAttribute("data-motion-id")).toBe("motion-001");
    expect(frameImage.getAttribute("src")).toContain(
      "motions/motion-001/0001.png",
    );
  });

  it("does not render the settings toggle by default", async () => {
    render(<App />);

    await screen.findByRole("region", { name: "情侣桌宠 MVP" });
    expect(screen.queryByRole("button", { name: "设置" })).toBeNull();
  });

  it("does not reveal the settings button through shell hover or focus", async () => {
    const { container } = render(<App />);

    const shell = container.querySelector(".app-shell");

    if (!shell) {
      throw new Error("app shell missing");
    }

    fireEvent.mouseOver(shell);
    fireEvent.focus(shell);

    expect(screen.queryByRole("button", { name: "设置" })).toBeNull();
  });

  it("opens interaction options when clicking the pet", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("img", { name: "Q 版小人" }));

    expect(screen.getByRole("menu", { name: "互动选项" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "双方天气" })).toBeTruthy();
  });

  it("renders message and surprise function menu items", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("img", { name: "Q 版小人" }));

    expect(screen.getByRole("menuitem", { name: "发消息" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "外卖到啦" })).toBeTruthy();
    expect(screen.getAllByRole("menuitem")).toHaveLength(6);
    expect(screen.queryByRole("menuitem", { name: "敲电脑" })).toBeNull();
  });

  it("opens interaction options with one left click on the pet stage", async () => {
    const { container } = render(<App />);
    await screen.findByRole("img", { name: "Q 版小人" });
    const petStage = container.querySelector(".pet-frame-stage");

    if (!petStage) {
      throw new Error("pet stage missing");
    }

    fireEvent.pointerDown(petStage, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
      screenX: 100,
      screenY: 100,
    });
    fireEvent.pointerUp(petStage, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
      screenX: 100,
      screenY: 100,
    });
    fireEvent.click(petStage);

    expect(screen.getByRole("menu", { name: "互动选项" })).toBeTruthy();
  });

  it("keeps every radial interaction button inside a 320 by 360 window", async () => {
    await withViewport(320, 360, async () => {
      const { container } = render(<App />);
      await screen.findByRole("img", { name: "Q 版小人" });
      const petStage = container.querySelector(".pet-frame-stage");

      if (!petStage) {
        throw new Error("pet stage missing");
      }

      fireEvent.pointerDown(petStage, {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        screenX: 100,
        screenY: 100,
      });
      fireEvent.pointerUp(petStage, {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        screenX: 100,
        screenY: 100,
      });
      fireEvent.click(petStage);

      const menu = screen.getByRole("menu", { name: "互动选项" });
      const centerX = Number.parseFloat(menu.style.left);
      const centerY = Number.parseFloat(menu.style.top);
      const halfButtonWidth = 34;
      const halfButtonHeight = 31;

      expect(centerX).toBe(160);
      expect(centerY).toBe(208);

      for (const button of screen.getAllByRole("menuitem") as HTMLElement[]) {
        const offsetX = readPixelVariable(button, "--menu-x");
        const offsetY = readPixelVariable(button, "--menu-y");

        expect(centerX + offsetX - halfButtonWidth).toBeGreaterThanOrEqual(0);
        expect(centerX + offsetX + halfButtonWidth).toBeLessThanOrEqual(320);
        expect(centerY + offsetY - halfButtonHeight).toBeGreaterThanOrEqual(0);
        expect(centerY + offsetY + halfButtonHeight).toBeLessThanOrEqual(360);
      }
    });
  });

  it("shows a pet bubble instead of opening the message composer when unpaired", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("img", { name: "Q 版小人" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "发消息" }));

    expect(windowCommandsMock.openMessageComposerSurface).not.toHaveBeenCalled();
    expect(document.querySelector(".bubble-layer")?.textContent).toBe("对");
  });

  it("shows a pet bubble instead of opening the message composer when the peer is offline", async () => {
    realtimeSyncMock.state.status = "connected";
    realtimeSyncMock.state.peerPresence = "offline";
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    fireEvent.click(await screen.findByRole("img", { name: "Q 版小人" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "发消息" }));

    expect(windowCommandsMock.openMessageComposerSurface).not.toHaveBeenCalled();
    expect(document.querySelector(".bubble-layer")?.textContent).toBe("对");
  });

  it("opens the message composer from the message button when the peer is online", async () => {
    realtimeSyncMock.state.status = "connected";
    realtimeSyncMock.state.peerPresence = "online";
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await openComposerFromInteractionMenu("发消息", "发送消息");

    expect(windowCommandsMock.openMessageComposerSurface).toHaveBeenCalledTimes(1);
    expect(windowCommandsMock.openMessageComposerSurface).toHaveBeenCalledWith(
      "message",
    );
    expect(screen.getByRole("region", { name: "发送消息" })).toBeTruthy();
    expect(screen.getByLabelText("消息内容")).toBeTruthy();
  });

  it("opens the weather surface while unpaired without requesting Relay weather", async () => {
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      ...completeProfileSettings(),
      clickThrough: true,
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: null,
        peerDeviceId: null,
      },
    });
    render(<App />);
    await flushAppEffects();
    const clickThroughCallCount =
      windowCommandsMock.setClickThrough.mock.calls.length;
    fireEvent.click(screen.getByRole("img", { name: "Q 版小人" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "双方天气" }));
    await flushAppEffects();
    const panel = screen.getByRole("region", { name: "双方天气" });

    expect(windowCommandsMock.openMessageComposerSurface).toHaveBeenCalledWith(
      "weather",
    );
    expect(screen.getByText("还没有可以一起看天气的 TA")).toBeTruthy();
    expect(pairWeatherHookMock.open).not.toHaveBeenCalled();
    expect(windowCommandsMock.setClickThrough).toHaveBeenCalledTimes(
      clickThroughCallCount,
    );
    expect(panel.closest(".composer-surface")).toBeTruthy();
  });

  it("opens spark while unpaired without dispatching a pet action", async () => {
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: null,
        peerDeviceId: null,
      },
    });
    render(<App />);
    const panel = await openSparkFromInteractionMenu();

    expect(windowCommandsMock.openMessageComposerSurface).toHaveBeenCalledWith(
      "spark",
    );
    expect(screen.getByText("和 TA 绑定后，一起把火花续起来")).toBeTruthy();
    expect(sparkStreakHookMock.requestLeaderboard).toHaveBeenCalledTimes(1);
    expect(panel.closest(".composer-surface")).toBeTruthy();
    expect(
      document
        .querySelector(".pet-frame-stage")
        ?.getAttribute("data-action"),
    ).not.toBe("act-hug");
  });

  it("projects a retained failed snapshot into the menu as unavailable known days", async () => {
    sparkStreakHookMock.snapshotState = {
      status: "failed",
      code: "relay_unavailable",
      snapshot: sparkStreakHookMock.snapshot,
    };
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      ...completeProfileSettings(),
      ...pairedSyncSettings(),
    });
    render(<App />);
    await flushAppEffects();

    fireEvent.click(screen.getByRole("img", { name: "Q 版小人" }));
    const sparkButton = screen.getByRole("menuitem", {
      name: "续火花，上次连续 28 天，数据暂不可用",
    });

    expect(sparkButton.textContent).toBe("28天");
    expect(sparkButton.getAttribute("data-spark-availability")).toBe(
      "unavailable",
    );
  });

  it("does not show a previous pair snapshot or leaderboard while the new pair loads", async () => {
    sparkStreakHookMock.snapshotState = {
      status: "ready",
      snapshot: sparkStreakHookMock.snapshot,
    };
    sparkStreakHookMock.leaderboardState = {
      status: "ready",
      response: sparkStreakHookMock.leaderboardResponse,
    };
    const settings = {
      ...completeProfileSettings(),
      ...pairedSyncSettings(),
      sync: {
        ...pairedSyncSettings().sync,
        pairId: "pair_2",
        peerDeviceId: "dev_c",
      },
    };
    windowCommandsMock.readSettings.mockResolvedValueOnce(settings);
    render(<App />);
    await flushAppEffects();

    fireEvent.click(screen.getByRole("img", { name: "Q 版小人" }));
    const sparkButton = screen.getByRole("menuitem", {
      name: "续火花，连续天数加载中",
    });
    expect(sparkButton.textContent).toBe("--天");

    fireEvent.click(sparkButton);
    const panel = await screen.findByRole("region", { name: "全服火花榜" });
    expect(panel.querySelector(".spark-loading-state")).toBeTruthy();
    expect(within(panel).queryByText("小满")).toBeNull();
    expect(within(panel).queryByText("杭州")).toBeNull();
    expect(within(panel).queryByText("28天")).toBeNull();
  });

  it("opens only spark, requests once, and restores the pet surface on close", async () => {
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      ...completeProfileSettings(),
      ...pairedSyncSettings(),
    });
    render(<App />);
    await openSparkFromInteractionMenu();

    expect(sparkStreakHookMock.requestLeaderboard).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region", { name: "双方天气" })).toBeNull();
    expect(screen.queryByRole("region", { name: "发送消息" })).toBeNull();
    expect(screen.queryByRole("region", { name: "送一份小心意" })).toBeNull();
    expect(screen.queryByRole("region", { name: "专注计时" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "关闭火花榜" }));
    await waitFor(() =>
      expect(windowCommandsMock.closeMessageComposerSurface).toHaveBeenCalledTimes(1),
    );
    expect(sparkStreakHookMock.clearLeaderboard).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "全服火花榜" })).toBeNull(),
    );
    expect(screen.getByRole("region", { name: "情侣桌宠 MVP" })).toBeTruthy();
  });

  it("forwards realtime spark snapshots without rebuilding the realtime client", async () => {
    render(<App />);
    await flushAppEffects();
    const callbacks = realtimeSyncMock.callbacks;
    const callCountBeforeSnapshot =
      realtimeSyncMock.useRealtimeSync.mock.calls.length;

    act(() => callbacks?.onSparkSnapshot?.(sparkStreakHookMock.snapshot));

    expect(sparkStreakHookMock.acceptSnapshot).toHaveBeenCalledWith(
      sparkStreakHookMock.snapshot,
    );
    expect(realtimeSyncMock.useRealtimeSync).toHaveBeenCalledTimes(
      callCountBeforeSnapshot,
    );
    expect(realtimeSyncMock.callbacks).toBe(callbacks);
  });

  it("requests pair weather exactly once on open with complete credentials even when the peer is offline", async () => {
    realtimeSyncMock.state.status = "connected";
    realtimeSyncMock.state.peerPresence = "offline";
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      ...completeProfileSettings(),
      ...pairedSyncSettings(),
    });
    render(<App />);

    await openWeatherFromInteractionMenu();

    expect(windowCommandsMock.openMessageComposerSurface).toHaveBeenCalledWith(
      "weather",
    );
    expect(pairWeatherHookMock.open).toHaveBeenCalledTimes(1);
    expect(pairWeatherHookMock.open).toHaveBeenCalledWith({
      relayUrl: "http://159.75.175.47:8787",
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId: "pair_1",
    });
    expect(screen.getByLabelText("天气加载中")).toBeTruthy();
  });

  it("keeps weather gutters transparent and reports only the fixed panel region as interactive", async () => {
    const panelRect = clientRect(18, 19, 424, 466);
    const rectSpy = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function getBoundingClientRectMock(this: Element) {
        return this.classList.contains("weather-composer-region")
          ? panelRect
          : clientRect(0, 0, 0, 0);
      });

    try {
      windowCommandsMock.readSettings.mockResolvedValueOnce({
        ...completeProfileSettings(),
        ...pairedSyncSettings(),
      });
      render(<App />);
      const panel = await openWeatherFromInteractionMenu();
      const region = panel.parentElement;
      const surface = panel.closest(".composer-surface");

      expect(surface?.hasAttribute("data-desktop-interactive-region")).toBe(
        false,
      );
      expect(panel.hasAttribute("data-desktop-interactive-region")).toBe(false);
      expect(region?.classList.contains("weather-composer-region")).toBe(true);
      expect(region?.hasAttribute("data-desktop-interactive-region")).toBe(true);
      expect(region?.style.width).toBe("424px");
      expect(region?.style.height).toBe("466px");
      const appCss = readFileSync(
        join(process.cwd(), "src", "app", "app.css"),
        "utf8",
      );
      expect(appCss).toMatch(
        /\.composer-surface\s*\{[^}]*pointer-events:\s*none;/s,
      );
      expect(appCss).toMatch(
        /\.weather-composer-region\s*\{[^}]*pointer-events:\s*auto;/s,
      );

      windowCommandsMock.setInteractiveRegions.mockClear();
      act(() => window.dispatchEvent(new Event("resize")));

      await waitFor(() =>
        expect(windowCommandsMock.setInteractiveRegions).toHaveBeenCalledWith(
          [{ x: 18, y: 19, width: 424, height: 466 }],
          expect.any(Number),
        ),
      );
    } finally {
      rectSpy.mockRestore();
    }
  });

  it("closes weather with Escape through the shared native geometry restore path", async () => {
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      ...completeProfileSettings(),
      ...pairedSyncSettings(),
    });
    render(<App />);
    await openWeatherFromInteractionMenu();

    fireEvent.keyDown(document.body, { key: "Escape" });

    await waitFor(() =>
      expect(windowCommandsMock.closeMessageComposerSurface).toHaveBeenCalledTimes(
        1,
      ),
    );
    expect(pairWeatherHookMock.close).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "双方天气" })).toBeNull(),
    );
  });

  it("accepts only one weather open while the native surface is pending", async () => {
    const opening = createDeferred<void>();
    windowCommandsMock.openMessageComposerSurface.mockReturnValueOnce(
      opening.promise,
    );
    windowCommandsMock.readSettings.mockResolvedValueOnce(pairedSyncSettings());
    render(<App />);

    await flushAppEffects();
    fireEvent.click(screen.getByRole("img", { name: "Q 版小人" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "双方天气" }));
    fireEvent.click(screen.getByRole("img", { name: "Q 版小人" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "双方天气" }));

    expect(windowCommandsMock.openMessageComposerSurface).toHaveBeenCalledTimes(
      1,
    );
    expect(pairWeatherHookMock.open).not.toHaveBeenCalled();

    await act(async () => {
      opening.resolve();
      await opening.promise;
    });

    expect(await screen.findByRole("region", { name: "双方天气" })).toBeTruthy();
    expect(pairWeatherHookMock.open).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending weather open and restores native geometry before tray settings", async () => {
    const opening = createDeferred<void>();
    const closing = createDeferred<void>();
    windowCommandsMock.openMessageComposerSurface.mockReturnValueOnce(
      opening.promise,
    );
    windowCommandsMock.closeMessageComposerSurface.mockReturnValueOnce(
      closing.promise,
    );
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      ...completeProfileSettings(),
      ...pairedSyncSettings(),
    });
    render(<App />);
    await waitFor(() => expect(windowCommandsMock.openSettingsHandler).toBeTruthy());

    await flushAppEffects();
    fireEvent.click(screen.getByRole("img", { name: "Q 版小人" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "双方天气" }));
    act(() => windowCommandsMock.openSettingsHandler?.());

    expect(document.getElementById("settings-panel")?.className).toBe(
      "settings-dock is-hidden",
    );

    await act(async () => {
      opening.resolve();
      await opening.promise;
    });

    await waitFor(() =>
      expect(windowCommandsMock.closeMessageComposerSurface).toHaveBeenCalledTimes(
        1,
      ),
    );
    expect(pairWeatherHookMock.open).not.toHaveBeenCalled();
    expect(document.getElementById("settings-panel")?.className).toBe(
      "settings-dock is-hidden",
    );

    await act(async () => {
      closing.resolve();
      await closing.promise;
    });

    expect(await screen.findByRole("region", { name: "桌宠设置" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "双方天气" })).toBeNull();
  });

  it.each([
    {
      name: "binding",
      command: "进入绑定设置",
      settings: {
        ...completeProfileSettings(),
        clickThrough: true,
        sync: {
          enabled: true,
          relayUrl: "http://159.75.175.47:8787",
          deviceId: "dev_a",
          deviceSecret: "secret_a",
          pairId: null,
          peerDeviceId: null,
        },
      },
    },
    {
      name: "basic information",
      command: "进入基本信息设置",
      settings: {
        clickThrough: true,
        ...pairedSyncSettings(),
      },
    },
  ])(
    "restores pet geometry before the weather $name action opens settings",
    async ({ command, settings }) => {
      const closing = createDeferred<void>();
      windowCommandsMock.closeMessageComposerSurface.mockReturnValueOnce(
        closing.promise,
      );
      windowCommandsMock.readSettings.mockResolvedValueOnce(settings);
      render(<App />);
      await openWeatherFromInteractionMenu();
      windowCommandsMock.setClickThrough.mockClear();

      fireEvent.click(screen.getByRole("button", { name: command }));

      expect(pairWeatherHookMock.close).not.toHaveBeenCalled();
      expect(windowCommandsMock.closeMessageComposerSurface).toHaveBeenCalledTimes(
        1,
      );
      expect(
        document
          .getElementById("settings-panel")
          ?.classList.contains("is-hidden"),
      ).toBe(true);
      expect(windowCommandsMock.setClickThrough).not.toHaveBeenCalled();

      await act(async () => {
        closing.resolve();
        await closing.promise;
      });

      expect(await screen.findByRole("region", { name: "桌宠设置" })).toBeTruthy();
      expect(
        document
          .getElementById("settings-panel")
          ?.classList.contains("is-hidden"),
      ).toBe(false);
      expect(windowCommandsMock.setClickThrough).toHaveBeenCalledWith(false);
      expect(windowCommandsMock.writeSettings).not.toHaveBeenCalled();
      expect(pairWeatherHookMock.close).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps weather open and blocks settings when native geometry restoration fails", async () => {
    windowCommandsMock.closeMessageComposerSurface.mockRejectedValueOnce(
      new Error("restore failed"),
    );
    windowCommandsMock.readSettings.mockResolvedValueOnce(pairedSyncSettings());
    render(<App />);
    await openWeatherFromInteractionMenu();

    fireEvent.click(
      screen.getByRole("button", { name: "进入基本信息设置" }),
    );

    await waitFor(() =>
      expect(windowCommandsMock.closeMessageComposerSurface).toHaveBeenCalledTimes(
        1,
      ),
    );
    expect(document.getElementById("settings-panel")?.className).toBe(
      "settings-dock is-hidden",
    );
    expect(screen.getByRole("region", { name: "双方天气" })).toBeTruthy();
    expect(pairWeatherHookMock.close).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "进入基本信息设置" }),
    );

    expect(await screen.findByRole("region", { name: "桌宠设置" })).toBeTruthy();
    expect(windowCommandsMock.closeMessageComposerSurface).toHaveBeenCalledTimes(
      2,
    );
    expect(pairWeatherHookMock.close).toHaveBeenCalledTimes(1);
  });

  it("opens the local focus timer while unpaired without realtime calls", async () => {
    render(<App />);

    await openFocusTimerFromInteractionMenu();

    expect(windowCommandsMock.openMessageComposerSurface).toHaveBeenCalledWith(
      "focus",
    );
    expect(realtimeSyncMock.client.sendMessage).not.toHaveBeenCalled();
    expect(screen.getByRole("timer").textContent).toBe("25:00");
  });

  it("starts a focus timer, restores the pet surface, and exposes compact controls", async () => {
    render(<App />);
    await openFocusTimerFromInteractionMenu();

    fireEvent.click(screen.getByRole("button", { name: "15分钟" }));
    fireEvent.click(screen.getByRole("button", { name: "开始专注" }));
    await flushAppEffects();

    expect(windowCommandsMock.writeFocusTimer).toHaveBeenCalledWith(
      expect.objectContaining({ status: "running", durationMinutes: 15 }),
    );
    expect(windowCommandsMock.closeMessageComposerSurface).toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "打开专注计时控制" }),
    ).toBeTruthy();
    expect(realtimeSyncMock.client.sendMessage).not.toHaveBeenCalled();
  });

  it("waits for the native surface before showing the message composer", async () => {
    const opening = createDeferred<void>();
    arrangeOnlinePair();
    windowCommandsMock.openMessageComposerSurface.mockReturnValueOnce(
      opening.promise,
    );
    render(<App />);

    await flushAppEffects();
    fireEvent.click(screen.getByRole("img", { name: "Q 版小人" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "发消息" }));

    expect(windowCommandsMock.openMessageComposerSurface).toHaveBeenCalledWith(
      "message",
    );
    expect(screen.queryByRole("region", { name: "发送消息" })).toBeNull();

    await act(async () => {
      opening.resolve();
      await opening.promise;
    });

    expect(
      await screen.findByRole("region", { name: "发送消息" }),
    ).toBeTruthy();
  });

  it("keeps the composer closed when the native surface fails to open", async () => {
    arrangeOnlinePair();
    windowCommandsMock.openMessageComposerSurface.mockRejectedValueOnce(
      new Error("native surface unavailable"),
    );
    render(<App />);

    fireEvent.click(await screen.findByRole("img", { name: "Q 版小人" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "发消息" }));
    await flushAppEffects();

    expect(windowCommandsMock.openMessageComposerSurface).toHaveBeenCalledWith(
      "message",
    );
    expect(screen.queryByRole("region", { name: "发送消息" })).toBeNull();
    expect(document.querySelector(".composer-surface")).toBeNull();
  });

  it("limits composer hover and focus styles to enabled controls", () => {
    const appCss = readFileSync(
      join(process.cwd(), "src", "app", "app.css"),
      "utf8",
    );

    expect(appCss).toContain(".composer-action:not(:disabled):hover");
    expect(appCss).toContain(".composer-action:not(:disabled):focus-visible");
    expect(appCss).toContain(".composer-choice:not(:disabled):hover");
    expect(appCss).toContain(".composer-choice:not(:disabled):focus-visible");
    expect(appCss).toContain('.composer-choice[aria-pressed="true"]');
    expect(appCss).not.toContain(".composer-action:hover");
    expect(appCss).not.toContain(".composer-action:focus-visible");
    expect(appCss).not.toContain(".composer-choice:hover");
    expect(appCss).not.toContain(".composer-choice:focus-visible");
  });

  it.each([
    ["发消息", "发送消息"],
    ["外卖到啦", "送一份小心意"],
  ] as const)(
    "renders the %s composer beside the hidden pet surface with card-scoped hit testing",
    async (menuItemName, regionName) => {
      arrangeOnlinePair();
      render(<App />);

      await openComposerFromInteractionMenu(menuItemName, regionName);

      const appShell = document.querySelector(".app-shell");
      const petSurface = document.querySelector(".pet-surface");
      const composerRegion = screen.getByRole("region", { name: regionName });
      const composerSurface = composerRegion.closest(".composer-surface");
      const composerCard = composerRegion.querySelector(".composer-card-shell");

      expect(appShell).toBeTruthy();
      expect(petSurface?.parentElement).toBe(appShell);
      expect(composerSurface?.parentElement).toBe(appShell);
      expect(petSurface?.contains(composerRegion)).toBe(false);
      expect(petSurface?.classList.contains("composer-active")).toBe(true);
      expect(petSurface?.getAttribute("aria-hidden")).toBe("true");
      expect(
        composerSurface?.hasAttribute("data-desktop-interactive-region"),
      ).toBe(false);
      expect(
        composerRegion.hasAttribute("data-desktop-interactive-region"),
      ).toBe(false);
      expect(
        composerCard?.hasAttribute("data-desktop-interactive-region"),
      ).toBe(true);
    },
  );

  it("reports the complete surprise card hit region at the current device scale", async () => {
    const cardRect = clientRect(22, 18, 396, 420);
    const submitRect = clientRect(266, 388, 132, 30);
    const originalDevicePixelRatio = Object.getOwnPropertyDescriptor(
      window,
      "devicePixelRatio",
    );
    const rectSpy = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function getBoundingClientRectMock(this: Element) {
        if (this.classList.contains("composer-card-shell")) {
          return cardRect;
        }

        if (
          this instanceof HTMLButtonElement &&
          this.textContent?.trim() === "送出这份心意"
        ) {
          return submitRect;
        }

        return clientRect(0, 0, 0, 0);
      });

    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 1.5,
    });

    try {
      arrangeOnlinePair();
      render(<App />);
      await openComposerFromInteractionMenu("外卖到啦", "送一份小心意");
      windowCommandsMock.setInteractiveRegions.mockClear();

      act(() => window.dispatchEvent(new Event("resize")));

      await waitFor(() =>
        expect(windowCommandsMock.setInteractiveRegions).toHaveBeenCalledWith(
          [
            {
              x: cardRect.left,
              y: cardRect.top,
              width: cardRect.width,
              height: cardRect.height,
            },
          ],
          1.5,
        ),
      );

      expect(cardRect.width).toBeGreaterThan(0);
      expect(cardRect.height).toBeGreaterThan(0);
      expect(submitRect.left).toBeGreaterThanOrEqual(cardRect.left);
      expect(submitRect.top).toBeGreaterThanOrEqual(cardRect.top);
      expect(submitRect.right).toBeLessThanOrEqual(cardRect.right);
      expect(submitRect.bottom).toBeLessThanOrEqual(cardRect.bottom);
    } finally {
      rectSpy.mockRestore();

      if (originalDevicePixelRatio) {
        Object.defineProperty(
          window,
          "devicePixelRatio",
          originalDevicePixelRatio,
        );
      } else {
        Reflect.deleteProperty(window, "devicePixelRatio");
      }
    }
  });

  it("opens the surprise composer from the surprise button when the peer is online", async () => {
    realtimeSyncMock.state.status = "connected";
    realtimeSyncMock.state.peerPresence = "online";
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await flushAppEffects();
    expect(screen.getByLabelText("对方状态")).toBeTruthy();

    await openComposerFromInteractionMenu("外卖到啦", "送一份小心意");

    expect(windowCommandsMock.openMessageComposerSurface).toHaveBeenCalledTimes(1);
    expect(windowCommandsMock.openMessageComposerSurface).toHaveBeenCalledWith(
      "surprise",
    );
    expect(screen.queryByRole("menu", { name: "互动选项" })).toBeNull();
    expect(screen.queryByRole("region", { name: "发送消息" })).toBeNull();
    expect(screen.getByRole("region", { name: "送一份小心意" })).toBeTruthy();
    expect(screen.getByLabelText("惊喜暗号")).toBeTruthy();
    expect(screen.queryByLabelText("对方状态")).toBeNull();
  });

  it("uses the message offline bubble for surprise without entering a pet action", async () => {
    vi.useFakeTimers();
    render(<App />);
    await flushAppEffects();

    const petImage = screen.getByRole("img", { name: "Q 版小人" });
    const stage = petImage.closest("[data-action]");

    fireEvent.click(petImage);
    fireEvent.click(screen.getByRole("menuitem", { name: "外卖到啦" }));

    expect(windowCommandsMock.openMessageComposerSurface).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "发送消息" })).toBeNull();
    expect(stage?.getAttribute("data-action")).toBe("idle-breathe");

    await advanceTypewriterText("对方在线后再发消息吧。");

    expect(document.querySelector(".bubble-layer")?.textContent).toBe(
      "对方在线后再发消息吧。",
    );
  });

  it("clears the availability bubble before opening the surprise composer", async () => {
    vi.useFakeTimers();
    realtimeSyncMock.state.status = "connected";
    realtimeSyncMock.state.peerPresence = "offline";
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await flushAppEffects();
    fireEvent.click(screen.getByRole("img", { name: "Q 版小人" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "外卖到啦" }));
    await advanceTypewriterText("对方在线后再发消息吧。");
    expect(document.querySelector(".bubble-layer")?.textContent).toBe(
      "对方在线后再发消息吧。",
    );

    realtimeSyncMock.state.peerPresence = "online";
    await openComposerFromInteractionMenu("外卖到啦", "送一份小心意");

    expect(screen.getByRole("region", { name: "送一份小心意" })).toBeTruthy();
    expect(screen.queryByRole("menu", { name: "互动选项" })).toBeNull();
    expect(document.querySelector(".bubble-layer")).toBeNull();
  });

  it("sends surprise content with fallback text and records the local session message", async () => {
    const motionPackage = motionPoolPackageSummary({
      motions: {
        "motion-001": {
          fps: 5,
          loop: true,
          frameCount: 2,
          durationMs: 6000,
          frames: "motions/motion-001/",
          weight: 1,
          tags: ["idle"],
        },
        "motion-message": {
          fps: 5,
          loop: true,
          frameCount: 2,
          durationMs: 6000,
          frames: "motions/motion-message/",
          weight: 1,
          tags: ["message"],
        },
        "motion-surprise": {
          fps: 5,
          loop: true,
          frameCount: 2,
          durationMs: 6000,
          frames: "motions/motion-surprise/",
          weight: 1,
          tags: ["surprise"],
        },
      },
      motionFramePaths: {
        "motion-001": [
          "C:/app/pet-packages/motion-buddy/motions/motion-001/0001.png",
          "C:/app/pet-packages/motion-buddy/motions/motion-001/0002.png",
        ],
        "motion-message": [
          "C:/app/pet-packages/motion-buddy/motions/motion-message/0001.png",
          "C:/app/pet-packages/motion-buddy/motions/motion-message/0002.png",
        ],
        "motion-surprise": [
          "C:/app/pet-packages/motion-buddy/motions/motion-surprise/0001.png",
          "C:/app/pet-packages/motion-buddy/motions/motion-surprise/0002.png",
        ],
      },
    });
    realtimeSyncMock.state.status = "connected";
    realtimeSyncMock.state.peerPresence = "online";
    petPackageCommandsMock.listPetPackages.mockResolvedValueOnce([motionPackage]);
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      appearance: {
        selectedPetPackageId: motionPackage.id,
        peerPetPackageByDeviceId: {},
      },
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await flushAppEffects();
    await openComposerFromInteractionMenu(
      "外卖到啦",
      "送一份小心意",
      "动作池小人",
    );
    fireEvent.click(screen.getByRole("button", { name: "想说抱歉" }));
    fireEvent.change(screen.getByLabelText("惊喜暗号"), {
      target: { value: " A-1024 " },
    });
    fireEvent.change(screen.getByLabelText("想对 TA 说"), {
      target: { value: "是我不好。" },
    });

    const expectedContent = {
      kind: "surprise",
      version: 1,
      theme: "apology",
      secret: "A-1024",
      note: "是我不好。",
    } as const;
    const expectedFallback =
      "一份小心意在等你。惊喜暗号：A-1024。是我不好。";

    fireEvent.click(screen.getByRole("button", { name: "送出这份心意" }));

    expect(realtimeSyncMock.client.sendMessage).toHaveBeenCalledWith(
      expectedFallback,
      expectedContent,
    );
    await waitFor(() =>
      expect(windowCommandsMock.closeMessageComposerSurface).toHaveBeenCalledTimes(
        1,
      ),
    );
    expect(screen.queryByRole("region", { name: "送一份小心意" })).toBeNull();
    expect(document.querySelector(".bubble-layer")?.textContent).not.toMatch(
      /外卖|订单|配送|取件码|取餐/,
    );
    expect(
      screen
        .getByRole("img", { name: "动作池小人" })
        .closest("[data-motion-id]")
        ?.getAttribute("data-motion-id"),
    ).toBe("motion-surprise");

    await openSettingsFromContextMenu();
    expect(screen.getByText(expectedFallback)).toBeTruthy();
  });

  it("keeps the surprise composer open with values when sending fails", async () => {
    realtimeSyncMock.state.status = "connected";
    realtimeSyncMock.state.peerPresence = "online";
    realtimeSyncMock.client.sendMessage.mockReturnValueOnce({
      ok: false,
      message: "发送失败",
    });
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await openComposerFromInteractionMenu("外卖到啦", "送一份小心意");
    fireEvent.click(screen.getByRole("button", { name: "想说抱歉" }));
    fireEvent.change(screen.getByLabelText("惊喜暗号"), {
      target: { value: "A-1024" },
    });
    fireEvent.change(screen.getByLabelText("想对 TA 说"), {
      target: { value: "是我不好。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "送出这份心意" }));

    expect(realtimeSyncMock.client.sendMessage).toHaveBeenCalledWith(
      "一份小心意在等你。惊喜暗号：A-1024。是我不好。",
      {
        kind: "surprise",
        version: 1,
        theme: "apology",
        secret: "A-1024",
        note: "是我不好。",
      },
    );
    await waitFor(() => expect(screen.getByText("发送失败")).toBeTruthy());
    expect(windowCommandsMock.closeMessageComposerSurface).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "送一份小心意" })).toBeTruthy();
    expect((screen.getByLabelText("惊喜暗号") as HTMLInputElement).value).toBe(
      "A-1024",
    );
    expect((screen.getByLabelText("想对 TA 说") as HTMLTextAreaElement).value).toBe(
      "是我不好。",
    );
  });

  it("renders an embedded peer status tag with the selected peer portrait", async () => {
    realtimeSyncMock.state.status = "connected";
    realtimeSyncMock.state.peerPresence = "online";
    realtimeSyncMock.state.peerActivityStatus = "slacking";
    const peerPackage = {
      ...importedPackageSummary("moon-buddy", "月亮伙伴"),
      portraitPath: "C:/app/pet-packages/moon-buddy/portrait.png",
      offlinePortraitPath:
        "C:/app/pet-packages/moon-buddy/portrait-offline.png",
    };
    petPackageCommandsMock.listPetPackages.mockResolvedValueOnce([peerPackage]);
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      appearance: {
        selectedPetPackageId: "builtin:q-girl",
        peerPetPackageByDeviceId: {
          dev_b: peerPackage.id,
        },
      },
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    const { container } = render(<App />);

    await flushAppEffects();

    const card = await screen.findByLabelText("对方状态");
    expect(card.getAttribute("data-status-variant")).toBe("slacking");
    expect(container.querySelector(".pet-frame-stage")?.contains(card)).toBe(true);
    expect(card.className).toContain("peer-presence-tag");
    expect(screen.getByText("TA摸鱼中")).toBeTruthy();
    expect(screen.queryByText("偷偷歇一会")).toBeNull();
    expect(screen.getByRole("img", { name: "对方头像" }).getAttribute("src")).toBe(
      "asset://C:/app/pet-packages/moon-buddy/portrait.png",
    );
    expect(screen.queryByLabelText("对方在线状态")).toBeNull();
  });

  it("keeps the peer presence tag inside the scaled pet stage", async () => {
    realtimeSyncMock.state.status = "connected";
    realtimeSyncMock.state.peerPresence = "online";
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      scale: 1.45,
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    const { container } = render(<App />);

    await flushAppEffects();

    const petStage = container.querySelector(".pet-frame-stage") as HTMLElement | null;
    const presenceBubble = await screen.findByLabelText("对方状态");

    expect(petStage?.contains(presenceBubble)).toBe(true);
    expect(petStage?.style.getPropertyValue("--pet-scale")).toBe("1.45");
  });

  it("renders an offline peer status card with the offline portrait first", async () => {
    realtimeSyncMock.state.status = "connected";
    realtimeSyncMock.state.peerPresence = "offline";
    const peerPackage = {
      ...importedPackageSummary("moon-buddy", "月亮伙伴"),
      portraitPath: "C:/app/pet-packages/moon-buddy/portrait.png",
      offlinePortraitPath:
        "C:/app/pet-packages/moon-buddy/portrait-offline.png",
    };
    petPackageCommandsMock.listPetPackages.mockResolvedValueOnce([peerPackage]);
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      appearance: {
        selectedPetPackageId: "builtin:q-girl",
        peerPetPackageByDeviceId: {
          dev_b: peerPackage.id,
        },
      },
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await flushAppEffects();

    const card = await screen.findByLabelText("对方状态");
    expect(card.getAttribute("data-status-variant")).toBe("offline");
    expect(screen.getByText("TA离线")).toBeTruthy();
    const offlinePortrait = screen.getByRole("img", { name: "对方头像" });
    expect(offlinePortrait.getAttribute("src")).toBe(
      "asset://C:/app/pet-packages/moon-buddy/portrait-offline.png",
    );

    fireEvent.error(offlinePortrait);
    const portrait = screen.getByRole("img", { name: "对方头像" });
    expect(portrait.getAttribute("src")).toBe(
      "asset://C:/app/pet-packages/moon-buddy/portrait.png",
    );

    fireEvent.error(portrait);
    const preview = screen.getByRole("img", { name: "对方头像" });
    expect(preview.getAttribute("src")).toBe(
      "asset://C:/app/pet-packages/moon-buddy/preview.png",
    );

    fireEvent.error(preview);
    const motionFallback = screen.getByRole("img", { name: "对方头像" });
    expect(motionFallback.getAttribute("src")).toContain(
      "frames/idle-breathe/0001.png",
    );

    fireEvent.error(motionFallback);
    const generatedFallback = screen.getByRole("img", { name: "对方头像" });
    expect(generatedFallback.getAttribute("src")).toMatch(/peer-avatar\.png$/);
    expect(screen.queryByText("TA")).toBeNull();
  });

  it("uses online peer image candidates without the offline portrait", async () => {
    realtimeSyncMock.state.status = "connected";
    realtimeSyncMock.state.peerPresence = "online";
    const peerPackage = {
      ...importedPackageSummary("moon-buddy", "月亮伙伴"),
      portraitPath: "C:/app/pet-packages/moon-buddy/portrait.png",
      offlinePortraitPath:
        "C:/app/pet-packages/moon-buddy/portrait-offline.png",
    };
    petPackageCommandsMock.listPetPackages.mockResolvedValueOnce([peerPackage]);
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      appearance: {
        selectedPetPackageId: "builtin:q-girl",
        peerPetPackageByDeviceId: {
          dev_b: peerPackage.id,
        },
      },
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await flushAppEffects();

    const portrait = await screen.findByRole("img", { name: "对方头像" });
    expect(portrait.getAttribute("src")).toBe(
      "asset://C:/app/pet-packages/moon-buddy/portrait.png",
    );

    fireEvent.error(portrait);
    const preview = screen.getByRole("img", { name: "对方头像" });
    expect(preview.getAttribute("src")).toBe(
      "asset://C:/app/pet-packages/moon-buddy/preview.png",
    );

    fireEvent.error(preview);
    const motionFallback = screen.getByRole("img", { name: "对方头像" });
    expect(motionFallback.getAttribute("src")).toContain(
      "frames/idle-breathe/0001.png",
    );
    expect(motionFallback.getAttribute("src")).not.toContain(
      "portrait-offline.png",
    );

    fireEvent.error(motionFallback);
    const generatedFallback = screen.getByRole("img", { name: "对方头像" });
    expect(generatedFallback.getAttribute("src")).toMatch(/peer-avatar\.png$/);
    expect(screen.queryByText("TA")).toBeNull();
  });

  it("does not show the peer status card when unpaired", async () => {
    realtimeSyncMock.state.status = "connected";
    realtimeSyncMock.state.peerPresence = "online";
    realtimeSyncMock.state.peerActivityStatus = "slacking";
    render(<App />);

    await flushAppEffects();

    expect(screen.queryByLabelText("对方状态")).toBeNull();
  });

  it("hides the peer status card while transient surfaces own the main window", async () => {
    vi.useFakeTimers();
    realtimeSyncMock.state.status = "connected";
    realtimeSyncMock.state.peerPresence = "online";
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await flushAppEffects();
    expect(screen.getByLabelText("对方状态")).toBeTruthy();

    await openSettingsFromContextMenu();
    expect(screen.queryByLabelText("对方状态")).toBeNull();
    fireEvent.click(screen.getByLabelText("关闭设置"));
    await flushAppEffects();
    expect(screen.getByLabelText("对方状态")).toBeTruthy();

    fireEvent.click(screen.getByRole("img", { name: "Q 版小人" }));
    expect(screen.getByRole("menu", { name: "互动选项" })).toBeTruthy();
    expect(screen.queryByLabelText("对方状态")).toBeNull();

    const statusMenuItem = screen.getByRole("menuitem", { name: "我的状态" });
    statusMenuItem.focus();
    fireEvent.click(statusMenuItem);
    expect(screen.getByRole("dialog", { name: "我的状态" })).toBeTruthy();
    expect(screen.queryByLabelText("对方状态")).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    await flushAppEffects();
    expect(screen.getByLabelText("对方状态")).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("region", { name: "情侣桌宠 MVP" }),
    );

    fireEvent.click(screen.getByRole("img", { name: "Q 版小人" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "发消息" }));
    await flushAppEffects();
    expect(screen.getByRole("region", { name: "发送消息" })).toBeTruthy();
    expect(screen.queryByLabelText("对方状态")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    await flushAppEffects();
    expect(screen.getByLabelText("对方状态")).toBeTruthy();

    fireEvent.click(screen.getByRole("img", { name: "Q 版小人" }));
    expect(screen.getByRole("menu", { name: "互动选项" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "外卖到啦" }));
    await flushAppEffects();
    expect(screen.getByRole("region", { name: "送一份小心意" })).toBeTruthy();
    expect(screen.queryByRole("menu", { name: "互动选项" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "我的状态" })).toBeNull();
    expect(screen.queryByLabelText("对方状态")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    await flushAppEffects();
    expect(screen.getByLabelText("对方状态")).toBeTruthy();

    act(() => {
      realtimeSyncMock.callbacks?.onMessage({
        id: "msg_1",
        fromDeviceId: "dev_b",
        text: "我来啦",
        at: "2026-08-06T08:00:00.000Z",
      });
    });
    await flushAppEffects();
    expect(screen.getByLabelText("对方桌宠消息")).toBeTruthy();
    expect(screen.queryByLabelText("对方状态")).toBeNull();
    fireEvent.pointerEnter(screen.getByLabelText("对方桌宠消息"));
    await flushAppEffects();
    act(() => vi.advanceTimersByTime(800));
    await flushAppEffects();
    expect(screen.queryByLabelText("对方桌宠消息")).toBeNull();
    expect(screen.getByLabelText("对方状态")).toBeTruthy();

    windowCommandsMock.snapWindowToEdgeIfNeeded.mockResolvedValueOnce("left");
    await dragPetPastThresholdAndRelease(screen.getByRole("region", { name: "情侣桌宠 MVP" }));
    expect(screen.queryByLabelText("对方状态")).toBeNull();
  });

  it.each([
    ["发消息", "发送消息"],
    ["外卖到啦", "送一份小心意"],
  ] as const)(
    "ignores right-click context menu while the %s composer owns the surface",
    async (menuItemName, regionName) => {
      arrangeOnlinePair();
      render(<App />);

      await openComposerFromInteractionMenu(menuItemName, regionName);
      windowCommandsMock.closeMessageComposerSurface.mockClear();

      const wasNotPrevented = dispatchContextMenuOnPetSurface();

      expect(wasNotPrevented).toBe(false);
      expect(screen.queryByRole("menu", { name: "桌宠菜单" })).toBeNull();
      expect(screen.getByRole("region", { name: regionName })).toBeTruthy();
      expect(windowCommandsMock.closeMessageComposerSurface).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["发消息", "发送消息"],
    ["外卖到啦", "送一份小心意"],
  ] as const)(
    "ignores desktop settings events while the %s composer owns the surface",
    async (menuItemName, regionName) => {
      arrangeOnlinePair();
      render(<App />);
      await waitFor(() => expect(windowCommandsMock.openSettingsHandler).toBeTruthy());

      await openComposerFromInteractionMenu(menuItemName, regionName);
      windowCommandsMock.closeMessageComposerSurface.mockClear();

      act(() => {
        windowCommandsMock.openSettingsHandler?.();
      });
      await flushAppEffects();

      expect(document.getElementById("settings-panel")?.className).toBe(
        "settings-dock is-hidden",
      );
      expect(screen.getByRole("region", { name: regionName })).toBeTruthy();
      expect(windowCommandsMock.closeMessageComposerSurface).not.toHaveBeenCalled();
    },
  );

  it("keeps a received surprise queued while tray Settings temporarily hides its layer", async () => {
    arrangeOnlinePair();
    render(<App />);
    await waitFor(() => expect(windowCommandsMock.openSettingsHandler).toBeTruthy());
    await flushAppEffects();

    emitRemoteSurprise();
    await flushAppEffects();

    expect(screen.getByLabelText("对方小心意消息")).toBeTruthy();
    expect(screen.queryByText("A-1024")).toBeNull();

    expect(dispatchContextMenuOnPetSurface()).toBe(false);
    act(() => {
      windowCommandsMock.openSettingsHandler?.();
    });
    fireEvent.click(screen.getByRole("img", { name: "Q 版小人" }));
    await flushAppEffects();

    expect(screen.queryByRole("menu", { name: "桌宠菜单" })).toBeNull();
    expect(screen.queryByRole("menu", { name: "互动选项" })).toBeNull();
    expect(document.getElementById("settings-panel")?.className).toBe(
      "settings-dock",
    );
    expect(screen.queryByLabelText("对方小心意消息")).toBeNull();
    expect(screen.queryByText("A-1024")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "关闭设置" }));
    expect(screen.getByLabelText("对方小心意消息")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /轻轻点开看看/ }));
    await flushAppEffects();
    expect(screen.getByText("A-1024")).toBeTruthy();
    expect(screen.getByText("是我不好。")).toBeTruthy();

    expect(dispatchContextMenuOnPetSurface()).toBe(false);
    act(() => {
      windowCommandsMock.openSettingsHandler?.();
    });
    await flushAppEffects();

    expect(screen.queryByRole("menu", { name: "桌宠菜单" })).toBeNull();
    expect(screen.queryByRole("menu", { name: "互动选项" })).toBeNull();
    expect(document.getElementById("settings-panel")?.className).toBe(
      "settings-dock",
    );
    expect(screen.queryByText("A-1024")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "关闭设置" }));
    expect(screen.getByText("A-1024")).toBeTruthy();
    expect(screen.getByLabelText("对方小心意消息").className).not.toContain(
      "is-dismissing",
    );

    fireEvent.click(screen.getByRole("button", { name: "我收下啦" }));
    await flushAppEffects();
    expect(screen.getByLabelText("对方小心意消息").className).toContain(
      "is-dismissing",
    );
  });

  it("opens permitted settings by clearing existing menu, status picker and bubble owners", async () => {
    render(<App />);
    await waitFor(() => expect(windowCommandsMock.openSettingsHandler).toBeTruthy());

    fireEvent.click(await screen.findByRole("img", { name: "Q 版小人" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "发消息" }));
    expect(document.querySelector(".bubble-layer")).toBeTruthy();
    fireEvent.click(screen.getByRole("img", { name: "Q 版小人" }));
    expect(screen.getByRole("menu", { name: "互动选项" })).toBeTruthy();

    act(() => {
      windowCommandsMock.openSettingsHandler?.();
    });
    await flushAppEffects();

    expect(document.getElementById("settings-panel")?.className).toBe(
      "settings-dock",
    );
    expect(screen.queryByRole("menu", { name: "互动选项" })).toBeNull();
    expect(document.querySelector(".bubble-layer")).toBeNull();

    fireEvent.click(screen.getByLabelText("关闭设置"));
    await flushAppEffects();
    fireEvent.click(screen.getByRole("img", { name: "Q 版小人" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "我的状态" }));
    expect(screen.getByRole("dialog", { name: "我的状态" })).toBeTruthy();

    act(() => {
      windowCommandsMock.openSettingsHandler?.();
    });
    await flushAppEffects();

    expect(document.getElementById("settings-panel")?.className).toBe(
      "settings-dock",
    );
    expect(screen.queryByRole("dialog", { name: "我的状态" })).toBeNull();

    fireEvent.click(screen.getByLabelText("关闭设置"));
    await flushAppEffects();
    fireEvent.contextMenu(screen.getByRole("region", { name: "情侣桌宠 MVP" }), {
      clientX: 48,
      clientY: 52,
    });
    expect(screen.getByRole("menu", { name: "桌宠菜单" })).toBeTruthy();

    act(() => {
      windowCommandsMock.openSettingsHandler?.();
    });
    await flushAppEffects();

    expect(document.getElementById("settings-panel")?.className).toBe(
      "settings-dock",
    );
    expect(screen.queryByRole("menu", { name: "桌宠菜单" })).toBeNull();
    expect(screen.queryByRole("menu", { name: "互动选项" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "我的状态" })).toBeNull();
  });

  it("closes the status picker before opening the right-click settings menu", async () => {
    realtimeSyncMock.state.status = "connected";
    realtimeSyncMock.state.peerPresence = "online";
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await flushAppEffects();

    fireEvent.click(screen.getByRole("img", { name: "Q 版小人" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "我的状态" }));
    expect(screen.getByRole("dialog", { name: "我的状态" })).toBeTruthy();

    const surface = screen.getByRole("region", { name: "情侣桌宠 MVP" });
    fireEvent.contextMenu(surface, { clientX: 48, clientY: 52 });

    expect(screen.queryByRole("dialog", { name: "我的状态" })).toBeNull();
    const settingsItem = screen.getByRole("menuitem", { name: "设置" });
    expect(settingsItem).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(settingsItem));

    fireEvent.click(settingsItem);
    expect(document.getElementById("settings-panel")?.className).toBe(
      "settings-dock",
    );
  });

  it("persists and syncs the selected local activity status", async () => {
    realtimeSyncMock.state.status = "connected";
    realtimeSyncMock.state.peerPresence = "online";
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await flushAppEffects();

    fireEvent.click(screen.getByRole("img", { name: "Q 版小人" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "我的状态" }));
    fireEvent.click(screen.getByRole("button", { name: "发呆中" }));

    expect(realtimeSyncMock.client.setActivityStatus).toHaveBeenCalledWith(
      "dazing",
    );
    await waitFor(() =>
      expect(windowCommandsMock.writeSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          sync: expect.objectContaining({ activityStatus: "dazing" }),
        }),
      ),
    );
    expect(screen.queryByRole("dialog", { name: "我的状态" })).toBeNull();
  });

  it("saves a disconnected activity status and explains it will sync later", async () => {
    vi.useFakeTimers();
    realtimeSyncMock.state.status = "disconnected";
    realtimeSyncMock.state.peerPresence = "online";
    realtimeSyncMock.client.setActivityStatus.mockReturnValueOnce({
      synced: false,
    });
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await flushAppEffects();

    fireEvent.click(screen.getByRole("img", { name: "Q 版小人" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "我的状态" }));
    fireEvent.click(screen.getByRole("button", { name: "加班中" }));

    expect(realtimeSyncMock.client.setActivityStatus).toHaveBeenCalledWith(
      "overtime",
    );
    await flushAppEffects();
    expect(windowCommandsMock.writeSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        sync: expect.objectContaining({ activityStatus: "overtime" }),
      }),
    );
    await advanceTypewriterText("状态已保存，连接后会同步。");
    expect(document.querySelector(".bubble-layer")?.textContent).toBe(
      "状态已保存，连接后会同步。",
    );
  });

  it("sends composer panel text through the realtime client and restores the pet surface", async () => {
    realtimeSyncMock.state.status = "connected";
    realtimeSyncMock.state.peerPresence = "online";
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await openComposerFromInteractionMenu("发消息", "发送消息");
    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: { value: "  晚安  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(realtimeSyncMock.client.sendMessage).toHaveBeenCalledWith("晚安");
    await waitFor(() =>
      expect(windowCommandsMock.closeMessageComposerSurface).toHaveBeenCalledTimes(
        1,
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "发送消息" })).toBeNull(),
    );
  });

  it("plays the local message tagged motion after sending a composer message", async () => {
    const motionPackage = motionPoolPackageSummary({
      motions: {
        "motion-001": {
          fps: 5,
          loop: true,
          frameCount: 2,
          durationMs: 6000,
          frames: "motions/motion-001/",
          weight: 1,
          tags: ["idle"],
        },
        "motion-message": {
          fps: 5,
          loop: true,
          frameCount: 2,
          durationMs: 6000,
          frames: "motions/motion-message/",
          weight: 1,
          tags: ["message"],
        },
      },
      motionFramePaths: {
        "motion-001": [
          "C:/app/pet-packages/motion-buddy/motions/motion-001/0001.png",
          "C:/app/pet-packages/motion-buddy/motions/motion-001/0002.png",
        ],
        "motion-message": [
          "C:/app/pet-packages/motion-buddy/motions/motion-message/0001.png",
          "C:/app/pet-packages/motion-buddy/motions/motion-message/0002.png",
        ],
      },
    });
    realtimeSyncMock.state.status = "connected";
    realtimeSyncMock.state.peerPresence = "online";
    petPackageCommandsMock.listPetPackages.mockResolvedValueOnce([motionPackage]);
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      appearance: {
        selectedPetPackageId: motionPackage.id,
        peerPetPackageByDeviceId: {},
      },
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await flushAppEffects();
    expect(
      screen
        .getByRole("img", { name: "动作池小人" })
        .closest("[data-motion-id]")
        ?.getAttribute("data-motion-id"),
    ).toBe("motion-001");

    await openComposerFromInteractionMenu(
      "发消息",
      "发送消息",
      "动作池小人",
    );
    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: { value: "晚安" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(realtimeSyncMock.client.sendMessage).toHaveBeenCalledWith("晚安");
    await waitFor(() =>
      expect(
        screen
          .getByRole("img", { name: "动作池小人" })
          .closest("[data-motion-id]")
          ?.getAttribute("data-motion-id"),
      ).toBe("motion-message"),
    );
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "发送消息" })).toBeNull(),
    );
  });

  it("keeps the composer panel open when sending fails", async () => {
    realtimeSyncMock.state.status = "connected";
    realtimeSyncMock.state.peerPresence = "online";
    realtimeSyncMock.client.sendMessage.mockReturnValueOnce({
      ok: false,
      message: "发送失败",
    });
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await openComposerFromInteractionMenu("发消息", "发送消息");
    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: { value: "晚安" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(realtimeSyncMock.client.sendMessage).toHaveBeenCalledWith("晚安");
    await waitFor(() => expect(screen.getByText("发送失败")).toBeTruthy());
    expect(windowCommandsMock.closeMessageComposerSurface).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "发送消息" })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "发送" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("closes the composer panel with cancel and Escape", async () => {
    realtimeSyncMock.state.status = "connected";
    realtimeSyncMock.state.peerPresence = "online";
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await openComposerFromInteractionMenu("发消息", "发送消息");
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    await waitFor(() => {
      expect(windowCommandsMock.closeMessageComposerSurface).toHaveBeenCalledTimes(
        1,
      );
      expect(screen.queryByRole("region", { name: "发送消息" })).toBeNull();
    });

    await openComposerFromInteractionMenu("发消息", "发送消息");
    fireEvent.keyDown(screen.getByLabelText("消息内容"), { key: "Escape" });

    await waitFor(() => {
      expect(windowCommandsMock.closeMessageComposerSurface).toHaveBeenCalledTimes(
        2,
      );
      expect(screen.queryByRole("region", { name: "发送消息" })).toBeNull();
    });
  });

  it("does not import the retired message composer window or event bridge", () => {
    const appSource = readFileSync(
      join(process.cwd(), "src", "app", "App.tsx"),
      "utf8",
    );

    expect(appSource).not.toContain("openMessageComposerWindow");
    expect(appSource).not.toContain("listenForMessageComposerSubmit");
    expect(appSource).not.toContain("emitMessageComposerResult");
  });

  it("selects the next idle segment from the active motion pool", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const motionPackage = motionPoolPackageSummary();
    petPackageCommandsMock.listPetPackages.mockResolvedValueOnce([motionPackage]);
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      appearance: {
        selectedPetPackageId: motionPackage.id,
        peerPetPackageByDeviceId: {},
      },
    });
    render(<App />);

    await flushAppEffects();
    const frameImage = screen.getByRole("img", { name: "动作池小人" });
    expect(
      frameImage.closest("[data-motion-id]")?.getAttribute("data-motion-id"),
    ).toBe("motion-001");

    act(() => {
      vi.advanceTimersByTime(1250);
    });
    await flushAppEffects();

    expect(
      screen
        .getByRole("img", { name: "动作池小人" })
        .closest("[data-motion-id]")
        ?.getAttribute("data-motion-id"),
    ).toBe("motion-002");
  });

  it("plays an ambient interaction during idle without showing a bubble", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const randomSpy = vi.spyOn(Math, "random");
    randomSpy
      .mockReturnValueOnce(0.01)
      .mockReturnValueOnce(0.01)
      .mockReturnValueOnce(0.01);
    render(<App />);
    await flushAppEffects();

    act(() => {
      vi.advanceTimersByTime(6250);
    });

    expect(
      screen
        .getByRole("img", { name: "Q 版小人" })
        .closest("[data-action]")
        ?.getAttribute("data-action"),
    ).toBe("act-cute");
    expect(screen.queryByText("陪我一会儿嘛。")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(6250);
    });

    expect(
      screen
        .getByRole("img", { name: "Q 版小人" })
        .closest("[data-action]")
        ?.getAttribute("data-action"),
    ).toBe("idle-breathe");
    randomSpy.mockRestore();
  });

  it("opens settings when the desktop open-settings event is received", async () => {
    render(<App />);

    expect(screen.queryByRole("button", { name: "设置" })).toBeNull();

    await waitFor(() => expect(windowCommandsMock.openSettingsHandler).toBeTruthy());

    act(() => {
      windowCommandsMock.openSettingsHandler?.();
    });

    const settingsButton = screen.getByRole("button", { name: "设置" });
    expect(settingsButton.getAttribute("aria-expanded")).toBe("true");
    expect(settingsButton.classList.contains("is-visible")).toBe(true);
  });

  it("keeps persisted click-through enabled when tray show recovers input", async () => {
    windowCommandsMock.readSettings.mockResolvedValueOnce({ clickThrough: true });
    render(<App />);

    await waitFor(() =>
      expect(windowCommandsMock.clickThroughRecoveredHandler).toBeTruthy(),
    );
    await waitFor(() => {
      expect((screen.getByLabelText("点击穿透") as HTMLInputElement).checked).toBe(
        true,
      );
    });
    windowCommandsMock.writeSettings.mockClear();

    act(() => {
      windowCommandsMock.clickThroughRecoveredHandler?.({ reason: "show" });
    });

    await flushAppEffects();
    expect(windowCommandsMock.writeSettings).not.toHaveBeenCalled();
    expect((screen.getByLabelText("点击穿透") as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it("does not rewrite settings when tray recovery arrives while click-through is already disabled", async () => {
    render(<App />);

    await waitFor(() =>
      expect(windowCommandsMock.clickThroughRecoveredHandler).toBeTruthy(),
    );
    await flushAppEffects();
    windowCommandsMock.writeSettings.mockClear();

    act(() => {
      windowCommandsMock.clickThroughRecoveredHandler?.({ reason: "show" });
    });

    await flushAppEffects();
    expect(windowCommandsMock.writeSettings).not.toHaveBeenCalled();
  });

  it("opens settings after tray settings recovers click-through without changing the persisted checkbox", async () => {
    windowCommandsMock.readSettings.mockResolvedValueOnce({ clickThrough: true });
    render(<App />);

    await waitFor(() =>
      expect(windowCommandsMock.clickThroughRecoveredHandler).toBeTruthy(),
    );
    await waitFor(() => expect(windowCommandsMock.openSettingsHandler).toBeTruthy());
    await waitFor(() => {
      expect((screen.getByLabelText("点击穿透") as HTMLInputElement).checked).toBe(
        true,
      );
    });
    windowCommandsMock.writeSettings.mockClear();

    act(() => {
      windowCommandsMock.clickThroughRecoveredHandler?.({ reason: "settings" });
      windowCommandsMock.openSettingsHandler?.();
    });

    expect(screen.getByRole("button", { name: "设置" }).getAttribute("aria-expanded")).toBe("true");
    expect(windowCommandsMock.writeSettings).not.toHaveBeenCalled();
    expect(windowCommandsMock.setClickThrough).toHaveBeenCalledWith(false);
    expect((screen.getByLabelText("点击穿透") as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it("closes the settings panel from the panel header", async () => {
    render(<App />);

    await openSettingsFromContextMenu();
    const settingsButton = screen.getByRole("button", { name: "设置" });
    expect(settingsButton.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById("settings-panel")?.className).toBe(
      "settings-dock",
    );

    fireEvent.click(screen.getByRole("button", { name: "关闭设置" }));

    expect(screen.queryByRole("button", { name: "设置" })).toBeNull();
    expect(document.getElementById("settings-panel")?.className).toBe(
      "settings-dock is-hidden",
    );
  });

  it("imports a pet package and selects it", async () => {
    const moonPackage = importedPackageSummary();
    petPackageCommandsMock.listPetPackages
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([moonPackage]);
    petPackageCommandsMock.importPetPackage.mockResolvedValueOnce(moonPackage);
    dialogOpenMock.mockResolvedValueOnce("C:/Users/me/moon.cdpet");
    render(<App />);

    await openSettingsFromContextMenu();
    fireEvent.click(screen.getByRole("button", { name: "导入形象资源包" }));

    await waitFor(() =>
      expect(petPackageCommandsMock.importPetPackage).toHaveBeenCalledWith(
        "C:/Users/me/moon.cdpet",
      ),
    );
    await waitFor(() =>
      expect(windowCommandsMock.writeSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          appearance: expect.objectContaining({
            selectedPetPackageId: "imported:moon-buddy",
          }),
        }),
      ),
    );
  });

  it("switches to an imported pet package from settings", async () => {
    petPackageCommandsMock.listPetPackages.mockResolvedValueOnce([
      importedPackageSummary(),
    ]);
    render(<App />);

    await openSettingsFromContextMenu();
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "月亮伙伴" })).toBeTruthy(),
    );
    fireEvent.change(screen.getByLabelText("当前形象"), {
      target: { value: "imported:moon-buddy" },
    });

    expect(windowCommandsMock.writeSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        appearance: expect.objectContaining({
          selectedPetPackageId: "imported:moon-buddy",
        }),
      }),
    );
  });

  it("deletes a non-selected imported pet package", async () => {
    petPackageCommandsMock.listPetPackages
      .mockResolvedValueOnce([importedPackageSummary()])
      .mockResolvedValueOnce([]);
    render(<App />);

    await openSettingsFromContextMenu();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "删除月亮伙伴" })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "删除月亮伙伴" }));

    await waitFor(() =>
      expect(petPackageCommandsMock.deletePetPackage).toHaveBeenCalledWith(
        "imported:moon-buddy",
      ),
    );
  });

  it("refuses to delete an imported pet package used as a peer package", async () => {
    petPackageCommandsMock.listPetPackages.mockResolvedValueOnce([
      importedPackageSummary(),
    ]);
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      appearance: {
        selectedPetPackageId: "builtin:q-girl",
        peerPetPackageByDeviceId: {
          dev_b: "imported:moon-buddy",
        },
      },
    });
    render(<App />);

    await openSettingsFromContextMenu();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "删除月亮伙伴" })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "删除月亮伙伴" }));

    expect(petPackageCommandsMock.deletePetPackage).not.toHaveBeenCalled();
    expect(await screen.findByText("对方形象正在使用，不能删除")).toBeTruthy();
  });

  it("renders a received message without adding a peer visitor image", async () => {
    const moonPackage = importedPackageSummary();
    petPackageCommandsMock.listPetPackages.mockResolvedValueOnce([moonPackage]);
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      appearance: {
        selectedPetPackageId: "builtin:q-girl",
        peerPetPackageByDeviceId: {
          dev_b: "imported:moon-buddy",
        },
      },
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);
    await flushAppEffects();

    expect(realtimeSyncMock.callbacks).toBeTruthy();
    expect(screen.getByRole("img", { name: "Q 版小人" })).toBeTruthy();

    act(() => {
      realtimeSyncMock.callbacks?.onMessage({
        id: "msg_1",
        fromDeviceId: "dev_b",
        text: "我来串门啦",
        at: "2026-08-03T12:00:00.000Z",
      });
    });

    expect(screen.getByLabelText("对方桌宠消息")).toBeTruthy();
    expect(screen.queryByRole("img", { name: "月亮伙伴来访" })).toBeNull();
    expect(screen.queryByRole("img", { name: "Q 版小人来访" })).toBeNull();
    expect(screen.getByRole("img", { name: "Q 版小人" })).toBeTruthy();
    expect(
      screen
        .getByRole("img", { name: "Q 版小人" })
        .closest("[data-motion-id]")
        ?.getAttribute("data-motion-id"),
    ).toBe("motion-message-pair");
  });

  it("plays the selected imported package message motion when a remote message arrives", async () => {
    const motionPackage = motionPoolPackageSummary({
      motions: {
        "motion-001": {
          fps: 5,
          loop: true,
          frameCount: 2,
          durationMs: 6000,
          frames: "motions/motion-001/",
          weight: 1,
          tags: ["idle"],
        },
        "motion-message-pair": {
          fps: 8,
          loop: true,
          frameCount: 2,
          durationMs: 6000,
          frames: "motions/motion-message-pair/",
          weight: 1,
          tags: ["message", "pair", "interaction"],
        },
      },
      motionFramePaths: {
        "motion-001": [
          "C:/app/pet-packages/motion-buddy/motions/motion-001/0001.png",
          "C:/app/pet-packages/motion-buddy/motions/motion-001/0002.png",
        ],
        "motion-message-pair": [
          "C:/app/pet-packages/motion-buddy/motions/motion-message-pair/0001.png",
          "C:/app/pet-packages/motion-buddy/motions/motion-message-pair/0002.png",
        ],
      },
    });
    petPackageCommandsMock.listPetPackages.mockResolvedValueOnce([motionPackage]);
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      appearance: {
        selectedPetPackageId: motionPackage.id,
        peerPetPackageByDeviceId: {},
      },
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await flushAppEffects();
    expect(screen.getByRole("img", { name: "动作池小人" })).toBeTruthy();

    act(() => {
      realtimeSyncMock.callbacks?.onMessage({
        id: "msg_1",
        fromDeviceId: "dev_b",
        text: "我来串门啦",
        at: "2026-08-03T12:00:00.000Z",
      });
    });

    expect(screen.getByLabelText("对方桌宠消息")).toBeTruthy();
    expect(
      screen
        .getByRole("img", { name: "动作池小人" })
        .closest("[data-motion-id]")
        ?.getAttribute("data-motion-id"),
    ).toBe("motion-message-pair");
    expect(screen.queryByRole("img", { name: "Q 版小人来访" })).toBeNull();
    expect(screen.queryByRole("img", { name: "月亮伙伴来访" })).toBeNull();
  });

  it("recovers a collapsed general surprise and surprise motion when Relay omits content", async () => {
    const motionPackage = taggedMotionPoolPackage({
      "motion-001": ["idle"],
      "motion-message": ["message"],
      "motion-surprise": ["surprise"],
    });
    petPackageCommandsMock.listPetPackages.mockResolvedValueOnce([motionPackage]);
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      appearance: {
        selectedPetPackageId: motionPackage.id,
        peerPetPackageByDeviceId: {},
      },
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await flushAppEffects();
    act(() => {
      realtimeSyncMock.callbacks?.onMessage({
        id: "surprise_compat_1",
        fromDeviceId: "dev_b",
        text: "一份小心意在等你。惊喜暗号：A562。没有特别的日子，也可以有一份小惊喜。",
        at: "2026-08-12T10:00:00.000Z",
      });
    });

    expect(screen.getByLabelText("对方小心意消息")).toBeTruthy();
    expect(screen.queryByLabelText("对方桌宠消息")).toBeNull();
    expect(screen.getByText("有个小惊喜在等你")).toBeTruthy();
    expect(screen.queryByText("A562")).toBeNull();
    expect(
      screen.queryByText("没有特别的日子，也可以有一份小惊喜。"),
    ).toBeNull();
    expect(
      screen
        .getByRole("img", { name: "动作池小人" })
        .closest("[data-motion-id]")
        ?.getAttribute("data-motion-id"),
    ).toBe("motion-surprise");
  });

  it("uses a surprise-tagged motion before a message-tagged motion for received surprises", async () => {
    const motionPackage = taggedMotionPoolPackage({
      "motion-001": ["idle"],
      "motion-message": ["message"],
      "motion-surprise": ["surprise"],
    });
    petPackageCommandsMock.listPetPackages.mockResolvedValueOnce([motionPackage]);
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      appearance: {
        selectedPetPackageId: motionPackage.id,
        peerPetPackageByDeviceId: {},
      },
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await flushAppEffects();
    act(() => {
      realtimeSyncMock.callbacks?.onMessage({
        id: "surprise_1",
        fromDeviceId: "dev_b",
        text: "一份小心意在等你。惊喜暗号：A-1024。是我不好。",
        at: "2026-08-12T10:00:00.000Z",
        content: {
          kind: "surprise",
          version: 1,
          theme: "apology",
          secret: "A-1024",
          note: "是我不好。",
        },
      });
    });

    expect(screen.getByLabelText("对方小心意消息")).toBeTruthy();
    expect(screen.getByText("先收下这份小心意")).toBeTruthy();
    expect(screen.queryByText("有个小惊喜在等你")).toBeNull();
    expect(
      screen
        .getByRole("img", { name: "动作池小人" })
        .closest("[data-motion-id]")
        ?.getAttribute("data-motion-id"),
    ).toBe("motion-surprise");
  });

  it("falls back to a message-tagged motion for received surprises without surprise motion", async () => {
    const motionPackage = taggedMotionPoolPackage({
      "motion-001": ["idle"],
      "motion-message": ["message"],
    });
    petPackageCommandsMock.listPetPackages.mockResolvedValueOnce([motionPackage]);
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      appearance: {
        selectedPetPackageId: motionPackage.id,
        peerPetPackageByDeviceId: {},
      },
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await flushAppEffects();
    act(() => {
      realtimeSyncMock.callbacks?.onMessage({
        id: "surprise_1",
        fromDeviceId: "dev_b",
        text: "一份小心意在等你。惊喜暗号：A-1024。",
        at: "2026-08-12T10:00:00.000Z",
        content: {
          kind: "surprise",
          version: 1,
          theme: "general",
          secret: "A-1024",
        },
      });
    });

    expect(screen.getByLabelText("对方小心意消息")).toBeTruthy();
    expect(
      screen
        .getByRole("img", { name: "动作池小人" })
        .closest("[data-motion-id]")
        ?.getAttribute("data-motion-id"),
    ).toBe("motion-message");
  });

  it("leaves the current motion unchanged for received surprises without surprise or message motion", async () => {
    const motionPackage = taggedMotionPoolPackage({
      "motion-001": ["idle"],
    });
    petPackageCommandsMock.listPetPackages.mockResolvedValueOnce([motionPackage]);
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      appearance: {
        selectedPetPackageId: motionPackage.id,
        peerPetPackageByDeviceId: {},
      },
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await flushAppEffects();
    expect(
      screen
        .getByRole("img", { name: "动作池小人" })
        .closest("[data-motion-id]")
        ?.getAttribute("data-motion-id"),
    ).toBe("motion-001");

    act(() => {
      realtimeSyncMock.callbacks?.onMessage({
        id: "surprise_1",
        fromDeviceId: "dev_b",
        text: "一份小心意在等你。惊喜暗号：A-1024。",
        at: "2026-08-12T10:00:00.000Z",
        content: {
          kind: "surprise",
          version: 1,
          theme: "general",
          secret: "A-1024",
        },
      });
    });

    expect(screen.getByLabelText("对方小心意消息")).toBeTruthy();
    expect(
      screen
        .getByRole("img", { name: "动作池小人" })
        .closest("[data-motion-id]")
        ?.getAttribute("data-motion-id"),
    ).toBe("motion-001");
  });

  it("continues to use message-tagged motion for ordinary received text", async () => {
    const motionPackage = taggedMotionPoolPackage({
      "motion-001": ["idle"],
      "motion-message": ["message"],
      "motion-surprise": ["surprise"],
    });
    petPackageCommandsMock.listPetPackages.mockResolvedValueOnce([motionPackage]);
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      appearance: {
        selectedPetPackageId: motionPackage.id,
        peerPetPackageByDeviceId: {},
      },
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await flushAppEffects();
    act(() => {
      realtimeSyncMock.callbacks?.onMessage({
        id: "msg_1",
        fromDeviceId: "dev_b",
        text: "普通消息",
        at: "2026-08-12T10:00:00.000Z",
      });
    });

    expect(screen.getByLabelText("对方桌宠消息")).toBeTruthy();
    expect(screen.queryByLabelText("对方小心意消息")).toBeNull();
    expect(
      screen
        .getByRole("img", { name: "动作池小人" })
        .closest("[data-motion-id]")
        ?.getAttribute("data-motion-id"),
    ).toBe("motion-message");
  });

  it("does not render a peer visitor for missing peer package mappings", async () => {
    const moonPackage = importedPackageSummary();
    petPackageCommandsMock.listPetPackages.mockResolvedValueOnce([moonPackage]);
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      appearance: {
        selectedPetPackageId: "imported:moon-buddy",
        peerPetPackageByDeviceId: {
          dev_b: "imported:missing",
        },
      },
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await flushAppEffects();
    expect(screen.getByRole("img", { name: "月亮伙伴" })).toBeTruthy();

    act(() => {
      realtimeSyncMock.callbacks?.onMessage({
        id: "msg_1",
        fromDeviceId: "dev_b",
        text: "我来串门啦",
        at: "2026-08-03T12:00:00.000Z",
      });
    });

    expect(screen.getByLabelText("对方桌宠消息")).toBeTruthy();
    expect(
      screen
        .getByRole("img", { name: "月亮伙伴" })
        .closest("[data-motion-id]")
        ?.getAttribute("data-motion-id"),
    ).toBe("idle-breathe");
    expect(screen.queryByRole("img", { name: "Q 版小人来访" })).toBeNull();
    expect(screen.queryByRole("img", { name: "月亮伙伴来访" })).toBeNull();
  });

  it("persists the selected peer pet package for the paired device", async () => {
    petPackageCommandsMock.listPetPackages.mockResolvedValueOnce([
      importedPackageSummary(),
    ]);
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await openSettingsFromContextMenu();
    await waitFor(() => expect(screen.getByLabelText("对方形象")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("对方形象"), {
      target: { value: "imported:moon-buddy" },
    });

    await waitFor(() =>
      expect(windowCommandsMock.writeSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          appearance: expect.objectContaining({
            peerPetPackageByDeviceId: {
              dev_b: "imported:moon-buddy",
            },
          }),
        }),
      ),
    );
  });

  it("moves the desktop window with custom pointer deltas after pet movement crosses the drag threshold", async () => {
    const { container } = render(<App />);
    const petStage = container.querySelector(".pet-frame-stage");

    if (!petStage) {
      throw new Error("pet stage missing");
    }

    fireEvent.pointerDown(petStage, {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      screenX: 100,
      screenY: 200,
    });

    fireEvent.pointerMove(petStage, {
      pointerId: 1,
      clientX: 18,
      clientY: 10,
      screenX: 108,
      screenY: 200,
    });
    fireEvent.pointerUp(petStage, {
      pointerId: 1,
      clientX: 18,
      clientY: 10,
      screenX: 108,
      screenY: 200,
    });

    await waitFor(() =>
      expect(windowCommandsMock.moveWindowForPointerDrag).toHaveBeenCalledWith(
        8,
        0,
      ),
    );
  });

  it("waits for the final pointer drag move before snapping to an edge", async () => {
    const finalMove = createDeferred<void>();
    windowCommandsMock.moveWindowForPointerDrag.mockReturnValueOnce(finalMove.promise);
    windowCommandsMock.snapWindowToEdgeIfNeeded.mockResolvedValueOnce(null);
    const { container } = render(<App />);
    const petStage = container.querySelector(".pet-frame-stage");

    if (!petStage) {
      throw new Error("pet stage missing");
    }

    fireEvent.pointerDown(petStage, {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      screenX: 100,
      screenY: 200,
    });
    fireEvent.pointerMove(petStage, {
      pointerId: 1,
      clientX: 18,
      clientY: 10,
      screenX: 108,
      screenY: 200,
    });
    fireEvent.pointerUp(petStage, {
      pointerId: 1,
      clientX: 18,
      clientY: 10,
      screenX: 108,
      screenY: 200,
    });

    await waitFor(() =>
      expect(windowCommandsMock.moveWindowForPointerDrag).toHaveBeenCalledWith(
        8,
        0,
      ),
    );
    await flushAppEffects();
    expect(windowCommandsMock.snapWindowToEdgeIfNeeded).not.toHaveBeenCalled();

    await act(async () => {
      finalMove.resolve();
      await finalMove.promise;
    });

    await waitFor(() =>
      expect(windowCommandsMock.snapWindowToEdgeIfNeeded).toHaveBeenCalledTimes(1),
    );
  });

  it("enters static edge idle after drag end returns an edge side", async () => {
    windowCommandsMock.snapWindowToEdgeIfNeeded.mockResolvedValueOnce("left");
    const { container } = render(<App />);

    await dragPetPastThresholdAndRelease(container);

    const frame = await screen.findByAltText("边缘微型桌宠");
    expect(frame.getAttribute("data-frame-kind")).toBe("idle");
    expect(frame.getAttribute("src")).toContain(
      "edge-companion/side/idle.png",
    );
    expect(
      container.querySelector(".pet-frame-stage")?.getAttribute(
        "data-edge-interaction-side",
      ),
    ).toBe("left");
    expect(screen.queryByAltText("桌宠边缘进入")).toBeNull();
    expect(screen.queryByAltText("桌宠边缘退出")).toBeNull();
  });

  it("does not restore or open interactions from a simple static mascot click", async () => {
    windowCommandsMock.snapWindowToEdgeIfNeeded.mockResolvedValueOnce("left");
    const { container } = render(<App />);

    await dragPetPastThresholdAndRelease(container);
    await screen.findByAltText("边缘微型桌宠");
    await clearDragClickSuppression();

    fireEvent.click(screen.getByTestId("edge-companion-alpha-hit-region"));

    expect(edgeInteractionHookSpy.requestExitThen).not.toHaveBeenCalled();
    expect(windowCommandsMock.restoreWindowFromEdgePeek).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu", { name: "互动选项" })).toBeNull();
    expect(screen.getByAltText("边缘微型桌宠")).toBeTruthy();
  });

  it("keeps static edge idle when the alpha region receives a context menu event", async () => {
    windowCommandsMock.snapWindowToEdgeIfNeeded.mockResolvedValueOnce("left");
    const { container } = render(<App />);

    await dragPetPastThresholdAndRelease(container);
    const hitRegion = await screen.findByTestId(
      "edge-companion-alpha-hit-region",
    );
    const contextMenuEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 40,
      clientY: 50,
    });

    let wasNotPrevented = true;
    act(() => {
      wasNotPrevented = hitRegion.dispatchEvent(contextMenuEvent);
    });

    expect(wasNotPrevented).toBe(false);
    expect(edgeInteractionHookSpy.requestExitThen).not.toHaveBeenCalled();
    expect(windowCommandsMock.restoreWindowFromEdgePeek).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu", { name: "桌宠菜单" })).toBeNull();
    expect(screen.getByAltText("边缘微型桌宠").getAttribute("data-frame-kind")).toBe(
      "idle",
    );
    expect(
      container.querySelector(".pet-frame-stage")?.getAttribute(
        "data-edge-interaction-side",
      ),
    ).toBe("left");
  });

  it("keeps static edge idle when an expanded notice card receives a context menu event", async () => {
    arrangeOnlinePair();
    windowCommandsMock.snapWindowToEdgeIfNeeded.mockResolvedValueOnce("right");
    const { container } = render(<App />);

    await flushAppEffects();
    emitRemoteText("edge-context-message", "右键也不要唤醒");
    await dragPetPastThresholdAndRelease(container);
    const card = screen.getByRole("button", {
      name: "右键也不要唤醒 有一句话想让你看见",
    });
    const contextMenuEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 40,
      clientY: 50,
    });

    let wasNotPrevented = true;
    act(() => {
      wasNotPrevented = card.dispatchEvent(contextMenuEvent);
    });

    expect(wasNotPrevented).toBe(false);
    expect(edgeInteractionHookSpy.requestExitThen).not.toHaveBeenCalled();
    expect(windowCommandsMock.restoreWindowFromEdgePeek).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu", { name: "桌宠菜单" })).toBeNull();
    expect(screen.getByAltText("边缘微型桌宠").getAttribute("data-frame-kind")).toBe(
      "idle",
    );
    expect(
      container.querySelector(".pet-frame-stage")?.getAttribute(
        "data-edge-interaction-side",
      ),
    ).toBe("right");
    expect(screen.getByRole("button", {
      name: "右键也不要唤醒 有一句话想让你看见",
    })).toBeTruthy();
    expect(screen.queryByLabelText("对方桌宠消息")).toBeNull();
  });

  it("restores only after an alpha-surface drag crosses the threshold and keeps moving", async () => {
    windowCommandsMock.snapWindowToEdgeIfNeeded
      .mockResolvedValueOnce("right")
      .mockResolvedValueOnce(null);
    const { container } = render(<App />);

    await dragPetPastThresholdAndRelease(container);
    const hitRegion = await screen.findByTestId(
      "edge-companion-alpha-hit-region",
    );
    windowCommandsMock.moveWindowForPointerDrag.mockClear();

    fireEvent.pointerDown(hitRegion, {
      pointerId: 7,
      screenX: 200,
      screenY: 300,
    });
    fireEvent.pointerMove(hitRegion, {
      pointerId: 7,
      screenX: 202,
      screenY: 300,
    });
    expect(windowCommandsMock.restoreWindowFromEdgePeek).not.toHaveBeenCalled();

    fireEvent.pointerMove(hitRegion, {
      pointerId: 7,
      screenX: 208,
      screenY: 300,
    });

    await waitFor(() =>
      expect(windowCommandsMock.restoreWindowFromEdgePeek).toHaveBeenCalledWith(
        "right",
      ),
    );
    await waitFor(() =>
      expect(windowCommandsMock.moveWindowForPointerDrag).toHaveBeenCalledWith(
        8,
        0,
      ),
    );
    expect(edgeInteractionHookSpy.requestExitThen).toHaveBeenCalledTimes(1);

    const stage = container.querySelector(".pet-frame-stage");
    if (!stage) {
      throw new Error("pet stage missing");
    }

    fireEvent.pointerMove(stage, {
      pointerId: 7,
      screenX: 213,
      screenY: 298,
    });
    fireEvent.pointerUp(stage, {
      pointerId: 7,
      screenX: 213,
      screenY: 298,
    });

    await waitFor(() =>
      expect(windowCommandsMock.moveWindowForPointerDrag).toHaveBeenCalledWith(
        5,
        -2,
      ),
    );
    expect(windowCommandsMock.restoreWindowFromEdgePeek).toHaveBeenCalledTimes(
      1,
    );
  });

  it("projects no edge notice for peer presence changes", async () => {
    arrangeOnlinePair();
    windowCommandsMock.snapWindowToEdgeIfNeeded.mockResolvedValueOnce("top");
    const { container } = render(<App />);

    await flushAppEffects();
    await dragPetPastThresholdAndRelease(container);

    expect(await screen.findByAltText("桌宠边缘待机")).toBeTruthy();
    expect(container.querySelector(".edge-pet-stage")).toBeTruthy();
    expect(screen.queryByTestId("edge-notice-surface")).toBeNull();
    expect(document.querySelector(".edge-notice-marker")).toBeNull();
    expect(screen.queryByLabelText("对方状态")).toBeNull();
  });

  it("keeps a text card expanded until restore, then acknowledges full content without docking", async () => {
    vi.useFakeTimers();
    const restoreDeferred = createDeferred<void>();
    arrangeOnlinePair();
    windowCommandsMock.snapWindowToEdgeIfNeeded.mockResolvedValueOnce("left");
    windowCommandsMock.restoreWindowFromEdgePeek.mockReturnValueOnce(
      restoreDeferred.promise,
    );
    const { container } = render(<App />);

    await flushAppEffects();
    emitRemoteText("edge-message", "今晚一起看电影吗？");
    await dragPetPastThresholdAndRelease(container);

    const card = screen.getByRole("button", {
      name: "今晚一起看电影吗？ 有一句话想让你看见",
    });
    const companionStage = screen.getByTestId("edge-companion-stage");
    const noticeSurface = screen.getByTestId("edge-notice-surface");
    const hitRegion = screen.getByTestId("edge-companion-alpha-hit-region");

    expect(document.querySelector(".edge-notice-marker")).toBeNull();
    expect(companionStage.hasAttribute("data-desktop-interactive-region")).toBe(
      false,
    );
    expect(noticeSurface.hasAttribute("data-desktop-interactive-region")).toBe(
      false,
    );
    expect(hitRegion.hasAttribute("data-desktop-interactive-region")).toBe(
      true,
    );
    expect(card.hasAttribute("data-desktop-interactive-region")).toBe(true);
    expect(screen.queryByLabelText("对方桌宠消息")).toBeNull();

    fireEvent.pointerEnter(card);
    fireEvent.pointerLeave(card);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(
      screen.getByRole("button", {
        name: "今晚一起看电影吗？ 有一句话想让你看见",
      }),
    ).toBeTruthy();
    expect(document.querySelector(".edge-notice-marker")).toBeNull();
    expect(screen.queryByLabelText("对方桌宠消息")).toBeNull();

    fireEvent.click(card);
    expect(edgeInteractionHookSpy.requestExitThen).toHaveBeenCalledTimes(1);
    expect(windowCommandsMock.restoreWindowFromEdgePeek).toHaveBeenCalledWith(
      "left",
    );
    expect(screen.queryByLabelText("对方桌宠消息")).toBeNull();

    await act(async () => {
      restoreDeferred.resolve();
      await restoreDeferred.promise;
    });
    await flushAppEffects();

    const fullMessage = screen.getByLabelText("对方桌宠消息");
    expect(fullMessage.className).toContain("is-visible");

    fireEvent.pointerEnter(fullMessage);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    await flushAppEffects();

    expect(screen.queryByLabelText("对方桌宠消息")).toBeNull();
    expect(windowCommandsMock.dockWindowAtEdge).not.toHaveBeenCalled();
  });

  it("keeps the expanded text card and FIFO unchanged when edge restore fails", async () => {
    arrangeOnlinePair();
    windowCommandsMock.snapWindowToEdgeIfNeeded.mockResolvedValueOnce("left");
    windowCommandsMock.restoreWindowFromEdgePeek.mockRejectedValueOnce(
      new Error("restore failed"),
    );
    const { container } = render(<App />);

    await flushAppEffects();
    emitRemoteText("edge-message", "今晚一起看电影吗？");
    emitRemoteText("queued-message", "下一条消息");
    await dragPetPastThresholdAndRelease(container);

    fireEvent.click(
      screen.getByRole("button", {
        name: "今晚一起看电影吗？ 有一句话想让你看见",
      }),
    );
    await waitFor(() =>
      expect(windowCommandsMock.resetWindowPosition).toHaveBeenCalledTimes(1),
    );

    expect(screen.queryByLabelText("对方桌宠消息")).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "今晚一起看电影吗？ 有一句话想让你看见",
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "下一条消息 有一句话想让你看见",
      }),
    ).toBeNull();
    expect(windowCommandsMock.restoreWindowFromEdgePeek).toHaveBeenCalledWith(
      "left",
    );
    expect(windowCommandsMock.dockWindowAtEdge).not.toHaveBeenCalled();
  });

  it("keeps a surprise card expanded until restore and promotes FIFO only after full dismissal", async () => {
    vi.useFakeTimers();
    arrangeOnlinePair();
    windowCommandsMock.snapWindowToEdgeIfNeeded.mockResolvedValueOnce("bottom");
    const { container } = render(<App />);

    await flushAppEffects();
    emitRemoteSurprise();
    emitRemoteText("queued-message", "下一条消息");
    await dragPetPastThresholdAndRelease(container);

    const card = screen.getByRole("button", {
      name: "有一份心意正在等你 点一下，让惊喜慢慢打开",
    });
    const noticeSurface = card.closest(".edge-notice-surface");

    expect(noticeSurface?.innerHTML).not.toMatch(
      /A-1024|是我不好|外卖|取件码|暗号/,
    );
    expect(document.querySelector(".edge-notice-marker")).toBeNull();

    fireEvent.pointerEnter(card);
    fireEvent.pointerLeave(card);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(
      screen.getByRole("button", {
        name: "有一份心意正在等你 点一下，让惊喜慢慢打开",
      }),
    ).toBeTruthy();

    fireEvent.click(card);
    await flushAppEffects();

    expect(screen.getByLabelText("对方小心意消息").className).toContain(
      "is-collapsed",
    );
    expect(screen.queryByLabelText("对方桌宠消息")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /轻轻点开看看/ }));
    fireEvent.click(screen.getByRole("button", { name: "我收下啦" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    await flushAppEffects();

    expect(screen.queryByLabelText("对方小心意消息")).toBeNull();
    expect(screen.getByLabelText("对方桌宠消息")).toBeTruthy();
    expect(windowCommandsMock.dockWindowAtEdge).not.toHaveBeenCalled();
  });

  it("keeps the expanded surprise card and FIFO unchanged when edge restore fails", async () => {
    arrangeOnlinePair();
    windowCommandsMock.snapWindowToEdgeIfNeeded.mockResolvedValueOnce("bottom");
    windowCommandsMock.restoreWindowFromEdgePeek.mockRejectedValueOnce(
      new Error("restore failed"),
    );
    const { container } = render(<App />);

    await flushAppEffects();
    emitRemoteSurprise();
    emitRemoteText("queued-message", "下一条消息");
    await dragPetPastThresholdAndRelease(container);

    fireEvent.click(
      screen.getByRole("button", {
        name: "有一份心意正在等你 点一下，让惊喜慢慢打开",
      }),
    );
    await waitFor(() =>
      expect(windowCommandsMock.resetWindowPosition).toHaveBeenCalledTimes(1),
    );

    expect(screen.queryByLabelText("对方小心意消息")).toBeNull();
    expect(screen.queryByLabelText("对方桌宠消息")).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "有一份心意正在等你 点一下，让惊喜慢慢打开",
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "下一条消息 有一句话想让你看见",
      }),
    ).toBeNull();
    expect(windowCommandsMock.restoreWindowFromEdgePeek).toHaveBeenCalledWith(
      "bottom",
    );
    expect(windowCommandsMock.dockWindowAtEdge).not.toHaveBeenCalled();
  });

  it("restores from a static edge image load failure once", async () => {
    windowCommandsMock.snapWindowToEdgeIfNeeded.mockResolvedValueOnce("left");
    const { container } = render(<App />);

    await dragPetPastThresholdAndRelease(container);
    const edgeImage = await screen.findByAltText("边缘微型桌宠");
    fireEvent.error(edgeImage);
    fireEvent.error(edgeImage);
    await flushAppEffects();

    expect(windowCommandsMock.restoreWindowFromEdgePeek).toHaveBeenCalledTimes(1);
    expect(windowCommandsMock.restoreWindowFromEdgePeek).toHaveBeenCalledWith(
      "left",
    );
    expect(screen.queryByAltText("边缘微型桌宠")).toBeNull();
  });

  it("does not snap imported packages that have no edge interaction profile", async () => {
    petPackageCommandsMock.listPetPackages.mockResolvedValueOnce([
      importedPackageSummary(),
    ]);
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      appearance: {
        selectedPetPackageId: "imported:moon-buddy",
      },
    });
    const { container } = render(<App />);

    await flushAppEffects();
    await dragPetPastThresholdAndRelease(container);

    expect(windowCommandsMock.snapWindowToEdgeIfNeeded).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "月亮伙伴" })).toBeTruthy();
    expect(screen.queryByAltText("边缘微型桌宠")).toBeNull();
  });

  it("temporarily disables click-through before opening settings from the context menu", async () => {
    windowCommandsMock.readSettings.mockResolvedValueOnce({ clickThrough: true });
    render(<App />);

    await waitFor(() => {
      expect((screen.getByLabelText("点击穿透") as HTMLInputElement).checked).toBe(true);
    });
    await waitFor(() =>
      expect(windowCommandsMock.setClickThrough).toHaveBeenCalledWith(true),
    );
    windowCommandsMock.setClickThrough.mockClear();
    windowCommandsMock.writeSettings.mockClear();

    await openSettingsFromContextMenu();

    const settingsButton = screen.getByRole("button", { name: "设置" });
    expect(settingsButton.getAttribute("aria-expanded")).toBe("true");
    expect(windowCommandsMock.setClickThrough).toHaveBeenCalledWith(false);
    expect(windowCommandsMock.writeSettings).not.toHaveBeenCalled();
    expect((screen.getByLabelText("点击穿透") as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it("restores full click-through after closing settings opened with a temporary recovery", async () => {
    windowCommandsMock.readSettings.mockResolvedValueOnce({ clickThrough: true });
    render(<App />);

    await waitFor(() => {
      expect((screen.getByLabelText("点击穿透") as HTMLInputElement).checked).toBe(true);
    });
    windowCommandsMock.setClickThrough.mockClear();
    windowCommandsMock.writeSettings.mockClear();

    await openSettingsFromContextMenu();
    expect(windowCommandsMock.setClickThrough).toHaveBeenCalledWith(false);
    windowCommandsMock.setClickThrough.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "关闭设置" }));

    expect(windowCommandsMock.setClickThrough).toHaveBeenCalledWith(true);
    expect(windowCommandsMock.writeSettings).not.toHaveBeenCalled();
    expect((screen.getByLabelText("点击穿透") as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it("restores full click-through after closing settings with the bottom settings toggle", async () => {
    windowCommandsMock.readSettings.mockResolvedValueOnce({ clickThrough: true });
    render(<App />);

    await waitFor(() => {
      expect((screen.getByLabelText("点击穿透") as HTMLInputElement).checked).toBe(true);
    });
    windowCommandsMock.setClickThrough.mockClear();
    windowCommandsMock.writeSettings.mockClear();

    await openSettingsFromContextMenu();
    expect(windowCommandsMock.setClickThrough).toHaveBeenCalledWith(false);
    windowCommandsMock.setClickThrough.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "设置" }));

    expect(document.getElementById("settings-panel")?.className).toBe(
      "settings-dock is-hidden",
    );
    expect(windowCommandsMock.setClickThrough).toHaveBeenCalledWith(true);
    expect(windowCommandsMock.writeSettings).not.toHaveBeenCalled();
    expect((screen.getByLabelText("点击穿透") as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it("closes the settings panel before enabling click-through from settings", async () => {
    render(<App />);

    await openSettingsFromContextMenu();
    const settingsButton = screen.getByRole("button", { name: "设置" });
    expect(settingsButton.getAttribute("aria-expanded")).toBe("true");

    windowCommandsMock.setClickThrough.mockClear();
    windowCommandsMock.writeSettings.mockClear();
    fireEvent.click(screen.getByLabelText("点击穿透"));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "设置" })).toBeNull(),
    );
    expect(document.getElementById("settings-panel")?.className).toBe(
      "settings-dock is-hidden",
    );
    await waitFor(() =>
      expect(windowCommandsMock.writeSettings).toHaveBeenCalledWith(
        expect.objectContaining({ clickThrough: true }),
      ),
    );
    await waitFor(() =>
      expect(windowCommandsMock.setClickThrough).toHaveBeenCalledWith(true),
    );
  });

  it("shows received realtime messages as a persistent remote pet visit", async () => {
    vi.useFakeTimers();
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);
    await flushAppEffects();

    expect(realtimeSyncMock.callbacks).toBeTruthy();

    act(() => {
      realtimeSyncMock.callbacks?.onMessage({
        id: "msg_1",
        fromDeviceId: "dev_b",
        text: "想你啦",
        at: "2026-08-03T12:00:00.000Z",
      });
    });

    const remoteLayer = screen.getByLabelText("对方桌宠消息");
    expect(remoteLayer).toBeTruthy();
    expect(screen.queryByRole("img", { name: "Q 版小人来访" })).toBeNull();
    expect(
      screen
        .getByRole("img", { name: "Q 版小人" })
        .closest("[data-motion-id]")
        ?.getAttribute("data-motion-id"),
    ).toBe("motion-message-pair");
    await advanceTypewriterText("想你啦");
    expect(within(remoteLayer).getByText("想你啦")).toBeTruthy();

    act(() => vi.advanceTimersByTime(5000));

    expect(within(screen.getByLabelText("对方桌宠消息")).getByText("想你啦")).toBeTruthy();
    expect(screen.queryByText("我在这里。")).toBeNull();
  });

  it("keeps the message motion while a remote message waits for acknowledgement", async () => {
    vi.useFakeTimers();
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);
    await flushAppEffects();

    act(() => {
      realtimeSyncMock.callbacks?.onMessage({
        id: "msg_1",
        fromDeviceId: "dev_b",
        text: "今天见一面",
        at: "2026-08-03T12:00:00.000Z",
      });
    });

    const petStage = screen
      .getByRole("img", { name: "Q 版小人" })
      .closest("[data-motion-id]");

    expect(petStage?.getAttribute("data-motion-id")).toBe(
      "motion-message-pair",
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });

    expect(screen.getByLabelText("对方桌宠消息")).toBeTruthy();
    expect(petStage?.getAttribute("data-motion-id")).toBe(
      "motion-message-pair",
    );
    expect(windowCommandsMock.moveWindowForAutoStep).not.toHaveBeenCalled();

    fireEvent.pointerEnter(screen.getByLabelText("对方桌宠消息"));
    await flushAppEffects();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(screen.queryByLabelText("对方桌宠消息")).toBeNull();
  });

  it("dismisses a received remote message only after hover acknowledgement", async () => {
    vi.useFakeTimers();
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    expect(realtimeSyncMock.callbacks).toBeTruthy();

    act(() => {
      realtimeSyncMock.callbacks?.onMessage({
        id: "msg_1",
        fromDeviceId: "dev_b",
        text: "摸摸头",
        at: "2026-08-03T12:00:00.000Z",
      });
    });

    expect(screen.queryByRole("img", { name: "Q 版小人来访" })).toBeNull();
    expect(screen.getByRole("img", { name: "Q 版小人" })).toBeTruthy();
    await advanceTypewriterText("摸摸头");
    fireEvent.pointerEnter(screen.getByLabelText("对方桌宠消息"));
    await flushAppEffects();
    act(() => vi.advanceTimersByTime(799));
    expect(
      within(screen.getByLabelText("对方桌宠消息")).getByText("摸摸头"),
    ).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await flushAppEffects();
    expect(screen.queryByLabelText("对方桌宠消息")).toBeNull();
  });

  it("keeps global click-through enabled for remote messages and lets tray Settings inspect them", async () => {
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      clickThrough: true,
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await flushAppEffects();
    expect(windowCommandsMock.setClickThrough).toHaveBeenCalledWith(true);
    expect(realtimeSyncMock.callbacks).toBeTruthy();
    windowCommandsMock.setClickThrough.mockClear();
    windowCommandsMock.writeSettings.mockClear();

    act(() => {
      realtimeSyncMock.callbacks?.onMessage({
        id: "msg_1",
        fromDeviceId: "dev_b",
        text: "看我一眼",
        at: "2026-08-03T12:00:00.000Z",
      });
    });

    await flushAppEffects();
    expect(windowCommandsMock.setClickThrough).not.toHaveBeenCalledWith(false);
    expect(windowCommandsMock.writeSettings).not.toHaveBeenCalled();
    expect(screen.getByLabelText("对方桌宠消息")).toBeTruthy();

    act(() => {
      windowCommandsMock.clickThroughRecoveredHandler?.({ reason: "settings" });
      windowCommandsMock.openSettingsHandler?.();
    });

    expect(screen.getByRole("button", { name: "设置" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.queryByLabelText("对方桌宠消息")).toBeNull();
    expect((screen.getByLabelText("点击穿透") as HTMLInputElement).checked).toBe(true);
    expect(windowCommandsMock.writeSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "关闭设置" }));

    expect(screen.getByLabelText("对方桌宠消息")).toBeTruthy();
    expect((screen.getByLabelText("点击穿透") as HTMLInputElement).checked).toBe(true);
    expect(windowCommandsMock.writeSettings).not.toHaveBeenCalled();
  });

  it("opens tray Settings over an unread edge notice without changing global click-through or the FIFO", async () => {
    realtimeSyncMock.state.status = "connected";
    realtimeSyncMock.state.peerPresence = "online";
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      ...pairedSyncSettings(),
      clickThrough: true,
    });
    windowCommandsMock.snapWindowToEdgeIfNeeded.mockResolvedValueOnce("left");
    const { container } = render(<App />);

    await flushAppEffects();
    windowCommandsMock.setClickThrough.mockClear();
    emitRemoteText("edge-global-click-through", "边缘未读消息");
    await flushAppEffects();
    expect(windowCommandsMock.setClickThrough).not.toHaveBeenCalledWith(false);

    await dragPetPastThresholdAndRelease(container);
    await clearDragClickSuppression();
    expect(
      screen.getByRole("button", {
        name: "边缘未读消息 有一句话想让你看见",
      }),
    ).toBeTruthy();
    expect(windowCommandsMock.setClickThrough).not.toHaveBeenCalledWith(false);

    act(() => {
      windowCommandsMock.clickThroughRecoveredHandler?.({ reason: "settings" });
      windowCommandsMock.openSettingsHandler?.();
    });

    expect(screen.getByRole("button", { name: "设置" }).getAttribute("aria-expanded")).toBe("true");
    expect((screen.getByLabelText("点击穿透") as HTMLInputElement).checked).toBe(true);
    expect(windowCommandsMock.writeSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "关闭设置" }));
    expect(
      screen.getByRole("button", {
        name: "边缘未读消息 有一句话想让你看见",
      }),
    ).toBeTruthy();
    expect((screen.getByLabelText("点击穿透") as HTMLInputElement).checked).toBe(true);
  });

  it("reveals and dismisses a received surprise before promoting queued text", async () => {
    vi.useFakeTimers();
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      clickThrough: true,
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await flushAppEffects();
    expect(windowCommandsMock.setClickThrough).toHaveBeenCalledWith(true);
    expect(realtimeSyncMock.callbacks).toBeTruthy();
    windowCommandsMock.setClickThrough.mockClear();
    windowCommandsMock.writeSettings.mockClear();

    act(() => {
      realtimeSyncMock.callbacks?.onMessage({
        id: "surprise_1",
        fromDeviceId: "dev_b",
        text: "一份小心意在等你。惊喜暗号：A-1024。是我不好。",
        at: "2026-08-12T10:00:00.000Z",
        content: {
          kind: "surprise",
          version: 1,
          theme: "apology",
          secret: "A-1024",
          note: "是我不好。",
        },
      });
      realtimeSyncMock.callbacks?.onMessage({
        id: "msg_2",
        fromDeviceId: "dev_b",
        text: "第二条",
        at: "2026-08-12T10:00:01.000Z",
      });
    });

    await flushAppEffects();
    expect(windowCommandsMock.setClickThrough).not.toHaveBeenCalledWith(false);
    expect(windowCommandsMock.writeSettings).not.toHaveBeenCalled();
    const surpriseLayer = screen.getByLabelText("对方小心意消息");
    expect(surpriseLayer).toBeTruthy();
    expect(screen.queryByText("A-1024")).toBeNull();
    expect(screen.queryByText("是我不好。")).toBeNull();
    expect(within(surpriseLayer).queryByText("第二条")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /轻轻点开看看/ }));
    await flushAppEffects();
    expect(screen.getByText("惊喜暗号")).toBeTruthy();
    expect(screen.getByText("A-1024")).toBeTruthy();
    expect(screen.getByText("是我不好。")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "我收下啦" }));
    await flushAppEffects();
    expect(screen.getByLabelText("对方小心意消息").className).toContain(
      "is-dismissing",
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    await flushAppEffects();

    expect(screen.queryByLabelText("对方小心意消息")).toBeNull();
    const secondRemoteLayer = screen.getByLabelText("对方桌宠消息");
    await advanceTypewriterText("第二条");
    expect(within(secondRemoteLayer).getByText("第二条")).toBeTruthy();
    expect(windowCommandsMock.setClickThrough).not.toHaveBeenCalledWith(true);

    fireEvent.pointerEnter(secondRemoteLayer);
    await flushAppEffects();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    await flushAppEffects();

    expect(screen.queryByLabelText("对方桌宠消息")).toBeNull();
    expect(windowCommandsMock.setClickThrough).not.toHaveBeenCalledWith(true);
    expect(windowCommandsMock.writeSettings).not.toHaveBeenCalled();
  });

  it("shows queued remote messages one at a time", async () => {
    vi.useFakeTimers();
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    expect(realtimeSyncMock.callbacks).toBeTruthy();

    act(() => {
      realtimeSyncMock.callbacks?.onMessage({
        id: "msg_1",
        fromDeviceId: "dev_b",
        text: "第一条",
        at: "2026-08-03T12:00:00.000Z",
      });
      realtimeSyncMock.callbacks?.onMessage({
        id: "msg_2",
        fromDeviceId: "dev_b",
        text: "第二条",
        at: "2026-08-03T12:00:01.000Z",
      });
    });

    const firstRemoteLayer = screen.getByLabelText("对方桌宠消息");
    await advanceTypewriterText("第一条");
    expect(within(firstRemoteLayer).getByText("第一条")).toBeTruthy();
    expect(within(firstRemoteLayer).queryByText("第二条")).toBeNull();

    fireEvent.pointerEnter(screen.getByLabelText("对方桌宠消息"));
    await flushAppEffects();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    await flushAppEffects();

    const secondRemoteLayer = screen.getByLabelText("对方桌宠消息");
    await advanceTypewriterText("第二条");
    expect(within(secondRemoteLayer).queryByText("第一条")).toBeNull();
    expect(within(secondRemoteLayer).getByText("第二条")).toBeTruthy();
  });

  it("does not expose inline sending from settings while the peer is offline", async () => {
    realtimeSyncMock.state.status = "connected";
    realtimeSyncMock.state.peerPresence = "offline";
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await openSettingsFromContextMenu();
    expect(screen.queryByLabelText("启用远程互动")).toBeNull();
    expect(screen.queryByLabelText("中继地址")).toBeNull();

    expect(screen.queryByLabelText("发送消息")).toBeNull();
    expect(screen.queryByRole("button", { name: "发送" })).toBeNull();

    expect(realtimeSyncMock.client.sendMessage).not.toHaveBeenCalled();
  });

  it("does not expose inline sending while disconnected with stale online presence", async () => {
    realtimeSyncMock.state.status = "disconnected";
    realtimeSyncMock.state.peerPresence = "online";
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await openSettingsFromContextMenu();

    expect(screen.getByText("未连接")).toBeTruthy();
    expect(screen.queryByText("对方在线")).toBeNull();
    expect(screen.queryByLabelText("发送消息")).toBeNull();
    expect(screen.queryByRole("button", { name: "发送" })).toBeNull();

    expect(realtimeSyncMock.client.sendMessage).not.toHaveBeenCalled();
  });

  it("loads a stale LAN relay binding as unpaired cloud sync settings", async () => {
    relayHttpClientMock.createPairCode.mockResolvedValueOnce({
      ok: true,
      code: "123456",
      expiresAt: "2026-08-03T12:10:00.000Z",
    });
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      ...completeProfileSettings(),
      sync: {
        enabled: true,
        relayUrl: "http://192.168.1.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_old_lan",
        peerDeviceId: "dev_b",
        activityStatus: "dazing",
      },
    });
    render(<App />);

    await openSettingsFromContextMenu();

    expect(screen.queryByText("已绑定")).toBeNull();
    expect(screen.getByRole("button", { name: "生成绑定码" })).toBeTruthy();
    expect(windowCommandsMock.writeSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        sync: expect.objectContaining({
          relayUrl: "http://159.75.175.47:8787",
          deviceId: "dev_a",
          deviceSecret: "secret_a",
          pairId: null,
          peerDeviceId: null,
          activityStatus: "dazing",
        }),
      }),
    );

    windowCommandsMock.writeSettings.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "生成绑定码" }));

    await waitFor(() =>
      expect(relayHttpClientMock.constructor).toHaveBeenCalledWith(
        "http://159.75.175.47:8787",
      ),
    );
    expect(relayHttpClientMock.createPairCode).toHaveBeenCalledWith({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      displayName: "Q 版桌宠",
      profile: localProfile,
    });
  });

  it("polls a generated pair code and stores the accepted pair for the creator", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-03T12:00:00.000Z"));
    relayHttpClientMock.createPairCode.mockResolvedValueOnce({
      ok: true,
      code: "123456",
      expiresAt: "2026-08-03T12:10:00.000Z",
    });
    relayHttpClientMock.getPairCodeStatus.mockResolvedValueOnce({
      ok: true,
      status: "paired",
      pairId: "pair_1",
      peerDeviceId: "dev_b",
      peerProfile,
    });
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      ...completeProfileSettings(),
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: null,
        peerDeviceId: null,
      },
    });
    render(<App />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await openSettingsFromContextMenu();
    expect(screen.queryByLabelText("启用远程互动")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "生成绑定码" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("等待对方输入绑定码")).toBeTruthy();
    expect(screen.getByLabelText("当前绑定码").textContent).toBe("123456");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(relayHttpClientMock.getPairCodeStatus).toHaveBeenCalledWith({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      code: "123456",
    });
    expect(windowCommandsMock.writeSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        sync: expect.objectContaining({
          pairId: "pair_1",
          peerDeviceId: "dev_b",
        }),
        profile: expect.objectContaining({
          peerByDeviceId: { dev_b: peerProfile },
        }),
      }),
    );
    expect(screen.queryByLabelText("当前绑定码")).toBeNull();
    expect(screen.getByText("已绑定")).toBeTruthy();
  });

  it("renders basic information between pet and remote settings", async () => {
    render(<App />);

    await openSettingsFromContextMenu();

    const basicInformation = screen.getByRole("region", { name: "基本信息" });
    const remoteInteraction = screen.getByRole("region", { name: "远程互动" });
    expect(
      basicInformation.compareDocumentPosition(remoteInteraction) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("blocks create and accept while basic information is incomplete", async () => {
    render(<App />);

    await openSettingsFromContextMenu();

    expect(screen.getByText("请先完成基本信息")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "生成绑定码" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "绑定" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(relayHttpClientMock.createPairCode).not.toHaveBeenCalled();
    expect(relayHttpClientMock.acceptPairCode).not.toHaveBeenCalled();
  });

  it("retries a pending local profile when realtime reconnects", async () => {
    realtimeSyncMock.state.status = "disconnected";
    relayHttpClientMock.saveProfile.mockResolvedValueOnce({
      ok: true,
      profile: {
        ...localProfile,
        updatedAt: "2026-08-18T08:00:00.000Z",
      },
    });
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      profile: {
        ...completeProfileSettings().profile,
        syncState: "pending",
      },
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    const view = render(<App />);
    await flushAppEffects();

    expect(relayHttpClientMock.saveProfile).not.toHaveBeenCalled();

    realtimeSyncMock.state.status = "connected";
    view.rerender(<App />);

    await waitFor(() =>
      expect(relayHttpClientMock.saveProfile).toHaveBeenCalledWith({
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        profile: localProfile,
      }),
    );
    await waitFor(() =>
      expect(windowCommandsMock.writeSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          profile: expect.objectContaining({ syncState: "synced" }),
        }),
      ),
    );
  });

  it("retries a failed pending upload only after the next reconnect edge", async () => {
    realtimeSyncMock.state.status = "disconnected";
    relayHttpClientMock.saveProfile.mockResolvedValue({
      ok: false,
      code: "relay_unavailable",
      message: "Relay unavailable",
    });
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      profile: {
        ...completeProfileSettings().profile,
        syncState: "pending",
      },
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    const view = render(<App />);
    await flushAppEffects();

    realtimeSyncMock.state.status = "connected";
    view.rerender(<App />);
    await waitFor(() =>
      expect(relayHttpClientMock.saveProfile).toHaveBeenCalledTimes(1),
    );
    await flushAppEffects();
    expect(relayHttpClientMock.saveProfile).toHaveBeenCalledTimes(1);

    realtimeSyncMock.state.status = "disconnected";
    view.rerender(<App />);
    await flushAppEffects();
    realtimeSyncMock.state.status = "connected";
    view.rerender(<App />);

    await waitFor(() =>
      expect(relayHttpClientMock.saveProfile).toHaveBeenCalledTimes(2),
    );
  });

  it("marks a pending profile synced after creating a pair code", async () => {
    relayHttpClientMock.createPairCode.mockResolvedValueOnce({
      ok: true,
      code: "123456",
      expiresAt: "2026-08-03T12:10:00.000Z",
    });
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      profile: {
        ...completeProfileSettings().profile,
        syncState: "pending",
      },
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: null,
        peerDeviceId: null,
      },
    });
    render(<App />);

    await openSettingsFromContextMenu();
    fireEvent.click(screen.getByRole("button", { name: "生成绑定码" }));

    await waitFor(() => expect(screen.getByLabelText("当前绑定码")).toBeTruthy());
    expect(windowCommandsMock.writeSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({ syncState: "synced" }),
      }),
    );
  });

  it("keeps a pending profile pending when pair-code creation fails", async () => {
    relayHttpClientMock.createPairCode.mockResolvedValueOnce({
      ok: false,
      code: "relay_unavailable",
      message: "Relay unavailable",
    });
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      profile: {
        ...completeProfileSettings().profile,
        syncState: "pending",
      },
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: null,
        peerDeviceId: null,
      },
    });
    render(<App />);

    await openSettingsFromContextMenu();
    windowCommandsMock.writeSettings.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "生成绑定码" }));

    await screen.findByText("Relay unavailable");
    expect(screen.getByText("等待同步")).toBeTruthy();
    expect(
      windowCommandsMock.writeSettings.mock.calls.some(
        ([settings]) => settings.profile?.syncState === "synced",
      ),
    ).toBe(false);
  });

  it("includes the complete profile when accepting and caches the returned peer profile", async () => {
    relayHttpClientMock.acceptPairCode.mockResolvedValueOnce({
      ok: true,
      pairId: "pair_1",
      peerDeviceId: "dev_b",
      peerProfile,
    });
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      profile: {
        ...completeProfileSettings().profile,
        syncState: "pending",
      },
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: null,
        peerDeviceId: null,
      },
    });
    render(<App />);

    await openSettingsFromContextMenu();
    fireEvent.change(screen.getByLabelText("输入绑定码"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定" }));

    await waitFor(() =>
      expect(relayHttpClientMock.acceptPairCode).toHaveBeenCalledWith({
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        displayName: "Q 版桌宠",
        code: "123456",
        profile: localProfile,
      }),
    );
    expect(windowCommandsMock.writeSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        sync: expect.objectContaining({
          pairId: "pair_1",
          peerDeviceId: "dev_b",
        }),
        profile: expect.objectContaining({
          syncState: "synced",
          peerByDeviceId: { dev_b: peerProfile },
        }),
      }),
    );
  });

  it("keeps a pending profile pending when accepting a pair code fails", async () => {
    relayHttpClientMock.acceptPairCode.mockResolvedValueOnce({
      ok: false,
      code: "relay_unavailable",
      message: "Relay unavailable",
    });
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      profile: {
        ...completeProfileSettings().profile,
        syncState: "pending",
      },
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: null,
        peerDeviceId: null,
      },
    });
    render(<App />);

    await openSettingsFromContextMenu();
    windowCommandsMock.writeSettings.mockClear();
    fireEvent.change(screen.getByLabelText("输入绑定码"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "绑定" }));

    await screen.findByText("Relay unavailable");
    expect(screen.getByText("等待同步")).toBeTruthy();
    expect(
      windowCommandsMock.writeSettings.mock.calls.some(
        ([settings]) => settings.profile?.syncState === "synced",
      ),
    ).toBe(false);
  });

  it("stores realtime peer profiles through the profile sync cache", async () => {
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      ...completeProfileSettings(),
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);
    await flushAppEffects();

    act(() => {
      realtimeSyncMock.callbacks?.onPeerProfile?.("dev_b", peerProfile);
    });

    await waitFor(() =>
      expect(windowCommandsMock.writeSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          profile: expect.objectContaining({
            peerByDeviceId: { dev_b: peerProfile },
          }),
        }),
      ),
    );
  });

  it("unpairs through the relay before clearing local pair settings", async () => {
    relayHttpClientMock.unpair.mockResolvedValueOnce({
      ok: true,
      pairId: "pair_1",
      unpairedAt: "2026-08-03T12:05:00.000Z",
    });
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await openSettingsFromContextMenu();
    await waitFor(() => expect(screen.getByText("已绑定")).toBeTruthy());
    windowCommandsMock.writeSettings.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "取消绑定" }));

    await waitFor(() =>
      expect(relayHttpClientMock.unpair).toHaveBeenCalledWith({
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
      }),
    );
    await waitFor(() =>
      expect(windowCommandsMock.writeSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          sync: expect.objectContaining({
            pairId: null,
            peerDeviceId: null,
          }),
        }),
      ),
    );
    expect(screen.queryByText("已绑定")).toBeNull();
  });

  it("clears local pair settings when relay reports the pair is already missing", async () => {
    relayHttpClientMock.unpair.mockResolvedValueOnce({
      ok: false,
      code: "pair_not_found",
      message: "Pair not found",
    });
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await openSettingsFromContextMenu();
    await waitFor(() => expect(screen.getByText("已绑定")).toBeTruthy());
    windowCommandsMock.writeSettings.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "取消绑定" }));

    await waitFor(() =>
      expect(windowCommandsMock.writeSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          sync: expect.objectContaining({
            pairId: null,
            peerDeviceId: null,
          }),
        }),
      ),
    );
    expect(screen.queryByText("已绑定")).toBeNull();
  });

  it("keeps local pair settings when relay unpair is unavailable", async () => {
    relayHttpClientMock.unpair.mockResolvedValueOnce({
      ok: false,
      code: "relay_unavailable",
      message: "Relay unavailable",
    });
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await openSettingsFromContextMenu();
    await waitFor(() => expect(screen.getByText("已绑定")).toBeTruthy());
    windowCommandsMock.writeSettings.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "取消绑定" }));

    await waitFor(() => expect(relayHttpClientMock.unpair).toHaveBeenCalledTimes(1));
    expect(windowCommandsMock.writeSettings).not.toHaveBeenCalled();
    expect(screen.getByText("已绑定")).toBeTruthy();
    expect(screen.getByText("无法连接中继，取消绑定失败，请稍后重试。")).toBeTruthy();
  });

  it("clears local pair settings without relay when local identity is incomplete", async () => {
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://159.75.175.47:8787",
        deviceId: "dev_a",
        deviceSecret: null,
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    await openSettingsFromContextMenu();
    await waitFor(() => expect(screen.getByText("已绑定")).toBeTruthy());
    windowCommandsMock.writeSettings.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "取消绑定" }));

    expect(relayHttpClientMock.unpair).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(windowCommandsMock.writeSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          sync: expect.objectContaining({
            pairId: null,
            peerDeviceId: null,
          }),
        }),
      ),
    );
  });

  it("passes the current movement range to desktop auto movement", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.95);
    render(<App />);

    act(() => {
      fireEvent.change(screen.getByLabelText("活动范围"), {
        target: { value: "free" },
      });
    });
    act(() => vi.advanceTimersByTime(14000));

    expect(windowCommandsMock.moveWindowForAutoStep).toHaveBeenCalledWith("free");
    randomSpy.mockRestore();
  });

  it("opens the pet context menu with right-click and can open settings", async () => {
    render(<App />);
    const petFrame = await screen.findByRole("img", { name: "Q 版小人" });
    const contextMenuEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 40,
      clientY: 50,
    });

    let wasNotPrevented = true;
    act(() => {
      wasNotPrevented = petFrame.dispatchEvent(contextMenuEvent);
    });

    expect(wasNotPrevented).toBe(false);
    expect(await screen.findByRole("menu", { name: "桌宠菜单" })).toBeTruthy();
    expect(screen.queryByRole("menu", { name: "互动选项" })).toBeNull();

    fireEvent.click(screen.getByRole("menuitem", { name: "设置" }));

    expect(screen.getByRole("button", { name: "设置" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("routes pet context menu commands through the desktop facade", async () => {
    render(<App />);
    const petFrame = await screen.findByRole("img", { name: "Q 版小人" });

    fireEvent.contextMenu(petFrame, { clientX: 48, clientY: 52 });
    fireEvent.click(screen.getByRole("menuitem", { name: "重置位置" }));
    expect(windowCommandsMock.resetWindowPosition).toHaveBeenCalledTimes(1);

    fireEvent.contextMenu(petFrame, { clientX: 48, clientY: 52 });
    fireEvent.click(screen.getByRole("menuitem", { name: "隐藏" }));
    expect(windowCommandsMock.hideWindow).toHaveBeenCalledTimes(1);

    fireEvent.contextMenu(petFrame, { clientX: 48, clientY: 52 });
    fireEvent.click(screen.getByRole("menuitem", { name: "退出" }));
    expect(windowCommandsMock.quitApp).toHaveBeenCalledTimes(1);
  });

  it("closes the pet context menu with Escape", async () => {
    render(<App />);
    const petFrame = await screen.findByRole("img", { name: "Q 版小人" });

    fireEvent.contextMenu(petFrame, { clientX: 48, clientY: 52 });
    expect(screen.getByRole("menu", { name: "桌宠菜单" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu", { name: "桌宠菜单" })).toBeNull();
  });
});
