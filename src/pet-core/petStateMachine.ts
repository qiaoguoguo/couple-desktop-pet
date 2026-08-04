import type { IdleActionName } from "../assets/petActionNames";
import type { PetEvent, PetState, PetStateName } from "./petTypes";

export type { PetEvent, PetEventType, PetState, PetStateName } from "./petTypes";

const defaultIdleAction: IdleActionName = "idle-breathe";

export function createInitialPetState(now: number): PetState {
  return {
    name: "idle",
    action: defaultIdleAction,
    enteredAt: now,
    lastInteractionAt: now,
    direction: 1,
    idleHistory: [defaultIdleAction],
  };
}

export function transitionPetState(state: PetState, event: PetEvent): PetState {
  switch (event.type) {
    case "APP_READY":
      return state;
    case "PET_CLICKED":
      if (state.name === "sleeping") {
        return enterIdle(state, event.at, event.at);
      }

      return { ...state, lastInteractionAt: event.at };
    case "INTERACTION_SELECTED":
      return enterState(state, "interacting", event.action, event.at, event.at);
    case "DRAG_STARTED":
      return enterState(state, "dragging", "drag", event.at, event.at);
    case "DRAG_ENDED":
      return enterIdle(state, event.at, event.at);
    case "AUTO_MOVE_TICK":
      if (state.name === "dragging" || state.name === "interacting") {
        return state;
      }

      if (state.name === "idle") {
        return enterState(state, "walking", "walk", event.at);
      }

      return state;
    case "IDLE_TIMEOUT":
      if (state.name === "dragging") {
        return state;
      }

      return enterState(state, "sleeping", "sleep", event.at);
    case "SETTINGS_CHANGED":
      if (state.name === "sleeping") {
        return enterIdle(state, event.at, event.at);
      }

      return state;
    case "IDLE_ANIMATION_FINISHED":
      return {
        ...state,
        name: "idle",
        action: event.action,
        enteredAt: event.at,
        idleHistory: [...state.idleHistory, event.action],
      };
    case "ANIMATION_FINISHED":
      if (state.name === "interacting" || state.name === "walking") {
        return enterIdle(state, event.at);
      }

      return state;
  }
}

function enterIdle(
  state: PetState,
  enteredAt: number,
  lastInteractionAt = state.lastInteractionAt,
): PetState {
  return enterState(state, "idle", defaultIdleAction, enteredAt, lastInteractionAt);
}

function enterState(
  state: PetState,
  name: PetStateName,
  action: PetState["action"],
  enteredAt: number,
  lastInteractionAt = state.lastInteractionAt,
): PetState {
  return {
    ...state,
    name,
    action,
    enteredAt,
    lastInteractionAt,
  };
}
