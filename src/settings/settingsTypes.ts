export type MovementRange = "bottom" | "active-screen" | "free";

export interface SyncSettings {
  enabled: boolean;
  relayUrl: string;
  deviceId: string | null;
  deviceSecret: string | null;
  pairId: string | null;
  peerDeviceId: string | null;
}

export interface AppearanceSettings {
  selectedPetPackageId: string;
  peerPetPackageByDeviceId: Record<string, string>;
}

export interface PetSettings {
  scale: number;
  autoMoveEnabled: boolean;
  movementRange: MovementRange;
  bubblesEnabled: boolean;
  alwaysOnTop: boolean;
  clickThrough: boolean;
  appearance: AppearanceSettings;
  sync: SyncSettings;
}
