export const idleActionNames = [
  "idle-breathe",
  "idle-look",
  "idle-stretch",
] as const;

export const movementActionNames = ["walk", "drag", "sleep"] as const;

export const interactionActionNames = [
  "act-cute",
  "act-typing",
  "act-wave",
  "act-hug",
  "act-pout",
  "act-drowsy",
] as const;

export const requiredPetActions = [
  ...idleActionNames,
  ...movementActionNames,
  ...interactionActionNames,
] as const;

export type IdleActionName = (typeof idleActionNames)[number];
export type MovementActionName = (typeof movementActionNames)[number];
export type InteractionActionName = (typeof interactionActionNames)[number];
export type PetActionName = (typeof requiredPetActions)[number];
export type PetActionCategory = "idle" | "movement" | "interaction";

export function readPetActionCategory(action: PetActionName): PetActionCategory {
  if ((idleActionNames as readonly string[]).includes(action)) {
    return "idle";
  }

  if ((interactionActionNames as readonly string[]).includes(action)) {
    return "interaction";
  }

  return "movement";
}

export function isLoopingPetAction(action: PetActionName): boolean {
  return (
    readPetActionCategory(action) === "idle" ||
    action === "walk" ||
    action === "drag" ||
    action === "sleep"
  );
}

export function isPetActionName(value: string): value is PetActionName {
  return (requiredPetActions as readonly string[]).includes(value);
}
