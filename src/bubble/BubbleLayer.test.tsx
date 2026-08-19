import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BubbleLayer } from "./BubbleLayer";

describe("BubbleLayer", () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("streams visible bubble text with the typewriter effect", async () => {
    vi.useFakeTimers();
    render(<BubbleLayer message="我在这里。" visible />);

    expect(screen.getByRole("status").textContent).toBe("我");

    for (let index = 0; index < 4; index += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(35);
      });
    }

    expect(screen.getByText("我在这里。")).toBeTruthy();
  });

  it("does not register the visual-only bubble as a desktop hit region", () => {
    render(<BubbleLayer message="我在这里。" visible />);

    expect(
      screen
        .getByRole("status")
        .hasAttribute("data-desktop-interactive-region"),
    ).toBe(false);
  });

  it("does not render hidden bubbles", () => {
    render(<BubbleLayer message="我在这里。" visible={false} />);

    expect(screen.queryByRole("status")).toBeNull();
  });
});
