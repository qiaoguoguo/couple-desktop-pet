import { nanoid } from "nanoid";
import type { Pool, PoolClient } from "pg";
import type {
  PlatformDevicePlatform,
  PlatformReleaseChannel,
  PlatformRole,
} from "../../shared/platformProtocol.js";

export type UserStatus = "active" | "disabled";
export type InvitationStatus = "unused" | "used" | "disabled";

export interface PlatformUser {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: PlatformRole;
  status: UserStatus;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export interface PlatformInvitation {
  id: string;
  code: string;
  status: InvitationStatus;
  maxUses: number;
  usedCount: number;
  createdBy: string | null;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface PlatformDevice {
  id: string;
  userId: string;
  deviceName: string;
  platform: PlatformDevicePlatform;
  clientVersion: string;
  devicePublicId: string;
  deviceSecretHash: string;
  lastSeenAt: Date | null;
  createdAt: Date;
}

export interface PlatformRelease {
  id: string;
  version: string;
  platform: PlatformDevicePlatform;
  channel: PlatformReleaseChannel;
  fileName: string;
  filePath: string;
  fileSize: number;
  sha256: string;
  releaseNotes: string;
  createdAt: Date;
  publishedAt: Date | null;
}

export interface PlatformDownloadEvent {
  id: string;
  userId: string;
  releaseId: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
  role: PlatformRole;
  status?: UserStatus;
}

export interface CreateInvitationInput {
  code: string;
  maxUses: number;
  createdBy: string | null;
  expiresAt: Date | null;
}

export interface RegisterUserWithInvitationInput {
  invitationCode: string;
  email: string;
  passwordHash: string;
  displayName: string;
}

export interface CreateDeviceInput {
  userId: string;
  deviceName: string;
  platform: PlatformDevicePlatform;
  clientVersion: string;
  deviceSecretHash: string;
}

export interface CreateReleaseInput {
  version: string;
  platform: PlatformDevicePlatform;
  channel: PlatformReleaseChannel;
  fileName: string;
  filePath: string;
  fileSize: number;
  sha256: string;
  releaseNotes: string;
  publishedAt: Date | null;
}

export interface RecordDownloadEventInput {
  userId: string;
  releaseId: string;
  ip: string | null;
  userAgent: string | null;
}

export interface PlatformRepository {
  createUser(input: CreateUserInput): Promise<PlatformUser>;
  findUserByEmail(email: string): Promise<PlatformUser | null>;
  findUserById(userId: string): Promise<PlatformUser | null>;
  markUserLoggedIn(userId: string): Promise<PlatformUser>;
  countAdmins(): Promise<number>;
  createInvitation(input: CreateInvitationInput): Promise<PlatformInvitation>;
  findInvitationByCode(code: string): Promise<PlatformInvitation | null>;
  registerUserWithInvitation(
    input: RegisterUserWithInvitationInput,
  ): Promise<PlatformUser>;
  createDevice(input: CreateDeviceInput): Promise<PlatformDevice>;
  listDevicesForUser(userId: string): Promise<PlatformDevice[]>;
  createRelease(input: CreateReleaseInput): Promise<PlatformRelease>;
  findReleaseById(releaseId: string): Promise<PlatformRelease | null>;
  findReleaseByVersionPlatform(
    version: string,
    platform: PlatformDevicePlatform,
  ): Promise<PlatformRelease | null>;
  listPublishedReleases(
    platform: PlatformDevicePlatform,
  ): Promise<PlatformRelease[]>;
  recordDownloadEvent(
    input: RecordDownloadEventInput,
  ): Promise<PlatformDownloadEvent>;
  listUsers(): Promise<PlatformUser[]>;
  listInvitations(): Promise<PlatformInvitation[]>;
  listDevices(): Promise<PlatformDevice[]>;
  listReleases(): Promise<PlatformRelease[]>;
  listDownloadEvents(): Promise<PlatformDownloadEvent[]>;
}

export type PlatformRepositoryErrorCode =
  | "email_exists"
  | "invitation_exists"
  | "invitation_not_found"
  | "invitation_unavailable"
  | "user_not_found"
  | "release_not_found";

export class PlatformRepositoryError extends Error {
  constructor(
    public readonly code: PlatformRepositoryErrorCode,
    message: string,
  ) {
    super(message);
  }
}

interface RepositoryOptions {
  now?: () => Date;
}

export function createMemoryPlatformRepository(
  options: RepositoryOptions = {},
): PlatformRepository {
  const now = options.now ?? (() => new Date());
  const users = new Map<string, PlatformUser>();
  const invitations = new Map<string, PlatformInvitation>();
  const devices = new Map<string, PlatformDevice>();
  const releases = new Map<string, PlatformRelease>();
  const downloadEvents = new Map<string, PlatformDownloadEvent>();

  function assertEmailAvailable(email: string) {
    for (const user of users.values()) {
      if (user.email === normalizeEmail(email)) {
        throw new PlatformRepositoryError("email_exists", "邮箱已经注册");
      }
    }
  }

  return {
    async createUser(input) {
      assertEmailAvailable(input.email);
      const user: PlatformUser = {
        id: createId("usr"),
        email: normalizeEmail(input.email),
        passwordHash: input.passwordHash,
        displayName: input.displayName,
        role: input.role,
        status: input.status ?? "active",
        createdAt: now(),
        lastLoginAt: null,
      };
      users.set(user.id, user);
      return cloneUser(user);
    },
    async findUserByEmail(email) {
      const normalizedEmail = normalizeEmail(email);
      const user =
        Array.from(users.values()).find((item) => item.email === normalizedEmail) ??
        null;
      return user ? cloneUser(user) : null;
    },
    async findUserById(userId) {
      const user = users.get(userId);
      return user ? cloneUser(user) : null;
    },
    async markUserLoggedIn(userId) {
      const user = users.get(userId);
      if (!user) {
        throw new PlatformRepositoryError("user_not_found", "用户不存在");
      }
      const updated = { ...user, lastLoginAt: now() };
      users.set(userId, updated);
      return cloneUser(updated);
    },
    async countAdmins() {
      return Array.from(users.values()).filter((user) => user.role === "admin")
        .length;
    },
    async createInvitation(input) {
      const code = normalizeInvitationCode(input.code);
      if (invitations.has(code)) {
        throw new PlatformRepositoryError(
          "invitation_exists",
          "邀请码已经存在",
        );
      }
      const invitation: PlatformInvitation = {
        id: createId("inv"),
        code,
        status: "unused",
        maxUses: input.maxUses,
        usedCount: 0,
        createdBy: input.createdBy,
        createdAt: now(),
        expiresAt: input.expiresAt,
      };
      invitations.set(invitation.code, invitation);
      return cloneInvitation(invitation);
    },
    async findInvitationByCode(code) {
      const invitation = invitations.get(normalizeInvitationCode(code));
      return invitation ? cloneInvitation(invitation) : null;
    },
    async registerUserWithInvitation(input) {
      assertEmailAvailable(input.email);
      const code = normalizeInvitationCode(input.invitationCode);
      const invitation = invitations.get(code);
      if (!invitation) {
        throw new PlatformRepositoryError(
          "invitation_not_found",
          "邀请码不存在",
        );
      }
      assertInvitationUsable(invitation, now());

      const user: PlatformUser = {
        id: createId("usr"),
        email: normalizeEmail(input.email),
        passwordHash: input.passwordHash,
        displayName: input.displayName,
        role: "user",
        status: "active",
        createdAt: now(),
        lastLoginAt: null,
      };
      users.set(user.id, user);
      invitations.set(code, consumeInvitation(invitation));
      return cloneUser(user);
    },
    async createDevice(input) {
      if (!users.has(input.userId)) {
        throw new PlatformRepositoryError("user_not_found", "用户不存在");
      }
      const device: PlatformDevice = {
        id: createId("dev"),
        userId: input.userId,
        deviceName: input.deviceName,
        platform: input.platform,
        clientVersion: input.clientVersion,
        devicePublicId: createId("dp"),
        deviceSecretHash: input.deviceSecretHash,
        lastSeenAt: now(),
        createdAt: now(),
      };
      devices.set(device.id, device);
      return cloneDevice(device);
    },
    async listDevicesForUser(userId) {
      return Array.from(devices.values())
        .filter((device) => device.userId === userId)
        .map(cloneDevice);
    },
    async createRelease(input) {
      const release: PlatformRelease = {
        id: createId("rel"),
        ...input,
        createdAt: now(),
      };
      releases.set(release.id, release);
      return cloneRelease(release);
    },
    async findReleaseById(releaseId) {
      const release = releases.get(releaseId);
      return release ? cloneRelease(release) : null;
    },
    async findReleaseByVersionPlatform(version, platform) {
      const release =
        Array.from(releases.values()).find(
          (item) => item.version === version && item.platform === platform,
        ) ?? null;
      return release ? cloneRelease(release) : null;
    },
    async listPublishedReleases(platform) {
      return Array.from(releases.values())
        .filter((release) => release.platform === platform && release.publishedAt)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .map(cloneRelease);
    },
    async recordDownloadEvent(input) {
      if (!releases.has(input.releaseId)) {
        throw new PlatformRepositoryError("release_not_found", "版本不存在");
      }
      const event: PlatformDownloadEvent = {
        id: createId("dle"),
        ...input,
        createdAt: now(),
      };
      downloadEvents.set(event.id, event);
      return cloneDownloadEvent(event);
    },
    async listUsers() {
      return Array.from(users.values()).map(cloneUser);
    },
    async listInvitations() {
      return Array.from(invitations.values()).map(cloneInvitation);
    },
    async listDevices() {
      return Array.from(devices.values()).map(cloneDevice);
    },
    async listReleases() {
      return Array.from(releases.values()).map(cloneRelease);
    },
    async listDownloadEvents() {
      return Array.from(downloadEvents.values()).map(cloneDownloadEvent);
    },
  };
}

export function createPgPlatformRepository(
  pool: Pool,
  options: RepositoryOptions = {},
): PlatformRepository {
  const now = options.now ?? (() => new Date());

  return {
    async createUser(input) {
      try {
        const result = await pool.query(
          `INSERT INTO users
            (id, email, password_hash, display_name, role, status, created_at, last_login_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
           RETURNING *`,
          [
            createId("usr"),
            normalizeEmail(input.email),
            input.passwordHash,
            input.displayName,
            input.role,
            input.status ?? "active",
            now(),
          ],
        );
        return mapUser(result.rows[0]);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new PlatformRepositoryError("email_exists", "邮箱已经注册");
        }
        throw error;
      }
    },
    async findUserByEmail(email) {
      const result = await pool.query("SELECT * FROM users WHERE email = $1", [
        normalizeEmail(email),
      ]);
      return result.rows[0] ? mapUser(result.rows[0]) : null;
    },
    async findUserById(userId) {
      const result = await pool.query("SELECT * FROM users WHERE id = $1", [
        userId,
      ]);
      return result.rows[0] ? mapUser(result.rows[0]) : null;
    },
    async markUserLoggedIn(userId) {
      const result = await pool.query(
        "UPDATE users SET last_login_at = $2 WHERE id = $1 RETURNING *",
        [userId, now()],
      );
      if (!result.rows[0]) {
        throw new PlatformRepositoryError("user_not_found", "用户不存在");
      }
      return mapUser(result.rows[0]);
    },
    async countAdmins() {
      const result = await pool.query(
        "SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin'",
      );
      return Number(result.rows[0]?.count ?? 0);
    },
    async createInvitation(input) {
      try {
        const result = await pool.query(
          `INSERT INTO invitations
            (id, code, status, max_uses, used_count, created_by, created_at, expires_at)
           VALUES ($1, $2, 'unused', $3, 0, $4, $5, $6)
           RETURNING *`,
          [
            createId("inv"),
            normalizeInvitationCode(input.code),
            input.maxUses,
            input.createdBy,
            now(),
            input.expiresAt,
          ],
        );
        return mapInvitation(result.rows[0]);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new PlatformRepositoryError(
            "invitation_exists",
            "邀请码已经存在",
          );
        }
        throw error;
      }
    },
    async findInvitationByCode(code) {
      const result = await pool.query(
        "SELECT * FROM invitations WHERE code = $1",
        [normalizeInvitationCode(code)],
      );
      return result.rows[0] ? mapInvitation(result.rows[0]) : null;
    },
    async registerUserWithInvitation(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const invitation = await lockInvitation(client, input.invitationCode);
        assertInvitationUsable(invitation, now());
        const user = await insertUser(client, {
          email: input.email,
          passwordHash: input.passwordHash,
          displayName: input.displayName,
          role: "user",
        }, now());
        const consumed = consumeInvitation(invitation);
        await client.query(
          `UPDATE invitations
           SET status = $2, used_count = $3
           WHERE code = $1`,
          [invitation.code, consumed.status, consumed.usedCount],
        );
        await client.query("COMMIT");
        return user;
      } catch (error) {
        await client.query("ROLLBACK");
        if (isUniqueViolation(error)) {
          throw new PlatformRepositoryError("email_exists", "邮箱已经注册");
        }
        throw error;
      } finally {
        client.release();
      }
    },
    async createDevice(input) {
      const result = await pool.query(
        `INSERT INTO devices
          (id, user_id, device_name, platform, client_version, device_public_id,
           device_secret_hash, last_seen_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
         RETURNING *`,
        [
          createId("dev"),
          input.userId,
          input.deviceName,
          input.platform,
          input.clientVersion,
          createId("dp"),
          input.deviceSecretHash,
          now(),
        ],
      );
      return mapDevice(result.rows[0]);
    },
    async listDevicesForUser(userId) {
      const result = await pool.query(
        "SELECT * FROM devices WHERE user_id = $1 ORDER BY created_at DESC",
        [userId],
      );
      return result.rows.map(mapDevice);
    },
    async createRelease(input) {
      const result = await pool.query(
        `INSERT INTO releases
          (id, version, platform, channel, file_name, file_path, file_size,
           sha256, release_notes, created_at, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          createId("rel"),
          input.version,
          input.platform,
          input.channel,
          input.fileName,
          input.filePath,
          input.fileSize,
          input.sha256,
          input.releaseNotes,
          now(),
          input.publishedAt,
        ],
      );
      return mapRelease(result.rows[0]);
    },
    async findReleaseById(releaseId) {
      const result = await pool.query("SELECT * FROM releases WHERE id = $1", [
        releaseId,
      ]);
      return result.rows[0] ? mapRelease(result.rows[0]) : null;
    },
    async findReleaseByVersionPlatform(version, platform) {
      const result = await pool.query(
        "SELECT * FROM releases WHERE version = $1 AND platform = $2 LIMIT 1",
        [version, platform],
      );
      return result.rows[0] ? mapRelease(result.rows[0]) : null;
    },
    async listPublishedReleases(platform) {
      const result = await pool.query(
        `SELECT * FROM releases
         WHERE platform = $1 AND published_at IS NOT NULL
         ORDER BY created_at DESC`,
        [platform],
      );
      return result.rows.map(mapRelease);
    },
    async recordDownloadEvent(input) {
      const result = await pool.query(
        `INSERT INTO download_events
          (id, user_id, release_id, ip, user_agent, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          createId("dle"),
          input.userId,
          input.releaseId,
          input.ip,
          input.userAgent,
          now(),
        ],
      );
      return mapDownloadEvent(result.rows[0]);
    },
    async listUsers() {
      const result = await pool.query("SELECT * FROM users ORDER BY created_at DESC");
      return result.rows.map(mapUser);
    },
    async listInvitations() {
      const result = await pool.query(
        "SELECT * FROM invitations ORDER BY created_at DESC",
      );
      return result.rows.map(mapInvitation);
    },
    async listDevices() {
      const result = await pool.query(
        "SELECT * FROM devices ORDER BY created_at DESC",
      );
      return result.rows.map(mapDevice);
    },
    async listReleases() {
      const result = await pool.query(
        "SELECT * FROM releases ORDER BY created_at DESC",
      );
      return result.rows.map(mapRelease);
    },
    async listDownloadEvents() {
      const result = await pool.query(
        "SELECT * FROM download_events ORDER BY created_at DESC",
      );
      return result.rows.map(mapDownloadEvent);
    },
  };
}

