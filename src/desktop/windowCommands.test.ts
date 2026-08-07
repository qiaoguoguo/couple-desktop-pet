import { beforeEach, describe, expect, it, vi } from "vitest";
import {
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
});
