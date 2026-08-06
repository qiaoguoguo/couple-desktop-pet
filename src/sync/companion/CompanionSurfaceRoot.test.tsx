import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompanionSceneViewState } from "./companionSceneTypes";
import {
  CompanionSurfaceRoot,
  readCompanionSurfaceFromLabel,
  readCompanionSurfaceFromLocation,
  readCompanionSurfaceFromSearch,
} from "./CompanionSurfaceRoot";

const companionCommandsMock = vi.hoisted(() => ({
  readCompanionScene: vi.fn(),
  listenCompanionScene: vi.fn(),
  requestOpenMessageComposer: vi.fn(),
}));

vi.mock("../../desktop/companionWindowCommands", () => ({
  readCompanionScene: companionCommandsMock.readCompanionScene,
  listenCompanionScene: companionCommandsMock.listenCompanionScene,
  requestOpenMessageComposer: companionCommandsMock.requestOpenMessageComposer,
}));

describe("CompanionSurfaceRoot", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("parses supported surface query values only", () => {
    expect(readCompanionSurfaceFromSearch("?surface=peer-presence")).toBe(
      "peer-presence",
    );
    expect(readCompanionSurfaceFromSearch("?surface=peer-link")).toBe(
      "peer-link",
    );
    expect(readCompanionSurfaceFromSearch("?surface=offline-nest")).toBe(
      "offline-nest",
    );
    expect(readCompanionSurfaceFromSearch("?surface=main")).toBe(null);
    expect(readCompanionSurfaceFromSearch("")).toBe(null);
  });

  it("parses companion surface mode from stable hash routes", () => {
    expect(readCompanionSurfaceFromLocation("", "#surface=peer-presence")).toBe(
      "peer-presence",
    );
    expect(readCompanionSurfaceFromLocation("", "#surface=peer-link")).toBe(
      "peer-link",
    );
    expect(readCompanionSurfaceFromLocation("", "#surface=offline-nest")).toBe(
      "offline-nest",
    );
    expect(readCompanionSurfaceFromLocation("", "#surface=main")).toBe(null);
  });

  it("parses companion surface mode from Tauri window labels", () => {
    expect(readCompanionSurfaceFromLabel("peer-presence")).toBe("peer-presence");
    expect(readCompanionSurfaceFromLabel("peer-link")).toBe("peer-link");
    expect(readCompanionSurfaceFromLabel("offline-nest")).toBe("offline-nest");
    expect(readCompanionSurfaceFromLabel("main")).toBe(null);
    expect(readCompanionSurfaceFromLabel(null)).toBe(null);
  });

  it("reads current state, subscribes to updates, and opens composer when online presence is clicked", async () => {
    const unlisten = vi.fn();

    companionCommandsMock.readCompanionScene.mockResolvedValueOnce(
      onlineState(),
    );
    companionCommandsMock.listenCompanionScene.mockResolvedValueOnce(unlisten);
    companionCommandsMock.requestOpenMessageComposer.mockResolvedValueOnce(
      undefined,
    );

    const { unmount } = render(<CompanionSurfaceRoot surface="peer-presence" />);

    const button = await screen.findByRole("button", {
      name: "TA 在线，正在陪你",
    });

    expect(screen.getByAltText("对方桌宠头像").getAttribute("src")).toBe(
      "asset://portrait.png",
    );
    expect(companionCommandsMock.listenCompanionScene).toHaveBeenCalledTimes(1);

    fireEvent.click(button);
    await waitFor(() =>
      expect(companionCommandsMock.requestOpenMessageComposer).toHaveBeenCalled(),
    );

    unmount();
    await waitFor(() => expect(unlisten).toHaveBeenCalled());
  });

  it("subscribes before reading current state so startup emits are not missed", async () => {
    companionCommandsMock.readCompanionScene.mockResolvedValueOnce(
      onlineState(),
    );
    companionCommandsMock.listenCompanionScene.mockResolvedValueOnce(vi.fn());

    render(<CompanionSurfaceRoot surface="peer-presence" />);

    await screen.findByRole("button", {
      name: "TA 在线，正在陪你",
    });

    expect(
      companionCommandsMock.listenCompanionScene.mock.invocationCallOrder[0],
    ).toBeLessThan(
      companionCommandsMock.readCompanionScene.mock.invocationCallOrder[0],
    );
  });

  it("renders a later companion scene event when the initial read fails", async () => {
    const listeners: Array<(state: CompanionSceneViewState) => void> = [];

    companionCommandsMock.readCompanionScene.mockRejectedValueOnce(
      new Error("read unavailable"),
    );
    companionCommandsMock.listenCompanionScene.mockImplementationOnce(
      async (handler: (state: CompanionSceneViewState) => void) => {
        listeners.push(handler);

        return vi.fn();
      },
    );

    render(<CompanionSurfaceRoot surface="peer-presence" />);

    expect(listeners).toHaveLength(1);
    listeners[0](onlineState());

    expect(
      await screen.findByRole("button", {
        name: "TA 在线，正在陪你",
      }),
    ).toBeTruthy();
  });

  it("renders offline presence as non-interactive status", async () => {
    companionCommandsMock.readCompanionScene.mockResolvedValueOnce(
      offlineState(),
    );
    companionCommandsMock.listenCompanionScene.mockResolvedValueOnce(vi.fn());

    render(<CompanionSurfaceRoot surface="peer-presence" />);

    expect((await screen.findByRole("status")).textContent).toContain(
      "TA 离线",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders only the link surface for peer-link", async () => {
    companionCommandsMock.readCompanionScene.mockResolvedValueOnce(
      onlineState(),
    );
    companionCommandsMock.listenCompanionScene.mockResolvedValueOnce(vi.fn());

    render(<CompanionSurfaceRoot surface="peer-link" />);

    expect(await screen.findByRole("img", { name: "心动连线" })).toBeTruthy();
    expect(screen.queryByText("TA 在线")).toBeNull();
  });

  it("renders the offline nest surface only for offline state", async () => {
    companionCommandsMock.readCompanionScene.mockResolvedValueOnce(
      offlineState(),
    );
    companionCommandsMock.listenCompanionScene.mockResolvedValueOnce(vi.fn());

    render(<CompanionSurfaceRoot surface="offline-nest" />);

    expect(
      await screen.findByRole("img", { name: "离线留言小窝" }),
    ).toBeTruthy();
    expect(screen.queryByText("TA 离线")).toBeNull();
  });
});

function onlineState(): CompanionSceneViewState {
  return {
    presence: "online",
    portraitUrl: "asset://portrait.png",
    offlinePortraitUrl: "asset://offline.png",
    sceneScale: 1,
    suspended: false,
    side: "right",
    compact: false,
    revision: 1,
  };
}

function offlineState(): CompanionSceneViewState {
  return {
    ...onlineState(),
    presence: "offline",
    revision: 2,
  };
}
