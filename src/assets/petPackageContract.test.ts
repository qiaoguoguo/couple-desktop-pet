import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PET_PACKAGE_ID,
  PET_ACTION_DURATION_MS,
  PET_ACTION_FPS,
  PET_FRAMES_PER_ACTION,
  REQUIRED_PET_ACTIONS,
  readPetMotionPoolManifest,
  readPetPackageManifest,
} from "./petPackageContract";

interface TestScene {
  action: string;
  bubbleCues: Array<{ atMs: number; text?: string; source?: string }>;
  returnTo: string;
  waitForAcknowledge?: boolean;
}

function validAction(action: string, loop: boolean) {
  return {
    fps: PET_ACTION_FPS,
    loop,
    frameCount: PET_FRAMES_PER_ACTION,
    durationMs: PET_ACTION_DURATION_MS,
    frames: `frames/${action}/`,
  };
}

function validManifest(): {
  formatVersion: number;
  renderer: string;
  id: string;
  name: string;
  baseSize: { width: number; height: number };
  frameSize: { width: number; height: number };
  actions: Record<string, ReturnType<typeof validAction>>;
  scenes: Record<string, TestScene>;
} {
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
      "act-typing": {
        action: "act-typing",
        bubbleCues: [{ atMs: 1800, text: "我也在努力敲代码。" }],
        returnTo: "idle-breathe",
      },
      "act-wave": {
        action: "act-wave",
        bubbleCues: [{ atMs: 1200, text: "嗨，我在这里！" }],
        returnTo: "idle-breathe",
      },
      "act-hug": {
        action: "act-hug",
        bubbleCues: [{ atMs: 2000, text: "可以抱一下吗？" }],
        returnTo: "idle-breathe",
      },
      "act-pout": {
        action: "act-pout",
        bubbleCues: [{ atMs: 1800, text: "哼，快哄我。" }],
        returnTo: "idle-breathe",
      },
      "act-drowsy": {
        action: "act-drowsy",
        bubbleCues: [{ atMs: 2200, text: "有点困啦。" }],
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

function validMotionPoolManifest(overrides: Record<string, unknown> = {}) {
  return {
    formatVersion: 3,
    renderer: "motion-pool",
    id: "moon-buddy",
    name: "月亮小人",
    baseSize: { width: 256, height: 320 },
    frameSize: { width: 768, height: 960 },
    defaultMotion: "motion-001",
    motions: {
      "motion-001": {
        fps: 5,
        loop: true,
        frameCount: 30,
        durationMs: 6000,
        frames: "motions/motion-001/",
        weight: 1,
        tags: ["idle"],
      },
    },
    ...overrides,
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
    if (!manifest || manifest.formatVersion !== 2) {
      throw new Error("Expected a v2 frame-sequence manifest");
    }

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

  it("rejects manifests missing required scenes", () => {
    const missingScene = validManifest();
    delete missingScene.scenes["act-hug"];

    expect(readPetPackageManifest(missingScene)).toBeNull();
  });

  it("rejects remote-message scenes without acknowledgement", () => {
    const missingAcknowledgement = validManifest();
    delete missingAcknowledgement.scenes["remote-message"].waitForAcknowledge;

    expect(readPetPackageManifest(missingAcknowledgement)).toBeNull();
  });

  it("rejects remote-message scenes without a remote message cue", () => {
    const missingRemoteCue = validManifest();
    missingRemoteCue.scenes["remote-message"].bubbleCues = [
      { atMs: 1000, text: "普通气泡" },
    ];

    expect(readPetPackageManifest(missingRemoteCue)).toBeNull();
  });
});

describe("pet package v3 motion-pool contract", () => {
  it("reads a valid v3 manifest with one motion", () => {
    const manifest = readPetMotionPoolManifest({
      formatVersion: 3,
      renderer: "motion-pool",
      id: "moon-buddy",
      name: "月亮小人",
      baseSize: { width: 256, height: 320 },
      frameSize: { width: 768, height: 960 },
      defaultMotion: "motion-001",
      motions: {
        "motion-001": {
          fps: 5,
          loop: true,
          frameCount: 30,
          durationMs: 6000,
          frames: "motions/motion-001/",
          weight: 2,
          tags: ["idle"],
        },
      },
    });

    expect(manifest?.formatVersion).toBe(3);
    expect(manifest?.renderer).toBe("motion-pool");
    expect(manifest?.defaultMotion).toBe("motion-001");
    expect(manifest?.motions["motion-001"].frameCount).toBe(30);
  });

  it("rejects a v3 manifest without a valid default motion", () => {
    const manifest = validMotionPoolManifest({
      defaultMotion: "missing-motion",
    });

    expect(readPetMotionPoolManifest(manifest)).toBeNull();
  });

  it("rejects a v3 motion when the frames directory does not match the motion id", () => {
    const manifest = validMotionPoolManifest({
      motions: {
        "motion-001": {
          fps: 5,
          loop: true,
          frameCount: 30,
          durationMs: 6000,
          frames: "motions/other-motion/",
          weight: 1,
          tags: ["idle"],
        },
      },
    });

    expect(readPetMotionPoolManifest(manifest)).toBeNull();
  });

  it("accepts v3 motion frame counts from 1 to 60", () => {
    expect(
      readPetMotionPoolManifest(
        validMotionPoolManifest({
          motions: {
            "motion-001": {
              fps: 5,
              loop: true,
              frameCount: 1,
              durationMs: 3000,
              frames: "motions/motion-001/",
              weight: 1,
              tags: ["idle"],
            },
          },
        }),
      )?.motions["motion-001"].frameCount,
    ).toBe(1);

    expect(
      readPetMotionPoolManifest(
        validMotionPoolManifest({
          motions: {
            "motion-001": {
              fps: 5,
              loop: true,
              frameCount: 60,
              durationMs: 12000,
              frames: "motions/motion-001/",
              weight: 1,
              tags: ["idle"],
            },
          },
        }),
      )?.motions["motion-001"].frameCount,
    ).toBe(60);
  });
});
