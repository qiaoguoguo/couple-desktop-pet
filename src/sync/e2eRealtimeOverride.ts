import { isNullableActivityStatus } from "../../shared/activityStatus";
import type { SyncRuntimeState } from "./syncTypes";

export const E2E_REALTIME_OVERRIDE_WINDOW_KEY =
  "__COUPLE_PET_E2E_REALTIME_OVERRIDE__";
export const E2E_REALTIME_OVERRIDE_EVENT =
  "couple-pet:e2e-realtime-override:wdio:default";

const connectionStatuses = new Set([
  "disabled",
  "connecting",
  "connected",
  "disconnected",
  "authFailed",
]);
const peerPresences = new Set(["unknown", "online", "offline"]);

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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}
