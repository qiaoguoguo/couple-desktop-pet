import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  dockWindowAtEdge,
  readFocusTimer,
  listenForClickThroughRecovered,
  listenForWindowHidden,
  moveWindowForPointerDrag,
  openMessageComposerSurface,
  restoreWindowFromEdgePeek,
  setInteractiveRegions,
  snapWindowToEdgeIfNeeded,
  writeFocusTimer,
} from "./windowCommands";
import desktopApiSource from "./desktopApi.ts?raw";

const desktopApiMock = vi.hoisted(() => ({
  invokeCommand: vi.fn(),
  listenToDesktopEvent: vi.fn(),
}));

vi.mock("./desktopApi", () => ({
  invokeCommand: desktopApiMock.invokeCommand,
  listenToDesktopEvent: desktopApiMock.listenToDesktopEvent,
}));

describe("windowCommands edge peek bridge", () => {
  beforeEach(() => {
    desktopApiMock.invokeCommand.mockReset();
    desktopApiMock.listenToDesktopEvent.mockReset();
  });

  it("keeps snap command name unchanged", async () => {
    desktopApiMock.invokeCommand.mockResolvedValueOnce("left");

    await expect(snapWindowToEdgeIfNeeded()).resolves.toBe("left");

    expect(desktopApiMock.invokeCommand).toHaveBeenCalledWith(
      "snap_window_to_edge_if_needed",
    );
  });

  it("keeps restore command name and side argument unchanged", async () => {
    desktopApiMock.invokeCommand.mockResolvedValueOnce(undefined);

    await restoreWindowFromEdgePeek("right");

    expect(desktopApiMock.invokeCommand).toHaveBeenCalledWith(
      "restore_window_from_edge_peek",
      { side: "right" },
    );
  });

  it("subscribes to click-through recovered desktop event", async () => {
    const handler = vi.fn();
    const unlisten = vi.fn();
    desktopApiMock.listenToDesktopEvent.mockResolvedValueOnce(unlisten);

    await expect(listenForClickThroughRecovered(handler)).resolves.toBe(
      unlisten,
    );

    expect(desktopApiMock.listenToDesktopEvent).toHaveBeenCalledWith(
      "click-through-recovered",
      handler,
    );
  });

  it("subscribes to the unified native window-hidden event", async () => {
    const handler = vi.fn();
    const unlisten = vi.fn();
    desktopApiMock.listenToDesktopEvent.mockResolvedValueOnce(unlisten);

    await expect(listenForWindowHidden(handler)).resolves.toBe(unlisten);

    expect(desktopApiMock.listenToDesktopEvent).toHaveBeenCalledWith(
      "window-hidden",
      handler,
    );
  });

  it("docks at the requested edge with the exact native command payload", async () => {
    desktopApiMock.invokeCommand.mockResolvedValueOnce(undefined);

    await dockWindowAtEdge("right");

    expect(desktopApiMock.invokeCommand).toHaveBeenCalledWith(
      "dock_window_at_edge",
      { side: "right" },
    );
  });

  it("opens the message composer through a controlled surface argument", async () => {
    desktopApiMock.invokeCommand.mockResolvedValueOnce(undefined);

    await openMessageComposerSurface("message");

    expect(desktopApiMock.invokeCommand).toHaveBeenCalledWith(
      "open_message_composer_surface",
      { surface: "message" },
    );
  });

  it("opens the surprise composer through a controlled surface argument", async () => {
    desktopApiMock.invokeCommand.mockResolvedValueOnce(undefined);

    await openMessageComposerSurface("surprise");

    expect(desktopApiMock.invokeCommand).toHaveBeenCalledWith(
      "open_message_composer_surface",
      { surface: "surprise" },
    );
  });

  it("opens the focus composer through a controlled surface argument", async () => {
    desktopApiMock.invokeCommand.mockResolvedValueOnce(undefined);

    await openMessageComposerSurface("focus");

    expect(desktopApiMock.invokeCommand).toHaveBeenCalledWith(
      "open_message_composer_surface",
      { surface: "focus" },
    );
  });

  it("opens the weather composer through a controlled surface argument", async () => {
    desktopApiMock.invokeCommand.mockResolvedValueOnce(undefined);

    await openMessageComposerSurface("weather");

    expect(desktopApiMock.invokeCommand).toHaveBeenCalledWith(
      "open_message_composer_surface",
      { surface: "weather" },
    );
  });

  it("opens the spark composer through a controlled surface argument", async () => {
    desktopApiMock.invokeCommand.mockResolvedValueOnce(undefined);

    await openMessageComposerSurface("spark");

    expect(desktopApiMock.invokeCommand).toHaveBeenCalledWith(
      "open_message_composer_surface",
      { surface: "spark" },
    );
  });

  it("reads the focus timer from its dedicated local command", async () => {
    desktopApiMock.invokeCommand.mockResolvedValueOnce({
      status: "running",
      durationMinutes: 25,
      startedAt: 1_000,
      endsAt: 1_501_000,
    });

    await expect(readFocusTimer()).resolves.toEqual({
      status: "running",
      durationMinutes: 25,
      startedAt: 1_000,
      endsAt: 1_501_000,
    });

    expect(desktopApiMock.invokeCommand).toHaveBeenCalledWith(
      "read_focus_timer",
    );
  });

  it("writes the focus timer through its dedicated local command payload", async () => {
    desktopApiMock.invokeCommand.mockResolvedValueOnce(undefined);
    const timer = {
      status: "paused" as const,
      durationMinutes: 45,
      remainingMs: 120_000,
    };

    await writeFocusTimer(timer);

    expect(desktopApiMock.invokeCommand).toHaveBeenCalledWith(
      "write_focus_timer",
      { timer },
    );
  });

  it("reports CSS interaction rectangles with their device scale", async () => {
    desktopApiMock.invokeCommand.mockResolvedValueOnce(undefined);

    await setInteractiveRegions(
      [{ x: 12.5, y: 18, width: 96, height: 144.5 }],
      1.5,
    );

    expect(desktopApiMock.invokeCommand).toHaveBeenCalledWith(
      "set_interactive_regions",
      {
        regions: [{ x: 12.5, y: 18, width: 96, height: 144.5 }],
        deviceScaleFactor: 1.5,
      },
    );
  });

  it("moves the window from pointer screen deltas without using system dragging", async () => {
    desktopApiMock.invokeCommand.mockResolvedValueOnce(undefined);

    await moveWindowForPointerDrag(14, -9);

    expect(desktopApiMock.invokeCommand).toHaveBeenCalledWith(
      "move_window_for_pointer_drag",
      { deltaX: 14, deltaY: -9 },
    );
  });

  it("does not expose Tauri system dragging on the production bridge", () => {
    expect(desktopApiSource).not.toContain("startDragging");
    expect(desktopApiSource).not.toContain("getCurrentWindow");
  });
});
