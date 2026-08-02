export type MovementRange = "bottom" | "active-screen" | "free";

export interface PetSettings {
  scale: number;
  autoMoveEnabled: boolean;
  movementRange: MovementRange;
  bubblesEnabled: boolean;
  alwaysOnTop: boolean;
  clickThrough: boolean;
}
