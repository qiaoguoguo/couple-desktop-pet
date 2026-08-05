import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PET_PACKAGE_ID,
  PET_ACTION_FPS,
  PET_FRAMES_PER_ACTION,
} from "./petPackageContract";
import {
  builtInPetManifest,
  idleActionNames,
  interactionOptions,
  type InteractionActionName,
  type PetActionName,
} from "./builtInPetManifest";

const expectedActionNames = [
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
] as const satisfies readonly PetActionName[];

const bundledFrameUrls = import.meta.glob<string>(
  "./pets/q-girl/frames/**/*.png",
  {
    eager: true,
    import: "default",
    query: "?url",
  },
);

describe("builtInPetManifest", () => {
  it("uses the built-in runtime package id", () => {
    expect(builtInPetManifest.id).toBe(BUILT_IN_PET_PACKAGE_ID);
  });

  it("defines the expected long animation action set", () => {
    expect(Object.keys(builtInPetManifest.actions)).toEqual([
      ...expectedActionNames,
    ]);
  });

  it("defines exactly six radial function buttons", () => {
    expect(interactionOptions.map((option) => option.id)).toEqual([
      "act-cute",
      "act-typing",
      "act-wave",
      "act-hug",
      "act-pout",
      "act-drowsy",
    ] satisfies InteractionActionName[]);
    expect(interactionOptions.map((option) => option.label)).toEqual([
      "撒娇卖萌",
      "敲电脑",
      "打招呼",
      "求抱抱",
      "生气鼓脸",
      "困困打盹",
    ]);
  });

  it("keeps every idle and interaction action at least five seconds long", () => {
    const longActionIds = [
      ...idleActionNames,
      ...interactionOptions.map((option) => option.id),
    ];

    for (const actionId of longActionIds) {
      expect(
        builtInPetManifest.actions[actionId].durationMs,
      ).toBeGreaterThanOrEqual(5000);
    }
  });

  it("marks idle, movement, and interaction categories explicitly", () => {
    expect(builtInPetManifest.actions["idle-breathe"].category).toBe("idle");
    expect(builtInPetManifest.actions.walk.category).toBe("movement");
    expect(builtInPetManifest.actions["act-cute"].category).toBe(
      "interaction",
    );
  });

  it("uses thirty v2 PNG frames for every action", () => {
    for (const actionId of expectedActionNames) {
      const action = builtInPetManifest.actions[actionId];

      expect(action.frames).toHaveLength(PET_FRAMES_PER_ACTION);
      expect(action.durationMs).toBe(6000);
      expect(action.fps).toBe(PET_ACTION_FPS);

      action.frames.forEach((frame, index) => {
        const frameNumber = String(index + 1).padStart(4, "0");

        expect(frame).toBe(`pets/q-girl/frames/${actionId}/${frameNumber}.png`);
      });
    }
  });

  it("exposes the built-in pair message motion", () => {
    const motion = builtInPetManifest.motions["motion-message-pair"];

    expect(motion.fps).toBe(8);
    expect(motion.loop).toBe(true);
    expect(motion.frameCount).toBe(48);
    expect(motion.durationMs).toBe(6000);
    expect(motion.weight).toBe(1);
    expect(motion.tags).toEqual(
      expect.arrayContaining(["message", "pair", "interaction"]),
    );
    expect(motion.frames).toHaveLength(48);
    expect(motion.frames[0]).toBe(
      "pets/q-girl/frames/motion-message-pair/0001.png",
    );
    expect(motion.frames.at(-1)).toBe(
      "pets/q-girl/frames/motion-message-pair/0048.png",
    );

    for (const frame of motion.frames) {
      expect(frame.endsWith(".png")).toBe(true);
      expect(bundledFrameUrls[`./${frame}`]).toBeTruthy();
    }
  });

  it("references only bundled PNG frame files", () => {
    for (const action of Object.values(builtInPetManifest.actions)) {
      for (const frame of action.frames) {
        expect(frame.endsWith(".png")).toBe(true);
        expect(bundledFrameUrls[`./${frame}`]).toBeTruthy();
      }
    }
  });
});
