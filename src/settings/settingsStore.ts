import { BUILT_IN_PET_PACKAGE_ID } from "../assets/petPackageContract";
import { defaultSettings } from "./defaultSettings";
import type { MovementRange, PetSettings } from "./settingsTypes";

const LEGACY_BUILT_IN_PET_PACKAGE_ID = "builtin:star-sleeper";

export type { MovementRange, PetSettings } from "./settingsTypes";

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

    return mergeSettings(storedSettings as Partial<PetSettings>);
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

  return {
    enabled: readBoolean(value.enabled, defaultSettings.sync.enabled),
    relayUrl: readNonEmptyString(value.relayUrl, defaultSettings.sync.relayUrl),
    deviceId: readNullableString(value.deviceId),
    deviceSecret: readNullableString(value.deviceSecret),
    pairId: readNullableString(value.pairId),
    peerDeviceId: readNullableString(value.peerDeviceId),
  };
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
