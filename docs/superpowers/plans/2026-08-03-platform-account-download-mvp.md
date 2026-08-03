# Platform Account Download MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first internal-test platform for invitation-based email accounts, authenticated download access, device registration, and basic admin lists.

**Architecture:** Add two new workspace packages: `platform-api` for the account/download API and `platform-web` for the internal website/admin UI. Keep the existing `server` package as the local relay; do not merge platform account logic into it. Deploy through a separate Docker Compose project under `/opt/couple-pet-platform`.

**Tech Stack:** Node.js, TypeScript, Fastify, PostgreSQL, React, Vite, Docker Compose, Vitest.

## Global Constraints

- 用户交流和最终报告使用中文。
- 不修改现有 `.cdpet` 资源包格式。
- 不改现有 `server` relay 协议。
- 不停止、不替换、不复用 `/opt/qherp` 的现有容器、数据库或 MinIO。
- 平台一期部署目录固定为 `/opt/couple-pet-platform`。
- 无域名阶段只做内测访问，默认端口为 `19080` 和 `19081`。
- 新 PostgreSQL 不暴露公网端口，只在 Compose 内部网络访问。
- 一期不存储聊天消息原文。
- 一期只做邀请码 + 邮箱密码登录，不做手机号短信登录。
- 管理后台必须需要管理员身份。
- 密码必须存强 hash，不能存明文。
- 安装包下载第一版使用本地挂载目录，不接入对象存储。

---

## File Structure

- Modify `pnpm-workspace.yaml`: add `platform-api` and `platform-web`.
- Modify root `package.json`: add scripts for platform API/Web test, typecheck, build, and dev.
- Create `shared/platformProtocol.ts`: platform request/response constants and validation helpers shared by API and client tests.
- Create `platform-api/package.json`: API package scripts and dependencies.
- Create `platform-api/tsconfig.json`: strict TypeScript config.
- Create `platform-api/vitest.config.ts`: Node test config.
- Create `platform-api/src/config.ts`: environment parsing.
- Create `platform-api/src/server.ts`: Fastify app factory.
- Create `platform-api/src/index.ts`: runtime entry.
- Create `platform-api/src/errors.ts`: typed API errors.
- Create `platform-api/src/security/passwords.ts`: password hashing and verification.
- Create `platform-api/src/security/tokens.ts`: signed access token helpers.
- Create `platform-api/src/db/schema.sql`: PostgreSQL schema.
- Create `platform-api/src/db/database.ts`: PostgreSQL connection and schema initialization.
- Create `platform-api/src/repository.ts`: repository interface and PostgreSQL implementation.
- Create `platform-api/src/routes/authRoutes.ts`: invitation, register, login, and current-user endpoints.
- Create `platform-api/src/routes/deviceRoutes.ts`: device registration and listing endpoints.
- Create `platform-api/src/routes/releaseRoutes.ts`: release listing and download event endpoints.
- Create `platform-api/src/routes/adminRoutes.ts`: admin list/create endpoints.
- Create `platform-api/src/platformApi.test.ts`: route-level API tests.
- Create `platform-api/src/repository.test.ts`: repository behavior tests with isolated database setup.
- Create `platform-web/package.json`: web package scripts and dependencies.
- Create `platform-web/tsconfig.json`, `platform-web/vite.config.ts`, `platform-web/vitest.config.ts`.
- Create `platform-web/index.html`.
- Create `platform-web/src/main.tsx`.
- Create `platform-web/src/App.tsx`: website routes.
- Create `platform-web/src/apiClient.ts`: API client.
- Create `platform-web/src/sessionStore.ts`: token storage wrapper.
- Create `platform-web/src/App.test.tsx`: UI behavior tests.
- Create `platform-web/src/app.css`: internal-test website/admin styling.
- Create `deploy/couple-pet-platform/compose.yaml`: isolated deployment stack.
- Create `deploy/couple-pet-platform/.env.example`: deployment env template.
- Create `deploy/couple-pet-platform/README.md`: server deployment and rollback notes.
- Create `docs/manual-verification/platform-account-download-mvp.md`: manual verification checklist.

