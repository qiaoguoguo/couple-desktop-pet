import type { IncomingMessage, ServerResponse } from "node:http";
import { RelayError } from "./errors.js";

export const MAX_JSON_BODY_BYTES = 64 * 1024;

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const contentLength = Number(request.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    request.resume();
    throw bodyTooLarge();
  }

  let body: Buffer | null = null;
  let bytesRead = 0;
  for await (const chunk of request) {
    const source = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (bytesRead + source.length > MAX_JSON_BODY_BYTES) {
      request.resume();
      throw bodyTooLarge();
    }

    body ??= Buffer.allocUnsafe(MAX_JSON_BODY_BYTES);
    source.copy(body, bytesRead);
    bytesRead += source.length;
  }

  if (body === null) {
    return {};
  }

  return JSON.parse(body.toString("utf8", 0, bytesRead)) as unknown;
}

function bodyTooLarge(): RelayError {
  return new RelayError(
    "invalid_request",
    413,
    `Request body exceeds ${MAX_JSON_BODY_BYTES} bytes`,
  );
}

export function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
  response.end(JSON.stringify(body));
}

export function writeEmpty(response: ServerResponse, status: number): void {
  response.statusCode = status;
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
  response.end();
}

export function writeError(response: ServerResponse, error: unknown): void {
  if (error instanceof RelayError) {
    writeJson(response, error.status, {
      error: { code: error.code, message: error.message },
    });
    return;
  }

  writeJson(response, 500, {
    error: { code: "relay_unavailable", message: "Relay service error" },
  });
}
