import {
  ACTIVITY_STATUS_CAPABILITY,
  type ActivityStatus,
} from "../../shared/activityStatus";
import {
  PROFILE_SYNC_CAPABILITY,
  type DeviceProfileV1,
} from "../../shared/profileProtocol";
import {
  SPARK_SYNC_CAPABILITY,
  type SparkStreakSnapshotV1,
} from "../../shared/sparkProtocol";
import {
  parseServerToClientMessage,
  validateMessageText,
  type ClientToServerMessage,
  type StructuredMessageContent,
} from "../../shared/syncProtocol";
import { toWebSocketRelayUrl } from "./relayUrl";
import type { PeerPresence, SyncConnectionStatus } from "./syncTypes";

const reconnectDelaysMs = [1000, 2000, 5000, 10000, 30000] as const;

export type RealtimeClientEvent =
  | { type: "status"; status: SyncConnectionStatus }
  | {
      type: "presence";
      peerPresence: PeerPresence;
      peerDeviceId: string;
      changedAt: string | null;
      lastSeenAt: string | null;
    }
  | {
      type: "peerStatus";
      peerDeviceId: string;
      peerActivityStatus: ActivityStatus | null;
      changedAt: string;
    }
  | {
      type: "peerProfile";
      peerDeviceId: string;
      profile: DeviceProfileV1;
      changedAt: string;
    }
  | { type: "spark"; snapshot: SparkStreakSnapshotV1 }
  | {
      type: "message";
      id: string;
      fromDeviceId: string;
      text: string;
      at: string;
      content?: StructuredMessageContent;
    }
  | { type: "delivered"; clientMessageId: string; at: string }
  | { type: "error"; message: string };

export interface RealtimeClientOptions {
  relayUrl: string;
  deviceId: string;
  deviceSecret: string;
  pairId: string;
  activityStatus: ActivityStatus | null;
  webSocketFactory?: (url: string) => WebSocket;
  onEvent(event: RealtimeClientEvent): void;
}

