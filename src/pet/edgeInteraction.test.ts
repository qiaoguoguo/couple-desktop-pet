import { describe, expect, it } from "vitest";
import {
  edgeStageContactAnchors,
  getEdgePhaseMotion,
  transitionEdgeInteraction,
  type EdgeInteractionProfile,
} from "./edgeInteraction";

describe("edgeStageContactAnchors", () => {
  it("maps every legacy stage contact to the real stage edge", () => {
    expect(edgeStageContactAnchors).toEqual({
      left: { x: 0, y: 0.5 },
      right: { x: 1, y: 0.5 },
      top: { x: 0.5, y: 0 },
      bottom: { x: 0.5, y: 1 },
    });
  });
});

const profile: EdgeInteractionProfile = {
  side: "left",
  contactAnchor: { x: 0.275, y: 0.5 },
  enter: {
    frames: ["enter-1.png", "enter-2.png", "enter-3.png"],
    fps: 8,
    loop: false,
    durationMs: 375,
    frameAnchors: [
      { x: 0.274, y: 0.5 },
      { x: 0.275, y: 0.5 },
      { x: 0.276, y: 0.5 },
    ],
  },
  idle: {
    frames: ["idle-1.png", "idle-2.png"],
    fps: 4,
    loop: true,
    durationMs: 5500,
    frameAnchors: [
      { x: 0.275, y: 0.5 },
      { x: 0.275, y: 0.501 },
    ],
  },
  react: {
    frames: ["react-1.png", "react-2.png"],
    fps: 8,
    loop: false,
    durationMs: 250,
    frameAnchors: [
      { x: 0.275, y: 0.5 },
      { x: 0.275, y: 0.502 },
    ],
  },
};

describe("transitionEdgeInteraction", () => {
  it("enters the single idle state after snapping", () => {
    expect(transitionEdgeInteraction(null, { type: "SNAPPED", side: "left" }))
      .toEqual({ side: "left", phase: "idle" });
  });

  it("clears idle on cancel and ignores obsolete animation events", () => {
    const idle = { side: "left", phase: "idle" } as const;

    expect(
      transitionEdgeInteraction(idle, { type: "CANCEL" }),
    ).toBeNull();
    expect(transitionEdgeInteraction(idle, { type: "PHASE_FINISHED" })).toBe(
      idle,
    );
    expect(transitionEdgeInteraction(idle, { type: "POINTER_ENTER" })).toBe(
      idle,
    );
    expect(transitionEdgeInteraction(idle, { type: "REQUEST_EXIT" })).toBe(
      idle,
    );
  });
});

describe("getEdgePhaseMotion", () => {
  it("returns exit as a reversed enter motion including frame anchors", () => {
    const enter = getEdgePhaseMotion(profile, "enter");
    const exit = getEdgePhaseMotion(profile, "exit");

    expect(exit.frames).toEqual([...enter.frames].reverse());
    expect(exit.frameAnchors).toEqual([...enter.frameAnchors].reverse());
    expect(exit.fps).toBe(enter.fps);
    expect(exit.loop).toBe(false);
    expect(exit.durationMs).toBe(enter.durationMs);
  });

  it("keeps idle long enough and all anchors normalized", () => {
    expect(profile.idle.durationMs).toBeGreaterThanOrEqual(5000);

    for (const motion of [
      getEdgePhaseMotion(profile, "enter"),
      getEdgePhaseMotion(profile, "idle"),
      getEdgePhaseMotion(profile, "react"),
      getEdgePhaseMotion(profile, "exit"),
    ]) {
      expect(motion.frames).toHaveLength(motion.frameAnchors.length);
      for (const anchor of motion.frameAnchors) {
        expect(anchor.x).toBeGreaterThanOrEqual(0);
        expect(anchor.x).toBeLessThanOrEqual(1);
        expect(anchor.y).toBeGreaterThanOrEqual(0);
        expect(anchor.y).toBeLessThanOrEqual(1);
      }
    }
  });
});
