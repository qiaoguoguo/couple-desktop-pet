import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  AcceptPairCodeRequest,
  CreatePairCodeRequest,
  PairCodeStatusRequest,
  UnpairRequest,
} from "../../shared/syncProtocol.js";
import { RelayError } from "./errors.js";
import { readJsonBody, writeEmpty, writeError, writeJson } from "./httpJson.js";
import type { RelayRepository } from "./repository.js";

export function createRelayRequestHandler(
  repository: RelayRepository,
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    void handleRequest(repository, request, response);
  };
}

async function handleRequest(
  repository: RelayRepository,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (request.method === "OPTIONS") {
      writeEmpty(response, 204);
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      writeJson(response, 200, { ok: true });
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

async function readBodyOrThrow(request: IncomingMessage): Promise<unknown> {
  try {
    return await readJsonBody(request);
  } catch {
    throw new RelayError("invalid_request", 400, "Request body must be valid JSON");
  }
}

function readCreatePairCodeRequest(input: unknown): CreatePairCodeRequest {
  if (!isRecord(input)) {
    throw new RelayError("invalid_request", 400, "Request body must be an object");
  }

  return {
    deviceId: readRequiredString(input.deviceId, "deviceId"),
    deviceSecret: readRequiredString(input.deviceSecret, "deviceSecret"),
    displayName: readRequiredString(input.displayName, "displayName"),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
