import { join } from "node:path";

export type InteropPlatform = "windows" | "macos";

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
