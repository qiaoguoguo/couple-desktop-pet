import type { Server } from "node:http";
import WebSocket, { WebSocketServer, type RawData } from "ws";
import {
  ACTIVITY_STATUS_CAPABILITY,
  isNullableActivityStatus,
} from "../../shared/activityStatus.js";
import type {
  ClientToServerMessage,
  ErrorServerMessage,
  ServerToClientMessage,
  StructuredMessageContent,
} from "../../shared/syncProtocol.js";
import {
  readSupportedCapabilities,
  validateMessageText,
  validateStructuredMessageContent,
} from "../../shared/syncProtocol.js";
import {
  ConnectionRegistry,
  type AuthenticatedConnection,
} from "./connectionRegistry.js";
import { RelayError } from "./errors.js";
import { createServerMessageId } from "./ids.js";
import type { RelayRepository } from "./repository.js";

export function attachWebSocketRelay(
  server: Server,
  repository: RelayRepository,
  now: () => Date = () => new Date(),
): WebSocketServer {
  const registry = new ConnectionRegistry();
  const webSocketServer = new WebSocketServer({ server, path: "/ws" });

  webSocketServer.on("connection", (socket) => {
    let connection: AuthenticatedConnection | null = null;

    socket.on("message", (data) => {
      try {
        const message = parseClientMessage(data);

        if (!connection) {
          connection = authenticateSocket(
            repository,
            registry,
            socket,
            message,
            now,
          );
          return;
        }

        handleAuthenticatedMessage(registry, connection, message, now);
      } catch (error) {
        sendError(socket, toErrorMessage(error, readRequestId(data)));
      }
    });

    socket.on("close", () => {
      if (!connection || !registry.remove(connection.deviceId, socket)) {
        return;
      }

      const peer = registry.get(connection.peerDeviceId);
      if (peer && peer.pairId === connection.pairId) {
        sendJson(peer.socket, {
          type: "peer.offline",
          pairId: connection.pairId,
          peerDeviceId: connection.deviceId,
          changedAt: createPresenceChangedAt(now),
        });
      }
    });
  });

  return webSocketServer;
}

function authenticateSocket(
  repository: RelayRepository,
  registry: ConnectionRegistry,
  socket: WebSocket,
  message: ClientToServerMessage,
  now: () => Date,
): AuthenticatedConnection {
  if (message.type !== "auth") {
    throw new RelayError("auth_failed", 401, "Authentication is required");
  }

  const authenticated = repository.authenticateDeviceForPair(message);
  const connection: AuthenticatedConnection = {
    socket,
    deviceId: authenticated.deviceId,
    pairId: authenticated.pairId,
    peerDeviceId: authenticated.peerDeviceId,
    activityStatus: null,
    supportsActivityStatus:
      message.capabilities?.includes(ACTIVITY_STATUS_CAPABILITY) ?? false,
  };
  const previous = registry.replace(connection);
  const isPresenceTransition = !previous;
  if (previous && previous.socket !== socket) {
    previous.socket.close();
  }

  sendJson(socket, {
    type: "auth.ok",
    requestId: message.requestId,
    pairId: authenticated.pairId,
    capabilities: [ACTIVITY_STATUS_CAPABILITY],
  });

  const changedAt = createPresenceChangedAt(now);
  const peer = registry.get(authenticated.peerDeviceId);
  if (peer && peer.pairId === authenticated.pairId) {
    sendJson(socket, {
      type: "peer.online",
      pairId: authenticated.pairId,
      peerDeviceId: authenticated.peerDeviceId,
      changedAt,
    });
    sendPeerStatusIfPresent(connection, authenticated.pairId, peer, changedAt);
    if (isPresenceTransition) {
      sendJson(peer.socket, {
        type: "peer.online",
        pairId: authenticated.pairId,
        peerDeviceId: authenticated.deviceId,
        changedAt,
      });
      sendPeerStatusIfPresent(
        peer,
        authenticated.pairId,
        connection,
        changedAt,
      );
    }
  } else {
    sendJson(socket, {
      type: "peer.offline",
      pairId: authenticated.pairId,
      peerDeviceId: authenticated.peerDeviceId,
      changedAt,
    });
  }

  return connection;
}

function sendPeerStatusIfPresent(
  target: AuthenticatedConnection,
  pairId: string,
  peer: AuthenticatedConnection,
  changedAt: string,
): void {
  if (!target.supportsActivityStatus || peer.activityStatus === null) {
    return;
  }

  sendJson(target.socket, {
    type: "peer.status",
    pairId,
    peerDeviceId: peer.deviceId,
    activityStatus: peer.activityStatus,
    changedAt,
  });
}

function createPresenceChangedAt(now: () => Date): string {
  return now().toISOString();
}

