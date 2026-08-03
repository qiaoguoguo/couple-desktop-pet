import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeRelayDatabase, openRelayDatabase } from "./database.js";
import { RelayError } from "./errors.js";
import { RelayRepository } from "./repository.js";

let tempDir = "";
let db: Database.Database;
let repository: RelayRepository;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "couple-pet-relay-"));
  db = openRelayDatabase(join(tempDir, "relay.sqlite"));
  initializeRelayDatabase(db);
  repository = new RelayRepository(db, () => new Date("2026-08-03T12:00:00.000Z"));
});

afterEach(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
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
});
