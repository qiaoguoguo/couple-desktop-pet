import { describe, expect, it } from "vitest";
import {
  normalizeCompanionSceneState,
  normalizeCompanionSceneViewState,
} from "./companionSceneState";

describe("companion scene state", () => {
  it("normalizes URL fields and clamps scene scale", () => {
    expect(
      normalizeCompanionSceneState({
        presence: "online",
        portraitUrl: "",
        offlinePortraitUrl: "asset://offline.png",
        sceneScale: 2,
        suspended: false,
      }),
    ).toEqual({
      presence: "online",
      portraitUrl: null,
      offlinePortraitUrl: "asset://offline.png",
      sceneScale: 1.25,
      suspended: false,
    });

    expect(
      normalizeCompanionSceneState({
        presence: "offline",
        portraitUrl: "asset://portrait.png",
        offlinePortraitUrl: "   ",
        sceneScale: 0.1,
        suspended: true,
      }).sceneScale,
    ).toBe(0.85);
  });

  it("rejects malformed scene content safely", () => {
    expect(() =>
      normalizeCompanionSceneState({
        presence: "busy",
        portraitUrl: null,
        offlinePortraitUrl: null,
        sceneScale: 1,
        suspended: false,
      }),
    ).toThrow("Invalid companion presence");
  });

  it("normalizes view state with layout fields", () => {
    expect(
      normalizeCompanionSceneViewState({
        presence: "online",
        portraitUrl: null,
        offlinePortraitUrl: null,
        sceneScale: 1,
        suspended: false,
        side: "left",
        compact: false,
        revision: 3,
      }),
    ).toEqual({
      presence: "online",
      portraitUrl: null,
      offlinePortraitUrl: null,
      sceneScale: 1,
      suspended: false,
      side: "left",
      compact: false,
      revision: 3,
    });
  });
});
