import type {
  PetMotionDefinition,
  BuiltInPetManifest,
} from "./builtInPetManifest";
import { Q_BOY_BUILT_IN_PET_PACKAGE_ID } from "./petPackageContract";

export interface BuiltInMotionPoolManifest {
  id: string;
  name: string;
  preview: string;
  portrait: string;
  offlinePortrait: string;
  baseSize: BuiltInPetManifest["baseSize"];
  frameSize: BuiltInPetManifest["frameSize"];
  defaultMotionId: string;
  motions: Record<string, PetMotionDefinition>;
  scenes: BuiltInPetManifest["scenes"];
}

const motionFrames = (motionId: string, frameCount: number) =>
  Array.from(
    { length: frameCount },
    (_, index) =>
      `pets/q-boy/motions/${motionId}/${String(index + 1).padStart(4, "0")}.png`,
  );

export const builtInBoyManifest = {
  id: Q_BOY_BUILT_IN_PET_PACKAGE_ID,
  name: "青禾",
  preview: "pets/q-boy/preview.png",
  portrait: "pets/q-boy/preview.png",
  offlinePortrait: "pets/q-boy/preview.png",
  baseSize: { width: 256, height: 320 },
  frameSize: { width: 512, height: 640 },
  defaultMotionId: "motion-001",
  motions: {
    "motion-001": {
      fps: 5,
      loop: true,
      frameCount: 20,
      durationMs: 6000,
      frames: motionFrames("motion-001", 20),
      weight: 2,
      tags: ["idle", "ambient"],
    },
    "motion-message-pair": {
      fps: 8,
      loop: true,
      frameCount: 48,
      durationMs: 6000,
      frames: motionFrames("motion-message-pair", 48),
      weight: 1,
      tags: ["message", "pair", "interaction"],
    },
  },
  scenes: {},
} as const satisfies BuiltInMotionPoolManifest;
