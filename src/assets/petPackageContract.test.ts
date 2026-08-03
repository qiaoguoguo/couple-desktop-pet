import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PET_PACKAGE_ID,
  PET_FRAMES_PER_ACTION,
  REQUIRED_PET_ACTIONS,
  buildFrameFileName,
  readPetPackageManifest,
} from "./petPackageContract";

describe("pet package contract", () => {
  it("defines the built-in package id and the fixed action contract", () => {
    expect(BUILT_IN_PET_PACKAGE_ID).toBe("builtin:star-sleeper");
    expect(PET_FRAMES_PER_ACTION).toBe(18);
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

  it("builds fixed frame file names", () => {
    expect(buildFrameFileName("act-wave", 1)).toBe("act-wave-01.png");
    expect(buildFrameFileName("act-wave", 18)).toBe("act-wave-18.png");
  });

  it("reads a valid manifest", () => {
    expect(
      readPetPackageManifest({
        formatVersion: 1,
        id: "moon-buddy",
        name: "月亮伙伴",
        baseSize: { width: 256, height: 320 },
        frameSize: { width: 512, height: 512 },
        actions: Object.fromEntries(
          REQUIRED_PET_ACTIONS.map((action) => [
            action,
            { fps: 3, loop: action.startsWith("idle") },
          ]),
        ),
      }),
    ).toMatchObject({
      formatVersion: 1,
      id: "moon-buddy",
      name: "月亮伙伴",
    });
  });

  it("rejects invalid ids and missing actions", () => {
    expect(
      readPetPackageManifest({
        formatVersion: 1,
        id: "../bad",
        name: "坏包",
        baseSize: { width: 256, height: 320 },
        frameSize: { width: 512, height: 512 },
        actions: {},
      }),
    ).toBeNull();
  });
});