---

### Task 1: Workspace and Shared Platform Contract

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`
- Create: `shared/platformProtocol.ts`
- Create: `shared/platformProtocol.test.ts`

**Interfaces:**
- Produces:
  - `PLATFORM_EMAIL_MAX_LENGTH = 254`
  - `PLATFORM_PASSWORD_MIN_LENGTH = 8`
  - `INVITATION_CODE_MIN_LENGTH = 6`
  - `INVITATION_CODE_MAX_LENGTH = 32`
  - `type PlatformRole = "user" | "admin"`
  - `type PlatformDevicePlatform = "windows" | "macos" | "linux"`
  - `type PlatformReleaseChannel = "internal" | "stable"`
  - `validatePlatformEmail(input: unknown): { ok: true; email: string } | { ok: false; message: string }`
  - `validatePlatformPassword(input: unknown): { ok: true; password: string } | { ok: false; message: string }`
  - `validateInvitationCode(input: unknown): { ok: true; code: string } | { ok: false; message: string }`

- [ ] **Step 1: Write shared protocol tests**

Create `shared/platformProtocol.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  validateInvitationCode,
  validatePlatformEmail,
  validatePlatformPassword,
} from "./platformProtocol";

describe("platformProtocol", () => {
  it("normalizes valid email addresses", () => {
    expect(validatePlatformEmail(" Test@Example.COM ")).toEqual({
      ok: true,
      email: "test@example.com",
    });
  });

  it("rejects invalid email addresses", () => {
    expect(validatePlatformEmail("not-email")).toEqual({
      ok: false,
      message: "邮箱格式不正确",
    });
  });

  it("requires passwords with at least 8 characters", () => {
    expect(validatePlatformPassword("1234567")).toEqual({
      ok: false,
      message: "密码至少需要 8 位",
    });
    expect(validatePlatformPassword("12345678")).toEqual({
      ok: true,
      password: "12345678",
    });
  });

  it("normalizes invitation codes and rejects unsafe characters", () => {
    expect(validateInvitationCode(" abc-123 ")).toEqual({
      ok: true,
      code: "ABC-123",
    });
    expect(validateInvitationCode("../secret")).toEqual({
      ok: false,
      message: "邀请码格式不正确",
    });
  });
});
```

- [ ] **Step 2: Run red test**

Run: `pnpm vitest run shared/platformProtocol.test.ts`

Expected: FAIL because `shared/platformProtocol.ts` does not exist.

- [ ] **Step 3: Implement shared protocol**

Create `shared/platformProtocol.ts`:

```ts
export const PLATFORM_EMAIL_MAX_LENGTH = 254;
export const PLATFORM_PASSWORD_MIN_LENGTH = 8;
export const INVITATION_CODE_MIN_LENGTH = 6;
export const INVITATION_CODE_MAX_LENGTH = 32;

export type PlatformRole = "user" | "admin";
export type PlatformDevicePlatform = "windows" | "macos" | "linux";
export type PlatformReleaseChannel = "internal" | "stable";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

export type EmailValidation =
  | { ok: true; email: string }
  | { ok: false; message: string };

export type PasswordValidation =
  | { ok: true; password: string }
  | { ok: false; message: string };

export type InvitationCodeValidation =
  | { ok: true; code: string }
  | { ok: false; message: string };

export function validatePlatformEmail(input: unknown): EmailValidation {
  if (typeof input !== "string") {
    return { ok: false, message: "邮箱格式不正确" };
  }

  const email = input.trim().toLowerCase();
  if (
    email.length === 0 ||
    email.length > PLATFORM_EMAIL_MAX_LENGTH ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return { ok: false, message: "邮箱格式不正确" };
  }

  return { ok: true, email };
}

export function validatePlatformPassword(input: unknown): PasswordValidation {
  if (typeof input !== "string" || input.length < PLATFORM_PASSWORD_MIN_LENGTH) {
    return { ok: false, message: "密码至少需要 8 位" };
  }

  return { ok: true, password: input };
}

