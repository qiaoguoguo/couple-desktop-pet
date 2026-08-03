import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  validateInvitationCode,
  type PlatformDevicePlatform,
  type PlatformReleaseChannel,
} from "../../../shared/platformProtocol.js";
import { PlatformApiError } from "../errors.js";
import { readReleaseFileMetadata } from "../releases/releaseFiles.js";
import type {
  PlatformDownloadEvent,
  PlatformInvitation,
  PlatformRelease,
  PlatformUser,
} from "../repository.js";
import {
  mapRepositoryError,
  readBody,
  requireAdmin,
  type RouteContext,
} from "./authRoutes.js";
import { toPublicDevice } from "./deviceRoutes.js";

export async function registerAdminRoutes(
  server: FastifyInstance,
  context: RouteContext,
) {
  server.get("/admin/users", async (request) => {
    await requireAdmin(request, context);
    const users = await context.repository.listUsers();
    return { users: users.map(toAdminUser) };
  });

  server.get("/admin/invitations", async (request) => {
    await requireAdmin(request, context);
    const invitations = await context.repository.listInvitations();
    return { invitations: invitations.map(toAdminInvitation) };
  });

  server.post("/admin/invitations", async (request) => {
    const admin = await requireAdmin(request, context);
    const body = readBody(request);
    const code = validateInvitationCode(body.code);
    if (!code.ok) {
      throw new PlatformApiError(400, "invalid_request", code.message);
    }

    try {
      const invitation = await context.repository.createInvitation({
        code: code.code,
        maxUses: readPositiveInteger(body.maxUses, 1),
        createdBy: admin.id,
        expiresAt: readOptionalDate(body.expiresAt),
      });
      return { invitation: toAdminInvitation(invitation) };
    } catch (error) {
      throw mapRepositoryError(error);
    }
  });

  server.get("/admin/devices", async (request) => {
    await requireAdmin(request, context);
    const devices = await context.repository.listDevices();
    return { devices: devices.map(toPublicDevice) };
  });

  server.get("/admin/releases", async (request) => {
    await requireAdmin(request, context);
    const releases = await context.repository.listReleases();
    return { releases: releases.map(toAdminRelease) };
  });

  server.post("/admin/releases", async (request) => {
    await requireAdmin(request, context);
    const body = readBody(request);

    try {
      const fileName =
        typeof body.fileName === "string" && body.fileName.trim()
          ? body.fileName
          : null;
      const fileReference =
        typeof body.filePath === "string" && body.filePath.trim()
          ? body.filePath
          : fileName;
      if (!fileReference) {
        throw new PlatformApiError(400, "invalid_request", "文件路径不能为空");
      }
      const fileMetadata = await readReleaseFileMetadata({
        releaseStoragePath: context.releaseStoragePath,
        fileReference,
        fileName,
        expectedSha256:
          typeof body.sha256 === "string" && body.sha256.trim()
            ? body.sha256
            : null,
      });
      const release = await context.repository.createRelease({
        version: readText(body.version, "版本号不能为空"),
        platform: readPlatform(body.platform),
        channel: readChannel(body.channel),
        fileName: fileMetadata.fileName,
        filePath: fileMetadata.filePath,
        fileSize: fileMetadata.fileSize,
        sha256: fileMetadata.sha256,
        releaseNotes:
          typeof body.releaseNotes === "string" ? body.releaseNotes : "",
        publishedAt: readOptionalDate(body.publishedAt),
      });
      return { release: toAdminRelease(release) };
    } catch (error) {
      throw mapRepositoryError(error);
    }
  });

  server.get("/admin/downloads", async (request) => {
    await requireAdmin(request, context);
    const downloads = await context.repository.listDownloadEvents();
    return { downloads: downloads.map(toAdminDownloadEvent) };
  });
}

function toAdminUser(user: PlatformUser) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

function toAdminInvitation(invitation: PlatformInvitation) {
  return {
    id: invitation.id,
    code: invitation.code,
    status: invitation.status,
    maxUses: invitation.maxUses,
    usedCount: invitation.usedCount,
    createdBy: invitation.createdBy,
    createdAt: invitation.createdAt.toISOString(),
    expiresAt: invitation.expiresAt?.toISOString() ?? null,
  };
}

function toAdminRelease(release: PlatformRelease) {
  return {
    id: release.id,
    version: release.version,
    platform: release.platform,
    channel: release.channel,
    fileName: release.fileName,
    filePath: release.filePath,
    fileSize: release.fileSize,
    sha256: release.sha256,
    releaseNotes: release.releaseNotes,
    createdAt: release.createdAt.toISOString(),
    publishedAt: release.publishedAt?.toISOString() ?? null,
  };
}

function toAdminDownloadEvent(event: PlatformDownloadEvent) {
  return {
    id: event.id,
    userId: event.userId,
    releaseId: event.releaseId,
    ip: event.ip,
    userAgent: event.userAgent,
    createdAt: event.createdAt.toISOString(),
  };
}

function readText(input: unknown, message: string): string {
  if (typeof input !== "string" || !input.trim()) {
    throw new PlatformApiError(400, "invalid_request", message);
  }

  return input.trim();
}

function readPositiveInteger(input: unknown, fallback: number): number {
  if (input === undefined || input === null) {
    return fallback;
  }

  const value = Number(input);
  if (!Number.isInteger(value) || value < 1) {
    throw new PlatformApiError(400, "invalid_request", "数字参数不正确");
  }

  return value;
}

function readOptionalDate(input: unknown): Date | null {
  if (input === undefined || input === null || input === "") {
    return null;
  }

  if (typeof input !== "string") {
    throw new PlatformApiError(400, "invalid_request", "时间格式不正确");
  }

  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new PlatformApiError(400, "invalid_request", "时间格式不正确");
  }

  return date;
}

function readPlatform(input: unknown): PlatformDevicePlatform {
  if (input === "windows" || input === "macos" || input === "linux") {
    return input;
  }

  throw new PlatformApiError(400, "invalid_request", "平台参数不正确");
}

function readChannel(input: unknown): PlatformReleaseChannel {
  if (input === "internal" || input === "stable") {
    return input;
  }

  throw new PlatformApiError(400, "invalid_request", "发布渠道不正确");
}
