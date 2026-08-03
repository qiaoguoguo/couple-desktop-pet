import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRelayServer, type RelayServer } from "./server.js";

let tempDir = "";
let relay: RelayServer;
let baseUrl = "";

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "couple-pet-relay-http-"));
  relay = await createRelayServer({
    host: "127.0.0.1",
    port: 0,
    databasePath: join(tempDir, "relay.sqlite"),
    now: () => new Date("2026-08-03T12:00:00.000Z"),
  });
  baseUrl = `http://127.0.0.1:${relay.port}`;
});

afterEach(async () => {
  await relay.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("pairing HTTP API", () => {
  it("returns health", async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("creates and accepts a pair code", async () => {
    const codeResponse = await postJson(`${baseUrl}/pair-codes`, {
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      displayName: "星星桌宠",
    });

    expect(codeResponse.status).toBe(200);
    const codeBody = await codeResponse.json();
    expect(codeBody.code).toMatch(/^\d{6}$/);

    const acceptResponse = await postJson(`${baseUrl}/pairs/accept`, {
      deviceId: "dev_b",
      deviceSecret: "secret_b",
      displayName: "星星桌宠",
      code: codeBody.code,
    });

    expect(acceptResponse.status).toBe(200);
    const acceptBody = await acceptResponse.json();
    expect(acceptBody).toMatchObject({
      peerDeviceId: "dev_a",
    });

    const statusResponse = await postJson(`${baseUrl}/pair-codes/status`, {
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      code: codeBody.code,
    });

    expect(statusResponse.status).toBe(200);
    await expect(statusResponse.json()).resolves.toEqual({
      status: "paired",
      pairId: acceptBody.pairId,
      peerDeviceId: "dev_b",
    });
  });

  it("returns typed errors", async () => {
    const response = await postJson(`${baseUrl}/pairs/accept`, {
      deviceId: "dev_b",
      deviceSecret: "secret_b",
      displayName: "星星桌宠",
      code: "000000",
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "invalid_code",
        message: "Pair code is invalid",
      },
    });
  });
});

function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
