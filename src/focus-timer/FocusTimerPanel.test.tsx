import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FocusTimerPanel } from "./FocusTimerPanel";

describe("FocusTimerPanel", () => {
  it("starts with the last duration and exposes the four approved presets", () => {
    render(
      <FocusTimerPanel initialMinutes={25} onStart={vi.fn()} onClose={vi.fn()} />,
    );

    expect(screen.getByRole("timer").textContent).toBe("25:00");
    expect(screen.getByRole("button", { name: "15分钟" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "25分钟" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "45分钟" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "60分钟" })).toBeTruthy();
  });

  it("keeps the minute stepper inside 1 through 180", () => {
    const { rerender } = render(
      <FocusTimerPanel initialMinutes={1} onStart={vi.fn()} onClose={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "减少一分钟" }));
    expect(screen.getByRole("timer").textContent).toBe("01:00");

    rerender(
      <FocusTimerPanel initialMinutes={180} onStart={vi.fn()} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "增加一分钟" }));
    expect(screen.getByRole("timer").textContent).toBe("180:00");
  });

  it("submits presets and closes from cancel or Escape", () => {
    const onStart = vi.fn();
    const onClose = vi.fn();
    render(
      <FocusTimerPanel initialMinutes={25} onStart={onStart} onClose={onClose} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "45分钟" }));
    fireEvent.click(screen.getByRole("button", { name: "开始专注" }));
    expect(onStart).toHaveBeenCalledWith(45);

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
