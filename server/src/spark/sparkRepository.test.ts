import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { initializeRelayDatabase } from "../database.js";
import { SparkRepository } from "./sparkRepository.js";

let db: Database.Database;
let now: Date;
let repository: SparkRepository;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  initializeRelayDatabase(db);
  now = new Date("2026-08-14T02:00:00.000Z");
  repository = new SparkRepository(db, () => now);
});

describe("SparkRepository daily ledger", () => {
  it("starts a new pair at zero without materializing a summary", () => {
    seedPair("pair-a", "dev-a", "dev-b");

    expect(repository.getSnapshot("pair-a")).toMatchObject({
      streakDays: 0,
      tier: "unlit",
      calendarState: "pending_today",
      lastQualifiedDate: null,
    });
    expect(countRows("pair_spark_streaks")).toBe(0);
  });

  it("increments Friday to Monday once and persists across reconstruction", () => {
    seedPair("pair-a", "dev-a", "dev-b");
    seedSummary("pair-a", 10, "2026-08-14", "2026-08-14T02:00:00.000Z");
    now = new Date("2026-08-17T02:00:00.000Z");

    const first = repository.recordQualifiedInteraction("pair-a", "surprise");
    const duplicate = repository.recordQualifiedInteraction("pair-a", "message");
    const reconstructed = new SparkRepository(db, () => now);

    expect(first).toMatchObject({ changed: true, snapshot: { streakDays: 11 } });
    expect(duplicate).toMatchObject({ changed: false, snapshot: { streakDays: 11 } });
    expect(reconstructed.getSnapshot("pair-a").streakDays).toBe(11);
    expect(countRows("pair_spark_activity_days")).toBe(1);
    expect(
      db.prepare(
        "SELECT first_interaction_kind FROM pair_spark_activity_days WHERE pair_id = ?",
      ).get("pair-a"),
    ).toEqual({ first_interaction_kind: "surprise" });
  });

  it("ignores weekends without inserting or changing persisted state", () => {
    seedPair("pair-a", "dev-a", "dev-b");
    seedSummary("pair-a", 10, "2026-08-14", "2026-08-14T02:00:00.000Z");
    now = new Date("2026-08-15T02:00:00.000Z");

    expect(repository.recordQualifiedInteraction("pair-a", "message")).toMatchObject({
      changed: false,
      snapshot: {
        streakDays: 10,
        calendarState: "weekend_protected",
      },
    });
    expect(countRows("pair_spark_activity_days")).toBe(0);
    expect(readRawStreak("pair-a")).toBe(10);
  });

  it("projects zero after a missed weekday and restarts at one", () => {
    seedPair("pair-a", "dev-a", "dev-b");
    seedSummary("pair-a", 10, "2026-08-14", "2026-08-14T02:00:00.000Z");
    now = new Date("2026-08-18T02:00:00.000Z");

    expect(repository.getSnapshot("pair-a").streakDays).toBe(0);
    expect(repository.recordQualifiedInteraction("pair-a", "message")).toMatchObject({
      changed: true,
      snapshot: { streakDays: 1, calendarState: "qualified_today" },
    });
    expect(readRawStreak("pair-a")).toBe(1);
  });

  it("rejects disabled and unknown pairs without ledger rows", () => {
    seedPair("pair-disabled", "dev-a", "dev-b", "2026-08-14T03:00:00.000Z");

    expect(() =>
      repository.recordQualifiedInteraction("pair-disabled", "message"),
    ).toThrowError("Active pair not found");
    expect(() => repository.getSnapshot("pair-missing")).toThrowError(
      "Active pair not found",
    );
    expect(countRows("pair_spark_activity_days")).toBe(0);
  });
});

