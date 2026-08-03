import type { IncomingMessage, ServerResponse } from "node:http";
import { RelayError } from "./errors.js";

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
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
