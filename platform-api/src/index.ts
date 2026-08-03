import { readPlatformConfig } from "./config.js";
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

  const server = await createPlatformServer({
    jwtSecret: config.jwtSecret,
    repository: createPgPlatformRepository(pool),
  });

  await server.listen({ host: config.host, port: config.port });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "platform api failed");
  process.exitCode = 1;
});
