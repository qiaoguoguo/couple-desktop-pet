import type {
  EdgeCompanionVisualProfile,
  EdgeSide,
} from "../pet/edgeInteraction";
import type { CssAlphaBounds, FrameAlphaBounds } from "./frameAlphaBounds";

const stageWidthPx = 320;
const stageHeightPx = 360;

export interface EdgeNoticePlacement {
  axis: "x" | "y";
  direction: 1 | -1;
}

export interface EdgeCompanionLayout {
  visibleHeightPx: number;
  box: CssAlphaBounds;
  frame: CssAlphaBounds & { mirrorX: boolean };
  alphaHit: CssAlphaBounds | null;
}

export function getEdgeCompanionVisibleHeight(
  scale: number,
  profile: EdgeCompanionVisualProfile,
): number {
  return Math.min(
    profile.maxVisibleHeightPx,
    Math.max(
      profile.minVisibleHeightPx,
      Math.round(profile.baseVisibleHeightPx * scale),
    ),
  );
}

export function getEdgeNoticePlacement(side: EdgeSide): EdgeNoticePlacement {
  if (side === "left") {
    return { axis: "x", direction: 1 };
  }

  if (side === "right") {
    return { axis: "x", direction: -1 };
  }

  if (side === "top") {
    return { axis: "y", direction: 1 };
  }

  return { axis: "y", direction: -1 };
}

export function getEdgeCompanionLayout(
  profile: EdgeCompanionVisualProfile,
  scale: number,
  alphaBounds: FrameAlphaBounds | null,
  frameKind: "idle" | "blink" = "idle",
): EdgeCompanionLayout {
  const visibleHeightPx = getEdgeCompanionVisibleHeight(scale, profile);
  const sourceScale = alphaBounds
    ? visibleHeightPx / alphaBounds.height
    : visibleHeightPx / profile.fixedBox.heightPx;
  const boxWidth = profile.fixedBox.widthPx * sourceScale;
  const boxHeight = profile.fixedBox.heightPx * sourceScale;
  const boxPosition = getFixedBoxPosition(profile, boxWidth, boxHeight);
  const placement =
    frameKind === "blink"
      ? profile.fixedBox.blinkFrame
      : profile.fixedBox.idleFrame;
  const sourceFrameX = profile.mirrorX
    ? profile.fixedBox.widthPx - placement.xPx - placement.widthPx
    : placement.xPx;
  const frame = {
    left: normalize(sourceFrameX * sourceScale),
    top: normalize(placement.yPx * sourceScale),
    width: normalize(placement.widthPx * sourceScale),
    height: normalize(placement.heightPx * sourceScale),
    mirrorX: profile.mirrorX,
  };

  return {
    visibleHeightPx,
    box: {
      left: normalize(boxPosition.left),
      top: normalize(boxPosition.top),
      width: normalize(boxWidth),
      height: normalize(boxHeight),
    },
    frame,
    alphaHit: alphaBounds
      ? mapAlphaBoundsWithinFrame(alphaBounds, frame, profile.mirrorX)
      : null,
  };
}

function getFixedBoxPosition(
  profile: EdgeCompanionVisualProfile,
  width: number,
  height: number,
) {
  const anchorX = profile.fixedBox.contactAnchor.x * width;
  const anchorY = profile.fixedBox.contactAnchor.y * height;

  if (profile.side === "left") {
    return { left: -anchorX, top: stageHeightPx / 2 - anchorY };
  }

  if (profile.side === "right") {
    return { left: stageWidthPx - anchorX, top: stageHeightPx / 2 - anchorY };
  }

  return {
    left: stageWidthPx / 2 - anchorX,
    top: stageHeightPx - anchorY,
  };
}

function mapAlphaBoundsWithinFrame(
  bounds: FrameAlphaBounds,
  frame: CssAlphaBounds,
  mirrorX: boolean,
): CssAlphaBounds {
  const scaleX = frame.width / bounds.imageWidth;
  const scaleY = frame.height / bounds.imageHeight;
  const sourceX = mirrorX
    ? bounds.imageWidth - bounds.x - bounds.width
    : bounds.x;

  return {
    left: normalize(frame.left + sourceX * scaleX),
    top: normalize(frame.top + bounds.y * scaleY),
    width: normalize(bounds.width * scaleX),
    height: normalize(bounds.height * scaleY),
  };
}

function normalize(value: number) {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}