async function lockInvitation(
  client: PoolClient,
  invitationCode: string,
): Promise<PlatformInvitation> {
  const result = await client.query(
    "SELECT * FROM invitations WHERE code = $1 FOR UPDATE",
    [normalizeInvitationCode(invitationCode)],
  );

  if (!result.rows[0]) {
    throw new PlatformRepositoryError("invitation_not_found", "邀请码不存在");
  }

  return mapInvitation(result.rows[0]);
}

async function insertUser(
  client: PoolClient,
  input: CreateUserInput,
  createdAt: Date,
): Promise<PlatformUser> {
  const result = await client.query(
    `INSERT INTO users
      (id, email, password_hash, display_name, role, status, created_at, last_login_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
     RETURNING *`,
    [
      createId("usr"),
      normalizeEmail(input.email),
      input.passwordHash,
      input.displayName,
      input.role,
      input.status ?? "active",
      createdAt,
    ],
  );
  return mapUser(result.rows[0]);
}

function assertInvitationUsable(invitation: PlatformInvitation, at: Date) {
  if (
    invitation.status !== "unused" ||
    invitation.usedCount >= invitation.maxUses ||
    (invitation.expiresAt && invitation.expiresAt.getTime() <= at.getTime())
  ) {
    throw new PlatformRepositoryError(
      "invitation_unavailable",
      "邀请码不可用",
    );
  }
}