export class RealtimeClient {
  private socket: WebSocket | null = null;
  private closedByClient = false;
  private authFailed = false;
  private authenticated = false;
  private serverSupportsActivityStatus = false;
  private localActivityStatus: ActivityStatus | null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: RealtimeClientOptions) {
    this.localActivityStatus = options.activityStatus;
  }

  connect(): void {
    this.closeCurrentSocket();
    this.clearReconnectTimer();
    this.closedByClient = false;
    this.authFailed = false;
    this.authenticated = false;
    this.serverSupportsActivityStatus = false;
    this.options.onEvent({ type: "status", status: "connecting" });

    this.openSocket();
  }

  private openSocket(): void {
    const socket = this.createWebSocket(toWebSocketRelayUrl(this.options.relayUrl));
    this.socket = socket;
    socket.addEventListener("open", () => this.handleOpen(socket));
    socket.addEventListener("message", (event) => this.handleMessage(socket, event));
    socket.addEventListener("close", () => this.handleClose(socket));
    socket.addEventListener("error", () => {
      this.options.onEvent({ type: "error", message: "Relay connection error" });
    });
  }

  disconnect(): void {
    this.closedByClient = true;
    this.clearReconnectTimer();
    this.closeCurrentSocket();
  }

  sendMessage(
    text: string,
    content?: StructuredMessageContent,
  ): { ok: true; clientMessageId: string } | { ok: false; message: string } {
    const validated = validateMessageText(text);
    if (!validated.ok) {
      return { ok: false, message: validated.message };
    }

    if (!this.socket || !isSocketOpen(this.socket)) {
      return { ok: false, message: "Relay is not connected" };
    }

    const clientMessageId = createClientMessageId();
    this.send({
      type: "message.send",
      requestId: createRequestId("msg"),
      pairId: this.options.pairId,
      clientMessageId,
      text: validated.text,
      ...(content === undefined ? {} : { content }),
    });

    return { ok: true, clientMessageId };
  }

  setActivityStatus(activityStatus: ActivityStatus | null): { synced: boolean } {
    this.localActivityStatus = activityStatus;

    return { synced: this.sendActivityStatus() };
  }

  private handleOpen(socket: WebSocket): void {
    if (socket !== this.socket) {
      return;
    }

    this.authenticated = false;
    this.send({
      type: "auth",
      requestId: createRequestId("auth"),
      deviceId: this.options.deviceId,
      deviceSecret: this.options.deviceSecret,
      pairId: this.options.pairId,
      capabilities: [
        ACTIVITY_STATUS_CAPABILITY,
        PROFILE_SYNC_CAPABILITY,
        SPARK_SYNC_CAPABILITY,
      ],
    });
  }

  private handleMessage(socket: WebSocket, event: MessageEvent): void {
    if (socket !== this.socket) {
      return;
    }

    const parsed = parseIncomingMessage(event.data);
    if (!parsed) {
      this.options.onEvent({ type: "error", message: "Malformed relay message" });
      return;
    }

    switch (parsed.type) {
      case "auth.ok":
        this.reconnectAttempt = 0;
        this.authFailed = false;
        this.authenticated = true;
        this.serverSupportsActivityStatus =
          parsed.capabilities?.includes(ACTIVITY_STATUS_CAPABILITY) ?? false;
        this.sendActivityStatus();
        this.options.onEvent({ type: "status", status: "connected" });
        return;
      case "peer.online":
        this.options.onEvent({
          type: "presence",
          peerPresence: "online",
          peerDeviceId: parsed.peerDeviceId,
          changedAt: parsed.changedAt ?? null,
          lastSeenAt: parsed.lastSeenAt ?? null,
        });
        return;
      case "peer.offline":
        this.options.onEvent({
          type: "presence",
          peerPresence: "offline",
          peerDeviceId: parsed.peerDeviceId,
          changedAt: parsed.changedAt ?? null,
          lastSeenAt: parsed.lastSeenAt ?? null,
        });
        return;
      case "peer.status":
        this.options.onEvent({
          type: "peerStatus",
          peerDeviceId: parsed.peerDeviceId,
          peerActivityStatus: parsed.activityStatus,
          changedAt: parsed.changedAt,
        });
        return;
      case "peer.profile":
        this.options.onEvent({
          type: "peerProfile",
          peerDeviceId: parsed.peerDeviceId,
          profile: parsed.profile,
          changedAt: parsed.changedAt,
        });
        return;
      case "spark.updated":
        this.options.onEvent({ type: "spark", snapshot: parsed.snapshot });
        return;
      case "message.received":
        this.options.onEvent({
          type: "message",
          id: parsed.serverMessageId,
          fromDeviceId: parsed.fromDeviceId,
          text: parsed.text,
          at: parsed.sentAt,
          content: parsed.content,
        });
        return;
      case "message.delivered":
        this.options.onEvent({
          type: "delivered",
          clientMessageId: parsed.clientMessageId,
          at: parsed.deliveredAt,
        });
        return;
      case "error":
        if (parsed.code === "auth_failed") {
          this.authFailed = true;
          this.clearReconnectTimer();
          this.options.onEvent({ type: "status", status: "authFailed" });
        }
        this.options.onEvent({ type: "error", message: parsed.message });
        return;
      case "pong":
        return;
    }
  }

  private handleClose(socket: WebSocket): void {
    if (socket !== this.socket && this.socket !== null) {
      return;
    }

    this.socket = null;
    this.authenticated = false;
    this.serverSupportsActivityStatus = false;

    if (this.closedByClient) {
      this.options.onEvent({ type: "status", status: "disabled" });
      return;
    }

    if (this.authFailed) {
      this.options.onEvent({ type: "status", status: "authFailed" });
      return;
    }

    this.options.onEvent({ type: "status", status: "disconnected" });
    this.scheduleReconnect();
  }

  private send(message: ClientToServerMessage): void {
    this.socket?.send(JSON.stringify(message));
  }

  private sendActivityStatus(): boolean {
    if (
      !this.authenticated ||
      !this.serverSupportsActivityStatus ||
      !this.socket ||
      !isSocketOpen(this.socket)
    ) {
      return false;
    }

    this.send({
      type: "status.update",
      requestId: createRequestId("status"),
      pairId: this.options.pairId,
      activityStatus: this.localActivityStatus,
    });
    return true;
  }

  private createWebSocket(url: string): WebSocket {
    return this.options.webSocketFactory
      ? this.options.webSocketFactory(url)
      : new WebSocket(url);
  }

  private scheduleReconnect(): void {
    if (this.closedByClient || this.authFailed || this.reconnectTimer) {
      return;
    }

    const delay =
      reconnectDelaysMs[Math.min(this.reconnectAttempt, reconnectDelaysMs.length - 1)];
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;

      if (this.closedByClient || this.authFailed) {
        return;
      }

      this.options.onEvent({ type: "status", status: "connecting" });
      this.openSocket();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) {
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private closeCurrentSocket(): void {
    if (!this.socket) {
      return;
    }

    const socket = this.socket;
    this.socket = null;
    this.authenticated = false;
    this.serverSupportsActivityStatus = false;
    socket.close();
  }
}

function parseIncomingMessage(data: unknown) {
  try {
    const raw = typeof data === "string" ? data : String(data);
    return parseServerToClientMessage(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function isSocketOpen(socket: WebSocket): boolean {
  return socket.readyState === WebSocket.OPEN;
}

function createRequestId(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomHex(6)}`;
}

function createClientMessageId(): string {
  return `local_${Date.now()}_${randomHex(6)}`;
}

function randomHex(length: number): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
