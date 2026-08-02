import type { PetEvent, PetState } from "./petTypes";

const HAPPY_DURATION_MS = 900;
const WALKING_DURATION_MS = 1600;
const IDLE_TIMEOUT_MS = 120000;
const AUTO_MOVE_IDLE_MS = 8000;

export function getNextScheduledEvent(
  state: PetState,
  now: number,
  autoMoveEnabled: boolean,
): PetEvent | null {
  if (state.name === "happy" && now - state.enteredAt >= HAPPY_DURATION_MS) {
    return { type: "ANIMATION_FINISHED", at: now };
  }

  if (state.name === "walking" && now - state.enteredAt >= WALKING_DURATION_MS) {
    return { type: "ANIMATION_FINISHED", at: now };
  }

  if (state.name !== "sleeping" && now - state.lastInteractionAt >= IDLE_TIMEOUT_MS) {
    return { type: "IDLE_TIMEOUT", at: now };
  }

  if (
    autoMoveEnabled &&
    state.name === "idle" &&
    now - state.enteredAt >= AUTO_MOVE_IDLE_MS
  ) {
    return { type: "AUTO_MOVE_TICK", at: now };
  }

  return null;
}
