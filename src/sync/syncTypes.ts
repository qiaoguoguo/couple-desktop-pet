import type { ActivityStatus } from "../../shared/activityStatus";
import type {
  CityLocationV1,
  DeviceProfileV1,
  ProfileUpdateV1,
} from "../../shared/profileProtocol";
import type { PairSparkRequest } from "../../shared/sparkProtocol";

export type { PairSparkRequest };

export type SyncConnectionStatus =
  | "disabled"
  | "connecting"
  | "connected"
  | "disconnected"
  | "authFailed";

export type PeerPresence = "unknown" | "online" | "offline";

export interface SessionMessage {
  id: string;
  direction: "sent" | "received";
  text: string;
  at: string;
}

export interface SyncRuntimeState {
  status: SyncConnectionStatus;
  peerPresence: PeerPresence;
  peerActivityStatus: ActivityStatus | null;
  peerPresenceChangedAt: string | null;
  peerLastSeenAt: string | null;
  lastError: string | null;
}

export interface LocationSearchRequest {
  deviceId: string;
  deviceSecret: string;
  query: string;
}

export interface LocationSearchResponse {
  locations: CityLocationV1[];
}

export interface SaveProfileRequest {
  deviceId: string;
  deviceSecret: string;
  profile: ProfileUpdateV1;
}

export interface SaveProfileResponse {
  profile: DeviceProfileV1;
}

export interface PairWeatherRequest {
  deviceId: string;
  deviceSecret: string;
  pairId: string;
}
