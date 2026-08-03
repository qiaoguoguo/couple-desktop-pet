import type { FastifyInstance } from "fastify";
import type { PlatformDevicePlatform } from "../../../shared/platformProtocol.js";
import { PlatformApiError } from "../errors.js";
import type { PlatformRelease } from "../repository.js";
import {
  mapRepositoryError,
  readBody,
  requireUser,
  type RouteContext,
} from "./authRoutes.js";

export async function registerReleaseRoutes(
  server: FastifyInstance,
  context: RouteContext,
) {
  server.get("/releases", async (request) => {
    await requireUser(request, context);
    const platform = readPlatform(
      (request.query as Record<string, unknown>).platform,
    );
    const releases = await context.repository.listPublishedReleases(platform);

    return {
      releases: releases.map(toPublicRelease),
    };
  });

  server.post("/downloads", async (request) => {
    const user = await requireUser(request, context);
    const body = readBody(request);
    if (typeof body.releaseId !== "string" || !body.releaseId.trim()) {
      throw new PlatformApiError(400, "invalid_request", "版本 ID 不能为空");
    }

    try {
      const release = await context.repository.findReleaseById(body.releaseId);
      if (!release || !release.publishedAt) {
        throw new PlatformApiError(404, "not_found", "版本不存在");
      }

      const event = await context.repository.recordDownloadEvent({
        userId: user.id,
        releaseId: release.id,
        ip: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null,
      });

      return {
        ok: true,
        downloadEvent: {
          id: event.id,
          releaseId: event.releaseId,
          createdAt: event.createdAt.toISOString(),
        },
      };
    } catch (error) {
      throw mapRepositoryError(error);
    }
  });
}

export function toPublicRelease(release: PlatformRelease) {
  return {
    id: release.id,
    version: release.version,
    platform: release.platform,
    channel: release.channel,
    fileName: release.fileName,
    fileSize: release.fileSize,
    sha256: release.sha256,
    releaseNotes: release.releaseNotes,
    publishedAt: release.publishedAt?.toISOString() ?? null,
    downloadUrl: `/releases/${encodeURIComponent(release.fileName)}`,
  };
}

function readPlatform(input: unknown): PlatformDevicePlatform {
  if (input === "windows" || input === "macos" || input === "linux") {
    return input;
  }

  throw new PlatformApiError(400, "invalid_request", "平台参数不正确");
}
