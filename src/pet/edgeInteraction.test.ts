import { describe, expect, it } from "vitest";
import {
  getEdgePhaseMotion,
  transitionEdgeInteraction,
  type EdgeInteractionProfile,
} from "./edgeInteraction";

const profile: EdgeInteractionProfile = {
  side: "left",
  contactAnchor: { x: 0.725, y: 0.5 },
  enter: {
    frames: ["enter-1.png", "enter-2.png", "enter-3.png"],
    fps: 8,
    loop: false,
    durationMs: 375,
    frameAnchors: [
      { x: 0.724, y: 0.5 },
      { x: 0.725, y: 0.5 },
      { x: 0.726, y: 0.5 },
    ],
  },
  idle: {
    frames: ["idle-1.png", "idle-2.png"],
    fps: 4,
    loop: true,
    durationMs: 5500,
    frameAnchors: [
      { x: 0.725, y: 0.5 },
      { x: 0.725, y: 0.501 },
    ],
  },
  react: {
    frames: ["react-1.png", "react-2.png"],
    fps: 8,
    loop: false,
    durationMs: 250,
    frameAnchors: [
      { x: 0.725, y: 0.5 },
      { x: 0.725, y: 0.502 },
    ],
  },
};

describe("transitionEdgeInteraction", () => {
  it("runs the enter idle react exit state flow", () => {
    expect(transitionEdgeInteraction(null, { type: "SNAPPED", side: "left" }))
      .toEqual({ side: "left", phase: "enter" });
    expect(
      transitionEdgeInteraction(
        { side: "left", phase: "enter" },
        { type: "PHASE_FINISHED" },
      ),
    ).toEqual({ side: "left", phase: "idle" });
    expect(
      transitionEdgeInteraction(
        { side: "left", phase: "idle" },
        { type: "POINTER_ENTER" },
      ),
    ).toEqual({ side: "left", phase: "react" });
    expect(
      transitionEdgeInteraction(
        { side: "left", phase: "react" },
        { type: "PHASE_FINISHED" },
      ),
    ).toEqual({ side: "left", phase: "idle" });
    expect(
      transitionEdgeInteraction(
        { side: "left", phase: "idle" },
        { type: "REQUEST_EXIT" },
      ),
    ).toEqual({ side: "left", phase: "exit" });
    expect(
      transitionEdgeInteraction(
        { side: "left", phase: "exit" },
        { type: "PHASE_FINISHED" },
      ),
    ).toBeNull();
  });

  it("ignores events that would race enter and exit phases", () => {
    expect(
      transitionEdgeInteraction(
        { side: "top", phase: "enter" },
        { type: "POINTER_ENTER" },
      ),
    ).toEqual({ side: "top", phase: "enter" });
    expect(
      transitionEdgeInteraction(
        { side: "top", phase: "exit" },
        { type: "SNAPPED", side: "bottom" },
      ),
    ).toEqual({ side: "top", phase: "exit" });
    expect(
      transitionEdgeInteraction(
        { side: "top", phase: "exit" },
        { type: "POINTER_ENTER" },
      ),
    ).toEqual({ side: "top", phase: "exit" });
    expect(
      transitionEdgeInteraction(
        { side: "top", phase: "exit" },
        { type: "CANCEL" },
      ),
    ).toBeNull();
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
