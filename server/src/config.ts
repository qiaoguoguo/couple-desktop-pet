import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export interface RelayConfig {
  host: string;
  port: number;
  databasePath: string;
}

export function readRelayConfig(env: NodeJS.ProcessEnv = process.env): RelayConfig {
  const databasePath = env.RELAY_DATABASE_PATH ?? join(process.cwd(), ".data", "relay.sqlite");
  mkdirSync(dirname(databasePath), { recursive: true });

  return {
    host: env.RELAY_HOST ?? "127.0.0.1",
    port: readPort(env.RELAY_PORT),
    databasePath,
  };
}

function readPort(value: string | undefined): number {
  if (!value) {
    return 8787;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : 8787;
}
