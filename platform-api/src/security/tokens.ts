import { createHmac, timingSafeEqual } from "node:crypto";
import type { PlatformRole } from "../../../shared/platformProtocol.js";

export interface TokenClaims {
  userId: string;
  role: PlatformRole;
  email: string;
}

interface TokenPayload extends TokenClaims {
  iat: number;
}

export function signAccessToken(
  input: TokenClaims,
  secret: string,
  now = new Date(),
): string {
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const payload = encodeJson({
    ...input,
    iat: Math.floor(now.getTime() / 1000),
  } satisfies TokenPayload);
  const signature = sign(`${header}.${payload}`, secret);

  return `${header}.${payload}.${signature}`;
}

export function verifyAccessToken(
  token: string,
  secret: string,
): TokenClaims | null {
  const [header, payload, signature, extra] = token.split(".");
  if (!header || !payload || !signature || extra !== undefined) {
    return null;
  }

  const expectedSignature = sign(`${header}.${payload}`, secret);
  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<TokenPayload>;

    if (
      typeof decoded.userId !== "string" ||
      typeof decoded.email !== "string" ||
      (decoded.role !== "user" && decoded.role !== "admin")
    ) {
      return null;
    }

    return {
      userId: decoded.userId,
      role: decoded.role,
      email: decoded.email,
    };
  } catch {
    return null;
  }
}

function encodeJson(input: unknown): string {
  return Buffer.from(JSON.stringify(input)).toString("base64url");
}

function sign(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.byteLength !== rightBuffer.byteLength) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
