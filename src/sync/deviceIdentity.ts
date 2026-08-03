import type { SyncSettings } from "../settings/settingsTypes";

export function ensureDeviceIdentity(sync: SyncSettings): SyncSettings {
  if (sync.deviceId && sync.deviceSecret) {
    return sync;
  }

  return {
    ...sync,
    deviceId: sync.deviceId ?? createId("dev"),
    deviceSecret: sync.deviceSecret ?? createId("sec"),
  };
}

function createId(prefix: string): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
