import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import type { PlatformDevicePlatform } from "../../../shared/platformProtocol.js";
import { PlatformApiError } from "../errors.js";
import { hashPassword } from "../security/passwords.js";
import {
  mapRepositoryError,
  readBody,
  requireUser,
  type RouteContext,
} from "./authRoutes.js";

export async function registerDeviceRoutes(
  server: FastifyInstance,
  context: RouteContext,
) {
  server.post("/devices", async (request) => {
    const user = await requireUser(request, context);
    const body = readBody(request);
    const deviceName = readText(body.deviceName, "设备名称不能为空");
    const platform = readPlatform(body.platform);
    const clientVersion = readText(body.clientVersion, "客户端版本不能为空");
    const deviceSecret = `dsec_${nanoid(32)}`;

    try {
      const device = await context.repository.createDevice({
        userId: user.id,
        deviceName,
        platform,
        clientVersion,
        deviceSecretHash: await hashPassword(deviceSecret),
      });

      return {
        device: toPublicDevice(device),
        deviceSecret,
      };
    } catch (error) {
      throw mapRepositoryError(error);
    }
  });

  server.get("/devices", async (request) => {
    const user = await requireUser(request, context);
    const devices = await context.repository.listDevicesForUser(user.id);

    return {
      devices: devices.map(toPublicDevice),
    };
  });
}

export function toPublicDevice(device: {
  id: string;
  deviceName: string;
  platform: PlatformDevicePlatform;
  clientVersion: string;
  devicePublicId: string;
}) {
  return {
    id: device.id,
    deviceName: device.deviceName,
    platform: device.platform,
    clientVersion: device.clientVersion,
    devicePublicId: device.devicePublicId,
  };
}

function readText(input: unknown, message: string): string {
  if (typeof input !== "string" || !input.trim()) {
    throw new PlatformApiError(400, "invalid_request", message);
  }

  return input.trim();
}

function readPlatform(input: unknown): PlatformDevicePlatform {
  if (input === "windows" || input === "macos" || input === "linux") {
    return input;
  }

  throw new PlatformApiError(400, "invalid_request", "设备平台不正确");
}
