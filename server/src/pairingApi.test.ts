import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openRelayDatabase } from "./database.js";
import { WeatherProviderError, type ProviderWeather, type WeatherProvider } from "./weather/weatherProvider.js";
import { createRelayServer, type RelayServer } from "./server.js";

let tempDir = "";
let relay: RelayServer;
let baseUrl = "";
let now: Date;
let getCurrentDay: ReturnType<typeof vi.fn<WeatherProvider["getCurrentDay"]>>;
let searchLocations: ReturnType<typeof vi.fn<WeatherProvider["searchLocations"]>>;

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

const providerWeather: ProviderWeather = {
  condition: "partly-cloudy",
  conditionText: "局部多云",
  currentTemperatureC: 26,
  maxTemperatureC: 31.3,
  minTemperatureC: 20,
  rainChancePercent: 20,
};

const locationResults = Array.from({ length: 6 }, (_, index) => ({
  ...cityA,
  providerLocationId: cityA.providerLocationId + index,
  name: `杭州 ${index + 1}`,
  latitude: cityA.latitude + index * 0.01,
}));

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "couple-pet-relay-http-"));
  now = new Date("2026-08-03T12:00:00.000Z");
  getCurrentDay = vi
    .fn<WeatherProvider["getCurrentDay"]>()
    .mockResolvedValue(providerWeather);
  searchLocations = vi
    .fn<WeatherProvider["searchLocations"]>()
    .mockResolvedValue(locationResults);
  relay = await createRelayServer({
    host: "127.0.0.1",
    port: 0,
    databasePath: join(tempDir, "relay.sqlite"),
    now: () => now,
    weatherProvider: { getCurrentDay, searchLocations },
    weatherConfigured: true,
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
    await expect(response.json()).resolves.toEqual({
      ok: true,
      weatherConfigured: true,
    });
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

describe("profile and weather HTTP API", () => {
  it("saves a normalized profile and publishes one update after commit", async () => {
    const profileEvents: unknown[] = [];
    relay.profileEvents.subscribe(() => {
      throw new Error("listener failed");
    });
    relay.profileEvents.subscribe((event) => profileEvents.push(event));

    const response = await putJson(
      `${baseUrl}/devices/profile`,
      authWith(profileA),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      profile: {
        version: 1,
        nickname: "小满",
        city: cityA,
        updatedAt: "2026-08-03T12:00:00.000Z",
      },
    });
    expect(profileEvents).toEqual([
      {
        deviceId: "dev_a",
        profile: expect.objectContaining({ nickname: "小满", city: cityA }),
        changedAt: "2026-08-03T12:00:00.000Z",
      },
    ]);
  });

  it("authenticates profile saves before publishing or changing data", async () => {
    await putJson(`${baseUrl}/devices/profile`, authWith(profileA));
    const profileEvents: unknown[] = [];
    relay.profileEvents.subscribe((event) => profileEvents.push(event));

    const response = await putJson(`${baseUrl}/devices/profile`, {
      ...authWith(profileB),
      deviceSecret: "wrong_secret",
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "auth_failed" },
    });
    expect(profileEvents).toEqual([]);
  });

  it("limits profile saves to ten per device per hour", async () => {
    for (let index = 0; index < 10; index += 1) {
      expect((await putJson(`${baseUrl}/devices/profile`, authWith(profileA))).status).toBe(
        200,
      );
    }

    const limited = await putJson(`${baseUrl}/devices/profile`, authWith(profileA));
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({
      error: { code: "rate_limited", message: "Too many requests" },
    });
  });

  it("searches normalized cities, registers identity, and returns at most five", async () => {
    const response = await postJson(`${baseUrl}/locations/search`, {
      deviceId: "dev_search",
      deviceSecret: "secret_search",
      query: "  Hangzhou  ",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      locations: locationResults.slice(0, 5),
    });
    expect(searchLocations).toHaveBeenCalledWith("Hangzhou");

    const saveResponse = await putJson(`${baseUrl}/devices/profile`, {
      deviceId: "dev_search",
      deviceSecret: "secret_search",
      profile: profileA,
    });
    expect(saveResponse.status).toBe(200);
  });

  it("validates search length before contacting the provider", async () => {
    const tooShort = await postJson(`${baseUrl}/locations/search`, {
      deviceId: "dev_search",
      deviceSecret: "secret_search",
      query: "杭",
    });
    const tooLong = await postJson(`${baseUrl}/locations/search`, {
      deviceId: "dev_search",
      deviceSecret: "secret_search",
      query: "杭".repeat(81),
    });

    expect(tooShort.status).toBe(400);
    expect(tooLong.status).toBe(400);
    expect(searchLocations).not.toHaveBeenCalled();
  });

  it("authenticates search before provider access", async () => {
    await postJson(`${baseUrl}/locations/search`, {
      deviceId: "dev_search",
      deviceSecret: "secret_search",
      query: "Hangzhou",
    });
    searchLocations.mockClear();

    const response = await postJson(`${baseUrl}/locations/search`, {
      deviceId: "dev_search",
      deviceSecret: "wrong_secret",
      query: "Shanghai",
    });

    expect(response.status).toBe(401);
    expect(searchLocations).not.toHaveBeenCalled();
  });

  it("applies search limits to both device and source IP", async () => {
    for (let index = 0; index < 10; index += 1) {
      const response = await postJson(`${baseUrl}/locations/search`, {
        deviceId: "dev_search",
        deviceSecret: "secret_search",
        query: "Hangzhou",
      });
      expect(response.status).toBe(200);
    }

    expect(
      (
        await postJson(`${baseUrl}/locations/search`, {
          deviceId: "dev_search",
          deviceSecret: "secret_search",
          query: "Hangzhou",
        })
      ).status,
    ).toBe(429);
    expect(
      (
        await postJson(`${baseUrl}/locations/search`, {
          deviceId: "dev_other",
          deviceSecret: "secret_other",
          query: "Shanghai",
        })
      ).status,
    ).toBe(429);
  });

  it("rejects a source-limited search before creating its fresh identity", async () => {
    for (let index = 0; index < 10; index += 1) {
      const response = await postJson(`${baseUrl}/locations/search`, {
        deviceId: "dev_search",
        deviceSecret: "secret_search",
        query: "Hangzhou",
      });
      expect(response.status).toBe(200);
    }

    searchLocations.mockClear();
    const limited = await postJson(`${baseUrl}/locations/search`, {
      deviceId: "dev_rejected",
      deviceSecret: "secret_rejected",
      query: "Shanghai",
    });

    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({
      error: { code: "rate_limited", message: "Too many requests" },
    });
    expect(searchLocations).not.toHaveBeenCalled();

    const inspectionDb = openRelayDatabase(join(tempDir, "relay.sqlite"));
    const rejectedIdentity = inspectionDb
      .prepare("SELECT device_id FROM devices WHERE device_id = ?")
      .get("dev_rejected");
    inspectionDb.close();
    expect(rejectedIdentity).toBeUndefined();
  });

  it("returns both offline pair members using only repository coordinates", async () => {
    const pairId = await createProfilePair();
    const response = await postJson(`${baseUrl}/pairs/weather`, {
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId,
      latitude: 0,
      longitude: 0,
      city: { ...cityA, latitude: 0, longitude: 0 },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      self: { status: "ready", profile: { nickname: "小满" } },
      peer: { status: "ready", profile: { nickname: "阿岚" } },
    });
    expect(getCurrentDay).toHaveBeenCalledWith(cityA);
    expect(getCurrentDay).toHaveBeenCalledWith(profileB.city);
    expect(getCurrentDay).not.toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 0, longitude: 0 }),
    );
  });

  it("returns independent weather entries when one provider call fails", async () => {
    const pairId = await createProfilePair();
    getCurrentDay.mockImplementation((city) =>
      city.providerLocationId === profileB.city.providerLocationId
        ? Promise.reject(new WeatherProviderError("quota-exhausted"))
        : Promise.resolve(providerWeather),
    );

    const response = await postJson(`${baseUrl}/pairs/weather`, {
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      self: { status: "ready", profile: { nickname: "小满" } },
      peer: {
        status: "unavailable",
        profile: { nickname: "阿岚" },
        reason: "quota_exhausted",
      },
    });
  });

  it("reports an incomplete peer profile without blocking self weather", async () => {
    const pairId = await createProfilePair(false);

    const response = await postJson(`${baseUrl}/pairs/weather`, {
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      self: { status: "ready", profile: { nickname: "小满" } },
      peer: {
        status: "unavailable",
        profile: { nickname: "legacy-b", city: null },
        reason: "profile_incomplete",
      },
    });
    expect(getCurrentDay).toHaveBeenCalledTimes(1);
    expect(getCurrentDay).toHaveBeenCalledWith(cityA);
  });

  it("authenticates pair weather before profile or provider access", async () => {
    const pairId = await createProfilePair();
    getCurrentDay.mockClear();

    const response = await postJson(`${baseUrl}/pairs/weather`, {
      deviceId: "dev_a",
      deviceSecret: "wrong_secret",
      pairId,
    });

    expect(response.status).toBe(401);
    expect(getCurrentDay).not.toHaveBeenCalled();
  });

  it("limits pair-weather HTTP requests to thirty per device per minute", async () => {
    const pairId = await createProfilePair();
    for (let index = 0; index < 30; index += 1) {
      const response = await postJson(`${baseUrl}/pairs/weather`, {
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId,
      });
      expect(response.status).toBe(200);
    }

    const limited = await postJson(`${baseUrl}/pairs/weather`, {
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId,
    });
    expect(limited.status).toBe(429);
  });

  it("shares the thirty-per-minute pair-weather limit across one source IP", async () => {
    const firstPairId = await createProfilePair();
    const secondCodeResponse = await postJson(`${baseUrl}/pair-codes`, {
      deviceId: "dev_c",
      deviceSecret: "secret_c",
      displayName: "legacy-c",
      profile: profileA,
    });
    const secondCode = (await secondCodeResponse.json()) as { code: string };
    const secondPairResponse = await postJson(`${baseUrl}/pairs/accept`, {
      deviceId: "dev_d",
      deviceSecret: "secret_d",
      displayName: "legacy-d",
      profile: profileB,
      code: secondCode.code,
    });
    const secondPair = (await secondPairResponse.json()) as { pairId: string };

    for (let index = 0; index < 30; index += 1) {
      const response = await postJson(`${baseUrl}/pairs/weather`, {
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: firstPairId,
      });
      expect(response.status).toBe(200);
    }

    getCurrentDay.mockClear();
    const limited = await postJson(`${baseUrl}/pairs/weather`, {
      deviceId: "dev_c",
      deviceSecret: "secret_c",
      pairId: secondPair.pairId,
    });

    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({
      error: { code: "rate_limited", message: "Too many requests" },
    });
    expect(getCurrentDay).not.toHaveBeenCalled();
  });

  it("starts without a key and reports weather_not_configured", async () => {
    await relay.close();
    relay = await createRelayServer({
      host: "127.0.0.1",
      port: 0,
      databasePath: join(tempDir, "relay.sqlite"),
      now: () => now,
      weatherConfigured: false,
    });
    baseUrl = `http://127.0.0.1:${relay.port}`;

    await expect((await fetch(`${baseUrl}/health`)).json()).resolves.toEqual({
      ok: true,
      weatherConfigured: false,
    });

    const searchResponse = await postJson(`${baseUrl}/locations/search`, {
      deviceId: "dev_search",
      deviceSecret: "secret_search",
      query: "Hangzhou",
    });
    expect(searchResponse.status).toBe(503);
    await expect(searchResponse.json()).resolves.toEqual({
      error: {
        code: "weather_not_configured",
        message: "Weather service is not configured",
      },
    });

    const pairId = await createProfilePair();
    const weatherResponse = await postJson(`${baseUrl}/pairs/weather`, {
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId,
    });
    expect(weatherResponse.status).toBe(200);
    await expect(weatherResponse.json()).resolves.toMatchObject({
      self: { status: "unavailable", reason: "weather_not_configured" },
      peer: { status: "unavailable", reason: "weather_not_configured" },
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

function putJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function authWith(profile: typeof profileA | typeof profileB): Record<string, unknown> {
  return {
    deviceId: "dev_a",
    deviceSecret: "secret_a",
    profile,
  };
}

async function createProfilePair(peerHasProfile = true): Promise<string> {
  const codeResponse = await postJson(`${baseUrl}/pair-codes`, {
    deviceId: "dev_a",
    deviceSecret: "secret_a",
    displayName: "legacy-a",
    profile: profileA,
  });
  const codeBody = (await codeResponse.json()) as { code: string };
  const acceptResponse = await postJson(`${baseUrl}/pairs/accept`, {
    deviceId: "dev_b",
    deviceSecret: "secret_b",
    displayName: "legacy-b",
    ...(peerHasProfile ? { profile: profileB } : {}),
    code: codeBody.code,
  });
  const acceptBody = (await acceptResponse.json()) as { pairId: string };
  return acceptBody.pairId;
}
