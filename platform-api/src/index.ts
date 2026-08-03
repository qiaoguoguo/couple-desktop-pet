import { readPlatformConfig } from "./config.js";
import { createPlatformServer } from "./server.js";

async function main() {
  const config = readPlatformConfig();
  const server = await createPlatformServer({
    jwtSecret: config.jwtSecret,
    repository: {},
  });

  await server.listen({ host: config.host, port: config.port });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "platform api failed");
  process.exitCode = 1;
});
