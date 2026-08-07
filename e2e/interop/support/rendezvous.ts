import {
  createEncryptedEvent,
  createGitHubRendezvousClient,
  createInteropKeyPair,
  decryptEncryptedEvent,
  deriveSharedKey,
  exportPublicKey,
  type EncryptedEvent,
} from "../../../scripts/interop/github-rendezvous.mjs";

export type InteropRole = "windows" | "macos";

interface RendezvousEnv {
  owner: string;
  repo: string;
  token: string;
  issueNumber: number;
  role: InteropRole;
  sessionId: string;
}

const localRendezvousTimeoutMs = 120_000;
const ciRendezvousTimeoutMs = 20 * 60_000;
const localMochaTimeoutMs = 300_000;
const ciMochaTimeoutMs = 30 * 60_000;

export function readRendezvousEnv(env: NodeJS.ProcessEnv = process.env): RendezvousEnv {
  const repository = requireEnv(env, "INTEROP_GITHUB_REPOSITORY");
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    throw new Error("INTEROP_GITHUB_REPOSITORY must be owner/repo");
  }
  const role = requireEnv(env, "INTEROP_ROLE") as InteropRole;
  if (role !== "windows" && role !== "macos") {
    throw new Error("INTEROP_ROLE must be windows or macos");
  }
  return {
    owner,
    repo,
    token: requireEnv(env, "INTEROP_GITHUB_TOKEN"),
    issueNumber: Number.parseInt(requireEnv(env, "INTEROP_ISSUE_NUMBER"), 10),
    role,
    sessionId: env.INTEROP_SESSION_ID ?? "main",
  };
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

export function resolveInteropRendezvousTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return readPositiveIntegerEnv(
    env,
    "INTEROP_RENDEZVOUS_TIMEOUT_MS",
    isCi(env) ? ciRendezvousTimeoutMs : localRendezvousTimeoutMs,
  );
}

export function resolveInteropMochaTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  return readPositiveIntegerEnv(
    env,
    "INTEROP_MOCHA_TIMEOUT_MS",
    isCi(env) ? ciMochaTimeoutMs : localMochaTimeoutMs,
  );
}

function isCi(env: NodeJS.ProcessEnv): boolean {
  return env.CI === "true";
}

function readPositiveIntegerEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const value = env[name];
  if (value === undefined) {
    return fallback;
  }
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export async function createRendezvousSession() {
  const env = readRendezvousEnv();
  const timeoutMs = resolveInteropRendezvousTimeoutMs();
  const keys = createInteropKeyPair();
  const client = createGitHubRendezvousClient({
    owner: env.owner,
    repo: env.repo,
    token: env.token,
  });
  await client.postHello({
    issueNumber: env.issueNumber,
    role: env.role,
    publicKey: exportPublicKey(keys.publicKey),
    sessionId: env.sessionId,
  });
  const peerHello = await client.waitForPeerHello({
    issueNumber: env.issueNumber,
    selfRole: env.role,
    sessionId: env.sessionId,
    timeoutMs,
  });
  const key = deriveSharedKey({
    privateKey: keys.privateKey,
    peerPublicKey: peerHello.publicKey,
    issueNumber: env.issueNumber,
    sessionId: env.sessionId,
  });
  const peerRole = env.role === "windows" ? "macos" : "windows";

  return {
    role: env.role,
    peerRole,
    sessionId: env.sessionId,
    async send<TPayload>(event: string, payload: TPayload) {
      await client.postEncryptedEvent({
        issueNumber: env.issueNumber,
        encryptedEvent: createEncryptedEvent({
          role: env.role,
          event,
          payload,
          key,
          sessionId: env.sessionId,
        }),
      });
    },
    async receive<TPayload>(event: string): Promise<TPayload> {
      const encryptedEvent = (await client.waitForEncryptedEvent({
        issueNumber: env.issueNumber,
        selfRole: env.role,
        event,
        sessionId: env.sessionId,
        timeoutMs,
      })) as EncryptedEvent;
      return decryptEncryptedEvent<TPayload>({
        encryptedEvent,
        key,
        expectedEvent: event,
        expectedRole: peerRole,
        sessionId: env.sessionId,
      }).payload;
    },
  };
}
