import type { PetEvent, PetState, PetStateName } from "./petTypes";

export type { PetEvent, PetEventType, PetState, PetStateName } from "./petTypes";

export function createInitialPetState(now: number): PetState {
  return {
    name: "idle",
    enteredAt: now,
    lastInteractionAt: now,
    direction: 1,
  };
}

export function transitionPetState(state: PetState, event: PetEvent): PetState {
  switch (event.type) {
    case "APP_READY":
      return state;
    case "PET_CLICKED":
      return enterState(state, "happy", event.at, event.at);
    case "DRAG_STARTED":
      return enterState(state, "dragging", event.at, event.at);
    case "DRAG_ENDED":
      return enterState(state, "idle", event.at, event.at);
    case "AUTO_MOVE_TICK":
      if (state.name === "dragging") {
        return state;
      }

      if (state.name === "idle") {
        return enterState(state, "walking", event.at);
      }

      return state;
    case "IDLE_TIMEOUT":
      if (state.name === "dragging") {
        return state;
      }

      return enterState(state, "sleeping", event.at);
    case "SETTINGS_CHANGED":
      return state;
    case "ANIMATION_FINISHED":
      if (state.name === "happy" || state.name === "walking") {
        return enterState(state, "idle", event.at);
      }

      return state;
  }
}

function enterState(
  state: PetState,
  name: PetStateName,
  enteredAt: number,
  lastInteractionAt = state.lastInteractionAt,
): PetState {
  if (state.name === name) {
    return {
      ...state,
      enteredAt,
      lastInteractionAt,
    };
  }

  return {
    ...state,
    name,
    enteredAt,
    lastInteractionAt,
  };
}
