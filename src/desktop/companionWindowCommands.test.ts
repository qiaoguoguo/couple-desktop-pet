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
    previewUrl: null,
    motionFallbackUrl: null,
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

  it("normalizes read companion scene payloads from the desktop bridge", async () => {
    const { readCompanionScene } = await import("./companionWindowCommands");
    desktopApiMock.invokeCommand.mockResolvedValueOnce({
      ...scene,
      side: "left",
      compact: "false",
      revision: 7,
      sceneScale: 9,
    });

    await expect(readCompanionScene()).resolves.toMatchObject({
      side: "left",
      compact: false,
      sceneScale: 1.25,
      revision: 7,
    });
  });

  it("drops malformed companion scene listener payloads", async () => {
    const { listenCompanionScene } = await import("./companionWindowCommands");
    const unlisten = vi.fn();
    const handler = vi.fn();
    desktopApiMock.listenToDesktopEvent.mockImplementationOnce(
      async (_eventName: string, listener: (payload: unknown) => void) => {
        listener({
          ...scene,
          side: "right",
          compact: false,
          revision: 3,
        });
        listener({
          presence: "offline",
          side: "sideways",
          compact: false,
          revision: 4,
        });

        return unlisten;
      },
    );

    await listenCompanionScene(handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ presence: "online", revision: 3 }),
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
      expect.any(Function),
    );
    expect(returnedUnlisten).toBe(unlisten);
  });

  it("listens for companion requests to open the main composer", async () => {
    const { listenForOpenMessageComposerRequest } = await import(
      "./companionWindowCommands"
    );
    const unlisten = vi.fn();
    const handler = vi.fn();
    desktopApiMock.listenToDesktopEvent.mockResolvedValueOnce(unlisten);

    const returnedUnlisten = await listenForOpenMessageComposerRequest(handler);

    expect(desktopApiMock.listenToDesktopEvent).toHaveBeenCalledWith(
      "open-message-composer",
      handler,
    );
    expect(returnedUnlisten).toBe(unlisten);
  });
});