function consumeInvitation(invitation: PlatformInvitation): PlatformInvitation {
  const usedCount = invitation.usedCount + 1;
  return {
    ...invitation,
    usedCount,
    status: usedCount >= invitation.maxUses ? "used" : "unused",
  };
}

function createId(prefix: string): string {
  return `${prefix}_${nanoid(16)}`;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeInvitationCode(code: string): string {
  return code.trim().toUpperCase();
}

function cloneUser(user: PlatformUser): PlatformUser {
  return {
    ...user,
    createdAt: new Date(user.createdAt),
    lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt) : null,
  };
}

function cloneInvitation(invitation: PlatformInvitation): PlatformInvitation {
  return {
    ...invitation,
    createdAt: new Date(invitation.createdAt),
    expiresAt: invitation.expiresAt ? new Date(invitation.expiresAt) : null,
  };
}

function cloneDevice(device: PlatformDevice): PlatformDevice {
  return {
    ...device,
    lastSeenAt: device.lastSeenAt ? new Date(device.lastSeenAt) : null,
    createdAt: new Date(device.createdAt),
  };
}

function cloneRelease(release: PlatformRelease): PlatformRelease {
  return {
    ...release,
    createdAt: new Date(release.createdAt),
    publishedAt: release.publishedAt ? new Date(release.publishedAt) : null,
  };
}

