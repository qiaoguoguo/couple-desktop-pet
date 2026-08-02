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

  it("shows a bubble when clicking the pet frame", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("img", { name: "星星睡衣小星人" }));

    expect(screen.getByText("我在这里。").textContent).toBe("我在这里。");
  });

  it("refreshes the hide timer when the same bubble is shown again", async () => {
    vi.useFakeTimers();
    render(<App />);

    const petFrame = screen.getByRole("img", { name: "星星睡衣小星人" });

    fireEvent.click(petFrame);
    expect(screen.getByText("我在这里。").textContent).toBe("我在这里。");

    act(() => vi.advanceTimersByTime(1000));
    fireEvent.click(petFrame);
    act(() => vi.advanceTimersByTime(1000));

    expect(screen.getByText("我在这里。").textContent).toBe("我在这里。");
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
