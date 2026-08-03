import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createMemoryPlatformRepository } from "./repository.js";
import type { PlatformRepository } from "./repository.js";
import { createPlatformServer } from "./server.js";
import { hashPassword } from "./security/passwords.js";

const servers: FastifyInstance[] = [];

describe("platform api routes", () => {
  afterEach(async () => {
    await Promise.all(servers.map((server) => server.close()));
    servers.length = 0;
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

  it("lists published Windows releases and records a download event", async () => {
    const { server, repository, accessToken, user } =
      await createTestServerWithUser();
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

    const listResponse = await server.inject({
      method: "GET",
      url: "/releases?platform=windows",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const downloadResponse = await server.inject({
      method: "POST",
      url: "/downloads",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "user-agent": "vitest-agent",
      },
      remoteAddress: "127.0.0.1",
      payload: { releaseId: release.id },
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().releases).toEqual([
      expect.objectContaining({
        id: release.id,
        fileName: "couple-pet.exe",
        downloadUrl: "/releases/couple-pet.exe",
      }),
    ]);
    expect(downloadResponse.statusCode).toBe(200);
    expect((await repository.listDownloadEvents())[0]).toEqual(
      expect.objectContaining({
        userId: user.id,
        releaseId: release.id,
        userAgent: "vitest-agent",
      }),
    );
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
    const { server, repository, adminToken } = await createTestServerWithAdmin();
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
        filePath: "/storage/releases/couple-pet.exe",
        fileSize: 1024,
        sha256: "hash-win",
        releaseNotes: "Windows 内测包",
        publishedAt: "2026-08-03T12:00:00.000Z",
      },
    });

    expect(createInvitation.statusCode).toBe(200);
    expect(createRelease.statusCode).toBe(200);

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
});

async function createTestServer() {
  const repository = createMemoryPlatformRepository({
    now: () => new Date("2026-08-03T12:00:00.000Z"),
  });
  const server = await createPlatformServer({
    jwtSecret: "test-secret",
    repository,
  });
  servers.push(server);

  return { server, repository };
}

async function createTestServerWithUser() {
  const setup = await createTestServer();
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

async function createTestServerWithAdmin() {
  const setup = await createTestServer();
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
