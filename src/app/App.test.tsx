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
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PET_ACTION_DURATION_MS,
  PET_ACTION_FPS,
  PET_FRAMES_PER_ACTION,
  REQUIRED_PET_ACTIONS,
  type ImportedPetPackageSummary,
} from "../assets/petPackageContract";
import { App } from "./App";

const windowCommandsMock = vi.hoisted(() => ({
  openSettingsHandler: undefined as (() => void) | undefined,
  openSettingsUnlisten: vi.fn(),
  moveWindowForAutoStep: vi.fn().mockResolvedValue(undefined),
  openMessageComposerSurface: vi.fn().mockResolvedValue(undefined),
  closeMessageComposerSurface: vi.fn().mockResolvedValue(undefined),
  readSettings: vi.fn().mockResolvedValue({}),
  hideWindow: vi.fn().mockResolvedValue(undefined),
  quitApp: vi.fn().mockResolvedValue(undefined),
  resetWindowPosition: vi.fn().mockResolvedValue(undefined),
  restoreWindowFromEdgePeek: vi.fn().mockResolvedValue(undefined),
  setClickThrough: vi.fn().mockResolvedValue(undefined),
  snapWindowToEdgeIfNeeded: vi.fn().mockResolvedValue(null),
  startWindowDrag: vi.fn().mockResolvedValue(undefined),
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
          }): void;
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
          }): void;
        },
      ) => {
        mock.callbacks = callbacks;
        return { state: mock.state, client: mock.client };
      },
    ),
  };

  return mock;
});