function cloneDownloadEvent(event: PlatformDownloadEvent): PlatformDownloadEvent {
  return {
    ...event,
    createdAt: new Date(event.createdAt),
  };
}

function mapUser(row: Record<string, unknown>): PlatformUser {
  return {
    id: String(row.id),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    displayName: String(row.display_name),
    role: row.role as PlatformRole,
    status: row.status as UserStatus,
    createdAt: toDate(row.created_at),
    lastLoginAt: row.last_login_at ? toDate(row.last_login_at) : null,
  };
}

function mapInvitation(row: Record<string, unknown>): PlatformInvitation {
  return {
    id: String(row.id),
    code: String(row.code),
    status: row.status as InvitationStatus,
    maxUses: Number(row.max_uses),
    usedCount: Number(row.used_count),
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: toDate(row.created_at),
    expiresAt: row.expires_at ? toDate(row.expires_at) : null,
  };
}

function mapDevice(row: Record<string, unknown>): PlatformDevice {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    deviceName: String(row.device_name),
    platform: row.platform as PlatformDevicePlatform,
    clientVersion: String(row.client_version),
    devicePublicId: String(row.device_public_id),
    deviceSecretHash: String(row.device_secret_hash),
    lastSeenAt: row.last_seen_at ? toDate(row.last_seen_at) : null,
    createdAt: toDate(row.created_at),
  };
}

function mapRelease(row: Record<string, unknown>): PlatformRelease {
  return {
    id: String(row.id),
    version: String(row.version),
    platform: row.platform as PlatformDevicePlatform,
    channel: row.channel as PlatformReleaseChannel,
    fileName: String(row.file_name),
    filePath: String(row.file_path),
    fileSize: Number(row.file_size),
    sha256: String(row.sha256),
    releaseNotes: String(row.release_notes),
    createdAt: toDate(row.created_at),
    publishedAt: row.published_at ? toDate(row.published_at) : null,
  };
}

function mapDownloadEvent(row: Record<string, unknown>): PlatformDownloadEvent {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    releaseId: String(row.release_id),
    ip: row.ip ? String(row.ip) : null,
    userAgent: row.user_agent ? String(row.user_agent) : null,
    createdAt: toDate(row.created_at),
  };
}

function toDate(input: unknown): Date {
  return input instanceof Date ? input : new Date(String(input));
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}
