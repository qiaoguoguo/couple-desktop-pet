export type EdgeSide = "left" | "right" | "top" | "bottom";
export type EdgePhase = "enter" | "idle" | "react" | "exit";
export type EdgeInteractionState = {
  side: EdgeSide;
  phase: EdgePhase;
} | null;

export interface EdgeAnchor {
  x: number;
  y: number;
}

export interface EdgePhaseMotion {
  frames: readonly string[];
  fps: number;
  loop: boolean;
  durationMs: number;
  frameAnchors: readonly EdgeAnchor[];
}

export interface EdgeInteractionProfile {
  side: EdgeSide;
  contactAnchor: EdgeAnchor;
  enter: EdgePhaseMotion;
  idle: EdgePhaseMotion;
  react: EdgePhaseMotion;
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
      return { side: event.side, phase: "enter" };
    }

    return null;
  }

  if (state.phase === "exit") {
    if (event.type === "PHASE_FINISHED") {
      return null;
    }

    return state;
  }

  if (event.type === "REQUEST_EXIT") {
    return { side: state.side, phase: "exit" };
  }

  if (state.phase === "enter" && event.type === "PHASE_FINISHED") {
    return { side: state.side, phase: "idle" };
  }

  if (state.phase === "idle" && event.type === "POINTER_ENTER") {
    return { side: state.side, phase: "react" };
  }

  if (state.phase === "react" && event.type === "PHASE_FINISHED") {
    return { side: state.side, phase: "idle" };
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
