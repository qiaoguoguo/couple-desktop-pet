import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  AcceptPairCodeRequest,
  CreatePairCodeRequest,
  PairCodeStatusRequest,
  UnpairRequest,
} from "../../shared/syncProtocol.js";
import type { PairSparkRequest } from "../../shared/sparkProtocol.js";
import {
  validateProfileUpdate,
  type DeviceProfileV1,
  type ProfileUpdateV1,
} from "../../shared/profileProtocol.js";
import type {
  PairWeatherEntry,
  PairWeatherResponse,
  WeatherSnapshotV1,
  WeatherUnavailableReason,
} from "../../shared/weatherProtocol.js";
import { RelayError } from "./errors.js";
import { readJsonBody, writeError, writeJson } from "./httpJson.js";
import type { ProfileEventHub } from "./profileEvents.js";
import { FixedWindowRateLimiter } from "./requestRateLimiter.js";
import type { RelayRepository } from "./repository.js";
import type { SparkRepository } from "./spark/sparkRepository.js";
import { WeatherProviderError } from "./weather/weatherProvider.js";
import type { WeatherService } from "./weather/weatherService.js";

export interface PairingApiDependencies {
  weatherService: WeatherService;
  rateLimiter: FixedWindowRateLimiter;
  profileEvents: ProfileEventHub;
  weatherConfigured: boolean;
  sparkRepository: SparkRepository;
}

export function createRelayRequestHandler(
  repository: RelayRepository,
  dependencies: PairingApiDependencies,
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    void handleRequest(repository, dependencies, request, response);
  };
}

