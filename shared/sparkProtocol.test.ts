import { describe, expect, it } from "vitest";
import {
  getSparkTier,
  readSparkLeaderboardResponse,
  readSparkStreakSnapshot,
} from "./sparkProtocol";

const snapshot = {
  version: 1,
  pairId: "pair-a",
  streakDays: 30,
  tier: "blaze",
  calendarState: "qualified_today",
  lastQualifiedDate: "2026-08-19",
  timezone: "Asia/Shanghai",
  asOf: "2026-08-19T02:00:00.000Z",
  refreshAt: "2026-08-19T16:00:00.000Z",
} as const;

const leaderboard = {
  version: 1,
  snapshot,
  top20: [
    {
      rank: 1,
      displayNames: ["林*", "周*"],
      cities: ["上海", "杭州"],
      streakDays: 128,
      tier: "stellar",
    },
  ],
  self: {
    rank: 27,
    displayNames: ["小雨", "阿程"],
    cities: ["长沙", "深圳"],
    streakDays: 28,
    tier: "heartflame",
  },
  asOf: "2026-08-19T02:00:00.000Z",
} as const;

describe("getSparkTier", () => {
  it.each([
    [0, "unlit"],
    [1, "glimmer"],
    [4, "glimmer"],
    [5, "warm"],
    [14, "warm"],
    [15, "heartflame"],
    [29, "heartflame"],
    [30, "blaze"],
    [59, "blaze"],
    [60, "everbright"],
    [99, "everbright"],
    [100, "stellar"],
  ] as const)("maps %i days to %s", (days, tier) => {
    expect(getSparkTier(days)).toBe(tier);
  });
});

describe("readSparkStreakSnapshot", () => {
  it("reconstructs a valid declared snapshot", () => {
    expect(readSparkStreakSnapshot({ ...snapshot, ignored: "future" })).toEqual(snapshot);
  });

  it.each([
    { name: "unsupported version", patch: { version: 2 } },
    { name: "empty pair", patch: { pairId: "" } },
    { name: "negative days", patch: { streakDays: -1 } },
    { name: "fractional days", patch: { streakDays: 1.5 } },
    { name: "tier mismatch", patch: { tier: "heartflame" } },
    { name: "calendar state", patch: { calendarState: "holiday" } },
    { name: "invalid qualified date", patch: { lastQualifiedDate: "2026-02-30" } },
    { name: "noncanonical asOf", patch: { asOf: "2026-08-19T02:00:00Z" } },
    { name: "invalid refreshAt", patch: { refreshAt: "tomorrow" } },
    { name: "timezone", patch: { timezone: "UTC" } },
  ])("rejects $name", ({ patch }) => {
    expect(readSparkStreakSnapshot({ ...snapshot, ...patch })).toBeNull();
  });
});

describe("readSparkLeaderboardResponse", () => {
  it("reconstructs only the declared leaderboard fields", () => {
    expect(
      readSparkLeaderboardResponse({
        ...leaderboard,
        ignored: true,
        top20: [{ ...leaderboard.top20[0], ignored: true }],
      }),
    ).toEqual(leaderboard);
  });

  it("accepts a zero-day unranked self row", () => {
    expect(
      readSparkLeaderboardResponse({
        ...leaderboard,
        self: {
          ...leaderboard.self,
          rank: null,
          streakDays: 0,
          tier: "unlit",
        },
      }),
    ).not.toBeNull();
  });

  it.each([
    { name: "unsupported version", value: { ...leaderboard, version: 2 } },
    {
      name: "invalid public rank",
      value: { ...leaderboard, top20: [{ ...leaderboard.top20[0], rank: 0 }] },
    },
    {
      name: "fractional public rank",
      value: { ...leaderboard, top20: [{ ...leaderboard.top20[0], rank: 1.5 }] },
    },
    {
      name: "zero-day public row",
      value: {
        ...leaderboard,
        top20: [{ ...leaderboard.top20[0], streakDays: 0, tier: "unlit" }],
      },
    },
    {
      name: "tier mismatch",
      value: { ...leaderboard, top20: [{ ...leaderboard.top20[0], tier: "warm" }] },
    },
    {
      name: "too many rows",
      value: { ...leaderboard, top20: Array.from({ length: 21 }, () => leaderboard.top20[0]) },
    },
    {
      name: "ranked zero-day self",
      value: {
        ...leaderboard,
        self: { ...leaderboard.self, rank: 1, streakDays: 0, tier: "unlit" },
      },
    },
    {
      name: "unranked positive self",
      value: { ...leaderboard, self: { ...leaderboard.self, rank: null } },
    },
    {
      name: "private device id",
      value: {
        ...leaderboard,
        top20: [{ ...leaderboard.top20[0], deviceId: "dev-a" }],
      },
    },
    {
      name: "private pair id",
      value: {
        ...leaderboard,
        top20: [{ ...leaderboard.top20[0], pairId: "pair-secret" }],
      },
    },
    {
      name: "coordinates",
      value: {
        ...leaderboard,
        top20: [{ ...leaderboard.top20[0], latitude: 30, longitude: 120 }],
      },
    },
    { name: "noncanonical response time", value: { ...leaderboard, asOf: "invalid" } },
  ])("rejects $name", ({ value }) => {
    expect(readSparkLeaderboardResponse(value)).toBeNull();
  });
});
