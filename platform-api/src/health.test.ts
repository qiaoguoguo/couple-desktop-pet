import { afterEach, describe, expect, it } from "vitest";
import { createPlatformServer } from "./server.js";

describe("platform health", () => {
  const servers: Array<{ close(): Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(servers.map((server) => server.close()));
    servers.length = 0;
  });

  it("returns ok from health endpoint", async () => {
    const server = await createPlatformServer({
      jwtSecret: "test-secret",
      repository: createNoopRepository(),
    });
    servers.push(server);

    const response = await server.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, service: "platform-api" });
  });
});

function createNoopRepository(): unknown {
  return {};
}
