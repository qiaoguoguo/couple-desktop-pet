import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { createErrorPayload, PlatformApiError } from "./errors.js";
import type { PlatformRepository } from "./repository.js";
import { registerAdminRoutes } from "./routes/adminRoutes.js";
import { registerAuthRoutes } from "./routes/authRoutes.js";
import { registerDeviceRoutes } from "./routes/deviceRoutes.js";
import { registerReleaseRoutes } from "./routes/releaseRoutes.js";

export interface PlatformServerOptions {
  jwtSecret: string;
  repository: PlatformRepository;
}

export async function createPlatformServer(
  options: PlatformServerOptions,
): Promise<FastifyInstance> {
  const server = Fastify({
    logger: false,
  });

  await server.register(cors, {
    origin: true,
    credentials: true,
  });

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof PlatformApiError) {
      void reply.status(error.statusCode).send(createErrorPayload(error));
      return;
    }

    void reply.status(500).send(
      createErrorPayload(
        new PlatformApiError(500, "internal_error", "服务暂时不可用"),
      ),
    );
  });

  server.get("/health", async () => ({
    ok: true,
    service: "platform-api",
  }));

  await registerAuthRoutes(server, options);
  await registerDeviceRoutes(server, options);
  await registerReleaseRoutes(server, options);
  await registerAdminRoutes(server, options);

  return server;
}
