import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const windowCommandsMock = vi.hoisted(() => ({
  openSettingsHandler: undefined as (() => void) | undefined,
  openSettingsUnlisten: vi.fn(),
  moveWindowForAutoStep: vi.fn().mockResolvedValue(undefined),
  readSettings: vi.fn().mockResolvedValue({}),
  setClickThrough: vi.fn().mockResolvedValue(undefined),
  startWindowDrag: vi.fn().mockResolvedValue(undefined),
  writeSettings: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../desktop/windowCommands", () => ({
  readSettings: windowCommandsMock.readSettings,
  writeSettings: windowCommandsMock.writeSettings,
  setAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
  setClickThrough: windowCommandsMock.setClickThrough,
  resetWindowPosition: vi.fn().mockResolvedValue(undefined),
  moveWindowForAutoStep: windowCommandsMock.moveWindowForAutoStep,
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
    expect(screen.getByLabelText("星星睡衣小星人开发占位")).toBeTruthy();
    expect(screen.getByRole("button", { name: "设置" })).toBeTruthy();
  });

  it("shows a bubble when clicking the fallback pet", async () => {
    render(<App />);

    fireEvent.click(await screen.findByLabelText("星星睡衣小星人开发占位"));

    expect(screen.getByText("我在这里。").textContent).toBe("我在这里。");
  });

  it("refreshes the hide timer when the same bubble is shown again", async () => {
    vi.useFakeTimers();
    render(<App />);

    const fallbackPet = screen.getByLabelText("星星睡衣小星人开发占位");

    fireEvent.click(fallbackPet);
    expect(screen.getByText("我在这里。").textContent).toBe("我在这里。");

    act(() => vi.advanceTimersByTime(1000));
    fireEvent.click(fallbackPet);
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
  });

  it("starts desktop window dragging when pet drag begins", () => {
    const { container } = render(<App />);
    const petStage = container.querySelector(".pixi-pet-stage");

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
});
