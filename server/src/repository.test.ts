import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeRelayDatabase, openRelayDatabase } from "./database.js";
import { RelayError } from "./errors.js";
import { hashDeviceSecret } from "./ids.js";
import { RelayRepository } from "./repository.js";

let tempDir = "";
let db: Database.Database;
let repository: RelayRepository;
let now: Date;

const cityA = {
  provider: "weatherapi",
  providerLocationId: 1785728,
  name: "杭州",
  region: "浙江",
  country: "中国",
  latitude: 30.27,
  longitude: 120.15,
} as const;

const cityB = {
  ...cityA,
  providerLocationId: 1795565,
  name: "上海",
  region: "上海",
  latitude: 31.23,
  longitude: 121.47,
} as const;

const profileUpdateA = {
  version: 1,
  nickname: "  小满  ",
  city: cityA,
} as const;

const profileUpdateB = {
  version: 1,
  nickname: "阿岚",
  city: cityB,
} as const;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "couple-pet-relay-"));
  db = openRelayDatabase(join(tempDir, "relay.sqlite"));
  initializeRelayDatabase(db);
  now = new Date("2026-08-03T12:00:00.000Z");
  repository = new RelayRepository(db, () => now);
});

afterEach(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("Relay database migrations", () => {
  it("creates the spark schema idempotently with constraints and ranking index", () => {
    initializeRelayDatabase(db);

    const tables = db
      .prepare(
        "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name LIKE 'pair_spark_%' ORDER BY name",
      )
      .all() as Array<{ name: string; sql: string }>;
    expect(tables.map((table) => table.name)).toEqual([
      "pair_spark_activity_days",
      "pair_spark_streaks",
    ]);
    expect(tables.every((table) => table.sql.includes("CHECK"))).toBe(true);

    const activityColumns = db
      .prepare("PRAGMA table_info(pair_spark_activity_days)")
      .all() as Array<{ name: string; pk: number }>;
    expect(
      activityColumns
        .filter((column) => column.pk > 0)
        .sort((left, right) => left.pk - right.pk)
        .map((column) => column.name),
    ).toEqual(["pair_id", "activity_date"]);
    expect(
      db.prepare("PRAGMA foreign_key_list(pair_spark_activity_days)").all(),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ table: "pairs", from: "pair_id" })]),
    );
    expect(
      db.prepare("PRAGMA foreign_key_list(pair_spark_streaks)").all(),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ table: "pairs", from: "pair_id" })]),
    );
    expect(
      db.prepare("PRAGMA index_list(pair_spark_streaks)").all(),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "idx_pair_spark_active_ranking" }),
      ]),
    );
  });

  it("upgrades a pre-Task-3 schema without losing device or pair data", () => {
    db.close();
    db = openRelayDatabase(join(tempDir, "pre-task-3.sqlite"));
    db.exec(`
      CREATE TABLE devices (
        device_id TEXT PRIMARY KEY,
        device_secret_hash TEXT NOT NULL,
        display_name TEXT,
        created_at TEXT NOT NULL,
        last_seen_at TEXT
      );
      CREATE TABLE pair_codes (
        code TEXT PRIMARY KEY,
        creator_device_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (creator_device_id) REFERENCES devices(device_id)
      );
      CREATE TABLE pairs (
        pair_id TEXT PRIMARY KEY,
        device_a_id TEXT NOT NULL,
        device_b_id TEXT NOT NULL,
        pair_code TEXT,
        created_at TEXT NOT NULL,
        disabled_at TEXT,
        FOREIGN KEY (device_a_id) REFERENCES devices(device_id),
        FOREIGN KEY (device_b_id) REFERENCES devices(device_id)
      );
    `);
    const createdAt = "2026-08-03T11:59:00.000Z";
    db.prepare(
      "INSERT INTO devices (device_id, device_secret_hash, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
    ).run("dev_a", hashDeviceSecret("secret_a"), "小满", createdAt, createdAt);
    db.prepare(
      "INSERT INTO devices (device_id, device_secret_hash, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
    ).run("dev_b", hashDeviceSecret("secret_b"), "阿岚", createdAt, createdAt);
    db.prepare(
      "INSERT INTO pair_codes (code, creator_device_id, expires_at, consumed_at, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(
      "123456",
      "dev_a",
      "2026-08-03T12:10:00.000Z",
      "2026-08-03T12:00:00.000Z",
      createdAt,
    );
    db.prepare(
      "INSERT INTO pairs (pair_id, device_a_id, device_b_id, pair_code, created_at, disabled_at) VALUES (?, ?, ?, ?, ?, NULL)",
    ).run("pair_legacy", "dev_a", "dev_b", "123456", createdAt);

    initializeRelayDatabase(db);
    repository = new RelayRepository(db, () => now);

    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all();
    expect(names).toContainEqual({ name: "device_locations" });
    expect(names).toContainEqual({ name: "pair_spark_activity_days" });
    expect(names).toContainEqual({ name: "pair_spark_streaks" });
    expect(repository.getPeerDeviceId("pair_legacy", "dev_a")).toBe("dev_b");
    expect(
      repository.authenticateDeviceForPair({
        deviceId: "dev_b",
        deviceSecret: "secret_b",
        pairId: "pair_legacy",
      }),
    ).toEqual({
      deviceId: "dev_b",
      pairId: "pair_legacy",
      peerDeviceId: "dev_a",
    });
    expect(
      repository.getPairCodeStatus({
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        code: "123456",
      }),
    ).toMatchObject({
      status: "paired",
      pairId: "pair_legacy",
      peerDeviceId: "dev_b",
    });

    const saved = repository.saveProfile({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      profile: profileUpdateA,
    });
    expect(saved).toMatchObject({ nickname: "小满", city: cityA });
    expect(repository.getPeerDeviceId("pair_legacy", "dev_a")).toBe("dev_b");
  });
});

