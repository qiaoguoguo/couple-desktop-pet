import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FocusTimerCompletion } from "./FocusTimerCompletion";

const state = {
  status: "completed-unacknowledged" as const,
  durationMinutes: 25,
  completedAt: 1_000,
  collapsed: false,
};

describe("FocusTimerCompletion", () => {
  it("renders the approved emotional copy and both actions", () => {
    const onAcknowledge = vi.fn();
    const onRepeat = vi.fn();
    render(
      <FocusTimerCompletion
        state={state}
        presentation="expanded"
        onAcknowledge={onAcknowledge}
        onRepeat={onRepeat}
        onExpand={vi.fn()}
      />,
    );

    expect(screen.getByText("专注完成")).toBeTruthy();
    expect(screen.getByText("这一小段，认真完成了")).toBeTruthy();
    expect(screen.getByText("辛苦啦，休息一下吧。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "知道啦" }));
    fireEvent.click(screen.getByRole("button", { name: "再来一次" }));
    expect(onAcknowledge).toHaveBeenCalledOnce();
    expect(onRepeat).toHaveBeenCalledOnce();
  });

  it("uses an independent UI animation shell and an interactive region", () => {
    const { container } = render(
      <FocusTimerCompletion
        state={state}
        presentation="animating"
        onAcknowledge={vi.fn()}
        onRepeat={vi.fn()}
        onExpand={vi.fn()}
      />,
    );

    expect(container.querySelector(".focus-timer-completion.is-animating")).toBeTruthy();
    expect(container.querySelector("[data-desktop-interactive-region]")).toBeTruthy();
    expect(container.querySelector("img")?.getAttribute("src")).toBeTruthy();
  });

  it("collapses to a clickable unread timer icon", () => {
    const onExpand = vi.fn();
    render(
      <FocusTimerCompletion
        state={{ ...state, collapsed: true }}
        presentation="collapsed"
        onAcknowledge={vi.fn()}
        onRepeat={vi.fn()}
        onExpand={onExpand}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开专注完成提醒" }));
    expect(onExpand).toHaveBeenCalledOnce();
  });

  it("renders nothing while queued", () => {
    const { container } = render(
      <FocusTimerCompletion
        state={state}
        presentation="queued"
        onAcknowledge={vi.fn()}
        onRepeat={vi.fn()}
        onExpand={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
