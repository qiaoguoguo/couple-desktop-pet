import { describe, expect, it } from "vitest";
import { hashPassword } from "./security/passwords.js";
import { createMemoryPlatformRepository } from "./repository.js";

describe("PlatformRepository", () => {
  it("creates an admin user", async () => {
    const repository = createRepository();

    const admin = await repository.createUser({
      email: " Admin@Example.COM ",
      passwordHash: "hash_admin",
      displayName: "管理员",
      role: "admin",
    });

    expect(admin.id.startsWith("usr_")).toBe(true);
    expect(admin.email).toBe("admin@example.com");
    expect(admin.role).toBe("admin");
    expect(admin.status).toBe("active");
  });

  it("creates and reads a valid invitation", async () => {
    const repository = createRepository();

    await repository.createInvitation({
      code: " beta-001 ",
      maxUses: 1,
      createdBy: null,
      expiresAt: new Date("2026-08-04T00:00:00.000Z"),
    });

    const invitation = await repository.findInvitationByCode("BETA-001");

    expect(invitation).toEqual(
      expect.objectContaining({
        code: "BETA-001",
        status: "unused",
        usedCount: 0,
      }),
    );
  });

  it("rejects duplicate invitation codes without overwriting the existing invitation", async () => {
    const repository = createRepository();
    await repository.createInvitation({
      code: "BETA-001",
      maxUses: 1,
      createdBy: null,
      expiresAt: null,
    });

    await expect(
      repository.createInvitation({
        code: " beta-001 ",
        maxUses: 2,
        createdBy: null,
        expiresAt: null,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "invitation_exists",
      }),
    );
    expect(await repository.findInvitationByCode("BETA-001")).toEqual(
      expect.objectContaining({
        maxUses: 1,
      }),
    );
  });

  it("registers a user and consumes a one-use invitation", async () => {
    const repository = createRepository();
    await repository.createInvitation({
      code: "BETA-002",
      maxUses: 1,
      createdBy: null,
      expiresAt: null,
    });

    const user = await repository.registerUserWithInvitation({
      invitationCode: "BETA-002",
      email: "user@example.com",
      passwordHash: "hash_user",
      displayName: "内测用户",
    });

    expect(user.email).toBe("user@example.com");
    expect(user.role).toBe("user");
    expect(await repository.findInvitationByCode("BETA-002")).toEqual(
      expect.objectContaining({ status: "used", usedCount: 1 }),
    );
  });

  it("rejects reusing a one-use invitation", async () => {
    const repository = createRepository();
    await repository.createInvitation({
      code: "BETA-003",
      maxUses: 1,
      createdBy: null,
      expiresAt: null,
    });
    await repository.registerUserWithInvitation({
      invitationCode: "BETA-003",
      email: "first@example.com",
      passwordHash: "hash_first",
      displayName: "第一位",
    });

    await expect(
      repository.registerUserWithInvitation({
        invitationCode: "BETA-003",
        email: "second@example.com",
        passwordHash: "hash_second",
        displayName: "第二位",
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "invitation_unavailable",
      }),
    );
  });

  it("updates last login time", async () => {
    const repository = createRepository();
    const user = await repository.createUser({
      email: "login@example.com",
      passwordHash: "hash_login",
      displayName: "登录用户",
      role: "user",
    });

    const loggedIn = await repository.markUserLoggedIn(user.id);

    expect(loggedIn.lastLoginAt?.toISOString()).toBe(
      "2026-08-03T12:00:00.000Z",
    );
  });

  it("registers devices without storing a plain device secret", async () => {
    const repository = createRepository();
    const user = await repository.createUser({
      email: "device@example.com",
      passwordHash: "hash_device",
      displayName: "设备用户",
      role: "user",
    });
    const secretHash = await hashPassword("plain-device-secret");

    const device = await repository.createDevice({
      userId: user.id,
      deviceName: "Windows 桌面",
      platform: "windows",
      clientVersion: "0.1.0",
      deviceSecretHash: secretHash,
    });

    expect(device.devicePublicId.startsWith("dp_")).toBe(true);
    expect(device.deviceSecretHash).toBe(secretHash);
    expect(device.deviceSecretHash).not.toContain("plain-device-secret");
  });

  it("lists only published releases for the requested platform", async () => {
    const repository = createRepository();
    await repository.createRelease({
      version: "0.1.0",
      platform: "windows",
      channel: "internal",
      fileName: "couple-pet.exe",
      filePath: "/storage/releases/couple-pet.exe",
      fileSize: 1024,
      sha256: "hash-win",
      releaseNotes: "Windows 内测包",
      publishedAt: new Date("2026-08-03T12:00:00.000Z"),
    });
    await repository.createRelease({
      version: "0.1.0",
      platform: "macos",
      channel: "internal",
      fileName: "couple-pet.dmg",
      filePath: "/storage/releases/couple-pet.dmg",
      fileSize: 2048,
      sha256: "hash-mac",
      releaseNotes: "macOS 内测包",
      publishedAt: new Date("2026-08-03T12:00:00.000Z"),
    });
    await repository.createRelease({
      version: "0.2.0",
      platform: "windows",
      channel: "internal",
      fileName: "draft.exe",
      filePath: "/storage/releases/draft.exe",
      fileSize: 4096,
      sha256: "hash-draft",
      releaseNotes: "未发布",
      publishedAt: null,
    });

    const releases = await repository.listPublishedReleases("windows");

    expect(releases).toHaveLength(1);
    expect(releases[0]).toEqual(
      expect.objectContaining({
        fileName: "couple-pet.exe",
        sha256: "hash-win",
      }),
    );
  });

  it("records download events with user, release, ip, and user agent", async () => {
    const repository = createRepository();
    const user = await repository.createUser({
      email: "download@example.com",
      passwordHash: "hash_download",
      displayName: "下载用户",
      role: "user",
    });
    const release = await repository.createRelease({
      version: "0.1.0",
      platform: "windows",
      channel: "internal",
      fileName: "couple-pet.exe",
      filePath: "/storage/releases/couple-pet.exe",
      fileSize: 1024,
      sha256: "hash-win",
      releaseNotes: "Windows 内测包",
      publishedAt: new Date("2026-08-03T12:00:00.000Z"),
    });

    const event = await repository.recordDownloadEvent({
      userId: user.id,
      releaseId: release.id,
      ip: "127.0.0.1",
      userAgent: "vitest",
    });

    expect(event).toEqual(
      expect.objectContaining({
        userId: user.id,
        releaseId: release.id,
        ip: "127.0.0.1",
        userAgent: "vitest",
      }),
    );
  });
});

function createRepository() {
  return createMemoryPlatformRepository({
    now: () => new Date("2026-08-03T12:00:00.000Z"),
  });
}