function handleAuthenticatedMessage(
  registry: ConnectionRegistry,
  connection: AuthenticatedConnection,
  message: ClientToServerMessage,
  now: () => Date,
): void {
  if (message.type === "ping") {
    sendJson(connection.socket, { type: "pong" });
    return;
  }

  if (message.type === "status.update") {
    handleStatusUpdate(registry, connection, message, now);
    return;
  }

  if (message.type !== "message.send") {
    sendError(connection.socket, {
      type: "error",
      requestId: message.requestId,
      code: "malformed_message",
      message: "Unsupported message type",
    });
    return;
  }

  if (message.pairId !== connection.pairId) {
    sendError(connection.socket, {
      type: "error",
      requestId: message.requestId,
      code: "auth_failed",
      message: "Pair authentication failed",
    });
    return;
  }

  const text = validateMessageText(message.text);
  if (!text.ok) {
    sendError(connection.socket, {
      type: "error",
      requestId: message.requestId,
      code: text.code,
      message: text.message,
    });
    return;
  }

  const peer = registry.get(connection.peerDeviceId);
  if (!peer || peer.pairId !== connection.pairId) {
    sendError(connection.socket, {
      type: "error",
      requestId: message.requestId,
      code: "peer_offline",
      message: "Peer is offline",
    });
    return;
  }

  const sentAt = new Date().toISOString();
  sendJson(peer.socket, {
    type: "message.received",
    pairId: connection.pairId,
    serverMessageId: createServerMessageId(),
    fromDeviceId: connection.deviceId,
    text: text.text,
    sentAt,
    ...(message.content ? { content: message.content } : {}),
  });
  sendJson(connection.socket, {
    type: "message.delivered",
    requestId: message.requestId,
    clientMessageId: message.clientMessageId,
    deliveredAt: sentAt,
  });
}

function handleStatusUpdate(
  registry: ConnectionRegistry,
  connection: AuthenticatedConnection,
  message: Extract<ClientToServerMessage, { type: "status.update" }>,
  now: () => Date,
): void {
  if (message.pairId !== connection.pairId) {
    sendError(connection.socket, {
      type: "error",
      requestId: message.requestId,
      code: "auth_failed",
      message: "Pair authentication failed",
    });
    return;
  }

  connection.activityStatus = message.activityStatus;

  const peer = registry.get(connection.peerDeviceId);
  if (!peer || peer.pairId !== connection.pairId) {
    return;
  }

  if (!peer.supportsActivityStatus) {
    return;
  }

  sendJson(peer.socket, {
    type: "peer.status",
    pairId: connection.pairId,
    peerDeviceId: connection.deviceId,
    activityStatus: connection.activityStatus,
    changedAt: now().toISOString(),
  });
}

function parseClientMessage(data: RawData): ClientToServerMessage {
  const parsed = JSON.parse(data.toString()) as unknown;
  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    throw new RelayError("malformed_message", 400, "Malformed websocket message");
  }

  if (parsed.type === "ping") {
    return { type: "ping" };
  }

  if (
    parsed.type === "auth" &&
    typeof parsed.requestId === "string" &&
    typeof parsed.deviceId === "string" &&
    typeof parsed.deviceSecret === "string" &&
    typeof parsed.pairId === "string"
  ) {
    const capabilities = readSupportedCapabilities(parsed.capabilities);
    if (capabilities === null) {
      throw new RelayError("malformed_message", 400, "Malformed websocket message");
    }

    return {
      type: "auth",
      requestId: parsed.requestId,
      deviceId: parsed.deviceId,
      deviceSecret: parsed.deviceSecret,
      pairId: parsed.pairId,
      ...(capabilities === undefined ? {} : { capabilities }),
    };
  }

  if (
    parsed.type === "message.send" &&
    typeof parsed.requestId === "string" &&
    typeof parsed.pairId === "string" &&
    typeof parsed.clientMessageId === "string" &&
    typeof parsed.text === "string"
  ) {
    const content = readStructuredMessageContent(parsed.content);

    return {
      type: "message.send",
      requestId: parsed.requestId,
      pairId: parsed.pairId,
      clientMessageId: parsed.clientMessageId,
      text: parsed.text,
      ...(content === undefined ? {} : { content }),
    };
  }

  if (
    parsed.type === "status.update" &&
    typeof parsed.requestId === "string" &&
    typeof parsed.pairId === "string" &&
    isNullableActivityStatus(parsed.activityStatus)
  ) {
    return {
      type: "status.update",
      requestId: parsed.requestId,
      pairId: parsed.pairId,
      activityStatus: parsed.activityStatus,
    };
  }

  throw new RelayError("malformed_message", 400, "Malformed websocket message");
}

function readStructuredMessageContent(
  input: unknown,
): StructuredMessageContent | undefined {
  if (input === undefined) {
    return undefined;
  }

  const validation = validateStructuredMessageContent(input);
  if (!validation.ok) {
    throw new RelayError("malformed_message", 400, validation.message);
  }

  return validation.content;
}

function toErrorMessage(error: unknown, requestId: string | undefined): ErrorServerMessage {
  if (error instanceof RelayError) {
    return {
      type: "error",
      requestId,
      code: error.code,
      message: error.message,
    };
  }

  return {
    type: "error",
    requestId,
    code: "malformed_message",
    message: "Malformed websocket message",
  };
}

function readRequestId(data: RawData): string | undefined {
  try {
    const parsed = JSON.parse(data.toString()) as unknown;
    return isRecord(parsed) && typeof parsed.requestId === "string"
      ? parsed.requestId
      : undefined;
  } catch {
    return undefined;
  }
}

function sendError(socket: WebSocket, message: ErrorServerMessage): void {
  sendJson(socket, message);
}

function sendJson(socket: WebSocket, message: ServerToClientMessage): void {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(message));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
