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
  peerPresenceChangedAt: string | null;
  peerLastSeenAt: string | null;
  lastError: string | null;
}
