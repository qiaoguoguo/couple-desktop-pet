import type { ActivityStatus } from "../../shared/activityStatus";
import type {
  DeviceProfileV1,
  ProfileUpdateV1,
} from "../../shared/profileProtocol";

export type MovementRange = "bottom" | "active-screen" | "free";

export interface SyncSettings {
  enabled: boolean;
  relayUrl: string;
  deviceId: string | null;
  deviceSecret: string | null;
  pairId: string | null;
  peerDeviceId: string | null;
  activityStatus: ActivityStatus | null;
}

export interface AppearanceSettings {
  selectedPetPackageId: string;
  peerPetPackageByDeviceId: Record<string, string>;
}

export interface ProfileSettings {
  local: ProfileUpdateV1 | null;
  peerByDeviceId: Record<string, DeviceProfileV1>;
  syncState: "idle" | "saving" | "synced" | "pending" | "error";
}

export interface PetSettings {
  scale: number;
  autoMoveEnabled: boolean;
  movementRange: MovementRange;
  bubblesEnabled: boolean;
  alwaysOnTop: boolean;
  clickThrough: boolean;
  appearance: AppearanceSettings;
  profile: ProfileSettings;
  sync: SyncSettings;
}
