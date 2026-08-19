import type WebSocket from "ws";
import type { ActivityStatus } from "../../shared/activityStatus.js";

export interface AuthenticatedConnection {
  socket: WebSocket;
  deviceId: string;
  pairId: string;
  peerDeviceId: string;
  activityStatus: ActivityStatus | null;
  supportsActivityStatus: boolean;
  supportsProfileSync: boolean;
  supportsSpark: boolean;
}

export class ConnectionRegistry {
  private readonly byDeviceId = new Map<string, AuthenticatedConnection>();

  replace(connection: AuthenticatedConnection): AuthenticatedConnection | null {
    const previous = this.byDeviceId.get(connection.deviceId) ?? null;
    this.byDeviceId.set(connection.deviceId, connection);
    return previous;
  }

  remove(deviceId: string, socket: WebSocket): boolean {
    const current = this.byDeviceId.get(deviceId);
    if (!current || current.socket !== socket) {
      return false;
    }

    this.byDeviceId.delete(deviceId);
    return true;
  }

  get(deviceId: string): AuthenticatedConnection | null {
    return this.byDeviceId.get(deviceId) ?? null;
  }

  getConnectionsForPeer(peerDeviceId: string): AuthenticatedConnection[] {
    return [...this.byDeviceId.values()].filter(
      (connection) => connection.peerDeviceId === peerDeviceId,
    );
  }
}
