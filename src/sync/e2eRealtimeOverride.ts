import { isNullableActivityStatus } from "../../shared/activityStatus";
import {
  validateStructuredMessageContent,
  type StructuredMessageContent,
} from "../../shared/syncProtocol";
import {
  readPairWeatherResponse,
  type PairWeatherResponse,
} from "../../shared/weatherProtocol";
import {
  readSparkLeaderboardResponse,
  type SparkLeaderboardResponseV1,
} from "../../shared/sparkProtocol";
import type { SyncErrorCode } from "../../shared/syncProtocol";
import type { SyncRuntimeState } from "./syncTypes";

export const E2E_REALTIME_OVERRIDE_WINDOW_KEY =
  "__COUPLE_PET_E2E_REALTIME_OVERRIDE__";
export const E2E_REALTIME_OVERRIDE_EVENT =
  "couple-pet:e2e-realtime-override:wdio:default";
export const E2E_INCOMING_MESSAGE_EVENT =
  "couple-pet:e2e-incoming-message:wdio:default";
export const E2E_PAIR_WEATHER_OVERRIDE_WINDOW_KEY =
  "__COUPLE_PET_E2E_PAIR_WEATHER_OVERRIDE__";
export const E2E_PAIR_WEATHER_OVERRIDE_EVENT =
  "couple-pet:e2e-pair-weather-override:wdio:default";
export const E2E_SPARK_LEADERBOARD_OVERRIDE_WINDOW_KEY =
  "__COUPLE_PET_E2E_SPARK_LEADERBOARD_OVERRIDE__";
export const E2E_SPARK_LEADERBOARD_OVERRIDE_EVENT =
  "couple-pet:e2e-spark-leaderboard-override:wdio:default";

export type E2eSparkLeaderboardOverride =
  | { status: "loading" }
  | { status: "ready"; response: SparkLeaderboardResponseV1 }
  | {
      status: "failed";
      code: Extract<
        SyncErrorCode,
        "auth_failed" | "pair_not_found" | "rate_limited" | "relay_unavailable"
      >;
    };

export interface E2eIncomingMessage {
  id: string;
  fromDeviceId: string;
  text: string;
  at: string;
  content?: StructuredMessageContent;
}

const connectionStatuses = new Set([
  "disabled",
  "connecting",
  "connected",
  "disconnected",
  "authFailed",
]);
const peerPresences = new Set(["unknown", "online", "offline"]);
const sparkFixtureErrorCodes = new Set([
  "auth_failed",
  "pair_not_found",
  "rate_limited",
  "relay_unavailable",
]);

export function parseE2eRealtimeOverride(
  value: unknown,
): SyncRuntimeState | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  const {
    status,
    peerPresence,
    peerActivityStatus,
    peerPresenceChangedAt,
    peerLastSeenAt,
    lastError,
  } = value;

  if (
    typeof status !== "string" ||
    !connectionStatuses.has(status) ||
    typeof peerPresence !== "string" ||
    !peerPresences.has(peerPresence) ||
    !isNullableActivityStatus(peerActivityStatus) ||
    !isNullableString(peerPresenceChangedAt) ||
    !isNullableString(peerLastSeenAt) ||
    !isNullableString(lastError)
  ) {
    return null;
  }

  return {
    status,
    peerPresence,
    peerActivityStatus,
    peerPresenceChangedAt,
    peerLastSeenAt,
    lastError,
  } as SyncRuntimeState;
}

export function readE2eRealtimeOverride(): SyncRuntimeState | null {
  return parseE2eRealtimeOverride(
    globalThis.window?.[E2E_REALTIME_OVERRIDE_WINDOW_KEY as keyof Window],
  );
}

export function subscribeToE2eRealtimeOverride(
  onChange: (state: SyncRuntimeState | null) => void,
): () => void {
  const update = () => onChange(readE2eRealtimeOverride());

  update();
  window.addEventListener(E2E_REALTIME_OVERRIDE_EVENT, update);
  return () => window.removeEventListener(E2E_REALTIME_OVERRIDE_EVENT, update);
}

export function parseE2eIncomingMessage(value: unknown): E2eIncomingMessage | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  const { id, fromDeviceId, text, at, content } = value;
  if (
    !isNonEmptyString(id) ||
    !isNonEmptyString(fromDeviceId) ||
    !isNonEmptyString(text) ||
    !isNonEmptyString(at)
  ) {
    return null;
  }

  if (content === undefined) {
    return { id, fromDeviceId, text, at };
  }

  const validatedContent = validateStructuredMessageContent(content);
  if (!validatedContent.ok) {
    return null;
  }

  return {
    id,
    fromDeviceId,
    text,
    at,
    content: validatedContent.content,
  };
}

export function subscribeToE2eIncomingMessages(
  onMessage: (message: E2eIncomingMessage) => void,
): () => void {
  const listener = (event: Event) => {
    if (!(event instanceof CustomEvent)) {
      return;
    }

    const message = parseE2eIncomingMessage(event.detail);
    if (message) {
      onMessage(message);
    }
  };

  window.addEventListener(E2E_INCOMING_MESSAGE_EVENT, listener);
  return () => window.removeEventListener(E2E_INCOMING_MESSAGE_EVENT, listener);
}

export function parseE2ePairWeatherOverride(
  value: unknown,
): PairWeatherResponse | null {
  return readPairWeatherResponse(value);
}

export function readE2ePairWeatherOverride(): PairWeatherResponse | null {
  return parseE2ePairWeatherOverride(
    globalThis.window?.[
      E2E_PAIR_WEATHER_OVERRIDE_WINDOW_KEY as keyof Window
    ],
  );
}

export function subscribeToE2ePairWeatherOverride(
  onChange: (response: PairWeatherResponse | null) => void,
): () => void {
  const update = () => onChange(readE2ePairWeatherOverride());

  update();
  window.addEventListener(E2E_PAIR_WEATHER_OVERRIDE_EVENT, update);
  return () =>
    window.removeEventListener(E2E_PAIR_WEATHER_OVERRIDE_EVENT, update);
}

export function parseE2eSparkLeaderboardOverride(
  value: unknown,
): E2eSparkLeaderboardOverride | null {
  if (!isPlainRecord(value) || typeof value.status !== "string") {
    return null;
  }
  if (value.status === "loading") {
    return { status: "loading" };
  }
  if (value.status === "ready") {
    const response = readSparkLeaderboardResponse(value.response);
    return response === null ? null : { status: "ready", response };
  }
  if (
    value.status === "failed" &&
    typeof value.code === "string" &&
    sparkFixtureErrorCodes.has(value.code)
  ) {
    return {
      status: "failed",
      code: value.code as Extract<
        SyncErrorCode,
        "auth_failed" | "pair_not_found" | "rate_limited" | "relay_unavailable"
      >,
    };
  }
  return null;
}

export function readE2eSparkLeaderboardOverride(): E2eSparkLeaderboardOverride | null {
  return parseE2eSparkLeaderboardOverride(
    globalThis.window?.[
      E2E_SPARK_LEADERBOARD_OVERRIDE_WINDOW_KEY as keyof Window
    ],
  );
}

export function subscribeToE2eSparkLeaderboardOverride(
  onChange: (override: E2eSparkLeaderboardOverride | null) => void,
): () => void {
  const update = () => onChange(readE2eSparkLeaderboardOverride());
  window.addEventListener(E2E_SPARK_LEADERBOARD_OVERRIDE_EVENT, update);
  return () =>
    window.removeEventListener(E2E_SPARK_LEADERBOARD_OVERRIDE_EVENT, update);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
