import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PET_PACKAGE_ID,
  PET_ACTION_DURATION_MS,
  PET_ACTION_FPS,
  PET_FRAMES_PER_ACTION,
  REQUIRED_PET_ACTIONS,
  readPetPackageManifest,
} from "./petPackageContract";

function validAction(action: string, loop: boolean) {
  return {
    fps: PET_ACTION_FPS,
    loop,
    frameCount: PET_FRAMES_PER_ACTION,
    durationMs: PET_ACTION_DURATION_MS,
    frames: `frames/${action}/`,
  };
}

function validManifest() {
  return {
    formatVersion: 2,
    renderer: "frame-sequence",
    id: "q-girl-custom",
    name: "Q 版小人",
    baseSize: { width: 256, height: 320 },
    frameSize: { width: 768, height: 960 },
    actions: Object.fromEntries(
      REQUIRED_PET_ACTIONS.map((action) => [
        action,
        validAction(
          action,
          action.startsWith("idle") ||
            action === "walk" ||
            action === "drag" ||
            action === "sleep",
        ),
      ]),
    ),
    scenes: {
      "act-cute": {
        action: "act-cute",
        bubbleCues: [{ atMs: 1800, text: "陪我一会儿嘛。" }],
        returnTo: "idle-breathe",
      },
      "remote-message": {
        action: "act-wave",
        bubbleCues: [{ atMs: 1000, source: "remoteMessage" }],
        waitForAcknowledge: true,
        returnTo: "idle-breathe",
      },
    },
  };
}

describe("pet package v2 contract", () => {
  it("uses the q-girl package as the built-in default", () => {
    expect(BUILT_IN_PET_PACKAGE_ID).toBe("builtin:q-girl");
  });

  it("requires 30 frames at 5 fps for each 6 second action", () => {
    expect(PET_FRAMES_PER_ACTION).toBe(30);
    expect(PET_ACTION_FPS).toBe(5);
    expect(PET_ACTION_DURATION_MS).toBe(6000);
    expect(REQUIRED_PET_ACTIONS).toEqual([
      "idle-breathe",
      "idle-look",
      "idle-stretch",
      "walk",
      "drag",
      "sleep",
      "act-cute",
      "act-typing",
      "act-wave",
      "act-hug",
      "act-pout",
      "act-drowsy",
    ]);
  });

  it("reads a valid v2 manifest", () => {
    const manifest = readPetPackageManifest(validManifest());
    expect(manifest?.formatVersion).toBe(2);
    expect(manifest?.renderer).toBe("frame-sequence");
    expect(manifest?.actions["act-cute"].frames).toBe("frames/act-cute/");
    expect(manifest?.actions["act-cute"].frameCount).toBe(30);
    expect(manifest?.scenes["remote-message"].waitForAcknowledge).toBe(true);
  });

  it("rejects a v1 manifest", () => {
    expect(
      readPetPackageManifest({
        formatVersion: 1,
        id: "old-star",
        name: "旧版",
        baseSize: { width: 256, height: 320 },
        frameSize: { width: 512, height: 512 },
        actions: {},
      }),
    ).toBeNull();
  });

  it("rejects wrong frame counts and frame directories", () => {
    const wrongCount = validManifest();
    wrongCount.actions["act-cute"] = {
      ...wrongCount.actions["act-cute"],
      frameCount: 18,
    };
    expect(readPetPackageManifest(wrongCount)).toBeNull();

    const wrongDirectory = validManifest();
    wrongDirectory.actions["act-cute"] = {
      ...wrongDirectory.actions["act-cute"],
      frames: "frames/act-cute-",
    };
    expect(readPetPackageManifest(wrongDirectory)).toBeNull();
  });
});
