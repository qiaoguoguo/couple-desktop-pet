import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PET_PACKAGE_ID,
  PET_ACTION_DURATION_MS,
  PET_ACTION_FPS,
  PET_FRAMES_PER_ACTION,
  REQUIRED_PET_ACTIONS,
  type ImportedPetPackageSummary,
} from "./petPackageContract";
import {
  buildPetPackageRegistry,
  resolveSelectedPetPackage,
} from "./petPackageRegistry";

describe("pet package registry", () => {
  it("builds the q-girl built-in package from v2 frames", () => {
    const packages = buildPetPackageRegistry([], (path) => `asset://${path}`);
    const builtIn = packages[0];

    expect(builtIn.id).toBe(BUILT_IN_PET_PACKAGE_ID);
    expect(builtIn.name).toBe("Q 版小人");
    expect(builtIn.frameSize).toEqual({ width: 768, height: 960 });
    expect(builtIn.actions["act-cute"].fps).toBe(PET_ACTION_FPS);
    expect(builtIn.actions["act-cute"].frameCount).toBe(PET_FRAMES_PER_ACTION);
    expect(builtIn.actions["act-cute"].durationMs).toBe(
      PET_ACTION_DURATION_MS,
    );
    expect(builtIn.actions["act-cute"].frames).toHaveLength(
      PET_FRAMES_PER_ACTION,
    );
    expect(builtIn.actions["act-cute"].frames[0]).toContain(
      "pets/q-girl/frames/act-cute/0001.png",
    );
    expect(builtIn.scenes["remote-message"].waitForAcknowledge).toBe(true);
  });

  it("builds imported packages from v2 action manifests", () => {
    const imported = importedPackageSummary();
    const packages = buildPetPackageRegistry(
      [imported],
      (path) => `asset://${path}`,
    );
    const resolved = packages.find((pkg) => pkg.id === "imported:moon-buddy");

    expect(resolved?.actions["idle-breathe"].fps).toBe(5);
    expect(resolved?.actions["idle-breathe"].frames[0]).toBe(
      "asset://C:/pets/moon/frames/idle-breathe/0001.png",
    );
    expect(resolved?.previewUrl).toBe("asset://C:/pets/moon/preview.png");
    expect(resolved?.scenes["act-hug"].bubbleCues[0].text).toBe(
      "可以抱一下吗？",
    );
  });

  it("falls back to the q-girl built-in package when a saved package is missing", () => {
    const packages = buildPetPackageRegistry([], (path) => `asset://${path}`);
    expect(resolveSelectedPetPackage(packages, "imported:missing").id).toBe(
      BUILT_IN_PET_PACKAGE_ID,
    );
  });
});

function importedPackageSummary(): ImportedPetPackageSummary {
  return {
    id: "imported:moon-buddy",
    manifestId: "moon-buddy",
    name: "Moon Buddy",
    baseSize: { width: 256, height: 320 },
    frameSize: { width: 768, height: 960 },
    previewPath: "C:/pets/moon/preview.png",
    actions: Object.fromEntries(
      REQUIRED_PET_ACTIONS.map((action) => [
        action,
        {
          fps: 5,
          loop:
            action.startsWith("idle") ||
            action === "walk" ||
            action === "drag" ||
            action === "sleep",
          frameCount: 30,
          durationMs: 6000,
          frames: `frames/${action}/`,
        },
      ]),
    ) as ImportedPetPackageSummary["actions"],
    scenes: {
      "act-hug": {
        action: "act-hug",
        bubbleCues: [{ atMs: 2000, text: "可以抱一下吗？" }],
        returnTo: "idle-breathe",
      },
      "remote-message": {
        action: "act-wave",
        bubbleCues: [{ atMs: 1000, source: "remoteMessage" }],
        waitForAcknowledge: true,
        returnTo: "idle-breathe",
      },
    },
    framePaths: Object.fromEntries(
      REQUIRED_PET_ACTIONS.map((action) => [
        action,
        Array.from(
          { length: PET_FRAMES_PER_ACTION },
          (_, index) =>
            `C:/pets/moon/frames/${action}/${String(index + 1).padStart(
              4,
              "0",
            )}.png`,
        ),
      ]),
    ) as ImportedPetPackageSummary["framePaths"],
  };
}
