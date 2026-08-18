import { join, posix, win32 } from "node:path";

export type InteropPlatform = "windows" | "macos";

export interface E2eAppDataPaths {
  app_data_dir: string;
  settings_path: string;
}

export type NativeEvidenceSubject =
  | "weather-panel"
  | "basic-information-settings";

const dedicatedE2eIdentifier = "com.couple.desktoppet.e2e";

const sensitiveEnvNames = new Set([
  "GITHUB_TOKEN",
  "INTEROP_GITHUB_TOKEN",
  "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
]);

export function createIsolatedAppEnv({
  platform,
  root,
}: {
  platform: InteropPlatform;
  root: string;
}): Record<string, string> {
  if (platform === "windows") {
    return {
      APPDATA: join(root, "AppData", "Roaming"),
      LOCALAPPDATA: join(root, "AppData", "Local"),
      USERPROFILE: join(root, "UserProfile"),
    };
  }

  return {
    HOME: join(root, "home"),
  };
}

export function filterChildAppEnv(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      continue;
    }
    if (sensitiveEnvNames.has(key) || key.startsWith("APPLE_")) {
      filtered[key] = "";
      continue;
    }
    filtered[key] = value;
  }
  return filtered;
}

export function assertDedicatedE2eAppDataPaths(
  paths: E2eAppDataPaths,
  platform: NodeJS.Platform = process.platform,
): void {
  const path = platform === "win32" ? win32 : posix;
  const appDataDir = paths.app_data_dir;
  const settingsPath = paths.settings_path;
  const normalizedAppDataDir = path.resolve(appDataDir);
  const normalizedSettingsPath = path.resolve(settingsPath);
  const normalizeForComparison = (value: string) =>
    platform === "win32" ? value.toLowerCase() : value;

  const isDedicatedDirectory =
    path.isAbsolute(appDataDir) &&
    normalizeForComparison(path.basename(normalizedAppDataDir)) ===
      normalizeForComparison(dedicatedE2eIdentifier);
  const isDedicatedSettingsFile =
    path.isAbsolute(settingsPath) &&
    normalizeForComparison(path.dirname(normalizedSettingsPath)) ===
      normalizeForComparison(normalizedAppDataDir) &&
    normalizeForComparison(path.basename(normalizedSettingsPath)) ===
      "settings.json";

  if (!isDedicatedDirectory || !isDedicatedSettingsFile) {
    throw new Error(
      `refusing E2E settings write outside ${dedicatedE2eIdentifier}: ${appDataDir}`,
    );
  }
}

export function resolveNativeEvidenceStem(
  subject: NativeEvidenceSubject,
  platform: NodeJS.Platform,
  scaleFactor: number,
): string {
  const scalePercent = Math.round(scaleFactor * 100);
  if (
    !Number.isFinite(scaleFactor) ||
    scaleFactor <= 0 ||
    Math.abs(scaleFactor * 100 - scalePercent) > 0.01
  ) {
    throw new Error(`invalid native evidence scale: ${scaleFactor}`);
  }

  const platformName =
    platform === "win32"
      ? "windows"
      : platform === "darwin"
        ? "macos"
        : platform;
  return `${subject}-${platformName}-${scalePercent}`;
}
