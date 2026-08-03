import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createMemoryPlatformRepository } from "./repository.js";
import type { PlatformRepository } from "./repository.js";
import { createPlatformServer } from "./server.js";
import { hashPassword } from "./security/passwords.js";

const servers: FastifyInstance[] = [];
const tempDirs: string[] = [];

describe("platform api routes", () => {
  afterEach(async () => {
    await Promise.all(servers.map((server) => server.close()));
    servers.length = 0;
    await Promise.all(
      tempDirs.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("returns a Chinese error for invalid invitation code verification", async () => {
    const { server } = await createTestServer();

    const response = await server.inject({
      method: "POST",
      url: "/auth/invitations/verify",
      payload: { code: "missing-code" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: "not_found",
        message: "邀请码不存在或不可用",
      },
    });
  });

  it("registers with an invitation and does not return password hash", async () => {
    const { server, repository } = await createTestServer();
    await repository.createInvitation({
      code: "BETA-100",
      maxUses: 1,
      createdBy: null,
      expiresAt: null,
    });

    const response = await server.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        invitationCode: "BETA-100",
        email: "User@Example.COM",
        password: "12345678",
        displayName: "测试用户",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      accessToken: expect.any(String),
      user: {
        id: expect.stringMatching(/^usr_/),
        email: "user@example.com",
        displayName: "测试用户",
        role: "user",
      },
    });
    expect(JSON.stringify(response.json())).not.toContain("passwordHash");
  });

  it("logs in with valid credentials and rejects a wrong password", async () => {
    const { server, repository } = await createTestServer();
    await repository.createUser({
      email: "login@example.com",
      passwordHash: await hashPassword("12345678"),
      displayName: "登录用户",
      role: "user",
    });

    const okResponse = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "login@example.com", password: "12345678" },
    });
    const badResponse = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "login@example.com", password: "wrong-password" },
    });

    expect(okResponse.statusCode).toBe(200);
    expect(okResponse.json().accessToken).toEqual(expect.any(String));
    expect(badResponse.statusCode).toBe(401);
  });

  it("returns the current user for a Bearer token", async () => {
    const { server, accessToken } = await createTestServerWithUser();

    const response = await server.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: {
        id: expect.stringMatching(/^usr_/),
        email: "user@example.com",
        displayName: "普通用户",
        role: "user",
      },
    });
  });

  it("sets CORS headers only for configured origins while allowing no-origin requests", async () => {
    const { server } = await createTestServer({
      corsOrigins: ["http://allowed.example"],
    });

    const allowed = await server.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://allowed.example" },
    });
    const denied = await server.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://denied.example" },
    });
    const noOrigin = await server.inject({
      method: "GET",
      url: "/health",
    });

    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "http://allowed.example",
    );
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    expect(noOrigin.statusCode).toBe(200);
  });

  it("registers and lists devices for the authenticated user", async () => {
    const { server, accessToken } = await createTestServerWithUser();

    const createResponse = await server.inject({
      method: "POST",
      url: "/devices",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        deviceName: "Windows 桌面",
        platform: "windows",
        clientVersion: "0.1.0",
      },
    });
    const listResponse = await server.inject({
      method: "GET",
      url: "/devices",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json()).toEqual({
      device: {
        id: expect.stringMatching(/^dev_/),
        deviceName: "Windows 桌面",
        platform: "windows",
        clientVersion: "0.1.0",
        devicePublicId: expect.stringMatching(/^dp_/),
      },
      deviceSecret: expect.any(String),
    });
    expect(listResponse.json().devices).toHaveLength(1);
    expect(JSON.stringify(listResponse.json())).not.toContain("deviceSecretHash");
  });

  it("lists published Windows releases and downloads files through the authenticated API", async () => {
    const storagePath = await createTempDir();
    const filePath = join(storagePath, "couple-pet.exe");
    const fileContent = Buffer.from("windows-build");
    await writeFile(filePath, fileContent);
    const { server, repository, accessToken, user } =
      await createTestServerWithUser({ releaseStoragePath: storagePath });
    const release = await repository.createRelease({
      version: "0.1.0",
      platform: "windows",
      channel: "internal",
      fileName: "couple-pet.exe",
      filePath,
      fileSize: fileContent.byteLength,
      sha256: sha256(fileContent),
      releaseNotes: "Windows 内测包",
      publishedAt: new Date("2026-08-03T12:00:00.000Z"),
    });

    const listResponse = await server.inject({
      method: "GET",
      url: "/releases?platform=windows",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const downloadResponse = await server.inject({
      method: "GET",
      url: `/releases/${release.id}/download`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "user-agent": "vitest-agent",
      },
      remoteAddress: "127.0.0.1",
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().releases).toEqual([
      expect.objectContaining({
        id: release.id,
        fileName: "couple-pet.exe",
        downloadUrl: `/releases/${release.id}/download`,
      }),
    ]);
    expect(listResponse.json().releases[0].downloadUrl).not.toContain(
      "/releases/couple-pet.exe",
    );
    expect(downloadResponse.statusCode).toBe(200);
    expect(downloadResponse.body).toBe(fileContent.toString("utf8"));
    expect(downloadResponse.headers["content-disposition"]).toContain(
      'filename="couple-pet.exe"',
    );
    expect((await repository.listDownloadEvents())[0]).toEqual(
      expect.objectContaining({
        userId: user.id,
        releaseId: release.id,
        userAgent: "vitest-agent",
      }),
    );
  });

  it("rejects unauthenticated release downloads", async () => {
    const storagePath = await createTempDir();
    const filePath = join(storagePath, "couple-pet.exe");
    await writeFile(filePath, "windows-build");
    const { server, repository } = await createTestServer({
      releaseStoragePath: storagePath,
    });
    const release = await repository.createRelease({
      version: "0.1.0",
      platform: "windows",
      channel: "internal",
      fileName: "couple-pet.exe",
      filePath,
      fileSize: 13,
      sha256: sha256("windows-build"),
      releaseNotes: "Windows 内测包",
      publishedAt: new Date("2026-08-03T12:00:00.000Z"),
    });

    const response = await server.inject({
      method: "GET",
      url: `/releases/${release.id}/download`,
    });

    expect(response.statusCode).toBe(401);
    expect(await repository.listDownloadEvents()).toHaveLength(0);
  });

  it("rejects unpublished or storage-escaped release downloads", async () => {
    const storagePath = await createTempDir();
    const outsidePath = join(await createTempDir(), "outside.exe");
    const draftPath = join(storagePath, "draft.exe");
    await writeFile(outsidePath, "outside");
    await writeFile(draftPath, "draft");
    const { server, repository, accessToken } = await createTestServerWithUser({
      releaseStoragePath: storagePath,
    });
    const unpublished = await repository.createRelease({
      version: "0.2.0",
      platform: "windows",
      channel: "internal",
      fileName: "draft.exe",
      filePath: draftPath,
      fileSize: 5,
      sha256: sha256("draft"),
      releaseNotes: "未发布",
      publishedAt: null,
    });
    const escaped = await repository.createRelease({
      version: "0.3.0",
      platform: "windows",
      channel: "internal",
      fileName: "outside.exe",
      filePath: outsidePath,
      fileSize: 7,
      sha256: sha256("outside"),
      releaseNotes: "越界",
      publishedAt: new Date("2026-08-03T12:00:00.000Z"),
    });

    const draftResponse = await server.inject({
      method: "GET",
      url: `/releases/${unpublished.id}/download`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const escapedResponse = await server.inject({
      method: "GET",
      url: `/releases/${escaped.id}/download`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(draftResponse.statusCode).toBe(404);
    expect(escapedResponse.statusCode).toBe(404);
    expect(await repository.listDownloadEvents()).toHaveLength(0);
  });

  it("rejects admin endpoints for normal users", async () => {
    const { server, accessToken } = await createTestServerWithUser();

    const response = await server.inject({
      method: "GET",
      url: "/admin/users",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(403);
  });

  it("allows admin to create and list platform records", async () => {
    const storagePath = await createTempDir();
    const fileContent = Buffer.from("windows-build");
    await writeFile(join(storagePath, "couple-pet.exe"), fileContent);
    const { server, repository, adminToken } = await createTestServerWithAdmin({
      releaseStoragePath: storagePath,
    });
    const user = await repository.createUser({
      email: "device-owner@example.com",
      passwordHash: await hashPassword("12345678"),
      displayName: "设备主人",
      role: "user",
    });
    await repository.createDevice({
      userId: user.id,
      deviceName: "Windows 桌面",
      platform: "windows",
      clientVersion: "0.1.0",
      deviceSecretHash: await hashPassword("device-secret"),
    });

    const createInvitation = await server.inject({
      method: "POST",
      url: "/admin/invitations",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { code: "ADMIN-1", maxUses: 2, expiresAt: null },
    });
    const createRelease = await server.inject({
      method: "POST",
      url: "/admin/releases",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        version: "0.1.0",
        platform: "windows",
        channel: "internal",
        fileName: "couple-pet.exe",
        releaseNotes: "Windows 内测包",
        publishedAt: "2026-08-03T12:00:00.000Z",
      },
    });

    expect(createInvitation.statusCode).toBe(200);
    expect(createRelease.statusCode).toBe(200);
    expect(createRelease.json().release).toEqual(
      expect.objectContaining({
        fileName: "couple-pet.exe",
        filePath: resolve(storagePath, "couple-pet.exe"),
        fileSize: fileContent.byteLength,
        sha256: sha256(fileContent),
      }),
    );

    for (const url of [
      "/admin/users",
      "/admin/invitations",
      "/admin/devices",
      "/admin/releases",
      "/admin/downloads",
    ]) {
      const response = await server.inject({
        method: "GET",
        url,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
    }
  });

  it("rejects admin invitation maxUses below one", async () => {
    const { server, adminToken } = await createTestServerWithAdmin();

    const response = await server.inject({
      method: "POST",
      url: "/admin/invitations",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { code: "ADMIN-2", maxUses: 0, expiresAt: null },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns conflict instead of overwriting duplicate invitation codes", async () => {
    const { server, adminToken } = await createTestServerWithAdmin();
    await server.inject({
      method: "POST",
      url: "/admin/invitations",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { code: "ADMIN-3", maxUses: 1, expiresAt: null },
    });

    const response = await server.inject({
      method: "POST",
      url: "/admin/invitations",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { code: "ADMIN-3", maxUses: 1, expiresAt: null },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: { code: "conflict", message: "邀请码已经存在" },
    });
  });

  it("rejects unsafe release file names and storage file references", async () => {
    const storagePath = await createTempDir();
    const { server, adminToken } = await createTestServerWithAdmin({
      releaseStoragePath: storagePath,
    });

    for (const payload of [
      { fileName: "../evil.exe" },
      { fileName: "folder/app.exe" },
      { fileName: "bad\\app.exe" },
      { fileName: "couple-pet.exe", filePath: "../outside.exe" },
    ]) {
      const response = await server.inject({
        method: "POST",
        url: "/admin/releases",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          version: "0.1.0",
          platform: "windows",
          channel: "internal",
          releaseNotes: "Windows 内测包",
          publishedAt: "2026-08-03T12:00:00.000Z",
          ...payload,
        },
      });

      expect(response.statusCode).toBe(400);
    }
  });

  it("rejects release creation when the file is missing or sha256 does not match", async () => {
    const storagePath = await createTempDir();
    await writeFile(join(storagePath, "couple-pet.exe"), "windows-build");
    const { server, adminToken } = await createTestServerWithAdmin({
      releaseStoragePath: storagePath,
    });

    const missingFile = await server.inject({
      method: "POST",
      url: "/admin/releases",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        version: "0.1.0",
        platform: "windows",
        channel: "internal",
        fileName: "missing.exe",
        publishedAt: "2026-08-03T12:00:00.000Z",
      },
    });
    const shaMismatch = await server.inject({
      method: "POST",
      url: "/admin/releases",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        version: "0.1.1",
        platform: "windows",
        channel: "internal",
        fileName: "couple-pet.exe",
        sha256: "deadbeef",
        publishedAt: "2026-08-03T12:00:00.000Z",
      },
    });

    expect(missingFile.statusCode).toBe(400);
    expect(shaMismatch.statusCode).toBe(400);
  });
});

async function createTestServer(
  options: { releaseStoragePath?: string; corsOrigins?: string[] } = {},
) {
  const repository = createMemoryPlatformRepository({
    now: () => new Date("2026-08-03T12:00:00.000Z"),
  });
  const server = await createPlatformServer({
    jwtSecret: "test-secret",
    repository,
    releaseStoragePath:
      options.releaseStoragePath ?? resolve("storage/releases"),
    corsOrigins: options.corsOrigins ?? ["http://127.0.0.1:19080"],
  });
  servers.push(server);

  return { server, repository };
}

async function createTestServerWithUser(
  options: { releaseStoragePath?: string; corsOrigins?: string[] } = {},
) {
  const setup = await createTestServer(options);
  const user = await setup.repository.createUser({
    email: "user@example.com",
    passwordHash: await hashPassword("12345678"),
    displayName: "普通用户",
    role: "user",
  });
  const loginResponse = await setup.server.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: user.email, password: "12345678" },
  });

  return {
    ...setup,
    user,
    accessToken: loginResponse.json().accessToken as string,
  };
}

async function createTestServerWithAdmin(
  options: { releaseStoragePath?: string; corsOrigins?: string[] } = {},
) {
  const setup = await createTestServer(options);
  await setup.repository.createUser({
    email: "admin@example.com",
    passwordHash: await hashPassword("12345678"),
    displayName: "管理员",
    role: "admin",
  });
  const loginResponse = await setup.server.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "admin@example.com", password: "12345678" },
  });

  return {
    ...setup,
    adminToken: loginResponse.json().accessToken as string,
  };
}

async function createTempDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "couple-pet-platform-"));
  tempDirs.push(directory);
  return directory;
}

function sha256(input: Buffer | string): string {
  return createHash("sha256").update(input).digest("hex");
}
