import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  readSettings: vi.fn().mockResolvedValue({}),
  hideWindow: vi.fn().mockResolvedValue(undefined),
  quitApp: vi.fn().mockResolvedValue(undefined),
  resetWindowPosition: vi.fn().mockResolvedValue(undefined),
  setClickThrough: vi.fn().mockResolvedValue(undefined),
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
      sendMessage: vi.fn(() => ({
        ok: true as const,
        clientMessageId: "local_test",
      })),
    },
    state: {
      status: "disabled" as
        | "disabled"
        | "connecting"
        | "connected"
        | "disconnected"
        | "authFailed",
      peerPresence: "unknown" as "unknown" | "online" | "offline",
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
  moveWindowForAutoStep: windowCommandsMock.moveWindowForAutoStep,
  hideWindow: windowCommandsMock.hideWindow,
  quitApp: windowCommandsMock.quitApp,
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
  return {
    id: `imported:${manifestId}`,
    manifestId,
    name,
    baseSize: { width: 256, height: 320 },
    frameSize: { width: 768, height: 960 },
    previewPath: `C:/app/pet-packages/${manifestId}/preview.png`,
    actions: importedActions(),
    scenes: importedScenes(),
    framePaths: importedFramePaths(manifestId),
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

async function flushAppEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("App", () => {
  afterEach(() => {
    windowCommandsMock.openSettingsHandler = undefined;
    windowCommandsMock.openSettingsUnlisten.mockClear();
    windowCommandsMock.moveWindowForAutoStep.mockClear();
    windowCommandsMock.readSettings.mockReset();
    windowCommandsMock.readSettings.mockResolvedValue({});
    windowCommandsMock.hideWindow.mockClear();
    windowCommandsMock.quitApp.mockClear();
    windowCommandsMock.resetWindowPosition.mockClear();
    windowCommandsMock.setClickThrough.mockClear();
    windowCommandsMock.startWindowDrag.mockClear();
    windowCommandsMock.writeSettings.mockClear();
    realtimeSyncMock.callbacks = undefined;
    realtimeSyncMock.client.sendMessage.mockClear();
    realtimeSyncMock.state.status = "disabled";
    realtimeSyncMock.state.peerPresence = "unknown";
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
    expect(screen.getByRole("button", { name: "设置" })).toBeTruthy();
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

  it("keeps the settings button visually hidden by default", async () => {
    render(<App />);

    const settingsButton = await screen.findByRole("button", { name: "设置" });

    expect(settingsButton.className).toBe("settings-toggle is-hidden");
  });

  it("opens interaction options when clicking the pet", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("img", { name: "Q 版小人" }));

    expect(screen.getByRole("menu", { name: "互动选项" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "撒娇卖萌" })).toBeTruthy();
  });

  it("shows an interaction bubble from the motion scene cue instead of immediately", async () => {
    vi.useFakeTimers();
    render(<App />);

    const petImage = screen.getByRole("img", { name: "Q 版小人" });

    act(() => {
      fireEvent.click(petImage);
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "撒娇卖萌" }));

    expect(screen.queryByRole("menu", { name: "互动选项" })).toBeNull();
    expect(screen.queryByText("陪我一会儿嘛。")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1800);
    });

    expect(screen.getByText("陪我一会儿嘛。").textContent).toBe("陪我一会儿嘛。");

    act(() => {
      vi.advanceTimersByTime(4250);
    });

    expect(petImage.closest("[data-action]")?.getAttribute("data-action")).toBe(
      "idle-breathe",
    );
  });

  it("plays the configured scene action and returns to the configured idle action", async () => {
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

    expect(
      screen
        .getByRole("img", { name: "月亮伙伴" })
        .closest("[data-action]")
        ?.getAttribute("data-action"),
    ).toBe("act-wave");

    act(() => {
      vi.advanceTimersByTime(6250);
    });

    expect(
      screen
        .getByRole("img", { name: "月亮伙伴" })
        .closest("[data-action]")
        ?.getAttribute("data-action"),
    ).toBe("idle-look");
  });

  it("refreshes the hide timer when the same bubble is shown again", async () => {
    vi.useFakeTimers();
    render(<App />);

    const petFrame = screen.getByRole("img", { name: "Q 版小人" });

    act(() => {
      fireEvent.click(petFrame);
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "撒娇卖萌" }));
    act(() => vi.advanceTimersByTime(1800));
    expect(screen.getByText("陪我一会儿嘛。").textContent).toBe("陪我一会儿嘛。");

    act(() => vi.advanceTimersByTime(1000));
    act(() => {
      fireEvent.click(petFrame);
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "撒娇卖萌" }));
    act(() => vi.advanceTimersByTime(1800));
    act(() => vi.advanceTimersByTime(1000));

    expect(screen.getByText("陪我一会儿嘛。").textContent).toBe("陪我一会儿嘛。");
  });

  it("opens settings when the desktop open-settings event is received", async () => {
    render(<App />);

    const settingsButton = screen.getByRole("button", { name: "设置" });
    expect(settingsButton.getAttribute("aria-expanded")).toBe("false");

    await waitFor(() => expect(windowCommandsMock.openSettingsHandler).toBeTruthy());

    act(() => {
      windowCommandsMock.openSettingsHandler?.();
    });

    expect(settingsButton.getAttribute("aria-expanded")).toBe("true");
    expect(settingsButton.classList.contains("is-visible")).toBe(true);
  });

  it("closes the settings panel from the panel header", async () => {
    render(<App />);

    const settingsButton = screen.getByRole("button", { name: "设置" });
    fireEvent.click(settingsButton);
    expect(settingsButton.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById("settings-panel")?.className).toBe(
      "settings-dock",
    );

    fireEvent.click(screen.getByRole("button", { name: "关闭设置" }));

    expect(settingsButton.getAttribute("aria-expanded")).toBe("false");
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

    fireEvent.click(await screen.findByRole("button", { name: "设置" }));
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

    fireEvent.click(await screen.findByRole("button", { name: "设置" }));
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

    fireEvent.click(await screen.findByRole("button", { name: "设置" }));
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

    fireEvent.click(await screen.findByRole("button", { name: "设置" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "删除月亮伙伴" })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "删除月亮伙伴" }));

    expect(petPackageCommandsMock.deletePetPackage).not.toHaveBeenCalled();
    expect(await screen.findByText("对方形象正在使用，不能删除")).toBeTruthy();
  });

  it("renders a received message with the selected peer pet package", async () => {
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
        relayUrl: "http://127.0.0.1:8787",
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
        text: "我来串门啦",
        at: "2026-08-03T12:00:00.000Z",
      });
    });

    expect(await screen.findByRole("img", { name: "月亮伙伴来访" })).toBeTruthy();
  });

  it("persists the selected peer pet package for the paired device", async () => {
    petPackageCommandsMock.listPetPackages.mockResolvedValueOnce([
      importedPackageSummary(),
    ]);
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://127.0.0.1:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "设置" }));
    await waitFor(() => expect(screen.getByLabelText("对方形象")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("对方形象"), {
      target: { value: "imported:moon-buddy" },
    });

    expect(windowCommandsMock.writeSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        appearance: expect.objectContaining({
          peerPetPackageByDeviceId: {
            dev_b: "imported:moon-buddy",
          },
        }),
      }),
    );
  });

  it("starts desktop window dragging when pet drag begins", () => {
    const { container } = render(<App />);
    const petStage = container.querySelector(".pet-frame-stage");

    if (!petStage) {
      throw new Error("pet stage missing");
    }

    fireEvent.pointerDown(petStage, { pointerId: 1, clientX: 10, clientY: 10 });

    expect(windowCommandsMock.startWindowDrag).toHaveBeenCalledTimes(1);
  });

  it("disables and persists click-through before opening settings from the button", async () => {
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

    const settingsButton = screen.getByRole("button", { name: "设置" });
    fireEvent.click(settingsButton);

    expect(settingsButton.getAttribute("aria-expanded")).toBe("true");
    expect(windowCommandsMock.setClickThrough).toHaveBeenCalledWith(false);
    expect(windowCommandsMock.writeSettings).toHaveBeenCalledWith(
      expect.objectContaining({ clickThrough: false }),
    );
  });

  it("closes the settings panel before enabling click-through from settings", async () => {
    render(<App />);

    const settingsButton = screen.getByRole("button", { name: "设置" });
    fireEvent.click(settingsButton);
    expect(settingsButton.getAttribute("aria-expanded")).toBe("true");

    windowCommandsMock.setClickThrough.mockClear();
    windowCommandsMock.writeSettings.mockClear();
    fireEvent.click(screen.getByLabelText("点击穿透"));

    await waitFor(() =>
      expect(settingsButton.getAttribute("aria-expanded")).toBe("false"),
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
        relayUrl: "http://127.0.0.1:8787",
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
        text: "想你啦",
        at: "2026-08-03T12:00:00.000Z",
      });
    });

    const remoteLayer = screen.getByLabelText("对方桌宠消息");
    expect(remoteLayer).toBeTruthy();
    const visitorImage = screen.getByRole("img", {
      name: "Q 版小人来访",
    }) as HTMLImageElement;
    expect(visitorImage.getAttribute("src")).toContain(
      "/src/assets/pets/q-girl/frames/act-wave/0001.png",
    );
    expect(within(remoteLayer).getByText("想你啦")).toBeTruthy();

    act(() => vi.advanceTimersByTime(5000));

    expect(within(screen.getByLabelText("对方桌宠消息")).getByText("想你啦")).toBeTruthy();
    expect(screen.queryByText("我在这里。")).toBeNull();
  });

  it("dismisses a received remote message only after hover acknowledgement", async () => {
    vi.useFakeTimers();
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://127.0.0.1:8787",
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

    expect(screen.getByRole("img", { name: "Q 版小人来访" })).toBeTruthy();
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
        relayUrl: "http://127.0.0.1:8787",
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
        relayUrl: "http://127.0.0.1:8787",
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
    expect(within(firstRemoteLayer).getByText("第一条")).toBeTruthy();
    expect(within(firstRemoteLayer).queryByText("第二条")).toBeNull();

    fireEvent.pointerEnter(screen.getByLabelText("对方桌宠消息"));
    await flushAppEffects();
    act(() => vi.advanceTimersByTime(800));

    const secondRemoteLayer = screen.getByLabelText("对方桌宠消息");
    expect(within(secondRemoteLayer).queryByText("第一条")).toBeNull();
    expect(within(secondRemoteLayer).getByText("第二条")).toBeTruthy();
  });

  it("does not send messages while the peer is offline", async () => {
    realtimeSyncMock.state.status = "connected";
    realtimeSyncMock.state.peerPresence = "offline";
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://127.0.0.1:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "设置" }));
    await waitFor(() =>
      expect((screen.getByLabelText("启用远程互动") as HTMLInputElement).checked).toBe(
        true,
      ),
    );

    expect(screen.getByText("对方当前不在线")).toBeTruthy();
    expect((screen.getByLabelText("发送消息") as HTMLTextAreaElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(realtimeSyncMock.client.sendMessage).not.toHaveBeenCalled();
  });

  it("does not send messages while disconnected with stale online presence", async () => {
    realtimeSyncMock.state.status = "disconnected";
    realtimeSyncMock.state.peerPresence = "online";
    windowCommandsMock.readSettings.mockResolvedValueOnce({
      sync: {
        enabled: true,
        relayUrl: "http://127.0.0.1:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "设置" }));
    await waitFor(() =>
      expect((screen.getByLabelText("启用远程互动") as HTMLInputElement).checked).toBe(
        true,
      ),
    );

    expect(screen.getByText("未连接")).toBeTruthy();
    expect(screen.queryByText("对方在线")).toBeNull();
    expect((screen.getByLabelText("发送消息") as HTMLTextAreaElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(realtimeSyncMock.client.sendMessage).not.toHaveBeenCalled();
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
        relayUrl: "http://127.0.0.1:8787",
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
    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    expect((screen.getByLabelText("启用远程互动") as HTMLInputElement).checked).toBe(
      true,
    );
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
        relayUrl: "http://127.0.0.1:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "设置" }));
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
        relayUrl: "http://127.0.0.1:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "设置" }));
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
        relayUrl: "http://127.0.0.1:8787",
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "设置" }));
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
        relayUrl: "http://127.0.0.1:8787",
        deviceId: "dev_a",
        deviceSecret: null,
        pairId: "pair_1",
        peerDeviceId: "dev_b",
      },
    });
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "设置" }));
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
    render(<App />);

    act(() => {
      fireEvent.change(screen.getByLabelText("活动范围"), {
        target: { value: "free" },
      });
    });
    act(() => vi.advanceTimersByTime(8000));

    expect(windowCommandsMock.moveWindowForAutoStep).toHaveBeenCalledWith("free");
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