const relayHttpClientMock = vi.hoisted(() => {
  const mock = {
    acceptPairCode: vi.fn(),
    createPairCode: vi.fn(),
    getPairCodeStatus: vi.fn(),
    unpair: vi.fn(),
    constructor: vi.fn(function RelayHttpClientMock() {
      return {
        acceptPairCode: mock.acceptPairCode,
        createPairCode: mock.createPairCode,
        getPairCodeStatus: mock.getPairCodeStatus,
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

vi.mock("../desktop/windowCommands", () => ({
  readSettings: windowCommandsMock.readSettings,
  writeSettings: windowCommandsMock.writeSettings,
  setAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
  setClickThrough: windowCommandsMock.setClickThrough,
  resetWindowPosition: windowCommandsMock.resetWindowPosition,
  restoreWindowFromEdgePeek: windowCommandsMock.restoreWindowFromEdgePeek,
  moveWindowForAutoStep: windowCommandsMock.moveWindowForAutoStep,
  openMessageComposerSurface: windowCommandsMock.openMessageComposerSurface,
  closeMessageComposerSurface: windowCommandsMock.closeMessageComposerSurface,
  hideWindow: windowCommandsMock.hideWindow,
  quitApp: windowCommandsMock.quitApp,
  snapWindowToEdgeIfNeeded: windowCommandsMock.snapWindowToEdgeIfNeeded,
  startWindowDrag: windowCommandsMock.startWindowDrag,
  listenForOpenSettings: vi.fn((handler: () => void) => {
    windowCommandsMock.openSettingsHandler = handler;
    return Promise.resolve(windowCommandsMock.openSettingsUnlisten);
  }),
}));

vi.mock("../sync/useRealtimeSync", () => ({
  useRealtimeSync: realtimeSyncMock.useRealtimeSync,
}));

vi.mock("../sync/relayHttpClient", () => ({
  RelayHttpClient: relayHttpClientMock.constructor,
}));

vi.mock("../assets/petPackageCommands", () => ({
  createPetPackageCommands: vi.fn(() => petPackageCommandsMock),
}));

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

  fireEvent.pointerDown(petStage, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(petStage, { pointerId: 1, clientX: 18, clientY: 10 });
  fireEvent.pointerUp(petStage, { pointerId: 1, clientX: 18, clientY: 10 });
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
  afterEach(() => {
    windowCommandsMock.openSettingsHandler = undefined;
    windowCommandsMock.openSettingsUnlisten.mockClear();
    windowCommandsMock.moveWindowForAutoStep.mockClear();
    windowCommandsMock.openMessageComposerSurface.mockClear();
    windowCommandsMock.closeMessageComposerSurface.mockClear();
    windowCommandsMock.readSettings.mockReset();
    windowCommandsMock.readSettings.mockResolvedValue({});
    windowCommandsMock.hideWindow.mockClear();
    windowCommandsMock.quitApp.mockClear();
    windowCommandsMock.resetWindowPosition.mockClear();
    windowCommandsMock.restoreWindowFromEdgePeek.mockClear();
    windowCommandsMock.setClickThrough.mockClear();
    windowCommandsMock.snapWindowToEdgeIfNeeded.mockReset();
    windowCommandsMock.snapWindowToEdgeIfNeeded.mockResolvedValue(null);
    windowCommandsMock.startWindowDrag.mockClear();
    windowCommandsMock.writeSettings.mockClear();
    realtimeSyncMock.callbacks = undefined;
    realtimeSyncMock.client.setActivityStatus.mockClear();
    realtimeSyncMock.client.sendMessage.mockClear();
    realtimeSyncMock.state.status = "disabled";
    realtimeSyncMock.state.peerPresence = "unknown";
    realtimeSyncMock.state.peerActivityStatus = null;
    realtimeSyncMock.state.peerPresenceChangedAt = null;
    realtimeSyncMock.state.peerLastSeenAt = null;
    realtimeSyncMock.state.lastError = null;
    realtimeSyncMock.useRealtimeSync.mockClear();
    relayHttpClientMock.acceptPairCode.mockReset();
    relayHttpClientMock.createPairCode.mockReset();
    relayHttpClientMock.getPairCodeStatus.mockReset();
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
    expect(screen.getByRole("menuitem", { name: "撒娇卖萌" })).toBeTruthy();
  });

  it("does not render a separate send message menu item", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("img", { name: "Q 版小人" }));

    expect(screen.queryByRole("menuitem", { name: "发消息" })).toBeNull();
    expect(screen.getAllByRole("menuitem")).toHaveLength(6);
    expect(screen.getByRole("menuitem", { name: "敲电脑" })).toBeTruthy();
  });

  it("opens interaction options with one left click on the pet stage", async () => {
    const { container } = render(<App />);
    await screen.findByRole("img", { name: "Q 版小人" });
    const petStage = container.querySelector(".pet-frame-stage");

    if (!petStage) {
      throw new Error("pet stage missing");
    }

    fireEvent.pointerDown(petStage, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(petStage, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.click(petStage);

    expect(screen.getByRole("menu", { name: "互动选项" })).toBeTruthy();
    expect(windowCommandsMock.startWindowDrag).not.toHaveBeenCalled();
  });

  it("keeps every radial interaction button inside a 320 by 360 window", async () => {
    await withViewport(320, 360, async () => {
      const { container } = render(<App />);
      await screen.findByRole("img", { name: "Q 版小人" });
      const petStage = container.querySelector(".pet-frame-stage");

      if (!petStage) {
        throw new Error("pet stage missing");
      }

      fireEvent.pointerDown(petStage, { pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerUp(petStage, { pointerId: 1, clientX: 100, clientY: 100 });
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
    fireEvent.click(screen.getByRole("menuitem", { name: "敲电脑" }));

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
    fireEvent.click(screen.getByRole("menuitem", { name: "敲电脑" }));

    expect(windowCommandsMock.openMessageComposerSurface).not.toHaveBeenCalled();
    expect(document.querySelector(".bubble-layer")?.textContent).toBe("对");
  });

  it("opens the message composer from the typing button when the peer is online", async () => {
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

    fireEvent.click(await screen.findByRole("img", { name: "Q 版小人" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "敲电脑" }));

    expect(windowCommandsMock.openMessageComposerSurface).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("region", { name: "发送消息" })).toBeTruthy();
    expect(screen.getByLabelText("消息内容")).toBeTruthy();
  });

  it("renders an embedded peer status card with the selected peer portrait", async () => {
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
    render(<App />);

    await flushAppEffects();

    const card = await screen.findByLabelText("对方状态");
    expect(card.getAttribute("data-status-variant")).toBe("slacking");
    expect(screen.getByText("TA 摸鱼中")).toBeTruthy();
    expect(screen.getByText("偷偷歇一会")).toBeTruthy();
    expect(screen.getByRole("img", { name: "对方头像" }).getAttribute("src")).toBe(
      "asset://C:/app/pet-packages/moon-buddy/portrait.png",
    );
    expect(screen.queryByLabelText("对方在线状态")).toBeNull();
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
    expect(screen.getByText("TA 离线")).toBeTruthy();
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
    expect(screen.queryByRole("img", { name: "对方头像" })).toBeNull();
    expect(screen.getByText("TA")).toBeTruthy();
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
    expect(screen.queryByRole("img", { name: "对方头像" })).toBeNull();
    expect(screen.getByText("TA")).toBeTruthy();
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
    fireEvent.click(screen.getByRole("menuitem", { name: "敲电脑" }));
    await flushAppEffects();
    expect(screen.getByRole("region", { name: "发送消息" })).toBeTruthy();
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

  it("closes the status picker immediately and defers the context menu until edge-peek restore completes", async () => {
    const snapDeferred = createDeferred<"left">();
    const restoreDeferred = createDeferred<void>();
    realtimeSyncMock.state.status = "connected";
    realtimeSyncMock.state.peerPresence = "online";
    windowCommandsMock.snapWindowToEdgeIfNeeded.mockReturnValueOnce(
      snapDeferred.promise,
    );
    windowCommandsMock.restoreWindowFromEdgePeek.mockReturnValueOnce(
      restoreDeferred.promise,
    );
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

    const surface = screen.getByRole("region", { name: "情侣桌宠 MVP" });
    await dragPetPastThresholdAndRelease(surface);

    fireEvent.click(screen.getByRole("img", { name: "Q 版小人" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "我的状态" }));
    expect(screen.getByRole("dialog", { name: "我的状态" })).toBeTruthy();

    await act(async () => {
      snapDeferred.resolve("left");
      await snapDeferred.promise;
    });
    await flushAppEffects();

    fireEvent.contextMenu(surface, { clientX: 48, clientY: 52 });

    expect(screen.queryByRole("dialog", { name: "我的状态" })).toBeNull();
    expect(screen.queryByRole("menu", { name: "桌宠菜单" })).toBeNull();

    await act(async () => {
      restoreDeferred.resolve();
      await restoreDeferred.promise;
    });
    await flushAppEffects();

    const settingsItem = screen.getByRole("menuitem", { name: "设置" });
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

    fireEvent.click(await screen.findByRole("img", { name: "Q 版小人" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "敲电脑" }));
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
    expect(screen.queryByRole("region", { name: "发送消息" })).toBeNull();
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

    fireEvent.click(screen.getByRole("img", { name: "动作池小人" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "敲电脑" }));
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

    fireEvent.click(await screen.findByRole("img", { name: "Q 版小人" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "敲电脑" }));
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

    fireEvent.click(await screen.findByRole("img", { name: "Q 版小人" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "敲电脑" }));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    await waitFor(() =>
      expect(windowCommandsMock.closeMessageComposerSurface).toHaveBeenCalledTimes(
        1,
      ),
    );
    expect(screen.queryByRole("region", { name: "发送消息" })).toBeNull();

    fireEvent.click(screen.getByRole("img", { name: "Q 版小人" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "敲电脑" }));
    fireEvent.keyDown(screen.getByLabelText("消息内容"), { key: "Escape" });

    await waitFor(() =>
      expect(windowCommandsMock.closeMessageComposerSurface).toHaveBeenCalledTimes(
        2,
      ),
    );
    expect(screen.queryByRole("region", { name: "发送消息" })).toBeNull();
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

  it("shows a placeholder bubble for non-typing function buttons without matching motions", async () => {
    vi.useFakeTimers();
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

    const petImage = screen.getByRole("img", { name: "动作池小人" });

    act(() => {
      fireEvent.click(petImage);
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "撒娇卖萌" }));

    expect(screen.queryByRole("menu", { name: "互动选项" })).toBeNull();
    expect(screen.queryByText("陪我一会儿嘛。")).toBeNull();
    await advanceTypewriterText("功能开发中，先陪你待一会儿。");

    expect(screen.getByText("功能开发中，先陪你待一会儿。")).toBeTruthy();
    expect(petImage.closest("[data-motion-id]")?.getAttribute("data-motion-id")).not.toBe(
      "act-cute",
    );
  });

  it("plays a matching motion for non-typing function buttons", async () => {
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
        "act-wave": {
          fps: 5,
          loop: false,
          frameCount: 2,
          durationMs: 6000,
          frames: "motions/act-wave/",
          weight: 1,
          tags: ["interaction"],
        },
      },
      motionFramePaths: {
        "motion-001": [
          "C:/app/pet-packages/motion-buddy/motions/motion-001/0001.png",
          "C:/app/pet-packages/motion-buddy/motions/motion-001/0002.png",
        ],
        "act-wave": [
          "C:/app/pet-packages/motion-buddy/motions/act-wave/0001.png",
          "C:/app/pet-packages/motion-buddy/motions/act-wave/0002.png",
        ],
      },
    });
    petPackageCommandsMock.listPetPackages.mockResolvedValueOnce([motionPackage]);
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      appearance: {
        selectedPetPackageId: motionPackage.id,
        peerPetPackageByDeviceId: {},
      },
    });
    render(<App />);

    await flushAppEffects();
    const petImage = screen.getByRole("img", { name: "动作池小人" });

    fireEvent.click(petImage);
    fireEvent.click(screen.getByRole("menuitem", { name: "打招呼" }));

    expect(screen.queryByRole("menu", { name: "互动选项" })).toBeNull();
    expect(
      screen
        .getByRole("img", { name: "动作池小人" })
        .closest("[data-motion-id]")
        ?.getAttribute("data-motion-id"),
    ).toBe("act-wave");
    expect(screen.queryByText("功能开发中，先陪你待一会儿。")).toBeNull();
  });

  it("ignores configured scene data for non-typing function buttons", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const scenicPackage = importedPackageSummary();
    scenicPackage.scenes = {
      ...scenicPackage.scenes,
      "act-cute": {
        action: "act-wave",
        bubbleCues: [{ atMs: 1000, text: "挥挥手。" }],
        returnTo: "idle-look",
      },
    };
    petPackageCommandsMock.listPetPackages.mockResolvedValueOnce([scenicPackage]);
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      appearance: {
        selectedPetPackageId: scenicPackage.id,
        peerPetPackageByDeviceId: {},
      },
    });
    render(<App />);

    await flushAppEffects();
    const petImage = screen.getByRole("img", { name: "月亮伙伴" });

    act(() => {
      fireEvent.click(petImage);
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "撒娇卖萌" }));

    expect(screen.queryByText("功能开发中，先陪你待一会儿。")).toBeNull();
    expect(screen.queryByText("挥挥手。")).toBeNull();
    const stage = screen
      .getByRole("img", { name: "月亮伙伴" })
      .closest("[data-action]");
    expect(stage?.getAttribute("data-motion-id")).toBe("act-cute");
    expect(stage?.getAttribute("data-action")).not.toBe("act-wave");
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

  it("refreshes the hide timer when the same bubble is shown again", async () => {
    vi.useFakeTimers();
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

    const petFrame = screen.getByRole("img", { name: "动作池小人" });

    act(() => {
      fireEvent.click(petFrame);
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "撒娇卖萌" }));
    await advanceTypewriterText("功能开发中，先陪你待一会儿。");
    expect(screen.getByText("功能开发中，先陪你待一会儿。")).toBeTruthy();

    act(() => vi.advanceTimersByTime(1000));
    act(() => {
      fireEvent.click(petFrame);
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "撒娇卖萌" }));
    await advanceTypewriterText("功能开发中，先陪你待一会儿。");
    act(() => vi.advanceTimersByTime(1000));

    expect(screen.getByText("功能开发中，先陪你待一会儿。")).toBeTruthy();
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

  it("starts desktop window dragging only after pet movement crosses the drag threshold", () => {
    const { container } = render(<App />);
    const petStage = container.querySelector(".pet-frame-stage");

    if (!petStage) {
      throw new Error("pet stage missing");
    }

    fireEvent.pointerDown(petStage, { pointerId: 1, clientX: 10, clientY: 10 });
    expect(windowCommandsMock.startWindowDrag).not.toHaveBeenCalled();

    fireEvent.pointerMove(petStage, { pointerId: 1, clientX: 18, clientY: 10 });
    expect(windowCommandsMock.startWindowDrag).toHaveBeenCalledTimes(1);
  });

  it("enters edge peek after drag end returns an edge side", async () => {
    windowCommandsMock.snapWindowToEdgeIfNeeded.mockResolvedValueOnce("left");
    const { container } = render(<App />);

    await dragPetPastThresholdAndRelease(container);

    expect(await screen.findByAltText("桌宠半隐藏")).toBeTruthy();
  });

  it("restores from edge peek before opening the interaction menu", async () => {
    windowCommandsMock.snapWindowToEdgeIfNeeded.mockResolvedValueOnce("left");
    const { container } = render(<App />);

    await dragPetPastThresholdAndRelease(container);
    fireEvent.click(await screen.findByAltText("桌宠半隐藏"));

    await waitFor(() =>
      expect(windowCommandsMock.restoreWindowFromEdgePeek).toHaveBeenCalledWith(
        "left",
      ),
    );
    expect(await screen.findByRole("menu", { name: "互动选项" })).toBeTruthy();
  });

  it("disables and persists click-through before opening settings from the context menu", async () => {
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
    expect(windowCommandsMock.writeSettings).toHaveBeenCalledWith(
      expect.objectContaining({ clickThrough: false }),
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

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByLabelText("对方桌宠消息")).toBeNull();
  });

  it("temporarily disables click-through while a remote message waits for acknowledgement", async () => {
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
        id: "msg_1",
        fromDeviceId: "dev_b",
        text: "看我一眼",
        at: "2026-08-03T12:00:00.000Z",
      });
    });

    await flushAppEffects();
    expect(windowCommandsMock.setClickThrough).toHaveBeenCalledWith(false);
    expect(windowCommandsMock.writeSettings).not.toHaveBeenCalled();

    fireEvent.pointerEnter(screen.getByLabelText("对方桌宠消息"));
    await flushAppEffects();
    act(() => vi.advanceTimersByTime(800));

    await flushAppEffects();
    expect(screen.queryByLabelText("对方桌宠消息")).toBeNull();
    expect(windowCommandsMock.setClickThrough).toHaveBeenCalledWith(true);
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
    act(() => vi.advanceTimersByTime(800));

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
    });
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
      }),
    );
    expect(screen.queryByLabelText("当前绑定码")).toBeNull();
    expect(screen.getByText("已绑定")).toBeTruthy();
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
