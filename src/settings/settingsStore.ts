import { defaultSettings } from "./defaultSettings";
import type { MovementRange, PetSettings } from "./settingsTypes";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
