import {
  parseServerToClientMessage,
  validateMessageText,
  type ClientToServerMessage,
} from "../../shared/syncProtocol";
import { toWebSocketRelayUrl } from "./relayUrl";
import type { PeerPresence, SyncConnectionStatus } from "./syncTypes";

export type RealtimeClientEvent =
  | { type: "status"; status: SyncConnectionStatus }
  | { type: "presence"; peerPresence: PeerPresence; peerDeviceId: string }
  | { type: "message"; id: string; fromDeviceId: string; text: string; at: string }
  | { type: "delivered"; clientMessageId: string; at: string }
  | { type: "error"; message: string };

export interface RealtimeClientOptions {
  relayUrl: string;
  deviceId: string;
  deviceSecret: string;
  pairId: string;
  webSocketFactory?: (url: string) => WebSocket;
  onEvent(event: RealtimeClientEvent): void;
}

export class RealtimeClient {
  private socket: WebSocket | null = null;
  private closedByClient = false;

  constructor(private readonly options: RealtimeClientOptions) {}

  connect(): void {
    this.disconnect();
    this.closedByClient = false;
    this.options.onEvent({ type: "status", status: "connecting" });

    const socket = this.createWebSocket(toWebSocketRelayUrl(this.options.relayUrl));
    this.socket = socket;
    socket.addEventListener("open", () => this.handleOpen(socket));
    socket.addEventListener("message", (event) => this.handleMessage(event));
    socket.addEventListener("close", () => this.handleClose(socket));
    socket.addEventListener("error", () => {
      this.options.onEvent({ type: "error", message: "Relay connection error" });
    });
  }

  disconnect(): void {
    if (!this.socket) {
      return;
    }

    this.closedByClient = true;
    this.socket.close();
    this.socket = null;
  }

  sendMessage(
    text: string,
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
    });

    return { ok: true, clientMessageId };
  }

  private handleOpen(socket: WebSocket): void {
    if (socket !== this.socket) {
      return;
    }

    this.send({
      type: "auth",
      requestId: createRequestId("auth"),
      deviceId: this.options.deviceId,
      deviceSecret: this.options.deviceSecret,
      pairId: this.options.pairId,
    });
  }

  private handleMessage(event: MessageEvent): void {
    const parsed = parseIncomingMessage(event.data);
    if (!parsed) {
      this.options.onEvent({ type: "error", message: "Malformed relay message" });
      return;
    }

    switch (parsed.type) {
      case "auth.ok":
        this.options.onEvent({ type: "status", status: "connected" });
        return;
      case "peer.online":
        this.options.onEvent({
          type: "presence",
          peerPresence: "online",
          peerDeviceId: parsed.peerDeviceId,
        });
        return;
      case "peer.offline":
        this.options.onEvent({
          type: "presence",
          peerPresence: "offline",
          peerDeviceId: parsed.peerDeviceId,
        });
        return;
      case "message.received":
        this.options.onEvent({
          type: "message",
          id: parsed.serverMessageId,
          fromDeviceId: parsed.fromDeviceId,
          text: parsed.text,
          at: parsed.sentAt,
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
    this.options.onEvent({
      type: "status",
      status: this.closedByClient ? "disabled" : "disconnected",
    });
  }

  private send(message: ClientToServerMessage): void {
    this.socket?.send(JSON.stringify(message));
  }

  private createWebSocket(url: string): WebSocket {
    return this.options.webSocketFactory
      ? this.options.webSocketFactory(url)
      : new WebSocket(url);
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
