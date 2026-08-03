import { createHash } from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import {
  validatePlatformEmail,
  validatePlatformPassword,
} from "../../shared/platformProtocol.js";
import type { PlatformConfig } from "./config.js";
import type { PlatformRepository } from "./repository.js";
import { hashPassword } from "./security/passwords.js";

export interface BootstrapConfig
  extends Pick<
    PlatformConfig,
    | "releaseStoragePath"
    | "adminEmail"
    | "adminPassword"
    | "demoWindowsExePath"
    | "demoWindowsVersion"
  > {}

export interface BootstrapLogger {
  warn(message: string): void;
}

export interface BootstrapOptions {
  repository: PlatformRepository;
  config: BootstrapConfig;
  logger?: BootstrapLogger;
}

export async function bootstrapPlatform({
  repository,
  config,
  logger = console,
}: BootstrapOptions): Promise<void> {
  await bootstrapAdmin(repository, config);
  await bootstrapDemoWindowsRelease(repository, config, logger);
}

async function bootstrapAdmin(
  repository: PlatformRepository,
  config: BootstrapConfig,
) {
  if ((await repository.countAdmins()) > 0) {
    return;
  }

  if (!config.adminEmail || !config.adminPassword) {
    return;
  }

  const email = validatePlatformEmail(config.adminEmail);
  const password = validatePlatformPassword(config.adminPassword);
  if (!email.ok) {
    throw new Error(email.message);
  }
  if (!password.ok) {
    throw new Error(password.message);
  }

  await repository.createUser({
    email: email.email,
    passwordHash: await hashPassword(password.password),
    displayName: "平台管理员",
    role: "admin",
  });
}

async function bootstrapDemoWindowsRelease(
  repository: PlatformRepository,
  config: BootstrapConfig,
  logger: BootstrapLogger,
) {
  if (!config.demoWindowsExePath || !config.demoWindowsVersion) {
    return;
  }

  const filePath = resolve(config.demoWindowsExePath);
  if (!isPathInside(resolve(config.releaseStoragePath), filePath)) {
    throw new Error("Demo release path must stay under release storage path");
  }

  try {
    await access(filePath);
  } catch {
    logger.warn("Demo Windows release file not found; skipping release bootstrap.");
    return;
  }

  const existingRelease = await repository.findReleaseByVersionPlatform(
    config.demoWindowsVersion,
    "windows",
  );
  if (existingRelease) {
    return;
  }

  const [fileBuffer, fileStat] = await Promise.all([
    readFile(filePath),
    stat(filePath),
  ]);
  const sha256 = createHash("sha256").update(fileBuffer).digest("hex");

  await repository.createRelease({
    version: config.demoWindowsVersion,
    platform: "windows",
    channel: "internal",
    fileName: basename(filePath),
    filePath,
    fileSize: fileStat.size,
    sha256,
    releaseNotes: "Windows 内测包",
    publishedAt: new Date(),
  });
}

function isPathInside(parentPath: string, candidatePath: string): boolean {
  const child = relative(parentPath, candidatePath);
  return Boolean(child) && !child.startsWith("..") && !isAbsolute(child);
}
