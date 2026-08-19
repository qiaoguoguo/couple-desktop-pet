import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FocusTimerPill } from "./FocusTimerPill";

describe("FocusTimerPill", () => {
  it("shows the remaining time and marks only its visible root interactive", () => {
    const { container } = render(
      <FocusTimerPill
        state={{ status: "running", durationMinutes: 25, startedAt: 1_000, endsAt: 1_501_000 }}
        now={2_000}
        controlsOpen={false}
        onToggleControls={vi.fn()}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onEnd={vi.fn()}
      />,
    );

    expect(screen.getByRole("timer").textContent).toBe("24:59");
    expect(container.querySelector("[data-desktop-interactive-region]")).toBeTruthy();
    expect(container.querySelector("img")?.getAttribute("src")).toBeTruthy();
  });

  it("opens controls and dispatches pause or end", () => {
    const onToggleControls = vi.fn();
    const onPause = vi.fn();
    const onEnd = vi.fn();
    render(
      <FocusTimerPill
        state={{ status: "running", durationMinutes: 25, startedAt: 0, endsAt: 60_000 }}
        now={1_000}
        controlsOpen
        onToggleControls={onToggleControls}
        onPause={onPause}
        onResume={vi.fn()}
        onEnd={onEnd}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "收起专注计时控制" }));
    fireEvent.click(screen.getByRole("button", { name: "暂停" }));
    fireEvent.click(screen.getByRole("button", { name: "结束计时" }));
    expect(onToggleControls).toHaveBeenCalledOnce();
    expect(onPause).toHaveBeenCalledOnce();
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("offers resume for paused timers", () => {
    const onResume = vi.fn();
    render(
      <FocusTimerPill
        state={{ status: "paused", durationMinutes: 25, remainingMs: 90_000 }}
        now={1_000}
        controlsOpen
        onToggleControls={vi.fn()}
        onPause={vi.fn()}
        onResume={onResume}
        onEnd={vi.fn()}
      />,
    );

    expect(screen.getByRole("timer").textContent).toBe("01:30");
    fireEvent.click(screen.getByRole("button", { name: "继续" }));
    expect(onResume).toHaveBeenCalledOnce();
  });
});
