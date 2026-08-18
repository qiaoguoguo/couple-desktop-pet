import { BUILT_IN_PET_PACKAGE_ID } from "../assets/petPackageContract";
import { isNullableActivityStatus } from "../../shared/activityStatus";
import {
  readDeviceProfile,
  validateProfileUpdate,
  type DeviceProfileV1,
} from "../../shared/profileProtocol";
import { defaultSettings } from "./defaultSettings";
import type { MovementRange, PetSettings } from "./settingsTypes";

const LEGACY_BUILT_IN_PET_PACKAGE_ID = "builtin:star-sleeper";

export type {
  MovementRange,
  PetSettings,
  ProfileSettings,
} from "./settingsTypes";

export interface SettingsPersistenceApi {
  readSettings(): Promise<unknown>;
  writeSettings(settings: PetSettings): Promise<void>;
}

export function mergeSettings(input: Partial<PetSettings>): PetSettings {
  const settings = isRecord(input) ? input : {};

  return {
    scale: readScale(settings.scale),
    autoMoveEnabled: readBoolean(settings.autoMoveEnabled, defaultSettings.autoMoveEnabled),
    movementRange: readMovementRange(settings.movementRange),
    bubblesEnabled: readBoolean(settings.bubblesEnabled, defaultSettings.bubblesEnabled),
    alwaysOnTop: readBoolean(settings.alwaysOnTop, defaultSettings.alwaysOnTop),
    clickThrough: readBoolean(settings.clickThrough, defaultSettings.clickThrough),
    appearance: readAppearanceSettings(settings.appearance),
    profile: readProfileSettings(settings.profile),
    sync: readSyncSettings(settings.sync),
  };
}

export async function loadSettings(
  api: SettingsPersistenceApi,
): Promise<PetSettings> {
  try {
    const storedSettings = await api.readSettings();

    if (!isRecord(storedSettings)) {
      return mergeSettings({});
    }

    const settings = mergeSettings(storedSettings as Partial<PetSettings>);

    if (shouldPersistRelayMigration(storedSettings)) {
      await api.writeSettings(settings).catch(() => undefined);
    }

    return settings;
  } catch {
    return mergeSettings({});
  }
}

export async function saveSettings(
  api: SettingsPersistenceApi,
  settings: PetSettings,
): Promise<void> {
  await api.writeSettings(mergeSettings(settings));
}

function readScale(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultSettings.scale;
  }

  return Math.min(2, Math.max(0.5, value));
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readMovementRange(value: unknown): MovementRange {
  if (value === "active-screen" || value === "free") {
    return value;
  }

  return "bottom";
}

function readSyncSettings(value: unknown): PetSettings["sync"] {
  if (!isRecord(value)) {
    return { ...defaultSettings.sync };
  }

  const relayUrl = normalizeRelayUrlForSettings(value.relayUrl);

  return {
    enabled: true,
    relayUrl: relayUrl.value,
    deviceId: readNullableString(value.deviceId),
    deviceSecret: readNullableString(value.deviceSecret),
    pairId: relayUrl.migrated ? null : readNullableString(value.pairId),
    peerDeviceId: relayUrl.migrated
      ? null
      : readNullableString(value.peerDeviceId),
    activityStatus: isNullableActivityStatus(value.activityStatus)
      ? value.activityStatus
      : null,
  };
}

export function normalizeRelayUrl(value: unknown): string {
  return normalizeRelayUrlForSettings(value).value;
}

function normalizeRelayUrlForSettings(value: unknown): {
  value: string;
  migrated: boolean;
} {
  const relayUrl = readNonEmptyString(value, defaultSettings.sync.relayUrl);

  if (typeof value === "string" && value.trim() && isLegacyPrivateRelayUrl(relayUrl)) {
    return {
      value: defaultSettings.sync.relayUrl,
      migrated: relayUrl !== defaultSettings.sync.relayUrl,
    };
  }

  return { value: relayUrl, migrated: false };
}

function shouldPersistRelayMigration(settings: Record<string, unknown>): boolean {
  const sync = settings.sync;

  if (!isRecord(sync)) {
    return false;
  }

  return normalizeRelayUrlForSettings(sync.relayUrl).migrated;
}

function isLegacyPrivateRelayUrl(relayUrl: string): boolean {
  let url: URL;

  try {
    url = new URL(relayUrl);
  } catch {
    return false;
  }

  const hostname = url.hostname.toLowerCase();

  return (
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    isPrivateOrLocalIpv4(hostname)
  );
}

function isPrivateOrLocalIpv4(hostname: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return false;
  }

  const octets = hostname.split(".").map((octet) => Number(octet));

  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const [first, second] = octets;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function readAppearanceSettings(value: unknown): PetSettings["appearance"] {
  if (!isRecord(value)) {
    return {
      selectedPetPackageId: defaultSettings.appearance.selectedPetPackageId,
      peerPetPackageByDeviceId: {
        ...defaultSettings.appearance.peerPetPackageByDeviceId,
      },
    };
  }

  return {
    selectedPetPackageId: normalizePetPackageId(
      readNonEmptyString(
        value.selectedPetPackageId,
        defaultSettings.appearance.selectedPetPackageId,
      ),
    ),
    peerPetPackageByDeviceId: readPetPackageMapping(
      value.peerPetPackageByDeviceId,
    ),
  };
}

function readProfileSettings(value: unknown): PetSettings["profile"] {
  if (!isRecord(value)) {
    return {
      local: null,
      peerByDeviceId: {},
      syncState: defaultSettings.profile.syncState,
    };
  }

  const localProfile = validateProfileUpdate(value.local);

  return {
    local: localProfile.ok ? localProfile.profile : null,
    peerByDeviceId: readPeerProfiles(value.peerByDeviceId),
    syncState: readProfileSyncState(value.syncState),
  };
}

function readPeerProfiles(value: unknown): PetSettings["profile"]["peerByDeviceId"] {
  if (!isRecord(value)) {
    return {};
  }

  const profiles: Array<[string, DeviceProfileV1]> = [];

  for (const [deviceId, valueProfile] of Object.entries(value)) {
    if (!deviceId.trim()) {
      continue;
    }

    const profile = readDeviceProfile(valueProfile);
    if (profile !== null) {
      profiles.push([deviceId, profile]);
    }
  }

  return Object.fromEntries(profiles);
}

function readProfileSyncState(value: unknown): PetSettings["profile"]["syncState"] {
  if (value === "saving" || value === "error") {
    return "pending";
  }

  if (value === "synced" || value === "pending") {
    return value;
  }

  return "idle";
}

function readPetPackageMapping(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(readStringRecord(value)).map(([key, packageId]) => [
      key,
      normalizePetPackageId(packageId),
    ]),
  );
}

function normalizePetPackageId(packageId: string): string {
  return packageId === LEGACY_BUILT_IN_PET_PACKAGE_ID
    ? BUILT_IN_PET_PACKAGE_ID
    : packageId;
}

function readStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  const entries: Record<string, string> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (key.trim() && typeof entry === "string" && entry.trim()) {
      entries[key] = entry.trim();
    }
  }

  return entries;
}

function readNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
