import {
  ACTIVITY_STATUS_CAPABILITY,
  type ActivityStatusCapability,
  isNullableActivityStatus,
  type ActivityStatus,
} from "./activityStatus.js";

export const MESSAGE_TEXT_MAX_LENGTH = 300;
export const PAIR_CODE_LENGTH = 6;
export const PAIR_CODE_TTL_MS = 10 * 60 * 1000;
const SURPRISE_SECRET_MAX_LENGTH = 24;
const SURPRISE_NOTE_MAX_LENGTH = 120;
const SURPRISE_SECRET_PATTERN = /^[A-Za-z0-9-]+$/;

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

export interface UnpairRequest extends DeviceAuthPayload {
  pairId: string;
}

export interface UnpairResponse {
  pairId: string;
  unpairedAt: string;
}

export interface AuthClientMessage {
  type: "auth";
  requestId: string;
  deviceId: string;
  deviceSecret: string;
  pairId: string;
  capabilities?: ActivityStatusCapability[];
}

export type SurpriseTheme =
  | "cheer"
  | "apology"
  | "birthday"
  | "festival"
  | "miss"
  | "general";

const SURPRISE_THEMES = new Set<string>([
  "cheer",
  "apology",
  "birthday",
  "festival",
  "miss",
  "general",
]);

export interface SurpriseMessageContent {
  kind: "surprise";
  version: 1;
  theme: SurpriseTheme;
  secret: string;
  note?: string;
}

export type StructuredMessageContent = SurpriseMessageContent;

export interface SendClientMessage {
  type: "message.send";
  requestId: string;
  pairId: string;
  clientMessageId: string;
  text: string;
  content?: StructuredMessageContent;
}

export interface StatusUpdateClientMessage {
  type: "status.update";
  requestId: string;
  pairId: string;
  activityStatus: ActivityStatus | null;
}

export interface PingClientMessage {
  type: "ping";
}

export type ClientToServerMessage =
  | AuthClientMessage
  | SendClientMessage
  | StatusUpdateClientMessage
  | PingClientMessage;

export interface AuthOkServerMessage {
  type: "auth.ok";
  requestId: string;
  pairId: string;
  capabilities?: ActivityStatusCapability[];
}

export interface PeerOnlineServerMessage {
  type: "peer.online";
  pairId: string;
  peerDeviceId: string;
  changedAt?: string;
  lastSeenAt?: string;
}

export interface PeerOfflineServerMessage {
  type: "peer.offline";
  pairId: string;
  peerDeviceId: string;
  changedAt?: string;
  lastSeenAt?: string;
}

export interface PeerStatusServerMessage {
  type: "peer.status";
  pairId: string;
  peerDeviceId: string;
  activityStatus: ActivityStatus | null;
  changedAt: string;
}

export interface MessageReceivedServerMessage {
  type: "message.received";
  pairId: string;
  serverMessageId: string;
  fromDeviceId: string;
  text: string;
  sentAt: string;
  content?: StructuredMessageContent;
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
  | PeerStatusServerMessage
  | MessageReceivedServerMessage
  | MessageDeliveredServerMessage
  | ErrorServerMessage
  | PongServerMessage;

export type MessageTextValidation =
  | { ok: true; text: string }
  | { ok: false; code: SyncErrorCode; message: string };

export type StructuredMessageValidation =
  | { ok: true; content: StructuredMessageContent }
  | { ok: false; code: "malformed_message"; message: string };

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

export function validateStructuredMessageContent(
  input: unknown,
): StructuredMessageValidation {
  if (!isRecord(input) || input.kind !== "surprise") {
    return malformedStructuredMessage("Structured message content is malformed");
  }

  if (input.version !== 1 || !Number.isInteger(input.version)) {
    return malformedStructuredMessage("Surprise message version is unsupported");
  }

  if (typeof input.theme !== "string" || !isSurpriseTheme(input.theme)) {
    return malformedStructuredMessage("Surprise message theme is unsupported");
  }

  if (typeof input.secret !== "string") {
    return malformedStructuredMessage("Surprise secret must be a string");
  }

  const secret = input.secret.trim();
  if (
    Array.from(secret).length < 1 ||
    Array.from(secret).length > SURPRISE_SECRET_MAX_LENGTH ||
    !SURPRISE_SECRET_PATTERN.test(secret)
  ) {
    return malformedStructuredMessage("Surprise secret is invalid");
  }

  if (input.note !== undefined && typeof input.note !== "string") {
    return malformedStructuredMessage("Surprise note must be a string");
  }

  const note = input.note?.trim();
  if (note !== undefined && Array.from(note).length > SURPRISE_NOTE_MAX_LENGTH) {
    return malformedStructuredMessage("Surprise note exceeds 120 characters");
  }

  return {
    ok: true,
    content: {
      kind: "surprise",
      version: 1,
      theme: input.theme,
      secret,
      ...(note ? { note } : {}),
    },
  };
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
    case "peer.status":
      return readPeerStatus(input);
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

  const capabilities = readSupportedCapabilities(input.capabilities);
  if (capabilities === null) {
    return null;
  }

  return {
    type: "auth.ok",
    requestId: input.requestId,
    pairId: input.pairId,
    ...(capabilities === undefined ? {} : { capabilities }),
  };
}

function readPeerPresence(
  input: Record<string, unknown>,
  type: "peer.online" | "peer.offline",
): PeerOnlineServerMessage | PeerOfflineServerMessage | null {
  if (typeof input.pairId !== "string" || typeof input.peerDeviceId !== "string") {
    return null;
  }

  return {
    type,
    pairId: input.pairId,
    peerDeviceId: input.peerDeviceId,
    changedAt: typeof input.changedAt === "string" ? input.changedAt : undefined,
    lastSeenAt: typeof input.lastSeenAt === "string" ? input.lastSeenAt : undefined,
  };
}

function readPeerStatus(input: Record<string, unknown>): PeerStatusServerMessage | null {
  if (
    typeof input.pairId !== "string" ||
    typeof input.peerDeviceId !== "string" ||
    !isNullableActivityStatus(input.activityStatus) ||
    typeof input.changedAt !== "string"
  ) {
    return null;
  }

  return {
    type: "peer.status",
    pairId: input.pairId,
    peerDeviceId: input.peerDeviceId,
    activityStatus: input.activityStatus,
    changedAt: input.changedAt,
  };
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

  const message: MessageReceivedServerMessage = {
    type: "message.received",
    pairId: input.pairId,
    serverMessageId: input.serverMessageId,
    fromDeviceId: input.fromDeviceId,
    text: input.text,
    sentAt: input.sentAt,
  };

  if (input.content === undefined) {
    return message;
  }

  const content = validateStructuredMessageContent(input.content);
  return {
    ...message,
    content: content.ok ? content.content : undefined,
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

export function isSurpriseTheme(value: string): value is SurpriseTheme {
  return SURPRISE_THEMES.has(value);
}

export function readSupportedCapabilities(
  value: unknown,
): ActivityStatusCapability[] | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    return null;
  }

  return value.includes(ACTIVITY_STATUS_CAPABILITY)
    ? [ACTIVITY_STATUS_CAPABILITY]
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function malformedStructuredMessage(message: string): StructuredMessageValidation {
  return { ok: false, code: "malformed_message", message };
}
