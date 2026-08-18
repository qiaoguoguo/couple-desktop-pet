import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRelayServer, type RelayServer } from "./server.js";

let tempDir = "";
let relay: RelayServer;
let baseUrl = "";

const cityA = {
  provider: "weatherapi",
  providerLocationId: 1785728,
  name: "杭州",
  region: "浙江",
  country: "中国",
  latitude: 30.27,
  longitude: 120.15,
} as const;

const profileA = {
  version: 1,
  nickname: "  小满  ",
  city: cityA,
} as const;

const profileB = {
  version: 1,
  nickname: "阿岚",
  city: {
    ...cityA,
    providerLocationId: 1795565,
    name: "上海",
    region: "上海",
    latitude: 31.23,
    longitude: 121.47,
  },
} as const;

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
      peerProfile: {
        version: 1,
        nickname: "星星桌宠",
        city: null,
        updatedAt: "2026-08-03T12:00:00.000Z",
      },
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
      peerProfile: {
        version: 1,
        nickname: "星星桌宠",
        city: null,
        updatedAt: "2026-08-03T12:00:00.000Z",
      },
    });
  });

  it("synchronizes normalized peer profiles while pairing", async () => {
    const codeResponse = await postJson(`${baseUrl}/pair-codes`, {
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      displayName: "legacy-a",
      profile: profileA,
    });
    const codeBody = await codeResponse.json();

    const acceptResponse = await postJson(`${baseUrl}/pairs/accept`, {
      deviceId: "dev_b",
      deviceSecret: "secret_b",
      displayName: "legacy-b",
      profile: profileB,
      code: codeBody.code,
    });

    expect(acceptResponse.status).toBe(200);
    const acceptBody = await acceptResponse.json();
    expect(acceptBody).toMatchObject({
      peerDeviceId: "dev_a",
      peerProfile: {
        nickname: "小满",
        city: cityA,
      },
    });

    const statusResponse = await postJson(`${baseUrl}/pair-codes/status`, {
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      code: codeBody.code,
    });
    await expect(statusResponse.json()).resolves.toMatchObject({
      status: "paired",
      peerDeviceId: "dev_b",
      peerProfile: {
        nickname: "阿岚",
        city: profileB.city,
      },
    });
  });

  it("rejects malformed optional profiles", async () => {
    const response = await postJson(`${baseUrl}/pair-codes`, {
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      displayName: "小满",
      profile: { ...profileA, version: 2 },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_request" },
    });
  });

  it("unpairs an active pair and lets the same creator bind again", async () => {
    const codeResponse = await postJson(`${baseUrl}/pair-codes`, {
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      displayName: "星星桌宠",
    });
    const codeBody = await codeResponse.json();
    const acceptResponse = await postJson(`${baseUrl}/pairs/accept`, {
      deviceId: "dev_b",
      deviceSecret: "secret_b",
      displayName: "星星桌宠",
      code: codeBody.code,
    });
    const acceptBody = await acceptResponse.json();

    const unpairResponse = await postJson(`${baseUrl}/pairs/unpair`, {
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId: acceptBody.pairId,
    });
    expect(unpairResponse.status).toBe(200);
    await expect(unpairResponse.json()).resolves.toMatchObject({
      pairId: acceptBody.pairId,
    });

    const nextCodeResponse = await postJson(`${baseUrl}/pair-codes`, {
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      displayName: "星星桌宠",
    });
    expect(nextCodeResponse.status).toBe(200);
    const nextCodeBody = await nextCodeResponse.json();
    expect(nextCodeBody.code).toMatch(/^\d{6}$/);
  });

  it("rejects unpair requests from non-pair members", async () => {
    const codeResponse = await postJson(`${baseUrl}/pair-codes`, {
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      displayName: "星星桌宠",
    });
    const codeBody = await codeResponse.json();
    const acceptResponse = await postJson(`${baseUrl}/pairs/accept`, {
      deviceId: "dev_b",
      deviceSecret: "secret_b",
      displayName: "星星桌宠",
      code: codeBody.code,
    });
    const acceptBody = await acceptResponse.json();
    await postJson(`${baseUrl}/pair-codes`, {
      deviceId: "dev_c",
      deviceSecret: "secret_c",
      displayName: "星星桌宠",
    });

    const unpairResponse = await postJson(`${baseUrl}/pairs/unpair`, {
      deviceId: "dev_c",
      deviceSecret: "secret_c",
      pairId: acceptBody.pairId,
    });

    expect(unpairResponse.status).toBe(401);
    await expect(unpairResponse.json()).resolves.toEqual({
      error: {
        code: "auth_failed",
        message: "Device is not part of this pair",
      },
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
