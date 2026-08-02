import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("../desktop/windowCommands", () => ({
  readSettings: vi.fn().mockResolvedValue({}),
  writeSettings: vi.fn().mockResolvedValue(undefined),
  setAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
  setClickThrough: vi.fn().mockResolvedValue(undefined),
  resetWindowPosition: vi.fn().mockResolvedValue(undefined),
}));

describe("App", () => {
  afterEach(() => {
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
});
