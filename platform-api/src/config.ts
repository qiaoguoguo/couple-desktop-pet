import { resolve } from "node:path";

export interface PlatformConfig {
  host: string;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  releaseStoragePath: string;
  publicBaseUrl: string;
  apiBaseUrl: string;
}

export function readPlatformConfig(
  env: NodeJS.ProcessEnv = process.env,
): PlatformConfig {
  const isProduction = env.NODE_ENV === "production";
  const jwtSecret = env.PLATFORM_JWT_SECRET;

  if (isProduction && !jwtSecret) {
    throw new Error("PLATFORM_JWT_SECRET is required in production");
  }

  return {
    host: env.PLATFORM_API_HOST ?? "127.0.0.1",
    port: readPort(env.PLATFORM_API_PORT),
    databaseUrl:
      env.PLATFORM_DATABASE_URL ??
      "postgres://couple_pet:couple_pet@127.0.0.1:5432/couple_pet_platform",
    jwtSecret: jwtSecret ?? "dev-insecure-platform-secret",
    releaseStoragePath: resolve(
      env.PLATFORM_RELEASE_STORAGE_PATH ?? "storage/releases",
    ),
    publicBaseUrl: env.PLATFORM_PUBLIC_BASE_URL ?? "http://127.0.0.1:19080",
    apiBaseUrl: env.PLATFORM_API_BASE_URL ?? "http://127.0.0.1:19081",
  };
}

function readPort(value: string | undefined): number {
  if (!value) {
    return 3000;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("PLATFORM_API_PORT must be a valid TCP port");
  }

  return port;
}
