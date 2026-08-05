import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TypewriterText } from "./TypewriterText";

describe("TypewriterText", () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("reveals text one unicode code point at a time", () => {
    vi.useFakeTimers();
    render(<TypewriterText text="你呀" intervalMs={35} />);

    expect(screen.getByText("你")).toBeTruthy();

    act(() => vi.advanceTimersByTime(35));

    expect(screen.getByText("你呀")).toBeTruthy();
  });

  it("shows full text when disabled", () => {
    render(<TypewriterText text="你好呀" disabled />);

    expect(screen.getByText("你好呀")).toBeTruthy();
  });

  it("shows full text when reduced motion is preferred", () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    render(<TypewriterText text="慢慢出现" />);

    expect(screen.getByText("慢慢出现")).toBeTruthy();
    window.matchMedia = originalMatchMedia;
  });
});
