import { describe, expect, it } from "vitest";
import type { EdgeCompanionVisualProfile } from "../pet/edgeInteraction";
import type { FrameAlphaBounds } from "./frameAlphaBounds";
import {
  getEdgeCompanionLayout,
  getEdgeCompanionVisibleHeight,
  getEdgeNoticePlacement,
} from "./edgeCompanionLayout";

const visual: EdgeCompanionVisualProfile = {
  side: "right",
  placement: "side",
  idleUrl: "/edge/side/idle.png",
  mirrorX: false,
  baseVisibleHeightPx: 34,
  minVisibleHeightPx: 30,
  maxVisibleHeightPx: 42,
  fixedBox: {
    widthPx: 100,
    heightPx: 100,
    contactAnchor: { x: 0.8, y: 0.5 },
    idleFrame: { xPx: 0, yPx: 0, widthPx: 100, heightPx: 100 },
  },
};

const alphaBounds: FrameAlphaBounds = {
  x: 10,
  y: 20,
  width: 60,
  height: 68,
  imageWidth: 100,
  imageHeight: 100,
};

describe("edge companion layout", () => {
  it.each([
    [0.6, 30],
    [1, 34],
    [1.45, 42],
    [2, 42],
  ] as const)("clamps scale %s to %spx", (scale, expectedHeight) => {
    expect(getEdgeCompanionVisibleHeight(scale, visual)).toBe(expectedHeight);
  });

  it.each([
    ["left", { axis: "x", direction: 1 }],
    ["right", { axis: "x", direction: -1 }],
    ["top", { axis: "y", direction: 1 }],
    ["bottom", { axis: "y", direction: -1 }],
  ] as const)("expands %s notices into the work area", (side, expected) => {
    expect(getEdgeNoticePlacement(side)).toEqual(expected);
  });

  it("maps the fixed box, contact anchor, frame, and alpha bounds into stable stage geometry", () => {
    expect(getEdgeCompanionLayout(visual, 1, alphaBounds)).toEqual({
      visibleHeightPx: 34,
      box: { left: 280, top: 155, width: 50, height: 50 },
      frame: { left: 0, top: 0, width: 50, height: 50, mirrorX: false },
      alphaHit: { left: 5, top: 10, width: 30, height: 34 },
    });
  });

  it("mirrors both frame placement and alpha bounds without moving the left contact anchor", () => {
    const leftVisual: EdgeCompanionVisualProfile = {
      ...visual,
      side: "left",
      mirrorX: true,
      fixedBox: {
        ...visual.fixedBox,
        widthPx: 110,
        contactAnchor: { x: 0.2, y: 0.5 },
        idleFrame: { xPx: 0, yPx: 0, widthPx: 100, heightPx: 100 },
      },
    };

    expect(getEdgeCompanionLayout(leftVisual, 1, alphaBounds)).toMatchObject({
      box: { left: -11, top: 155, width: 55, height: 50 },
      frame: { left: 5, top: 0, width: 50, height: 50, mirrorX: true },
      alphaHit: { left: 20, top: 10, width: 30, height: 34 },
    });
  });
});
