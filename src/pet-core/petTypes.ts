export type PetStateName = "idle" | "walking" | "dragging" | "happy" | "sleeping";

export type PetEventType =
  | "APP_READY"
  | "PET_CLICKED"
  | "DRAG_STARTED"
  | "DRAG_ENDED"
  | "AUTO_MOVE_TICK"
  | "IDLE_TIMEOUT"
  | "SETTINGS_CHANGED"
  | "ANIMATION_FINISHED";

export interface PetState {
  name: PetStateName;
  enteredAt: number;
  lastInteractionAt: number;
  direction: -1 | 1;
}

export interface PetEvent {
  type: PetEventType;
  at: number;
}
