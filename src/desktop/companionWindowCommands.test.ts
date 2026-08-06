import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanionSceneContentState } from "../sync/companion/companionSceneTypes";

const desktopApiMock = vi.hoisted(() => ({
  invokeCommand: vi.fn(),
  listenToDesktopEvent: vi.fn(),
}));

vi.mock("./desktopApi", () => desktopApiMock);

describe("companion window commands", () => {
  const scene: CompanionSceneContentState = {
    presence: "online",
    portraitUrl: "asset://portrait.png",
    offlinePortraitUrl: null,
    sceneScale: 1,
    suspended: false,
  };

  beforeEach(() => {
    desktopApiMock.invokeCommand.mockReset();
    desktopApiMock.listenToDesktopEvent.mockReset();
  });

  it("updates companion scene with camelCase state payload", async () => {
    const { updateCompanionScene } = await import("./companionWindowCommands");
    desktopApiMock.invokeCommand.mockResolvedValueOnce({
      ...scene,
      side: "right",
      compact: false,
      revision: 1,
    });

    await updateCompanionScene(scene);

    expect(desktopApiMock.invokeCommand).toHaveBeenCalledWith(
      "update_companion_scene",
      { state: scene },
    );
  });

  it("reads and hides companion scene through desktop commands", async () => {
    const { hideCompanionScene, readCompanionScene } = await import(
      "./companionWindowCommands"
    );
    desktopApiMock.invokeCommand.mockResolvedValueOnce({
      ...scene,
      side: "right",
      compact: false,
      revision: 2,
    });
    desktopApiMock.invokeCommand.mockResolvedValueOnce(undefined);

    await readCompanionScene();
    await hideCompanionScene();

    expect(desktopApiMock.invokeCommand).toHaveBeenNthCalledWith(
      1,
      "read_companion_scene",
    );
    expect(desktopApiMock.invokeCommand).toHaveBeenNthCalledWith(
      2,
      "hide_companion_scene",
    );
  });

  it("requests composer and listens for scene updates", async () => {
    const { listenCompanionScene, requestOpenMessageComposer } = await import(
      "./companionWindowCommands"
    );
    const unlisten = vi.fn();
    const handler = vi.fn();
    desktopApiMock.invokeCommand.mockResolvedValueOnce(undefined);
    desktopApiMock.listenToDesktopEvent.mockResolvedValueOnce(unlisten);

    await requestOpenMessageComposer();
    const returnedUnlisten = await listenCompanionScene(handler);

    expect(desktopApiMock.invokeCommand).toHaveBeenCalledWith(
      "request_open_message_composer",
    );
    expect(desktopApiMock.listenToDesktopEvent).toHaveBeenCalledWith(
      "companion-scene-updated",
      handler,
    );
    expect(returnedUnlisten).toBe(unlisten);
  });
});
