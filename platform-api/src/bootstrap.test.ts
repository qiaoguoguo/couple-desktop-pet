import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { bootstrapPlatform } from "./bootstrap.js";
import { createMemoryPlatformRepository } from "./repository.js";
import { verifyPassword } from "./security/passwords.js";

describe("bootstrapPlatform", () => {
  it("creates the first admin from env when no admin exists", async () => {
    const repository = createMemoryPlatformRepository();

    await bootstrapPlatform({
      repository,
      config: {
        releaseStoragePath: "C:/storage/releases",
        adminEmail: "admin@example.com",
        adminPassword: "12345678",
        demoWindowsExePath: null,
        demoWindowsVersion: null,
      },
    });

    const users = await repository.listUsers();
    expect(users).toHaveLength(1);
    expect(users[0]).toEqual(
      expect.objectContaining({
        email: "admin@example.com",
        role: "admin",
      }),
    );
    expect(await verifyPassword("12345678", users[0]!.passwordHash)).toBe(true);
  });

  it("does not overwrite an existing admin", async () => {
    const repository = createMemoryPlatformRepository();
    await repository.createUser({
      email: "existing@example.com",
      passwordHash: "existing-hash",
      displayName: "已有管理员",
      role: "admin",
    });

    await bootstrapPlatform({
      repository,
      config: {
        releaseStoragePath: "C:/storage/releases",
        adminEmail: "new@example.com",
        adminPassword: "12345678",
        demoWindowsExePath: null,
        demoWindowsVersion: null,
      },
    });

    const users = await repository.listUsers();
    expect(users).toHaveLength(1);
    expect(users[0]!.email).toBe("existing@example.com");
    expect(users[0]!.passwordHash).toBe("existing-hash");
  });

  it("creates demo Windows release metadata from a file under storage", async () => {
    const repository = createMemoryPlatformRepository();
    const storagePath = await mkdtemp(join(tmpdir(), "couple-pet-releases-"));
    const exePath = join(storagePath, "couple-pet-debug.exe");
    await writeFile(exePath, "demo exe content");

    await bootstrapPlatform({
      repository,
      config: {
        releaseStoragePath: storagePath,
        adminEmail: null,
        adminPassword: null,
        demoWindowsExePath: exePath,
        demoWindowsVersion: "0.1.0",
      },
    });

    const releases = await repository.listReleases();
    expect(releases).toHaveLength(1);
    expect(releases[0]).toEqual(
      expect.objectContaining({
        version: "0.1.0",
        platform: "windows",
        fileName: "couple-pet-debug.exe",
        fileSize: 16,
        sha256:
          "08db0e4b29f8a0af00ea7f8e1bf34fa5ab266e0acbafc6a7285da3aaefbb4a75",
      }),
    );
  });

  it("warns and continues when the demo release file is missing", async () => {
    const repository = createMemoryPlatformRepository();
    const warn = vi.fn();

    await bootstrapPlatform({
      repository,
      logger: { warn },
      config: {
        releaseStoragePath: "C:/storage/releases",
        adminEmail: null,
        adminPassword: null,
        demoWindowsExePath: "C:/storage/releases/missing.exe",
        demoWindowsVersion: "0.1.0",
      },
    });

    expect(await repository.listReleases()).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      "Demo Windows release file not found; skipping release bootstrap.",
    );
  });
});
