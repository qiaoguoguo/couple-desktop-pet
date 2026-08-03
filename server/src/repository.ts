import type Database from "better-sqlite3";
import {
  PAIR_CODE_TTL_MS,
  type PairCodeStatusResponse,
  type UnpairResponse,
} from "../../shared/syncProtocol.js";
import { RelayError } from "./errors.js";
import { createPairCode, createPairId, hashDeviceSecret } from "./ids.js";

export interface EnsureDeviceInput {
  deviceId: string;
  deviceSecret: string;
  displayName: string;
}

export interface CreatePairCodeInput extends EnsureDeviceInput {}

export interface CreatePairCodeResult {
  code: string;
  expiresAt: string;
}

export interface AcceptPairCodeInput extends EnsureDeviceInput {
  code: string;
}

export interface AcceptPairCodeResult {
  pairId: string;
  peerDeviceId: string;
}

export interface PairCodeStatusInput {
  deviceId: string;
  deviceSecret: string;
  code: string;
}

export interface UnpairInput {
  deviceId: string;
  deviceSecret: string;
  pairId: string;
}

export interface AuthenticateInput {
  deviceId: string;
  deviceSecret: string;
  pairId: string;
}

export interface AuthenticatedPair {
  pairId: string;
  deviceId: string;
  peerDeviceId: string;
}

interface DeviceRow {
  device_id: string;
  device_secret_hash: string;
}

interface PairCodeRow {
  code: string;
  creator_device_id: string;
  expires_at: string;
  consumed_at: string | null;
}

interface PairRow {
  pair_id: string;
  device_a_id: string;
  device_b_id: string;
  pair_code: string | null;
}

