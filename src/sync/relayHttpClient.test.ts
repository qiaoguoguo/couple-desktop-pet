import { describe, expect, it, vi } from "vitest";
import { RelayHttpClient } from "./relayHttpClient";

const city = {
  provider: "weatherapi" as const,
  providerLocationId: 2654428,
  name: "Hangzhou",
  region: "Zhejiang",
  country: "China",
  latitude: 30.29,
  longitude: 120.16,
};

const profileUpdate = {
  version: 1 as const,
  nickname: "小满",
  city,
};

const deviceProfile = {
  ...profileUpdate,
  updatedAt: "2026-08-18T08:00:00.000Z",
};

describe("RelayHttpClient", () => {
  it("gets strict spark snapshot and leaderboard contracts over exact POST paths", async () => {
    const snapshot = {
      version: 1 as const,
      pairId: "pair_1",
      streakDays: 28,
      tier: "heartflame" as const,
      calendarState: "qualified_today" as const,
      lastQualifiedDate: "2026-08-19",
      timezone: "Asia/Shanghai" as const,
      asOf: "2026-08-19T08:00:00.000Z",
      refreshAt: "2026-08-19T16:00:00.000Z",
    };
    const leaderboard = {
      version: 1 as const,
      snapshot,
      top20: [{
        rank: 1,
        displayNames: ["小*", "阿*"] as [string, string],
        cities: ["杭州", "上海"] as [string, string],
        streakDays: 28,
        tier: "heartflame" as const,
      }],
      self: {
        rank: 27,
        displayNames: ["小满", "阿岚"] as [string, string],
        cities: ["杭州", "上海"] as [string, string],
        streakDays: 28,
        tier: "heartflame" as const,
      },
      asOf: snapshot.asOf,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(snapshot), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...snapshot, tier: "stellar" }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(leaderboard), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...leaderboard, top20: [{
          ...leaderboard.top20[0],
          deviceId: "private",
        }] }), { status: 200 }),
      );
    const client = new RelayHttpClient("https://relay.example", fetchMock as typeof fetch);
    const request = {
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId: "pair_1",
    };

    await expect(client.getSparkSnapshot(request)).resolves.toEqual({
      ok: true,
      ...snapshot,
    });
    await expect(client.getSparkSnapshot(request)).resolves.toMatchObject({
      ok: false,
      code: "relay_unavailable",
    });
    await expect(client.getSparkLeaderboard(request)).resolves.toEqual({
      ok: true,
      ...leaderboard,
    });
    await expect(client.getSparkLeaderboard(request)).resolves.toMatchObject({
      ok: false,
      code: "relay_unavailable",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://relay.example/pairs/spark/snapshot",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://relay.example/pairs/spark/leaderboard",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("creates pair codes", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ code: "123456", expiresAt: "2026-08-03T12:10:00.000Z" }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const client = new RelayHttpClient("http://127.0.0.1:8787", fetchMock as typeof fetch);

    await expect(
      client.createPairCode({
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        displayName: "Q 版桌宠",
      }),
    ).resolves.toEqual({
      ok: true,
      code: "123456",
      expiresAt: "2026-08-03T12:10:00.000Z",
    });

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8787/pair-codes", expect.any(Object));
  });

  it("does not call injected fetch with the client instance as this", async () => {
    let observedThis: unknown = null;
    const fetchMock = vi.fn(function (this: unknown) {
      observedThis = this;
      return Promise.resolve(
        new Response(
          JSON.stringify({ code: "123456", expiresAt: "2026-08-03T12:10:00.000Z" }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    });
    const client = new RelayHttpClient("http://127.0.0.1:8787", fetchMock as typeof fetch);

    await client.createPairCode({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      displayName: "Q 版桌宠",
    });

    expect(observedThis).toBeUndefined();
    expect(observedThis).not.toBe(client);
  });

  it("maps relay errors", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: { code: "invalid_code", message: "Pair code is invalid" },
        }),
        {
          status: 404,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const client = new RelayHttpClient("http://127.0.0.1:8787", fetchMock as typeof fetch);

    await expect(
      client.acceptPairCode({
        deviceId: "dev_b",
        deviceSecret: "secret_b",
        displayName: "Q 版桌宠",
        code: "000000",
      }),
    ).resolves.toEqual({
      ok: false,
      code: "invalid_code",
      message: "Pair code is invalid",
    });
  });

  it("reads pair code status", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          status: "paired",
          pairId: "pair_1",
          peerDeviceId: "dev_b",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const client = new RelayHttpClient("http://127.0.0.1:8787", fetchMock as typeof fetch);

    await expect(
      client.getPairCodeStatus({
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        code: "123456",
      }),
    ).resolves.toEqual({
      ok: true,
      status: "paired",
      pairId: "pair_1",
      peerDeviceId: "dev_b",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/pair-codes/status",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("unpairs an active pair", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          pairId: "pair_1",
          unpairedAt: "2026-08-03T12:05:00.000Z",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const client = new RelayHttpClient("http://127.0.0.1:8787", fetchMock as typeof fetch);

    await expect(
      client.unpair({
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: "pair_1",
      }),
    ).resolves.toEqual({
      ok: true,
      pairId: "pair_1",
      unpairedAt: "2026-08-03T12:05:00.000Z",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/pairs/unpair",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects unknown relay error codes", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: { code: "not_a_code", message: "Bad relay error" },
        }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const client = new RelayHttpClient("http://127.0.0.1:8787", fetchMock as typeof fetch);

    await expect(
      client.createPairCode({
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        displayName: "Q 版桌宠",
      }),
    ).resolves.toEqual({
      ok: false,
      code: "relay_unavailable",
      message: "Relay unavailable",
    });
  });

  it("searches locations explicitly and parses normalized city contracts", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ locations: [city] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new RelayHttpClient(
      "http://127.0.0.1:8787",
      fetchMock as typeof fetch,
    );

    await expect(
      client.searchLocations({
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        query: "Hangzhou",
      }),
    ).resolves.toEqual({ ok: true, locations: [city] });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/locations/search",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uses PUT for profile saves and parses the saved profile", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ profile: deviceProfile }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new RelayHttpClient(
      "http://127.0.0.1:8787",
      fetchMock as typeof fetch,
    );

    await expect(
      client.saveProfile({
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        profile: profileUpdate,
      }),
    ).resolves.toEqual({ ok: true, profile: deviceProfile });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/devices/profile",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("gets pair weather and rejects malformed successful contracts", async () => {
    const weather = {
      version: 1 as const,
      condition: "clear" as const,
      conditionText: "Sunny",
      currentTemperatureC: 26,
      maxTemperatureC: 30,
      minTemperatureC: 20,
      rainChancePercent: 10,
      fetchedAt: "2026-08-18T08:01:00.000Z",
      source: "live" as const,
    };
    const pairWeather = {
      self: { status: "ready" as const, profile: deviceProfile, weather },
      peer: {
        status: "unavailable" as const,
        profile: { ...deviceProfile, nickname: "阿岚" },
        reason: "provider_unavailable" as const,
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(pairWeather), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...pairWeather, self: { status: "ready" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    const client = new RelayHttpClient(
      "http://127.0.0.1:8787",
      fetchMock as typeof fetch,
    );
    const request = {
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId: "pair_1",
    };

    await expect(client.getPairWeather(request)).resolves.toEqual({
      ok: true,
      ...pairWeather,
    });
    await expect(client.getPairWeather(request)).resolves.toEqual({
      ok: false,
      code: "relay_unavailable",
      message: "Relay unavailable",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:8787/pairs/weather",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects malformed successful profile and location responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ locations: [{ ...city, latitude: 100 }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ profile: { ...deviceProfile, version: 2 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    const client = new RelayHttpClient(
      "http://127.0.0.1:8787",
      fetchMock as typeof fetch,
    );

    await expect(
      client.searchLocations({
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        query: "Hangzhou",
      }),
    ).resolves.toMatchObject({ ok: false, code: "relay_unavailable" });
    await expect(
      client.saveProfile({
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        profile: profileUpdate,
      }),
    ).resolves.toMatchObject({ ok: false, code: "relay_unavailable" });
  });
});
