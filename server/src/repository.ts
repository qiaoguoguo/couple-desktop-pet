import type Database from "better-sqlite3";
import {
  PAIR_CODE_TTL_MS,
  type PairCodeStatusResponse,
  type UnpairResponse,
} from "../../shared/syncProtocol.js";
import {
  readDeviceProfile,
  validateProfileUpdate,
  type DeviceProfileV1,
  type ProfileUpdateV1,
} from "../../shared/profileProtocol.js";
import { RelayError } from "./errors.js";
import { createPairCode, createPairId, hashDeviceSecret } from "./ids.js";

export interface EnsureDeviceIdentityInput {
  deviceId: string;
  deviceSecret: string;
}

export interface EnsureDeviceInput extends EnsureDeviceIdentityInput {
  displayName: string;
}

export interface CreatePairCodeInput extends EnsureDeviceInput {
  profile?: ProfileUpdateV1;
}

export interface CreatePairCodeResult {
  code: string;
  expiresAt: string;
}

export interface AcceptPairCodeInput extends EnsureDeviceInput {
  code: string;
  profile?: ProfileUpdateV1;
}

export interface AcceptPairCodeResult {
  pairId: string;
  peerDeviceId: string;
  peerProfile?: DeviceProfileV1;
}

export interface SaveProfileInput extends EnsureDeviceIdentityInput {
  profile: ProfileUpdateV1;
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

interface DeviceProfileRow {
  display_name: string | null;
  created_at: string;
  last_seen_at: string | null;
  provider: string | null;
  provider_location_id: number | null;
  city_name: string | null;
  region_name: string | null;
  country_name: string | null;
  latitude: number | null;
  longitude: number | null;
  location_updated_at: string | null;
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

  ensureDeviceIdentity(input: EnsureDeviceIdentityInput): void {
    this.ensureDeviceIdentityAt(input, this.nowIso());
  }

  ensureDevice(input: EnsureDeviceInput): void {
    this.ensureDeviceAt(input, this.nowIso());
  }

  saveProfile(input: SaveProfileInput): DeviceProfileV1 {
    const profile = readProfileUpdateOrThrow(input.profile);

    return this.db.transaction(() => {
      const now = this.nowIso();
      this.ensureDeviceIdentityAt(input, now);
      return this.writeProfile(input.deviceId, profile, now);
    })();
  }

  getDeviceProfile(deviceId: string): DeviceProfileV1 | null {
    const row = this.db
      .prepare(
        `SELECT
          d.display_name,
          d.created_at,
          d.last_seen_at,
          l.provider,
          l.provider_location_id,
          l.city_name,
          l.region_name,
          l.country_name,
          l.latitude,
          l.longitude,
          l.updated_at AS location_updated_at
        FROM devices d
        LEFT JOIN device_locations l ON l.device_id = d.device_id
        WHERE d.device_id = ?`,
      )
      .get(deviceId) as DeviceProfileRow | undefined;

    if (!row || row.display_name === null) {
      return null;
    }

    const city =
      row.provider === null
        ? null
        : {
            provider: row.provider,
            providerLocationId: row.provider_location_id,
            name: row.city_name,
            region: row.region_name,
            country: row.country_name,
            latitude: row.latitude,
            longitude: row.longitude,
          };

    return readDeviceProfile({
      version: 1,
      nickname: row.display_name,
      city,
      updatedAt: row.location_updated_at ?? row.last_seen_at ?? row.created_at,
    });
  }

  getPairProfiles(input: AuthenticateInput): {
    selfProfile: DeviceProfileV1 | null;
    peerProfile: DeviceProfileV1 | null;
  } {
    const pair = this.authenticateDeviceForPair(input);
    return {
      selfProfile: this.getDeviceProfile(pair.deviceId),
      peerProfile: this.getDeviceProfile(pair.peerDeviceId),
    };
  }

  createPairCode(input: CreatePairCodeInput): CreatePairCodeResult {
    return this.db.transaction(() => {
      this.preparePairingDevice(input);

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
      this.preparePairingDevice(input);

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

      const peerProfile = this.getDeviceProfile(row.creator_device_id);
      return {
        pairId,
        peerDeviceId: row.creator_device_id,
        ...(peerProfile === null ? {} : { peerProfile }),
      };
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

      const peerProfile = this.getDeviceProfile(peerDeviceId);

      return {
        status: "paired",
        pairId: pair.pair_id,
        peerDeviceId,
        ...(peerProfile === null ? {} : { peerProfile }),
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

  private preparePairingDevice(input: CreatePairCodeInput | AcceptPairCodeInput): void {
    const now = this.nowIso();

    if (input.profile === undefined) {
      this.ensureDeviceAt(input, now);
      return;
    }

    const profile = readProfileUpdateOrThrow(input.profile);
    this.ensureDeviceIdentityAt(input, now);
    this.writeProfile(input.deviceId, profile, now);
  }

  private ensureDeviceAt(input: EnsureDeviceInput, now: string): void {
    this.ensureDeviceIdentityAt(input, now);
    this.db
      .prepare("UPDATE devices SET display_name = ?, last_seen_at = ? WHERE device_id = ?")
      .run(input.displayName, now, input.deviceId);
  }

  private ensureDeviceIdentityAt(
    input: EnsureDeviceIdentityInput,
    now: string,
  ): void {
    const secretHash = hashDeviceSecret(input.deviceSecret);
    const existing = this.db
      .prepare("SELECT device_id, device_secret_hash FROM devices WHERE device_id = ?")
      .get(input.deviceId) as DeviceRow | undefined;

    if (existing) {
      if (existing.device_secret_hash !== secretHash) {
        throw new RelayError("auth_failed", 401, "Device authentication failed");
      }

      this.db
        .prepare("UPDATE devices SET last_seen_at = ? WHERE device_id = ?")
        .run(now, input.deviceId);
      return;
    }

    this.db
      .prepare(
        "INSERT INTO devices (device_id, device_secret_hash, display_name, created_at, last_seen_at) VALUES (?, ?, NULL, ?, ?)",
      )
      .run(input.deviceId, secretHash, now, now);
  }

  private writeProfile(
    deviceId: string,
    profile: ProfileUpdateV1,
    updatedAt: string,
  ): DeviceProfileV1 {
    this.db
      .prepare("UPDATE devices SET display_name = ?, last_seen_at = ? WHERE device_id = ?")
      .run(profile.nickname, updatedAt, deviceId);
    this.db
      .prepare(
        `INSERT INTO device_locations (
          device_id,
          provider,
          provider_location_id,
          city_name,
          region_name,
          country_name,
          latitude,
          longitude,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET
          provider = excluded.provider,
          provider_location_id = excluded.provider_location_id,
          city_name = excluded.city_name,
          region_name = excluded.region_name,
          country_name = excluded.country_name,
          latitude = excluded.latitude,
          longitude = excluded.longitude,
          updated_at = excluded.updated_at`,
      )
      .run(
        deviceId,
        profile.city.provider,
        profile.city.providerLocationId,
        profile.city.name,
        profile.city.region,
        profile.city.country,
        profile.city.latitude,
        profile.city.longitude,
        updatedAt,
      );

    const saved = this.getDeviceProfile(deviceId);
    if (saved === null) {
      throw new RelayError("relay_unavailable", 503, "Could not read saved profile");
    }

    return saved;
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

function readProfileUpdateOrThrow(input: unknown): ProfileUpdateV1 {
  const profile = validateProfileUpdate(input);
  if (!profile.ok) {
    throw new RelayError("invalid_request", 400, profile.message);
  }

  return profile.profile;
}