export function validateInvitationCode(input: unknown): InvitationCodeValidation {
  if (typeof input !== "string") {
    return { ok: false, message: "邀请码格式不正确" };
  }

  const code = input.trim().toUpperCase();
  if (
    code.length < INVITATION_CODE_MIN_LENGTH ||
    code.length > INVITATION_CODE_MAX_LENGTH ||
    !/^[A-Z0-9-]+$/.test(code)
  ) {
    return { ok: false, message: "邀请码格式不正确" };
  }

  return { ok: true, code };
}
```

- [ ] **Step 4: Update workspace scripts**

Modify `pnpm-workspace.yaml`:

```yaml
packages:
  - "."
  - "server"
  - "platform-api"
  - "platform-web"
```

Modify root `package.json` scripts:

```json
{
  "platform-api:dev": "pnpm --dir platform-api dev",
  "platform-api:test": "pnpm --dir platform-api test",
  "platform-api:typecheck": "pnpm --dir platform-api typecheck",
  "platform-api:build": "pnpm --dir platform-api build",
  "platform-web:dev": "pnpm --dir platform-web dev",
  "platform-web:test": "pnpm --dir platform-web test",
  "platform-web:typecheck": "pnpm --dir platform-web typecheck",
  "platform-web:build": "pnpm --dir platform-web build"
}
```

- [ ] **Step 5: Run shared tests**

Run: `pnpm vitest run shared/platformProtocol.test.ts`

Expected: PASS.

---

### Task 2: Platform API Scaffold and Security Helpers

**Files:**
- Create: `platform-api/package.json`
- Create: `platform-api/tsconfig.json`
- Create: `platform-api/vitest.config.ts`
- Create: `platform-api/src/config.ts`
- Create: `platform-api/src/errors.ts`
- Create: `platform-api/src/security/passwords.ts`
- Create: `platform-api/src/security/tokens.ts`
- Create: `platform-api/src/security/passwords.test.ts`
- Create: `platform-api/src/security/tokens.test.ts`
- Create: `platform-api/src/server.ts`
- Create: `platform-api/src/index.ts`
- Create: `platform-api/src/health.test.ts`

**Interfaces:**
- Produces:
  - `readPlatformConfig(env?: NodeJS.ProcessEnv): PlatformConfig`
  - `hashPassword(password: string): Promise<string>`
  - `verifyPassword(password: string, hash: string): Promise<boolean>`
  - `signAccessToken(input: TokenClaims, secret: string, now?: Date): string`
  - `verifyAccessToken(token: string, secret: string): TokenClaims | null`
  - `createPlatformServer(options: PlatformServerOptions): Promise<FastifyInstance>`

- [ ] **Step 1: Add API package files**

Create package scripts with these dependencies:

```json
{
  "name": "couple-pet-platform-api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@fastify/cors": "^11.0.0",
    "@node-rs/argon2": "^2.0.2",
    "fastify": "^5.0.0",
    "jose": "^6.0.0",
    "nanoid": "^5.0.0",
    "pg": "^8.13.0"
  },
  "devDependencies": {
    "@types/node": "^24.1.0",
    "@types/pg": "^8.11.0",
    "tsx": "^4.20.3",
    "typescript": "^7.0.2",
    "vitest": "^4.1.10"
  }
}
```

- [ ] **Step 2: Write security and health tests**

Create tests that verify:

```ts
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./passwords";

