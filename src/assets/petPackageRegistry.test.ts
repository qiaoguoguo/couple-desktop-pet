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

  it("exposes built-in v2 actions as runtime motions", () => {
    const packages = buildPetPackageRegistry([], (path) => `asset://${path}`);
    const builtIn = packages[0];

    expect(builtIn.defaultMotionId).toBe("idle-breathe");
    expect(builtIn.motions["idle-breathe"].frames.length).toBeGreaterThan(0);
    expect(builtIn.motions["idle-breathe"].weight).toBeGreaterThan(
      builtIn.motions["act-typing"].weight,
    );
    expect(builtIn.motions["act-typing"].tags).toEqual(
      expect.arrayContaining(["interaction", "legacy-action", "act-typing"]),
    );
    expect(builtIn.motions["act-typing"].tags).not.toContain("idle");
    expect(builtIn.motions["motion-message-pair"].tags).toEqual(
      expect.arrayContaining(["message", "pair", "interaction"]),
    );
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

  it("exposes imported v2 actions as runtime motions", () => {
    const imported = importedPackageSummary();
    const packages = buildPetPackageRegistry(
      [imported],
      (path) => `asset://${path}`,
    );
    const resolved = packages.find((pkg) => pkg.id === "imported:moon-buddy");

    expect(resolved?.defaultMotionId).toBe("idle-breathe");
    expect(resolved?.motions["idle-breathe"].frames[0]).toBe(
      "asset://C:/pets/moon/frames/idle-breathe/0001.png",
    );
    expect(resolved?.motions["act-hug"].tags).toEqual(
      expect.arrayContaining(["interaction", "legacy-action", "act-hug"]),
    );
    expect(resolved?.motions["act-hug"].tags).not.toContain("idle");
  });

  it("builds a v3 imported motion-pool package with multiple motions and converted frame urls", () => {
    const packages = buildPetPackageRegistry(
      [motionPoolPackageSummary()],
      (path) => `asset://${path}`,
    );
    const resolved = packages.find((pkg) => pkg.id === "imported:moon-buddy");

    expect(resolved?.defaultMotionId).toBe("motion-001");
    expect(resolved?.motions["motion-001"].frames).toEqual([
      "asset://C:/pets/moon/motions/motion-001/0001.png",
      "asset://C:/pets/moon/motions/motion-001/0002.png",
    ]);
    expect(resolved?.motions["motion-002"].frames).toEqual([
      "asset://C:/pets/moon/motions/motion-002/0001.png",
      "asset://C:/pets/moon/motions/motion-002/0002.png",
      "asset://C:/pets/moon/motions/motion-002/0003.png",
    ]);
    expect(resolved?.motions["motion-002"].tags).toEqual(["idle", "stretch"]);
    expect(resolved?.actions["act-cute"].frames).toEqual(
      resolved?.motions["motion-001"].frames,
    );
    expect(resolved?.scenes).toEqual({});
  });

  it("skips v3 imported packages when motion frame count does not match frame paths", () => {
    const broken = motionPoolPackageSummary({
      motionFramePaths: {
        "motion-001": ["C:/pets/moon/motions/motion-001/0001.png"],
        "motion-002": [
          "C:/pets/moon/motions/motion-002/0001.png",
          "C:/pets/moon/motions/motion-002/0002.png",
          "C:/pets/moon/motions/motion-002/0003.png",
        ],
      },
    });

    const packages = buildPetPackageRegistry([broken], (path) => `asset://${path}`);

    expect(packages.some((pkg) => pkg.id === "imported:moon-buddy")).toBe(
      false,
    );
  });

  it("skips v3 imported packages when the default motion is missing or unknown", () => {
    const missingDefault = motionPoolPackageSummary({ defaultMotion: null });
    const unknownDefault = motionPoolPackageSummary({
      defaultMotion: "missing-motion",
    });

    const packages = buildPetPackageRegistry(
      [missingDefault, unknownDefault],
      (path) => `asset://${path}`,
    );

    expect(packages.some((pkg) => pkg.id === "imported:moon-buddy")).toBe(
      false,
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
    formatVersion: 2,
    renderer: "frame-sequence",
    defaultMotion: "idle-breathe",
    motions: Object.fromEntries(
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
          weight: action.startsWith("idle") ? 2 : 1,
          tags: ["idle", "legacy-action", action],
        },
      ]),
    ) as ImportedPetPackageSummary["motions"],
    motionFramePaths: Object.fromEntries(
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
    ) as ImportedPetPackageSummary["motionFramePaths"],
  };
}

function motionPoolPackageSummary(
  overrides: Partial<ImportedPetPackageSummary> = {},
): ImportedPetPackageSummary {
  return {
    id: "imported:moon-buddy",
    manifestId: "moon-buddy",
    name: "月亮小人",
    formatVersion: 3,
    renderer: "motion-pool",
    baseSize: { width: 256, height: 320 },
    frameSize: { width: 768, height: 960 },
    previewPath: "C:/pets/moon/preview.png",
    defaultMotion: "motion-001",
    motions: {
      "motion-001": {
        fps: 5,
        loop: true,
        frameCount: 2,
        durationMs: 6000,
        frames: "motions/motion-001/",
        weight: 1,
        tags: ["idle"],
      },
      "motion-002": {
        fps: 6,
        loop: false,
        frameCount: 3,
        durationMs: 7000,
        frames: "motions/motion-002/",
        weight: 3,
        tags: ["idle", "stretch"],
      },
    },
    motionFramePaths: {
      "motion-001": [
        "C:/pets/moon/motions/motion-001/0001.png",
        "C:/pets/moon/motions/motion-001/0002.png",
      ],
      "motion-002": [
        "C:\\pets\\moon\\motions\\motion-002\\0001.png",
        "C:\\pets\\moon\\motions\\motion-002\\0002.png",
        "C:\\pets\\moon\\motions\\motion-002\\0003.png",
      ],
    },
    actions: {} as ImportedPetPackageSummary["actions"],
    scenes: {},
    framePaths: {} as ImportedPetPackageSummary["framePaths"],
    ...overrides,
  };
}