async function handleRequest(
  repository: RelayRepository,
  dependencies: PairingApiDependencies,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (request.method === "OPTIONS") {
      writeOptions(response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      writeJson(response, 200, {
        ok: true,
        weatherConfigured: dependencies.weatherConfigured,
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/locations/search") {
      const body = readLocationSearchRequest(await readBodyOrThrow(request));
      consumeRateLimit(
        dependencies.rateLimiter,
        `locations:ip:${request.socket.remoteAddress ?? "unknown"}`,
        10,
        60_000,
      );
      repository.ensureDeviceIdentity(body);
      consumeRateLimit(
        dependencies.rateLimiter,
        `locations:device:${body.deviceId}`,
        10,
        60_000,
      );

      try {
        const locations = await dependencies.weatherService.searchLocations(body.query);
        writeJson(response, 200, { locations: locations.slice(0, 5) });
      } catch (error) {
        throw mapWeatherRouteError(error);
      }
      return;
    }

    if (request.method === "PUT" && url.pathname === "/devices/profile") {
      const body = readSaveProfileRequest(await readBodyOrThrow(request));
      repository.ensureDeviceIdentity(body);
      consumeRateLimit(
        dependencies.rateLimiter,
        `profiles:device:${body.deviceId}`,
        10,
        60 * 60_000,
      );

      const profile = repository.saveProfile(body);
      dependencies.profileEvents.publish({
        deviceId: body.deviceId,
        profile,
        changedAt: profile.updatedAt,
      });
      writeJson(response, 200, { profile });
      return;
    }

    if (request.method === "POST" && url.pathname === "/pairs/weather") {
      const body = readPairWeatherRequest(await readBodyOrThrow(request));
      consumeRateLimit(
        dependencies.rateLimiter,
        `weather:ip:${request.socket.remoteAddress ?? "unknown"}`,
        30,
        60_000,
      );
      const profiles = repository.getPairProfiles(body);
      consumeRateLimit(
        dependencies.rateLimiter,
        `weather:device:${body.deviceId}`,
        30,
        60_000,
      );

      const selfProfile = readPairProfileOrThrow(profiles.selfProfile);
      const peerProfile = readPairProfileOrThrow(profiles.peerProfile);
      const [selfWeather, peerWeather] = await Promise.allSettled([
        getProfileWeather(dependencies.weatherService, selfProfile),
        getProfileWeather(dependencies.weatherService, peerProfile),
      ]);
      const result: PairWeatherResponse = {
        self: toWeatherEntry(selfProfile, selfWeather),
        peer: toWeatherEntry(peerProfile, peerWeather),
      };
      writeJson(response, 200, result);
      return;
    }

    if (
      request.method === "POST" &&
      (url.pathname === "/pairs/spark/snapshot" ||
        url.pathname === "/pairs/spark/leaderboard")
    ) {
      const body = readPairSparkRequest(await readBodyOrThrow(request));
      const routeKey = url.pathname.endsWith("/snapshot")
        ? "spark:snapshot"
        : "spark:leaderboard";
      consumeRateLimit(
        dependencies.rateLimiter,
        `${routeKey}:ip:${request.socket.remoteAddress ?? "unknown"}`,
        30,
        60_000,
      );
      repository.authenticateDeviceForPair(body);
      consumeRateLimit(
        dependencies.rateLimiter,
        `${routeKey}:device:${body.deviceId}`,
        30,
        60_000,
      );

      const result = url.pathname.endsWith("/snapshot")
        ? dependencies.sparkRepository.getSnapshot(body.pairId)
        : dependencies.sparkRepository.getLeaderboard(body.pairId, body.deviceId);
      writeJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && url.pathname === "/pair-codes") {
      const body = readCreatePairCodeRequest(await readBodyOrThrow(request));
      writeJson(response, 200, repository.createPairCode(body));
      return;
    }

    if (request.method === "POST" && url.pathname === "/pair-codes/status") {
      const body = readPairCodeStatusRequest(await readBodyOrThrow(request));
      writeJson(response, 200, repository.getPairCodeStatus(body));
      return;
    }

    if (request.method === "POST" && url.pathname === "/pairs/accept") {
      const body = readAcceptPairCodeRequest(await readBodyOrThrow(request));
      writeJson(response, 200, repository.acceptPairCode(body));
      return;
    }

    if (request.method === "POST" && url.pathname === "/pairs/unpair") {
      const body = readUnpairRequest(await readBodyOrThrow(request));
      writeJson(response, 200, repository.unpair(body));
      return;
    }

    writeJson(response, 404, {
      error: { code: "invalid_request", message: "Route not found" },
    });
  } catch (error) {
    writeError(response, error);
  }
}

function writeOptions(response: ServerResponse): void {
  response.statusCode = 204;
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,POST,PUT,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
  response.end();
}

function readLocationSearchRequest(input: unknown): {
  deviceId: string;
  deviceSecret: string;
  query: string;
} {
  const record = readObjectBody(input);
  const query = readRequiredString(record.query, "query");
  const queryLength = Array.from(query).length;
  if (queryLength < 2 || queryLength > 80) {
    throw new RelayError(
      "invalid_request",
      400,
      "query must be between 2 and 80 characters",
    );
  }

  return {
    deviceId: readRequiredString(record.deviceId, "deviceId"),
    deviceSecret: readRequiredString(record.deviceSecret, "deviceSecret"),
    query,
  };
}

function readSaveProfileRequest(input: unknown): {
  deviceId: string;
  deviceSecret: string;
  profile: ProfileUpdateV1;
} {
  const record = readObjectBody(input);
  const profile = validateProfileUpdate(record.profile);
  if (!profile.ok) {
    throw new RelayError("invalid_request", 400, profile.message);
  }

  return {
    deviceId: readRequiredString(record.deviceId, "deviceId"),
    deviceSecret: readRequiredString(record.deviceSecret, "deviceSecret"),
    profile: profile.profile,
  };
}

function readPairWeatherRequest(input: unknown): {
  deviceId: string;
  deviceSecret: string;
  pairId: string;
} {
  const record = readObjectBody(input);
  return {
    deviceId: readRequiredString(record.deviceId, "deviceId"),
    deviceSecret: readRequiredString(record.deviceSecret, "deviceSecret"),
    pairId: readRequiredString(record.pairId, "pairId"),
  };
}

function readPairSparkRequest(input: unknown): PairSparkRequest {
  const record = readObjectBody(input);
  return {
    deviceId: readRequiredString(record.deviceId, "deviceId"),
    deviceSecret: readRequiredString(record.deviceSecret, "deviceSecret"),
    pairId: readRequiredString(record.pairId, "pairId"),
  };
}

function readObjectBody(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new RelayError("invalid_request", 400, "Request body must be an object");
  }
  return input;
}

function consumeRateLimit(
  limiter: FixedWindowRateLimiter,
  key: string,
  limit: number,
  windowMs: number,
): void {
  if (!limiter.consume(key, limit, windowMs).allowed) {
    throw new RelayError("rate_limited", 429, "Too many requests");
  }
}

function mapWeatherRouteError(error: unknown): RelayError {
  if (!(error instanceof WeatherProviderError)) {
    return new RelayError("provider_unavailable", 503, "Weather provider is unavailable");
  }

  switch (error.kind) {
    case "not-configured":
      return new RelayError(
        "weather_not_configured",
        503,
        "Weather service is not configured",
      );
    case "quota-exhausted":
      return new RelayError(
        "quota_exhausted",
        503,
        "Weather provider quota is exhausted",
      );
    case "unavailable":
    case "invalid-response":
      return new RelayError(
        "provider_unavailable",
        503,
        "Weather provider is unavailable",
      );
  }
}

function readPairProfileOrThrow(profile: DeviceProfileV1 | null): DeviceProfileV1 {
  if (profile === null) {
    throw new RelayError("profile_incomplete", 409, "Pair profile is incomplete");
  }
  return profile;
}

async function getProfileWeather(
  weatherService: WeatherService,
  profile: DeviceProfileV1,
): Promise<WeatherSnapshotV1> {
  if (profile.city === null) {
    throw new RelayError("profile_incomplete", 409, "Profile city is not configured");
  }
  return weatherService.getWeather(profile.city);
}

function toWeatherEntry(
  profile: DeviceProfileV1,
  result: PromiseSettledResult<WeatherSnapshotV1>,
): PairWeatherEntry {
  if (result.status === "fulfilled") {
    return {
      status: "ready",
      profile,
      weather: result.value,
    };
  }

  return {
    status: "unavailable",
    profile,
    reason: weatherUnavailableReason(result.reason),
  };
}

function weatherUnavailableReason(error: unknown): WeatherUnavailableReason {
  if (error instanceof RelayError && error.code === "profile_incomplete") {
    return "profile_incomplete";
  }
  if (!(error instanceof WeatherProviderError)) {
    return "provider_unavailable";
  }

  switch (error.kind) {
    case "not-configured":
      return "weather_not_configured";
    case "quota-exhausted":
      return "quota_exhausted";
    case "unavailable":
    case "invalid-response":
      return "provider_unavailable";
  }
}

async function readBodyOrThrow(request: IncomingMessage): Promise<unknown> {
  try {
    return await readJsonBody(request);
  } catch (error) {
    if (error instanceof RelayError) {
      throw error;
    }
    throw new RelayError("invalid_request", 400, "Request body must be valid JSON");
  }
}

function readCreatePairCodeRequest(input: unknown): CreatePairCodeRequest {
  if (!isRecord(input)) {
    throw new RelayError("invalid_request", 400, "Request body must be an object");
  }

  const profile = readOptionalProfile(input.profile);
  return {
    deviceId: readRequiredString(input.deviceId, "deviceId"),
    deviceSecret: readRequiredString(input.deviceSecret, "deviceSecret"),
    displayName: readRequiredString(input.displayName, "displayName"),
    ...(profile === undefined ? {} : { profile }),
  };
}

function readAcceptPairCodeRequest(input: unknown): AcceptPairCodeRequest {
  if (!isRecord(input)) {
    throw new RelayError("invalid_request", 400, "Request body must be an object");
  }

  return {
    ...readCreatePairCodeRequest(input),
    code: readRequiredString(input.code, "code"),
  };
}

function readPairCodeStatusRequest(input: unknown): PairCodeStatusRequest {
  if (!isRecord(input)) {
    throw new RelayError("invalid_request", 400, "Request body must be an object");
  }

  return {
    deviceId: readRequiredString(input.deviceId, "deviceId"),
    deviceSecret: readRequiredString(input.deviceSecret, "deviceSecret"),
    code: readRequiredString(input.code, "code"),
  };
}

function readUnpairRequest(input: unknown): UnpairRequest {
  if (!isRecord(input)) {
    throw new RelayError("invalid_request", 400, "Request body must be an object");
  }

  return {
    deviceId: readRequiredString(input.deviceId, "deviceId"),
    deviceSecret: readRequiredString(input.deviceSecret, "deviceSecret"),
    pairId: readRequiredString(input.pairId, "pairId"),
  };
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RelayError("invalid_request", 400, `${fieldName} must be a non-empty string`);
  }

  return value.trim();
}

function readOptionalProfile(value: unknown): ProfileUpdateV1 | undefined {
  if (value === undefined) {
    return undefined;
  }

  const profile = validateProfileUpdate(value);
  if (!profile.ok) {
    throw new RelayError("invalid_request", 400, profile.message);
  }

  return profile.profile;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