describe("passwords", () => {
  it("hashes and verifies passwords without storing plain text", async () => {
    const hash = await hashPassword("12345678");

    expect(hash).not.toContain("12345678");
    expect(await verifyPassword("12345678", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });
});
```

```ts
import { describe, expect, it } from "vitest";
import { signAccessToken, verifyAccessToken } from "./tokens";

describe("tokens", () => {
  it("round-trips signed access token claims", () => {
    const token = signAccessToken(
      { userId: "usr_1", role: "admin", email: "a@example.com" },
      "test-secret",
      new Date("2026-08-03T12:00:00.000Z"),
    );

    expect(verifyAccessToken(token, "test-secret")).toEqual({
      userId: "usr_1",
      role: "admin",
      email: "a@example.com",
    });
    expect(verifyAccessToken(token, "wrong-secret")).toBeNull();
  });
});
```

Create `health.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { createPlatformServer } from "./server";

describe("platform health", () => {
  const servers: Array<{ close(): Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(servers.map((server) => server.close()));
    servers.length = 0;
  });

  it("returns ok from health endpoint", async () => {
    const server = await createPlatformServer({
      jwtSecret: "test-secret",
      repository: createNoopRepository(),
    });
    servers.push(server);

    const response = await server.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, service: "platform-api" });
  });
});
```

Use a minimal `createNoopRepository` test helper in the test file until Task 3 adds the full repository.

- [ ] **Step 3: Run red tests**

Run:

```bash
pnpm --dir platform-api test
```

Expected: FAIL until implementation exists.

- [ ] **Step 4: Implement config, security, and server shell**

Key behavior:

- `readPlatformConfig` reads `PLATFORM_API_HOST`, `PLATFORM_API_PORT`, `PLATFORM_DATABASE_URL`, `PLATFORM_JWT_SECRET`, and release storage path.
- Missing `PLATFORM_JWT_SECRET` in production throws a clear error.
- `createPlatformServer` registers CORS for internal test use and `GET /health`.
- No database connection happens in `createPlatformServer` directly; pass repository through options for testability.

- [ ] **Step 5: Run API scaffold tests**

Run:

```bash
pnpm --dir platform-api test
pnpm --dir platform-api typecheck
```

Expected: PASS.

---

### Task 3: Database Schema and Platform Repository

**Files:**
- Create: `platform-api/src/db/schema.sql`
- Create: `platform-api/src/db/database.ts`
- Create: `platform-api/src/repository.ts`
- Create: `platform-api/src/repository.test.ts`

**Interfaces:**
- Produces:
  - `initializePlatformDatabase(pool: Pool): Promise<void>`
  - `createPgPlatformRepository(pool: Pool): PlatformRepository`
  - `interface PlatformRepository`
  - repository methods for invitations, users, devices, releases, and download events.

- [ ] **Step 1: Define SQL schema**

`schema.sql` must create these tables:

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL,
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('unused', 'used', 'disabled')),
  max_uses INTEGER NOT NULL CHECK (max_uses > 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('windows', 'macos', 'linux')),
  client_version TEXT NOT NULL,
  device_public_id TEXT NOT NULL UNIQUE,
  device_secret_hash TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS releases (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('windows', 'macos', 'linux')),
  channel TEXT NOT NULL CHECK (channel IN ('internal', 'stable')),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size >= 0),
  sha256 TEXT NOT NULL,
  release_notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS download_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  release_id TEXT NOT NULL REFERENCES releases(id),
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS interaction_events (
  id TEXT PRIMARY KEY,
  source_user_id TEXT NOT NULL REFERENCES users(id),
  target_user_id TEXT NOT NULL REFERENCES users(id),
  pair_id TEXT,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL
);
```

- [ ] **Step 2: Write repository tests**

Cover these cases:

- Create an admin user.
- Create an invitation and verify it is valid.
- Register a user consumes a one-use invitation.
- Reusing the same one-use invitation fails.
- Login updates `last_login_at`.
- Registering a device returns `device_public_id` and secret hash is not plain text.
- Listing releases returns only published releases for the requested platform.
- Recording download events stores user, release, IP, and user agent.

Use an isolated PostgreSQL test database. If local PostgreSQL is unavailable, use a repository test harness that starts the `postgres:18-alpine` container through Docker for the test suite and drops the database afterward. Keep this harness inside `platform-api/src/testDatabase.ts`.

- [ ] **Step 3: Run repository red tests**

Run:

```bash
pnpm --dir platform-api test src/repository.test.ts
```

Expected: FAIL until repository implementation exists.

- [ ] **Step 4: Implement repository**

Implementation requirements:

