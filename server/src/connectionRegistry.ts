import type WebSocket from "ws";

export interface AuthenticatedConnection {
  socket: WebSocket;
  deviceId: string;
  pairId: string;
  peerDeviceId: string;
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
}