export class RelayRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly getNow: () => Date = () => new Date(),
  ) {}

  ensureDevice(input: EnsureDeviceInput): void {
    const now = this.nowIso();
    const secretHash = hashDeviceSecret(input.deviceSecret);
    const existing = this.db
      .prepare("SELECT device_id, device_secret_hash FROM devices WHERE device_id = ?")
      .get(input.deviceId) as DeviceRow | undefined;

    if (existing) {
      if (existing.device_secret_hash !== secretHash) {
        throw new RelayError("auth_failed", 401, "Device authentication failed");
      }

      this.db
        .prepare("UPDATE devices SET display_name = ?, last_seen_at = ? WHERE device_id = ?")
        .run(input.displayName, now, input.deviceId);
      return;
    }

    this.db
      .prepare(
        "INSERT INTO devices (device_id, device_secret_hash, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(input.deviceId, secretHash, input.displayName, now, now);
  }

  createPairCode(input: CreatePairCodeInput): CreatePairCodeResult {
    return this.db.transaction(() => {
      this.ensureDevice(input);

      if (this.isDevicePaired(input.deviceId)) {
        throw new RelayError("device_already_paired", 409, "Device is already paired");
      }

      const now = this.nowIso();
      this.db
        .prepare(
          "UPDATE pair_codes SET consumed_at = ? WHERE creator_device_id = ? AND consumed_at IS NULL AND expires_at > ?",
        )
        .run(now, input.deviceId, now);

      const expiresAt = new Date(this.getNow().getTime() + PAIR_CODE_TTL_MS).toISOString();
      const code = this.insertUniquePairCode(input.deviceId, now, expiresAt);

      return { code, expiresAt };
    })();
  }

  acceptPairCode(input: AcceptPairCodeInput): AcceptPairCodeResult {
    return this.db.transaction(() => {
      this.ensureDevice(input);

      const row = this.db
        .prepare(
          "SELECT code, creator_device_id, expires_at, consumed_at FROM pair_codes WHERE code = ?",
        )
        .get(input.code) as PairCodeRow | undefined;
      const now = this.nowIso();

      if (!row) {
        throw new RelayError("invalid_code", 404, "Pair code is invalid");
      }

      if (row.consumed_at) {
        throw new RelayError("code_consumed", 409, "Pair code has already been used");
      }

      if (row.expires_at <= now) {
        throw new RelayError("code_expired", 410, "Pair code has expired");
      }

      if (row.creator_device_id === input.deviceId) {
        throw new RelayError(
          "self_pair_not_allowed",
          409,
          "Cannot pair a device with itself",
        );
      }

      if (this.isDevicePaired(row.creator_device_id)) {
        throw new RelayError("peer_already_paired", 409, "Peer is already paired");
      }

      if (this.isDevicePaired(input.deviceId)) {
        throw new RelayError("device_already_paired", 409, "Device is already paired");
      }

      const pairId = createPairId();
      this.db
        .prepare(
          "INSERT INTO pairs (pair_id, device_a_id, device_b_id, pair_code, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(pairId, row.creator_device_id, input.deviceId, input.code, now);
      this.db
        .prepare("UPDATE pair_codes SET consumed_at = ? WHERE code = ?")
        .run(now, input.code);

      return { pairId, peerDeviceId: row.creator_device_id };
    })();
  }

  getPairCodeStatus(input: PairCodeStatusInput): PairCodeStatusResponse {
    this.verifyDeviceCredentials(input.deviceId, input.deviceSecret);

    const row = this.db
      .prepare(
        "SELECT code, creator_device_id, expires_at, consumed_at FROM pair_codes WHERE code = ?",
      )
      .get(input.code) as PairCodeRow | undefined;

    if (!row) {
      throw new RelayError("invalid_code", 404, "Pair code is invalid");
    }

    if (row.creator_device_id !== input.deviceId) {
      throw new RelayError("auth_failed", 401, "Device is not the pair code creator");
    }

    const pair = this.findPairByCode(row.code);
    if (pair) {
      const peerDeviceId = getPeerFromPair(pair, input.deviceId);

      if (!peerDeviceId) {
        throw new RelayError("auth_failed", 401, "Device is not part of this pair");
      }

      return {
        status: "paired",
        pairId: pair.pair_id,
        peerDeviceId,
      };
    }

    if (row.consumed_at) {
      return { status: "consumed" };
    }

    if (row.expires_at <= this.nowIso()) {
      return { status: "expired" };
    }

    return {
      status: "pending",
      expiresAt: row.expires_at,
    };
  }

  authenticateDeviceForPair(input: AuthenticateInput): AuthenticatedPair {
    this.verifyDeviceCredentials(input.deviceId, input.deviceSecret);

    const row = this.findPair(input.pairId);
    if (!row) {
      throw new RelayError("pair_not_found", 404, "Pair not found");
    }

    const peerDeviceId = getPeerFromPair(row, input.deviceId);
    if (!peerDeviceId) {
      throw new RelayError("auth_failed", 401, "Device is not part of this pair");
    }

    return { pairId: input.pairId, deviceId: input.deviceId, peerDeviceId };
  }

  unpair(input: UnpairInput): UnpairResponse {
    return this.db.transaction(() => {
      this.verifyDeviceCredentials(input.deviceId, input.deviceSecret);

      const row = this.findPair(input.pairId);
      if (!row) {
        throw new RelayError("pair_not_found", 404, "Pair not found");
      }

      const peerDeviceId = getPeerFromPair(row, input.deviceId);
      if (!peerDeviceId) {
        throw new RelayError("auth_failed", 401, "Device is not part of this pair");
      }

      const unpairedAt = this.nowIso();
      const result = this.db
        .prepare("UPDATE pairs SET disabled_at = ? WHERE pair_id = ? AND disabled_at IS NULL")
        .run(unpairedAt, input.pairId);

      if (result.changes !== 1) {
        throw new RelayError("pair_not_found", 404, "Pair not found");
      }

      return { pairId: input.pairId, unpairedAt };
    })();
  }

  getPeerDeviceId(pairId: string, deviceId: string): string | null {
    const row = this.findPair(pairId);
    return row ? getPeerFromPair(row, deviceId) : null;
  }

  private insertUniquePairCode(deviceId: string, createdAt: string, expiresAt: string): string {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = createPairCode();
      const result = this.db
        .prepare(
          "INSERT OR IGNORE INTO pair_codes (code, creator_device_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
        )
        .run(code, deviceId, expiresAt, createdAt);

      if (result.changes === 1) {
        return code;
      }
    }

    throw new RelayError("relay_unavailable", 503, "Could not allocate pair code");
  }

  private isDevicePaired(deviceId: string): boolean {
    const row = this.db
      .prepare(
        "SELECT pair_id FROM pairs WHERE disabled_at IS NULL AND (device_a_id = ? OR device_b_id = ?) LIMIT 1",
      )
      .get(deviceId, deviceId);

    return Boolean(row);
  }

  private verifyDeviceCredentials(deviceId: string, deviceSecret: string): void {
    const secretHash = hashDeviceSecret(deviceSecret);
    const device = this.db
      .prepare("SELECT device_id, device_secret_hash FROM devices WHERE device_id = ?")
      .get(deviceId) as DeviceRow | undefined;

    if (!device || device.device_secret_hash !== secretHash) {
      throw new RelayError("auth_failed", 401, "Device authentication failed");
    }
  }

  private findPair(pairId: string): PairRow | undefined {
    return this.db
      .prepare(
        "SELECT pair_id, device_a_id, device_b_id, pair_code FROM pairs WHERE pair_id = ? AND disabled_at IS NULL",
      )
      .get(pairId) as PairRow | undefined;
  }

  private findPairByCode(code: string): PairRow | undefined {
    return this.db
      .prepare(
        "SELECT pair_id, device_a_id, device_b_id, pair_code FROM pairs WHERE pair_code = ? AND disabled_at IS NULL",
      )
      .get(code) as PairRow | undefined;
  }

  private nowIso(): string {
    return this.getNow().toISOString();
  }
}

function getPeerFromPair(row: PairRow, deviceId: string): string | null {
  if (row.device_a_id === deviceId) {
    return row.device_b_id;
  }

  if (row.device_b_id === deviceId) {
    return row.device_a_id;
  }

  return null;
}
