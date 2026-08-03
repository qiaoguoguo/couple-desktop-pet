import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("renders the desktop pet shell", async () => {
    render(<App />);

    expect(
      await screen.findByRole("region", { name: "情侣桌宠 MVP" }),
    ).toBeTruthy();
    expect(screen.getByRole("img", { name: "星星睡衣小星人" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "设置" })).toBeTruthy();
  });

  it("keeps the settings button visually hidden by default", async () => {
    render(<App />);

    const settingsButton = await screen.findByRole("button", { name: "设置" });

    expect(settingsButton.className).toBe("settings-toggle is-hidden");
  });

  it("opens interaction options when clicking the pet", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("img", { name: "星星睡衣小星人" }));

    expect(screen.getByRole("menu", { name: "互动选项" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "撒娇卖萌" })).toBeTruthy();
  });

  it("selects an interaction, closes the menu, and shows the interaction bubble", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("img", { name: "星星睡衣小星人" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "撒娇卖萌" }));

    expect(screen.queryByRole("menu", { name: "互动选项" })).toBeNull();
    expect(screen.getByText("陪我一会儿嘛。").textContent).toBe("陪我一会儿嘛。");
  });

  it("refreshes the hide timer when the same bubble is shown again", async () => {
    vi.useFakeTimers();
    render(<App />);

    const petFrame = screen.getByRole("img", { name: "星星睡衣小星人" });

    fireEvent.click(petFrame);
    fireEvent.click(screen.getByRole("menuitem", { name: "撒娇卖萌" }));
    expect(screen.getByText("陪我一会儿嘛。").textContent).toBe("陪我一会儿嘛。");

    act(() => vi.advanceTimersByTime(1000));
    fireEvent.click(petFrame);
    fireEvent.click(screen.getByRole("menuitem", { name: "撒娇卖萌" }));
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

  it("shows received realtime messages in the pet bubble", async () => {
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

    await waitFor(() => expect(realtimeSyncMock.callbacks).toBeTruthy());

    act(() => {
      realtimeSyncMock.callbacks?.onMessage({
        id: "msg_1",
        fromDeviceId: "dev_b",
        text: "想你啦",
        at: "2026-08-03T12:00:00.000Z",
      });
    });

    expect((await screen.findAllByText("想你啦")).length).toBeGreaterThan(0);
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
    const petFrame = await screen.findByRole("img", { name: "星星睡衣小星人" });
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
    const petFrame = await screen.findByRole("img", { name: "星星睡衣小星人" });

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
    const petFrame = await screen.findByRole("img", { name: "星星睡衣小星人" });

    fireEvent.contextMenu(petFrame, { clientX: 48, clientY: 52 });
    expect(screen.getByRole("menu", { name: "桌宠菜单" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu", { name: "桌宠菜单" })).toBeNull();
  });
});