- Use transactions for invitation consumption + user creation.
- Use `nanoid` IDs with prefixes such as `usr_`, `inv_`, `dev_`, `rel_`, `dle_`.
- Normalize emails before lookup.
- Store device secret hash, not plain secret.
- Do not log passwords, hashes, device secrets, or tokens.
- Use UTC timestamps from injected `now` function for tests.

- [ ] **Step 5: Run repository tests**

Run:

```bash
pnpm --dir platform-api test src/repository.test.ts
pnpm --dir platform-api typecheck
```

Expected: PASS.

---

### Task 4: Auth, Device, Release, and Admin API Routes

**Files:**
- Create: `platform-api/src/routes/authRoutes.ts`
- Create: `platform-api/src/routes/deviceRoutes.ts`
- Create: `platform-api/src/routes/releaseRoutes.ts`
- Create: `platform-api/src/routes/adminRoutes.ts`
- Create: `platform-api/src/platformApi.test.ts`
- Modify: `platform-api/src/server.ts`

**Interfaces:**
- Produces:
  - `POST /auth/invitations/verify`
  - `POST /auth/register`
  - `POST /auth/login`
  - `GET /me`
  - `POST /devices`
  - `GET /devices`
  - `GET /releases`
  - `POST /downloads`
  - `GET /admin/users`
  - `GET /admin/invitations`
  - `POST /admin/invitations`
  - `GET /admin/devices`
  - `GET /admin/releases`
  - `POST /admin/releases`
  - `GET /admin/downloads`

- [ ] **Step 1: Write API route tests**

Route tests must verify:

- Invalid invitation code returns 404 or 400 with Chinese message.
- Register requires valid invitation, email, and password.
- Register returns `{ accessToken, user }` and does not return password hash.
- Login returns token for valid credentials and rejects wrong password.
- `GET /me` requires Bearer token.
- `POST /devices` requires Bearer token and returns generated `devicePublicId` and one-time `deviceSecret`.
- `GET /releases?platform=windows` requires login and returns published Windows releases.
- `POST /downloads` requires login and creates a download event.
- Admin endpoints reject normal user tokens.
- Admin can list users, invitations, devices, releases, and downloads.

- [ ] **Step 2: Run route red tests**

Run:

```bash
pnpm --dir platform-api test src/platformApi.test.ts
```

Expected: FAIL until routes exist.

- [ ] **Step 3: Implement routes**

Implementation requirements:

