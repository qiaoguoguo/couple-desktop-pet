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
}

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
  };
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

export async function createRendezvousSession() {
  const env = readRendezvousEnv();
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
  });
  const peerHello = await client.waitForPeerHello({
    issueNumber: env.issueNumber,
    selfRole: env.role,
  });
  const key = deriveSharedKey({
    privateKey: keys.privateKey,
    peerPublicKey: peerHello.publicKey,
    issueNumber: env.issueNumber,
  });

  return {
    role: env.role,
    async send<TPayload>(event: string, payload: TPayload) {
      await client.postEncryptedEvent({
        issueNumber: env.issueNumber,
        encryptedEvent: createEncryptedEvent({
          role: env.role,
          event,
          payload,
          key,
        }),
      });
    },
    async receive<TPayload>(event: string): Promise<TPayload> {
      const encryptedEvent = (await client.waitForEncryptedEvent({
        issueNumber: env.issueNumber,
        selfRole: env.role,
        event,
      })) as EncryptedEvent;
      return decryptEncryptedEvent<TPayload>({ encryptedEvent, key }).payload;
    },
  };
}