describe("SparkRepository leaderboard", () => {
  it("returns competition ranks, top 20, private self data, and no public IDs", () => {
    now = new Date("2026-08-19T02:00:00.000Z");
    for (let index = 1; index <= 22; index += 1) {
      const pairId = `pair-${String(index).padStart(2, "0")}`;
      const deviceA = `dev-${index}-a`;
      const deviceB = `dev-${index}-b`;
      seedPair(pairId, deviceA, deviceB);
      seedProfile(deviceA, index === 22 ? "小雨" : `林${index}`, `城市${index}`);
      seedProfile(deviceB, index === 22 ? "阿程" : `周${index}`, `对岸${index}`);
      const days = index <= 2 ? 100 : 102 - index;
      seedSummary(
        pairId,
        days,
        "2026-08-19",
        new Date(Date.UTC(2026, 7, 19, 12, 0, 23 - index)).toISOString(),
      );
    }
    seedPair("pair-disabled", "disabled-a", "disabled-b", "2026-08-19T03:00:00.000Z");
    seedSummary("pair-disabled", 999, "2026-08-19", "2026-08-19T03:00:00.000Z");

    const result = repository.getLeaderboard("pair-22", "dev-22-b");

    expect(result.top20).toHaveLength(20);
    expect(result.top20.slice(0, 3).map((entry) => entry.rank)).toEqual([1, 1, 3]);
    expect(result.top20.slice(0, 2).map((entry) => entry.displayNames)).toEqual([
      ["林*", "周*"],
      ["林*", "周*"],
    ]);
    expect(result.top20.some((entry) => entry.streakDays === 999)).toBe(false);
    expect(result.self).toMatchObject({
      rank: 22,
      displayNames: ["阿程", "小雨"],
      cities: ["对岸22", "城市22"],
      streakDays: 80,
    });
    const publicJson = JSON.stringify(result.top20);
    for (const privateKey of [
      "deviceId",
      "device_id",
      "pairId",
      "pair_id",
      "latitude",
      "longitude",
      "secret",
    ]) {
      expect(publicJson).not.toContain(privateKey);
    }
  });

  it("returns missing-city fallback and a null rank for zero-day self", () => {
    seedPair("pair-zero", "zero-a", "zero-b");
    seedDevice("zero-a", "雨");
    seedDevice("zero-b", "Alice");

    expect(repository.getLeaderboard("pair-zero", "zero-a").self).toEqual({
      rank: null,
      displayNames: ["雨", "Alice"],
      cities: ["城市待设置", "城市待设置"],
      streakDays: 0,
      tier: "unlit",
    });
  });
});

function seedPair(
  pairId: string,
  deviceA: string,
  deviceB: string,
  disabledAt: string | null = null,
): void {
  seedDevice(deviceA, deviceA);
  seedDevice(deviceB, deviceB);
  db.prepare(
    `INSERT INTO pairs (
      pair_id, device_a_id, device_b_id, pair_code, created_at, disabled_at
    ) VALUES (?, ?, ?, NULL, ?, ?)`,
  ).run(pairId, deviceA, deviceB, "2026-08-01T00:00:00.000Z", disabledAt);
}

function seedDevice(deviceId: string, displayName: string): void {
  db.prepare(
    `INSERT INTO devices (
      device_id, device_secret_hash, display_name, created_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(device_id) DO UPDATE SET display_name = excluded.display_name`,
  ).run(deviceId, "hash", displayName, "2026-08-01T00:00:00.000Z", null);
}

function seedProfile(deviceId: string, nickname: string, city: string): void {
  db.prepare("UPDATE devices SET display_name = ? WHERE device_id = ?").run(
    nickname,
    deviceId,
  );
  db.prepare(
    `INSERT INTO device_locations (
      device_id, provider, provider_location_id, city_name, region_name,
      country_name, latitude, longitude, updated_at
    ) VALUES (?, 'weatherapi', 1, ?, '', '中国', 0, 0, ?)`,
  ).run(deviceId, city, "2026-08-19T01:00:00.000Z");
}

function seedSummary(
  pairId: string,
  days: number,
  date: string,
  qualifiedAt: string,
): void {
  db.prepare(
    `INSERT INTO pair_spark_streaks (
      pair_id, streak_days, last_qualified_date, last_qualified_at, updated_at
    ) VALUES (?, ?, ?, ?, ?)`,
  ).run(pairId, days, date, qualifiedAt, qualifiedAt);
}

function countRows(table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number })
    .count;
}

function readRawStreak(pairId: string): number | null {
  const row = db
    .prepare("SELECT streak_days FROM pair_spark_streaks WHERE pair_id = ?")
    .get(pairId) as { streak_days: number } | undefined;
  return row?.streak_days ?? null;
}
