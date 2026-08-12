import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listenForClickThroughRecovered,
  openMessageComposerSurface,
  restoreWindowFromEdgePeek,
  snapWindowToEdgeIfNeeded,
} from "./windowCommands";

const desktopApiMock = vi.hoisted(() => ({
  invokeCommand: vi.fn(),
  listenToDesktopEvent: vi.fn(),
  startCurrentWindowDrag: vi.fn(),
}));

vi.mock("./desktopApi", () => ({
  invokeCommand: desktopApiMock.invokeCommand,
  listenToDesktopEvent: desktopApiMock.listenToDesktopEvent,
  startCurrentWindowDrag: desktopApiMock.startCurrentWindowDrag,
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
});
