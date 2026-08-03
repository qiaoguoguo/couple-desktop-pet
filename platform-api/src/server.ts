import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { createErrorPayload, PlatformApiError } from "./errors.js";

export interface PlatformServerOptions {
  jwtSecret: string;
  repository: unknown;
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

  server.decorate("platform", options);

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

  return server;
}
