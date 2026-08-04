import type {
  IdleActionName,
  InteractionActionName,
  PetActionName,
} from "../assets/petActionNames";

export type PetStateName =
  | "idle"
  | "walking"
  | "dragging"
  | "interacting"
  | "sleeping";

export type PetEvent =
  | { type: "APP_READY"; at: number }
  | { type: "PET_CLICKED"; at: number }
  | { type: "DRAG_STARTED"; at: number }
  | { type: "DRAG_ENDED"; at: number }
  | { type: "AUTO_MOVE_TICK"; at: number }
  | { type: "IDLE_TIMEOUT"; at: number }
  | { type: "SETTINGS_CHANGED"; at: number }
  | { type: "ANIMATION_FINISHED"; at: number }
  | { type: "IDLE_ANIMATION_FINISHED"; action: IdleActionName; at: number }
  | {
      type: "INTERACTION_SELECTED";
      action: PetActionName;
      returnTo?: IdleActionName;
      at: number;
    }
  | {
      type: "AMBIENT_INTERACTION_SELECTED";
      action: InteractionActionName;
      returnTo?: IdleActionName;
      at: number;
    };

export type PetEventType = PetEvent["type"];

export interface PetState {
  name: PetStateName;
  action: PetActionName;
  enteredAt: number;
  lastInteractionAt: number;
  direction: -1 | 1;
  idleHistory: readonly PetActionName[];
  returnTo?: IdleActionName;
}
