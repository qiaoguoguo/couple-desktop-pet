import type { IdleActionName } from "../assets/petActionNames";
import type { PetEvent, PetState } from "./petTypes";

const IDLE_TIMEOUT_MS = 120000;
const AUTO_MOVE_IDLE_MS = 8000;

export function getNextScheduledEvent(
  state: PetState,
  now: number,
  autoMoveEnabled: boolean,
  currentActionDurationMs: number,
): PetEvent | null {
  if (state.name === "sleeping") {
    return null;
  }

  if (now - state.lastInteractionAt >= IDLE_TIMEOUT_MS) {
    return { type: "IDLE_TIMEOUT", at: now };
  }

  if (
    autoMoveEnabled &&
    state.name === "idle" &&
    now - state.lastInteractionAt >= AUTO_MOVE_IDLE_MS
  ) {
    return { type: "AUTO_MOVE_TICK", at: now };
  }

  if (
    (state.name === "interacting" || state.name === "walking") &&
    now - state.enteredAt >= currentActionDurationMs
  ) {
    return { type: "ANIMATION_FINISHED", at: now };
  }

  if (
    state.name === "idle" &&
    now - state.enteredAt >= currentActionDurationMs
  ) {
    return {
      type: "IDLE_ANIMATION_FINISHED",
      action: state.action as IdleActionName,
      at: now,
    };
  }

  return null;
}
