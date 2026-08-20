import { describe, expect, it } from "vitest";
import {
  getBuiltInFrameAssetUrl,
  getBuiltInPetAssetUrl,
} from "../renderer/frameAtlas";
import { builtInBoyManifest } from "./builtInBoyManifest";
import { Q_BOY_BUILT_IN_PET_PACKAGE_ID } from "./petPackageContract";

const bundledBoyAssetUrls = import.meta.glob<string>(
  ["./pets/q-boy/*.png", "./pets/q-boy/motions/**/*.png"],
  {
    eager: true,
    import: "default",
    query: "?url",
  },
);

describe("builtInBoyManifest", () => {
  it("defines Qinghe as the q-boy built-in motion-pool package", () => {
    expect(builtInBoyManifest).toMatchObject({
      id: Q_BOY_BUILT_IN_PET_PACKAGE_ID,
      name: "青禾",
      defaultMotionId: "motion-001",
      baseSize: { width: 256, height: 320 },
      frameSize: { width: 512, height: 640 },
    });
    expect(builtInBoyManifest.motions["motion-001"].frames).toHaveLength(20);
    expect(
      builtInBoyManifest.motions["motion-message-pair"].frames,
    ).toHaveLength(48);
  });

  it("resolves every declared Qinghe PNG from the explicit built-in atlas", () => {
    expect(bundledBoyAssetUrls[`./${builtInBoyManifest.preview}`]).toBeTruthy();
    expect(getBuiltInPetAssetUrl(builtInBoyManifest.preview)).toBeTruthy();

    for (const motion of Object.values(builtInBoyManifest.motions)) {
      expect(motion.frames).toHaveLength(motion.frameCount);

      for (const frame of motion.frames) {
        expect(bundledBoyAssetUrls[`./${frame}`]).toBeTruthy();
        expect(getBuiltInFrameAssetUrl(frame)).toBeTruthy();
      }
    }
  });
});
