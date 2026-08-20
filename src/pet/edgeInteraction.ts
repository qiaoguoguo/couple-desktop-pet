export type EdgeSide = "left" | "right" | "top" | "bottom";
export type EdgePhase = "enter" | "idle" | "react" | "exit";
export type EdgeInteractionState = {
  side: EdgeSide;
  phase: "idle";
} | null;

export interface EdgeAnchor {
  x: number;
  y: number;
}

export const edgeStageContactAnchors: Record<EdgeSide, EdgeAnchor> = {
  left: { x: 0, y: 0.5 },
  right: { x: 1, y: 0.5 },
  top: { x: 0.5, y: 0 },
  bottom: { x: 0.5, y: 1 },
};

export interface EdgePhaseMotion {
  frames: readonly string[];
  fps: number;
  loop: boolean;
  durationMs: number;
  frameAnchors: readonly EdgeAnchor[];
}

export interface EdgeCompanionFramePlacement {
  xPx: number;
  yPx: number;
  widthPx: number;
  heightPx: number;
}

export interface EdgeCompanionFixedBox {
  widthPx: number;
  heightPx: number;
  contactAnchor: EdgeAnchor;
  idleFrame: EdgeCompanionFramePlacement;
}

export interface EdgeCompanionVisualProfile {
  side: "left" | "right" | "bottom";
  placement: "side" | "bottom";
  idleUrl: string;
  mirrorX: boolean;
  baseVisibleHeightPx: 34;
  minVisibleHeightPx: 30;
  maxVisibleHeightPx: 42;
  fixedBox: EdgeCompanionFixedBox;
}

export interface EdgeInteractionProfile {
  side: EdgeSide;
  contactAnchor: EdgeAnchor;
  enter: EdgePhaseMotion;
  idle: EdgePhaseMotion;
  react: EdgePhaseMotion;
  companion?: EdgeCompanionVisualProfile;
}

export type EdgeInteractionEvent =
  | { type: "SNAPPED"; side: EdgeSide }
  | { type: "PHASE_FINISHED" }
  | { type: "POINTER_ENTER" }
  | { type: "REQUEST_EXIT" }
  | { type: "CANCEL" };

export function transitionEdgeInteraction(
  state: EdgeInteractionState,
  event: EdgeInteractionEvent,
): EdgeInteractionState {
  if (event.type === "CANCEL") {
    return null;
  }

  if (state === null) {
    if (event.type === "SNAPPED") {
      return { side: event.side, phase: "idle" };
    }

    return null;
  }

  return state;
}

export function getEdgePhaseMotion(
  profile: EdgeInteractionProfile,
  phase: EdgePhase,
): EdgePhaseMotion {
  if (phase !== "exit") {
    return profile[phase];
  }

  return {
    frames: [...profile.enter.frames].reverse(),
    fps: profile.enter.fps,
    loop: false,
    durationMs: profile.enter.durationMs,
    frameAnchors: [...profile.enter.frameAnchors].reverse(),
  };
}
