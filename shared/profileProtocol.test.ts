import { describe, expect, it } from "vitest";
import { readDeviceProfile, validateProfileUpdate } from "./profileProtocol";

const validCity = {
  provider: "weatherapi",
  providerLocationId: 1785728,
  name: "杭州",
  region: "浙江",
  country: "中国",
  latitude: 30.27,
  longitude: 120.15,
} as const;

describe("validateProfileUpdate", () => {
  it("accepts a vendored Chinese city with the existing weatherapi contract", () => {
    const localCity = {
      provider: "weatherapi",
      providerLocationId: 1815551,
      name: "长沙",
      region: "湖南",
      country: "中国",
      latitude: 28.19874,
      longitude: 112.97087,
    } as const;

    expect(
      validateProfileUpdate({ version: 1, nickname: "小满", city: localCity }),
    ).toEqual({
      ok: true,
      profile: { version: 1, nickname: "小满", city: localCity },
    });
  });

  it("continues to accept a city persisted from the previous local index", () => {
    const previouslyPersistedCity = {
      provider: "weatherapi",
      providerLocationId: 101250101,
      name: "长沙",
      region: "湖南",
      country: "中国",
      latitude: 28.19409,
      longitude: 112.982279,
    } as const;

    expect(
      validateProfileUpdate({
        version: 1,
        nickname: "小满",
        city: previouslyPersistedCity,
      }),
    ).toEqual({
      ok: true,
      profile: {
        version: 1,
        nickname: "小满",
        city: previouslyPersistedCity,
      },
    });
  });

  it("normalizes a complete profile update", () => {
    expect(
      validateProfileUpdate({
        version: 1,
        nickname: "  小满  ",
        city: validCity,
      }),
    ).toEqual({
      ok: true,
      profile: {
        version: 1,
        nickname: "小满",
        city: validCity,
      },
    });
  });

  it.each(["", "   ", "123456789012345678901"])(
    "rejects nickname %j",
    (nickname) => {
      expect(
        validateProfileUpdate({ version: 1, nickname, city: validCity }),
      ).toMatchObject({ ok: false });
    },
  );

  it("counts nickname limits by Unicode code point", () => {
    const emoji = "😀";
    expect(
      validateProfileUpdate({
        version: 1,
        nickname: emoji.repeat(20),
        city: validCity,
      }),
    ).toMatchObject({ ok: true });
    expect(
      validateProfileUpdate({
        version: 1,
        nickname: emoji.repeat(21),
        city: validCity,
      }),
    ).toMatchObject({ ok: false });
  });

  it.each([
    ["unknown version", { version: 2 }],
    ["unknown provider", { city: { ...validCity, provider: "other" } }],
    ["non-positive provider id", { city: { ...validCity, providerLocationId: 0 } }],
    ["fractional provider id", { city: { ...validCity, providerLocationId: 1.5 } }],
    ["overlong city name", { city: { ...validCity, name: "城".repeat(81) } }],
    ["overlong region", { city: { ...validCity, region: "省".repeat(81) } }],
    ["overlong country", { city: { ...validCity, country: "国".repeat(81) } }],
    ["latitude below range", { city: { ...validCity, latitude: -90.01 } }],
    ["latitude above range", { city: { ...validCity, latitude: 90.01 } }],
    ["longitude below range", { city: { ...validCity, longitude: -180.01 } }],
    ["longitude above range", { city: { ...validCity, longitude: 180.01 } }],
    ["non-finite coordinate", { city: { ...validCity, longitude: Number.NaN } }],
  ])("rejects %s", (_name, override) => {
    const input = {
      version: 1,
      nickname: "小满",
      city: validCity,
      ...override,
    };

    expect(validateProfileUpdate(input)).toMatchObject({ ok: false });
  });
});

describe("readDeviceProfile", () => {
  it("parses complete profiles and legacy profiles without a city", () => {
    expect(
      readDeviceProfile({
        version: 1,
        nickname: "  小满  ",
        city: validCity,
        updatedAt: "2026-08-18T08:00:00.000Z",
      }),
    ).toEqual({
      version: 1,
      nickname: "小满",
      city: validCity,
      updatedAt: "2026-08-18T08:00:00.000Z",
    });

    expect(
      readDeviceProfile({
        version: 1,
        nickname: "旧设备",
        city: null,
        updatedAt: "2026-08-18T08:00:00.000Z",
      }),
    ).toEqual({
      version: 1,
      nickname: "旧设备",
      city: null,
      updatedAt: "2026-08-18T08:00:00.000Z",
    });
  });

  it("rejects malformed profile versions, cities, and timestamps", () => {
    const profile = {
      version: 1,
      nickname: "小满",
      city: validCity,
      updatedAt: "2026-08-18T08:00:00.000Z",
    };

    expect(readDeviceProfile({ ...profile, version: 2 })).toBeNull();
    expect(
      readDeviceProfile({
        ...profile,
        city: { ...validCity, provider: "unknown" },
      }),
    ).toBeNull();
    expect(readDeviceProfile({ ...profile, updatedAt: 123 })).toBeNull();
  });

  it.each([
    "not-a-date",
    "2026-08-18T08:00:00Z",
    "2026-08-18 08:00:00.000Z",
    "2026-08-18T10:00:00.000+02:00",
  ])("rejects noncanonical timestamp %s", (updatedAt) => {
    expect(
      readDeviceProfile({
        version: 1,
        nickname: "小满",
        city: validCity,
        updatedAt,
      }),
    ).toBeNull();
  });
});