describe("RelayRepository profiles", () => {
  it("registers identity credentials without saving a nickname", () => {
    repository.ensureDeviceIdentity({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
    });

    expect(
      db.prepare("SELECT display_name FROM devices WHERE device_id = ?").get("dev_a"),
    ).toEqual({ display_name: null });
    expect(repository.getDeviceProfile("dev_a")).toBeNull();
  });

  it("saves and reads a normalized device profile", () => {
    repository.ensureDeviceIdentity({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
    });

    const saved = repository.saveProfile({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      profile: profileUpdateA,
    });

    expect(saved).toEqual({
      version: 1,
      nickname: "小满",
      city: cityA,
      updatedAt: "2026-08-03T12:00:00.000Z",
    });
    expect(repository.getDeviceProfile("dev_a")).toEqual(saved);
  });

  it("issues monotonic profile timestamps for same-millisecond saves", () => {
    const first = repository.saveProfile({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      profile: profileUpdateA,
    });
    const second = repository.saveProfile({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      profile: profileUpdateB,
    });

    expect(first.updatedAt).toBe("2026-08-03T12:00:00.000Z");
    expect(second.updatedAt).toBe("2026-08-03T12:00:00.001Z");
    expect(repository.getDeviceProfile("dev_a")).toEqual(second);
  });

  it("ignores a malformed stored timestamp when issuing the next profile revision", () => {
    repository.saveProfile({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      profile: profileUpdateA,
    });
    db.prepare("UPDATE device_locations SET updated_at = ? WHERE device_id = ?").run(
      "poisoned-timestamp",
      "dev_a",
    );

    const recovered = repository.saveProfile({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      profile: profileUpdateB,
    });

    expect(recovered.updatedAt).toBe("2026-08-03T12:00:00.000Z");
    expect(recovered.nickname).toBe("阿岚");
  });

  it("does not change a saved nickname when identity is ensured again", () => {
    repository.saveProfile({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      profile: profileUpdateA,
    });

    repository.ensureDeviceIdentity({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
    });

    expect(repository.getDeviceProfile("dev_a")?.nickname).toBe("小满");
  });

  it("authenticates profile updates without partially changing stored data", () => {
    const original = repository.saveProfile({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      profile: profileUpdateA,
    });

    expect(() =>
      repository.saveProfile({
        deviceId: "dev_a",
        deviceSecret: "wrong_secret",
        profile: profileUpdateB,
      }),
    ).toThrowError("Device authentication failed");
    expect(repository.getDeviceProfile("dev_a")).toEqual(original);
  });

  it("returns each peer profile after pairing", () => {
    const code = repository.createPairCode({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      displayName: "legacy-a",
      profile: profileUpdateA,
    });
    const accept = repository.acceptPairCode({
      deviceId: "dev_b",
      deviceSecret: "secret_b",
      displayName: "legacy-b",
      profile: profileUpdateB,
      code: code.code,
    });
    const status = repository.getPairCodeStatus({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      code: code.code,
    });

    expect(accept.peerProfile?.nickname).toBe("小满");
    expect(status.status).toBe("paired");
    if (status.status !== "paired") {
      throw new Error("Expected paired status");
    }
    expect(status.peerProfile?.nickname).toBe("阿岚");
    expect(
      repository.getPairProfiles({
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: accept.pairId,
      }),
    ).toEqual({
      selfProfile: expect.objectContaining({ nickname: "小满", city: cityA }),
      peerProfile: expect.objectContaining({ nickname: "阿岚", city: cityB }),
    });
    expect(
      repository.getPairProfiles({
        deviceId: "dev_b",
        deviceSecret: "secret_b",
        pairId: accept.pairId,
      }),
    ).toEqual({
      selfProfile: expect.objectContaining({ nickname: "阿岚", city: cityB }),
      peerProfile: expect.objectContaining({ nickname: "小满", city: cityA }),
    });
  });
});

