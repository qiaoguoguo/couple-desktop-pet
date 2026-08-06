import { useEffect, useReducer } from "react";
import type { CompanionPresence } from "./companionSceneTypes";

export type PresenceMotionPhase =
  | "hidden"
  | "enter"
  | "online-idle"
  | "hover"
  | "press"
  | "offline-transition"
  | "offline-idle"
  | "reduced-enter";

export interface PresenceMotionState {
  phase: PresenceMotionPhase;
  presence: CompanionPresence;
}

export type PresenceMotionEvent =
  | {
      type: "SCENE_CHANGED";
      presence: CompanionPresence;
      suspended: boolean;
      reducedMotion: boolean;
    }
  | { type: "TIMER_ELAPSED" }
  | { type: "HOVER_STARTED" }
  | { type: "PRESS_STARTED" };

export interface PresenceMotionScene {
  presence: CompanionPresence;
  suspended: boolean;
  reducedMotion: boolean;
}

export interface PresenceMotionControls {
  phase: PresenceMotionPhase;
  onHover: () => void;
  onPress: () => void;
}

const PHASE_DURATIONS_MS: Record<PresenceMotionPhase, number | null> = {
  hidden: null,
  enter: 700,
  "online-idle": 5600,
  hover: 180,
  press: 320,
  "offline-transition": 900,
  "offline-idle": 6000,
  "reduced-enter": 180,
};

export function createPresenceMotionState(): PresenceMotionState {
  return {
    phase: "hidden",
    presence: "hidden",
  };
}

export function transitionPresenceMotion(
  state: PresenceMotionState,
  event: PresenceMotionEvent,
): PresenceMotionState {
  if (event.type === "SCENE_CHANGED") {
    if (event.suspended || event.presence === "hidden") {
      return { phase: "hidden", presence: "hidden" };
    }

    if (event.reducedMotion) {
      return { phase: "reduced-enter", presence: event.presence };
    }

    if (event.presence === "online") {
      return state.presence === "online"
        ? state
        : { phase: "enter", presence: "online" };
    }

    return state.presence === "offline"
      ? state
      : { phase: "offline-transition", presence: "offline" };
  }

  if (event.type === "HOVER_STARTED") {
    return state.presence === "online" && state.phase !== "hidden"
      ? { phase: "hover", presence: "online" }
      : state;
  }

  if (event.type === "PRESS_STARTED") {
    return state.presence === "online" && state.phase !== "hidden"
      ? { phase: "press", presence: "online" }
      : state;
  }

  if (event.type === "TIMER_ELAPSED") {
    if (
      state.phase === "enter" ||
      state.phase === "hover" ||
      state.phase === "press"
    ) {
      return { phase: "online-idle", presence: "online" };
    }

    if (state.phase === "offline-transition") {
      return { phase: "offline-idle", presence: "offline" };
    }

    if (state.phase === "reduced-enter") {
      return state.presence === "offline"
        ? { phase: "offline-idle", presence: "offline" }
        : { phase: "online-idle", presence: "online" };
    }
  }

  return state;
}

export function getPresenceMotionDelay(
  state: PresenceMotionState,
): number | null {
  return PHASE_DURATIONS_MS[state.phase];
}

export function usePresenceMotionDirector(
  scene: PresenceMotionScene,
): PresenceMotionControls {
  const [state, dispatch] = useReducer(
    transitionPresenceMotion,
    undefined,
    createPresenceMotionState,
  );

  useEffect(() => {
    dispatch({
      type: "SCENE_CHANGED",
      presence: scene.presence,
      suspended: scene.suspended,
      reducedMotion: scene.reducedMotion,
    });
  }, [scene.presence, scene.reducedMotion, scene.suspended]);

  useEffect(() => {
    const delay = getPresenceMotionDelay(state);

    if (delay === null) {
      return;
    }

    const timer = window.setTimeout(() => {
      dispatch({ type: "TIMER_ELAPSED" });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [state]);

  return {
    phase: state.phase,
    onHover: () => dispatch({ type: "HOVER_STARTED" }),
    onPress: () => dispatch({ type: "PRESS_STARTED" }),
  };
}
