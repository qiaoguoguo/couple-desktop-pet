import { describe, expect, it } from "vitest";
import {
  createMotionSceneRuntime,
  isMotionSceneComplete,
  readDueBubbleCues,
} from "./motionScenePlayer";
import type { MotionScene } from "./motionSceneTypes";

const cuteScene: MotionScene = {
  id: "act-cute",
  action: "act-cute",
  durationMs: 6000,
  bubbleCues: [{ atMs: 1800, text: "陪我一会儿嘛。" }],
  returnTo: "idle-breathe",
};

const remoteScene: MotionScene = {
  id: "remote-message",
  action: "act-wave",
  durationMs: 6000,
  bubbleCues: [{ atMs: 1000, source: "remoteMessage" }],
  waitForAcknowledge: true,
  returnTo: "idle-breathe",
};

describe("motion scene player", () => {
  it("fires bubble cues once when their time is reached", () => {
    const runtime = createMotionSceneRuntime(cuteScene, 10_000);

    expect(readDueBubbleCues(runtime, 11_000)).toEqual([]);
    expect(readDueBubbleCues(runtime, 11_900)).toEqual([
      { atMs: 1800, text: "陪我一会儿嘛。" },
    ]);
    expect(readDueBubbleCues(runtime, 12_500)).toEqual([]);
  });

  it("resolves remote message text from the active message", () => {
    const runtime = createMotionSceneRuntime(remoteScene, 20_000, "早点休息");

    expect(readDueBubbleCues(runtime, 21_000)).toEqual([
      { atMs: 1000, text: "早点休息", source: "remoteMessage" },
    ]);
  });

  it("keeps a remote scene visible until acknowledged", () => {
    const runtime = createMotionSceneRuntime(remoteScene, 20_000, "早点休息");

    expect(isMotionSceneComplete(runtime, 27_000, false)).toBe(false);
    expect(isMotionSceneComplete(runtime, 27_000, true)).toBe(true);
  });

  it("completes normal interaction scenes after their duration", () => {
    const runtime = createMotionSceneRuntime(cuteScene, 10_000);

    expect(isMotionSceneComplete(runtime, 15_999, false)).toBe(false);
    expect(isMotionSceneComplete(runtime, 16_000, false)).toBe(true);
  });
});