describe("RelayRepository pair codes", () => {
  it("creates one active code per device and invalidates the previous code", () => {
    const first = repository.createPairCode({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      displayName: "星星桌宠",
    });
    const second = repository.createPairCode({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      displayName: "星星桌宠",
    });

    expect(first.code).toHaveLength(6);
    expect(second.code).toHaveLength(6);
    expect(second.code).not.toBe(first.code);
    expect(() =>
      repository.acceptPairCode({
        deviceId: "dev_b",
        deviceSecret: "secret_b",
        displayName: "星星桌宠",
        code: first.code,
      }),
    ).toThrowError(RelayError);
  });

  it("rejects self-pairing", () => {
    const code = repository.createPairCode({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      displayName: "星星桌宠",
    });

    expect(() =>
      repository.acceptPairCode({
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        displayName: "星星桌宠",
        code: code.code,
      }),
    ).toThrowError("Cannot pair a device with itself");
  });

  it("creates a pair and enforces one active pair per device", () => {
    const code = repository.createPairCode({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      displayName: "星星桌宠",
    });

    const pair = repository.acceptPairCode({
      deviceId: "dev_b",
      deviceSecret: "secret_b",
      displayName: "星星桌宠",
      code: code.code,
    });

    expect(pair.pairId).toMatch(/^pair_/);
    expect(pair.peerDeviceId).toBe("dev_a");
    expect(repository.getPeerDeviceId(pair.pairId, "dev_a")).toBe("dev_b");

    expect(() =>
      repository.createPairCode({
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        displayName: "星星桌宠",
      }),
    ).toThrowError("Device is already paired");
  });

  it("unpairs an active pair and lets the same device create another pair code", () => {
    const code = repository.createPairCode({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      displayName: "星星桌宠",
    });
    const pair = repository.acceptPairCode({
      deviceId: "dev_b",
      deviceSecret: "secret_b",
      displayName: "星星桌宠",
      code: code.code,
    });

    expect(
      repository.unpair({
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        pairId: pair.pairId,
      }),
    ).toMatchObject({ pairId: pair.pairId });
    expect(repository.getPeerDeviceId(pair.pairId, "dev_a")).toBeNull();

    const nextCode = repository.createPairCode({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      displayName: "星星桌宠",
    });
    expect(nextCode.code).toHaveLength(6);
  });

  it("rejects unpair from a valid device that is not a pair member", () => {
    const code = repository.createPairCode({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      displayName: "星星桌宠",
    });
    const pair = repository.acceptPairCode({
      deviceId: "dev_b",
      deviceSecret: "secret_b",
      displayName: "星星桌宠",
      code: code.code,
    });
    repository.ensureDevice({
      deviceId: "dev_c",
      deviceSecret: "secret_c",
      displayName: "星星桌宠",
    });

    expect(() =>
      repository.unpair({
        deviceId: "dev_c",
        deviceSecret: "secret_c",
        pairId: pair.pairId,
      }),
    ).toThrowError("Device is not part of this pair");
    expect(() =>
      repository.createPairCode({
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        displayName: "星星桌宠",
      }),
    ).toThrowError("Device is already paired");
  });

  it("lets the pair-code creator observe pending and paired status", () => {
    const code = repository.createPairCode({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      displayName: "星星桌宠",
    });

    expect(
      repository.getPairCodeStatus({
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        code: code.code,
      }),
    ).toEqual({
      status: "pending",
      expiresAt: code.expiresAt,
    });

    const pair = repository.acceptPairCode({
      deviceId: "dev_b",
      deviceSecret: "secret_b",
      displayName: "星星桌宠",
      code: code.code,
    });

    expect(
      repository.getPairCodeStatus({
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        code: code.code,
      }),
    ).toEqual({
      status: "paired",
      pairId: pair.pairId,
      peerDeviceId: "dev_b",
      peerProfile: {
        version: 1,
        nickname: "星星桌宠",
        city: null,
        updatedAt: "2026-08-03T12:00:00.000Z",
      },
    });
  });

  it("distinguishes superseded consumed codes from the code that created a pair", () => {
    const first = repository.createPairCode({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      displayName: "星星桌宠",
    });
    const second = repository.createPairCode({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      displayName: "星星桌宠",
    });
    const pair = repository.acceptPairCode({
      deviceId: "dev_b",
      deviceSecret: "secret_b",
      displayName: "星星桌宠",
      code: second.code,
    });

    expect(
      repository.getPairCodeStatus({
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        code: first.code,
      }),
    ).toEqual({ status: "consumed" });
    expect(
      repository.getPairCodeStatus({
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        code: second.code,
      }),
    ).toEqual({
      status: "paired",
      pairId: pair.pairId,
      peerDeviceId: "dev_b",
      peerProfile: {
        version: 1,
        nickname: "星星桌宠",
        city: null,
        updatedAt: "2026-08-03T12:00:00.000Z",
      },
    });
  });

  it("reports expired status for an unused expired pair code", () => {
    const code = repository.createPairCode({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      displayName: "星星桌宠",
    });

    now = new Date(code.expiresAt);

    expect(
      repository.getPairCodeStatus({
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        code: code.code,
      }),
    ).toEqual({ status: "expired" });
  });
});
