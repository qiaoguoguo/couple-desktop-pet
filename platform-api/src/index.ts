import { readPlatformConfig } from "./config.js";
import { bootstrapPlatform } from "./bootstrap.js";
import {
  createPlatformPool,
  initializePlatformDatabase,
} from "./db/database.js";
import { createPgPlatformRepository } from "./repository.js";
import { createPlatformServer } from "./server.js";

async function main() {
  const config = readPlatformConfig();
  const pool = createPlatformPool(config.databaseUrl);
  await initializePlatformDatabase(pool);
  const repository = createPgPlatformRepository(pool);
  await bootstrapPlatform({
    repository,
    config,
  });

  const server = await createPlatformServer({
    jwtSecret: config.jwtSecret,
    repository,
    releaseStoragePath: config.releaseStoragePath,
    corsOrigins: config.corsOrigins,
  });

  await server.listen({ host: config.host, port: config.port });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "platform api failed");
  process.exitCode = 1;
});