- Add a small auth pre-handler that verifies Bearer token.
- Add an admin pre-handler that checks `role === "admin"`.
- API errors use stable JSON shape:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "中文错误信息"
  }
}
```

- Do not expose password hashes, device secret hashes, or token secrets.
- On `POST /downloads`, record `request.ip` and `user-agent`.

- [ ] **Step 4: Run route tests and API typecheck**

Run:

```bash
pnpm --dir platform-api test
pnpm --dir platform-api typecheck
```

Expected: PASS.

---

### Task 5: Platform Web Internal Test UI

**Files:**
- Create: `platform-web/package.json`
- Create: `platform-web/tsconfig.json`
- Create: `platform-web/vite.config.ts`
- Create: `platform-web/vitest.config.ts`
- Create: `platform-web/index.html`
- Create: `platform-web/src/main.tsx`
- Create: `platform-web/src/apiClient.ts`
- Create: `platform-web/src/sessionStore.ts`
- Create: `platform-web/src/App.tsx`
- Create: `platform-web/src/App.test.tsx`
- Create: `platform-web/src/app.css`

**Interfaces:**
- Produces:
  - User routes: `/`, `/invite`, `/register`, `/login`, `/download`
  - Admin route: `/admin`
  - `PlatformApiClient`
  - `SessionStore`

- [ ] **Step 1: Create web package**

Use React + Vite. Root page style should be utilitarian internal-test UI, not a marketing landing page.

Dependencies:

```json
{
  "dependencies": {
    "@vitejs/plugin-react": "^6.0.5",
    "vite": "^8.2.0",
    "typescript": "^7.0.2",
    "react": "^19.2.8",
    "react-dom": "^19.2.8"
  },
  "devDependencies": {
    "@testing-library/react": "^16.3.2",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.4",
    "jsdom": "^30.0.1",
    "vitest": "^4.1.10"
  }
}
```

- [ ] **Step 2: Write UI tests**

Cover:

- Home page shows internal test entry and download/login path.
- Invitation form calls verify API and moves to register.
- Register stores token and shows download page.
- Login stores token and shows download page.
- Download page lists Windows release and records download before opening URL.
- Admin page shows users, invitations, devices, releases, and download records for admin token.
- Non-admin user sees admin access denied.

- [ ] **Step 3: Implement API client**

`apiClient.ts` should:

- Read API base URL from `VITE_PLATFORM_API_BASE_URL`, default `/api`.
- Use `fetch`.
- Attach Bearer token when available.
- Throw readable errors using API error message.

- [ ] **Step 4: Implement UI**

UI requirements:

- Chinese text.
- Dense but readable internal-test layout.
- No oversized hero.
- Download page clearly shows version, platform, file size, sha256, release notes.
- Admin tables should fit inside desktop and small browser widths with horizontal overflow when needed.
- Do not store password in state after form submit succeeds.

- [ ] **Step 5: Run web tests and build**

Run:

```bash
pnpm --dir platform-web test
pnpm --dir platform-web typecheck
pnpm --dir platform-web build
```

Expected: PASS.

---

### Task 6: Docker Compose Deployment Assets

**Files:**
- Create: `platform-api/Dockerfile`
- Create: `platform-web/Dockerfile`
- Create: `platform-web/nginx.conf`
- Create: `deploy/couple-pet-platform/compose.yaml`
- Create: `deploy/couple-pet-platform/.env.example`
- Create: `deploy/couple-pet-platform/README.md`
- Create: `docs/manual-verification/platform-account-download-mvp.md`

**Interfaces:**
- Produces:
  - Compose project with `postgres`, `platform-api`, and `platform-web`.
  - External ports `19080` and `19081`.
  - Internal database only.

- [ ] **Step 1: Write deployment config tests**

Create a test such as `deploy/couple-pet-platform/composeConfig.test.ts` or a root-level Vitest test that parses compose YAML and verifies:

- It does not expose port `5432`.
- It exposes `19080:80` for web.
- It exposes `19081:3000` for API.
- Compose services include `postgres`, `platform-api`, and `platform-web`.
- The compose file does not reference `/opt/qherp`.

- [ ] **Step 2: Implement Dockerfiles**

Requirements:

- API Dockerfile runs `pnpm --dir platform-api build` and starts `node dist/index.js`.
- Web Dockerfile builds static assets and serves them with nginx.
- Web nginx proxies `/api/` to `platform-api:3000/`.
- API still listens on `0.0.0.0:3000` inside container.

- [ ] **Step 3: Implement compose**

`compose.yaml` must:

- Use project-local named volumes for Postgres and release storage.
- Set `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` from env.
- Pass `PLATFORM_DATABASE_URL` to API using the internal service name.
- Mount release storage into API read path.
- Expose only:

```yaml
ports:
  - "19080:80"
  - "19081:3000"
