export const MESSAGE_TEXT_MAX_LENGTH = 300;
export const PAIR_CODE_LENGTH = 6;
export const PAIR_CODE_TTL_MS = 10 * 60 * 1000;

export type SyncErrorCode =
  | "invalid_request"
  | "invalid_code"
  | "code_expired"
  | "code_consumed"
  | "self_pair_not_allowed"
  | "device_already_paired"
  | "peer_already_paired"
  | "pair_not_found"
  | "auth_failed"
  | "peer_offline"
  | "message_empty"
  | "message_too_long"
  | "rate_limited"
  | "relay_unavailable"
  | "malformed_message";

const SYNC_ERROR_CODES = new Set<string>([
  "invalid_request",
  "invalid_code",
  "code_expired",
  "code_consumed",
  "self_pair_not_allowed",
  "device_already_paired",
  "peer_already_paired",
  "pair_not_found",
  "auth_failed",
  "peer_offline",
  "message_empty",
  "message_too_long",
  "rate_limited",
  "relay_unavailable",
  "malformed_message",
]);

export interface DeviceCredentialsPayload {
  deviceId: string;
  deviceSecret: string;
  displayName: string;
}

export interface DeviceAuthPayload {
  deviceId: string;
  deviceSecret: string;
}

export type CreatePairCodeRequest = DeviceCredentialsPayload;

export interface CreatePairCodeResponse {
  code: string;
  expiresAt: string;
}

export interface AcceptPairCodeRequest extends DeviceCredentialsPayload {
  code: string;
}

export interface AcceptPairCodeResponse {
  pairId: string;
  peerDeviceId: string;
}

export interface PairCodeStatusRequest extends DeviceAuthPayload {
  code: string;
}

export type PairCodeStatusResponse =
  | { status: "pending"; expiresAt: string }
  | { status: "paired"; pairId: string; peerDeviceId: string }
  | { status: "expired" }
  | { status: "consumed" };

export interface AuthClientMessage {
  type: "auth";
  requestId: string;
  deviceId: string;
  deviceSecret: string;
  pairId: string;
}

export interface SendClientMessage {
  type: "message.send";
  requestId: string;
  pairId: string;
  clientMessageId: string;
  text: string;
}

export interface PingClientMessage {
  type: "ping";
}

export type ClientToServerMessage =
  | AuthClientMessage
  | SendClientMessage
  | PingClientMessage;

export interface AuthOkServerMessage {
  type: "auth.ok";
  requestId: string;
  pairId: string;
}

export interface PeerOnlineServerMessage {
  type: "peer.online";
  pairId: string;
  peerDeviceId: string;
}

export interface PeerOfflineServerMessage {
  type: "peer.offline";
  pairId: string;
  peerDeviceId: string;
}

export interface MessageReceivedServerMessage {
  type: "message.received";
  pairId: string;
  serverMessageId: string;
  fromDeviceId: string;
  text: string;
  sentAt: string;
}

export interface MessageDeliveredServerMessage {
  type: "message.delivered";
  requestId: string;
  clientMessageId: string;
  deliveredAt: string;
}

export interface ErrorServerMessage {
  type: "error";
  requestId?: string;
  code: SyncErrorCode;
  message: string;
}

export interface PongServerMessage {
  type: "pong";
}

export type ServerToClientMessage =
  | AuthOkServerMessage
  | PeerOnlineServerMessage
  | PeerOfflineServerMessage
  | MessageReceivedServerMessage
  | MessageDeliveredServerMessage
  | ErrorServerMessage
  | PongServerMessage;

export type MessageTextValidation =
  | { ok: true; text: string }
  | { ok: false; code: SyncErrorCode; message: string };

export function validateMessageText(text: unknown): MessageTextValidation {
  if (typeof text !== "string") {
    return {
      ok: false,
      code: "malformed_message",
      message: "Message text must be a string",
    };
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, code: "message_empty", message: "Message text is empty" };
  }

  if (Array.from(trimmed).length > MESSAGE_TEXT_MAX_LENGTH) {
    return {
      ok: false,
      code: "message_too_long",
      message: "Message text exceeds 300 characters",
    };
  }

  return { ok: true, text: trimmed };
}

export function parseServerToClientMessage(input: unknown): ServerToClientMessage | null {
  if (!isRecord(input) || typeof input.type !== "string") {
    return null;
  }

  switch (input.type) {
    case "auth.ok":
      return readAuthOk(input);
    case "peer.online":
      return readPeerPresence(input, "peer.online");
    case "peer.offline":
      return readPeerPresence(input, "peer.offline");
    case "message.received":
      return readMessageReceived(input);
    case "message.delivered":
      return readMessageDelivered(input);
    case "error":
      return readError(input);
    case "pong":
      return { type: "pong" };
    default:
      return null;
  }
}

function readAuthOk(input: Record<string, unknown>): AuthOkServerMessage | null {
  if (typeof input.requestId !== "string" || typeof input.pairId !== "string") {
    return null;
  }

  return { type: "auth.ok", requestId: input.requestId, pairId: input.pairId };
}

function readPeerPresence(
  input: Record<string, unknown>,
  type: "peer.online" | "peer.offline",
): PeerOnlineServerMessage | PeerOfflineServerMessage | null {
  if (typeof input.pairId !== "string" || typeof input.peerDeviceId !== "string") {
    return null;
  }

  return { type, pairId: input.pairId, peerDeviceId: input.peerDeviceId };
}

function readMessageReceived(input: Record<string, unknown>): MessageReceivedServerMessage | null {
  if (
    typeof input.pairId !== "string" ||
    typeof input.serverMessageId !== "string" ||
    typeof input.fromDeviceId !== "string" ||
    typeof input.text !== "string" ||
    typeof input.sentAt !== "string"
  ) {
    return null;
  }

  return {
    type: "message.received",
    pairId: input.pairId,
    serverMessageId: input.serverMessageId,
    fromDeviceId: input.fromDeviceId,
    text: input.text,
    sentAt: input.sentAt,
  };
}

function readMessageDelivered(input: Record<string, unknown>): MessageDeliveredServerMessage | null {
  if (
    typeof input.requestId !== "string" ||
    typeof input.clientMessageId !== "string" ||
    typeof input.deliveredAt !== "string"
  ) {
    return null;
  }

  return {
    type: "message.delivered",
    requestId: input.requestId,
    clientMessageId: input.clientMessageId,
    deliveredAt: input.deliveredAt,
  };
}

function readError(input: Record<string, unknown>): ErrorServerMessage | null {
  if (
    typeof input.code !== "string" ||
    !isSyncErrorCode(input.code) ||
    typeof input.message !== "string"
  ) {
    return null;
  }

  return {
    type: "error",
    requestId: typeof input.requestId === "string" ? input.requestId : undefined,
    code: input.code,
    message: input.message,
  };
}

export function isSyncErrorCode(code: string): code is SyncErrorCode {
  return SYNC_ERROR_CODES.has(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
