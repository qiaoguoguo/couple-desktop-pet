import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActivityStatusPicker } from "./ActivityStatusPicker";

describe("ActivityStatusPicker", () => {
  it("renders four status choices and marks the current status", () => {
    render(
      <ActivityStatusPicker
        currentStatus="dazing"
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "我的状态" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "在线" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(screen.getByRole("button", { name: "摸鱼中" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "发呆中" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByRole("button", { name: "加班中" })).toBeTruthy();
  });

  it("emits nullable activity status values", () => {
    const onSelect = vi.fn();
    render(
      <ActivityStatusPicker
        currentStatus={null}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "摸鱼中" }));
    fireEvent.click(screen.getByRole("button", { name: "在线" }));

    expect(onSelect).toHaveBeenNthCalledWith(1, "slacking");
    expect(onSelect).toHaveBeenNthCalledWith(2, null);
  });

  it("closes on Escape and outside pointer down but keeps clicks inside", () => {
    const onClose = vi.fn();
    render(
      <ActivityStatusPicker
        currentStatus={null}
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.mouseDown(screen.getByRole("dialog", { name: "我的状态" }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.mouseDown(screen.getByTestId("activity-status-picker-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