```

- [ ] **Step 4: Write deployment README**

Document:

- Copy repo to `/opt/couple-pet-platform`.
- Create `.env` from `.env.example`.
- Set `PLATFORM_JWT_SECRET`.
- Start stack:

```bash
docker compose -p couple-pet-platform -f deploy/couple-pet-platform/compose.yaml up -d --build
```

- Smoke check:

```bash
curl http://159.75.175.47:19081/health
```

- Stop stack:

```bash
docker compose -p couple-pet-platform -f deploy/couple-pet-platform/compose.yaml down
```

- [ ] **Step 5: Run deployment config tests**

Run:

```bash
pnpm test
pnpm platform-api:build
pnpm platform-web:build
```

Expected: PASS.

---

### Task 7: Seed Admin, Demo Release, and Manual Verification

**Files:**
- Modify: `platform-api/src/index.ts`
- Modify: `platform-api/src/repository.ts`
- Create: `platform-api/src/bootstrap.ts`
- Create: `platform-api/src/bootstrap.test.ts`
- Modify: `docs/manual-verification/platform-account-download-mvp.md`

**Interfaces:**
- Produces:
  - Startup bootstrap that creates the first admin from env when no admin exists.
  - Optional demo release metadata from env.

- [ ] **Step 1: Write bootstrap tests**

Cover:

- If no admin exists and env contains `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD`, bootstrap creates admin.
- If an admin already exists, bootstrap does not overwrite password or email.
- If `PLATFORM_DEMO_WINDOWS_EXE_PATH` points to a file and no release exists for that version, bootstrap inserts a release row with sha256 and file size.

- [ ] **Step 2: Implement bootstrap**

Requirements:

- Bootstrap runs once during API startup after schema initialization.
- Admin password is hashed.
- Demo release path must stay under configured release storage directory.
- Missing demo release file logs a clear warning and continues startup.

- [ ] **Step 3: Update manual verification**

Manual checks:

1. Start API/Web locally.
2. Create or bootstrap admin.
3. Create invitation from admin page.
4. Register user with invitation.
5. Login user.
6. Register device through API.
7. Add or bootstrap a Windows release.
8. Download page shows the release.
9. Click download and confirm download event appears in admin page.
10. Confirm normal user cannot open admin page.

- [ ] **Step 4: Run full verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm platform-api:test
pnpm platform-api:typecheck
pnpm platform-api:build
pnpm platform-web:test
pnpm platform-web:typecheck
pnpm platform-web:build
```

Expected: PASS.

---

### Task 8: Optional Server Smoke Deploy

**Files:**
- No repo file changes unless deployment docs need correction.

**Interfaces:**
- Produces:
  - Running internal-test stack on `159.75.175.47` only after local verification passes and the user confirms deployment.

- [ ] **Step 1: Ask for deployment confirmation**

Before touching the server, report:

- Local verification results.
- Planned remote path `/opt/couple-pet-platform`.
- Planned exposed ports `19080` and `19081`.
- Existing services that will not be touched.

- [ ] **Step 2: Copy files to server**

Use SSH key `~/.ssh/couple_pet_deploy_ed25519`.

Do not copy `node_modules`, `dist`, `src-tauri/target`, local `.data`, or generated app caches.

- [ ] **Step 3: Create remote env**

Create `/opt/couple-pet-platform/.env` with:

```bash
POSTGRES_USER=couple_pet
POSTGRES_PASSWORD=<generated strong password>
POSTGRES_DB=couple_pet_platform
PLATFORM_JWT_SECRET=<generated strong secret>
PLATFORM_ADMIN_EMAIL=<user-provided admin email>
PLATFORM_ADMIN_PASSWORD=<user-provided or generated temporary password>
PLATFORM_PUBLIC_BASE_URL=http://159.75.175.47:19080
PLATFORM_API_BASE_URL=http://159.75.175.47:19081
```

Sensitive values must not be committed to git.

- [ ] **Step 4: Start stack**

Run on server:

```bash
cd /opt/couple-pet-platform
docker compose -p couple-pet-platform -f deploy/couple-pet-platform/compose.yaml up -d --build
docker compose -p couple-pet-platform -f deploy/couple-pet-platform/compose.yaml ps
curl -fsS http://127.0.0.1:19081/health
```

- [ ] **Step 5: Report external URLs**

Report:

- `http://159.75.175.47:19080`
- `http://159.75.175.47:19081/health`

Also report any cloud security group/firewall issue if the ports are not externally reachable.

---

## Plan Self-Review

- Spec coverage: covers invitation registration, email login, downloads, device registration, admin lists, Docker Compose, isolated ports, and future interaction-event table.
- Scope check: does not implement leaderboard, continuous-day statistics, public social feed, or full realtime gateway migration in this phase.
- Security check: passwords are hashed, admin routes require admin token, device secrets are hashed, and chat messages are not stored.
- Deployment check: avoids existing occupied ports and does not touch `/opt/qherp`.
- Type consistency: package names, script names, route names, and deployment ports are consistent across tasks.
