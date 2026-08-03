import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  validateInvitationCode,
  validatePlatformEmail,
  validatePlatformPassword,
} from "../../../shared/platformProtocol.js";
import { PlatformApiError } from "../errors.js";
import {
  PlatformRepositoryError,
  type PlatformInvitation,
  type PlatformRepository,
  type PlatformUser,
} from "../repository.js";
import { hashPassword, verifyPassword } from "../security/passwords.js";
import {
  signAccessToken,
  verifyAccessToken,
  type TokenClaims,
} from "../security/tokens.js";

export interface RouteContext {
  repository: PlatformRepository;
  jwtSecret: string;
  releaseStoragePath: string;
}

export async function registerAuthRoutes(
  server: FastifyInstance,
  context: RouteContext,
) {
  server.post("/auth/invitations/verify", async (request) => {
    const body = readBody(request);
    const code = validateInvitationCode(body.code);
    if (!code.ok) {
      throw new PlatformApiError(400, "invalid_request", code.message);
    }

    const invitation = await context.repository.findInvitationByCode(code.code);
    if (!invitation || !isInvitationUsable(invitation)) {
      throw new PlatformApiError(404, "not_found", "邀请码不存在或不可用");
    }

    return {
      ok: true,
      invitation: {
        code: invitation.code,
        expiresAt: invitation.expiresAt?.toISOString() ?? null,
      },
    };
  });

  server.post("/auth/register", async (request) => {
    const body = readBody(request);
    const invitationCode = validateInvitationCode(body.invitationCode);
    const email = validatePlatformEmail(body.email);
    const password = validatePlatformPassword(body.password);
    const displayName =
      typeof body.displayName === "string" && body.displayName.trim()
        ? body.displayName.trim()
        : email.ok
          ? email.email.split("@")[0] ?? "内测用户"
          : "内测用户";

    if (!invitationCode.ok) {
      throw new PlatformApiError(400, "invalid_request", invitationCode.message);
    }
    if (!email.ok) {
      throw new PlatformApiError(400, "invalid_request", email.message);
    }
    if (!password.ok) {
      throw new PlatformApiError(400, "invalid_request", password.message);
    }

    try {
      const user = await context.repository.registerUserWithInvitation({
        invitationCode: invitationCode.code,
        email: email.email,
        passwordHash: await hashPassword(password.password),
        displayName,
      });

      return createAuthResponse(user, context.jwtSecret);
    } catch (error) {
      throw mapRepositoryError(error);
    }
  });

  server.post("/auth/login", async (request) => {
    const body = readBody(request);
    const email = validatePlatformEmail(body.email);
    const password = validatePlatformPassword(body.password);

    if (!email.ok || !password.ok) {
      throw new PlatformApiError(401, "unauthorized", "邮箱或密码不正确");
    }

    const user = await context.repository.findUserByEmail(email.email);
    if (
      !user ||
      user.status !== "active" ||
      !(await verifyPassword(password.password, user.passwordHash))
    ) {
      throw new PlatformApiError(401, "unauthorized", "邮箱或密码不正确");
    }

    const updatedUser = await context.repository.markUserLoggedIn(user.id);
    return createAuthResponse(updatedUser, context.jwtSecret);
  });

  server.get("/me", async (request) => {
    const user = await requireUser(request, context);
    return { user: toPublicUser(user) };
  });
}

export async function requireUser(
  request: FastifyRequest,
  context: RouteContext,
): Promise<PlatformUser> {
  const claims = readTokenClaims(request, context.jwtSecret);
  const user = await context.repository.findUserById(claims.userId);

  if (!user || user.status !== "active") {
    throw new PlatformApiError(401, "unauthorized", "请先登录");
  }

  return user;
}

export async function requireAdmin(
  request: FastifyRequest,
  context: RouteContext,
): Promise<PlatformUser> {
  const user = await requireUser(request, context);

  if (user.role !== "admin") {
    throw new PlatformApiError(403, "forbidden", "需要管理员权限");
  }

  return user;
}

export function toPublicUser(user: PlatformUser) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}

export function readBody(request: FastifyRequest): Record<string, unknown> {
  return typeof request.body === "object" && request.body !== null
    ? (request.body as Record<string, unknown>)
    : {};
}

export function mapRepositoryError(error: unknown): PlatformApiError {
  if (error instanceof PlatformRepositoryError) {
    if (error.code === "email_exists") {
      return new PlatformApiError(409, "conflict", error.message);
    }
    if (error.code === "invitation_exists") {
      return new PlatformApiError(409, "conflict", error.message);
    }
    if (
      error.code === "invitation_not_found" ||
      error.code === "release_not_found" ||
      error.code === "user_not_found"
    ) {
      return new PlatformApiError(404, "not_found", error.message);
    }
    if (error.code === "invitation_unavailable") {
      return new PlatformApiError(400, "invalid_request", error.message);
    }
  }

  return error instanceof PlatformApiError
    ? error
    : new PlatformApiError(500, "internal_error", "服务暂时不可用");
}

function createAuthResponse(user: PlatformUser, jwtSecret: string) {
  return {
    accessToken: signAccessToken(
      { userId: user.id, role: user.role, email: user.email },
      jwtSecret,
    ),
    user: toPublicUser(user),
  };
}

function readTokenClaims(
  request: FastifyRequest,
  jwtSecret: string,
): TokenClaims {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    throw new PlatformApiError(401, "unauthorized", "请先登录");
  }

  const claims = verifyAccessToken(authorization.slice("Bearer ".length), jwtSecret);
  if (!claims) {
    throw new PlatformApiError(401, "unauthorized", "请先登录");
  }

  return claims;
}

function isInvitationUsable(invitation: PlatformInvitation): boolean {
  return (
    invitation.status === "unused" &&
    invitation.usedCount < invitation.maxUses &&
    (!invitation.expiresAt || invitation.expiresAt.getTime() > Date.now())
  );
}
