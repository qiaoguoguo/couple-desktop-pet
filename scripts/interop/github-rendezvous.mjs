import {
  createCipheriv,
  createDecipheriv,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const commentMarker = "couple-pet-interop-v1";
const defaultApiBaseUrl = "https://api.github.com";
const sensitiveKeys = [
  "GITHUB_TOKEN",
  "INTEROP_GITHUB_TOKEN",
  "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
  "pairCode",
  "deviceSecret",
  "message",
  "token",
  "secret",
];

export function createInteropKeyPair() {
  return generateKeyPairSync("x25519");
}

export function exportPublicKey(publicKey) {
  return publicKey.export({ type: "spki", format: "der" }).toString("base64url");
}

function importPublicKey(publicKey) {
  return createPublicKey({
    key: Buffer.from(publicKey, "base64url"),
    type: "spki",
    format: "der",
  });
}

export function deriveSharedKey({ privateKey, peerPublicKey, issueNumber }) {
  const secret = diffieHellman({
    privateKey,
    publicKey: importPublicKey(peerPublicKey),
  });
  return Buffer.from(
    hkdfSync(
      "sha256",
      secret,
      Buffer.from(`couple-pet-interop:${issueNumber}`),
      Buffer.from("github-issue-rendezvous-v1"),
      32,
    ),
  );
}

export function createEncryptedEvent({ role, event, payload, key }) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const plaintext = Buffer.from(JSON.stringify({ role, event, payload }), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    kind: "encrypted-event",
    role,
    event,
    nonce: nonce.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  };
}

export function decryptEncryptedEvent({ encryptedEvent, key }) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(encryptedEvent.nonce, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(encryptedEvent.tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encryptedEvent.ciphertext, "base64url")),
    decipher.final(),
  ]);

  return JSON.parse(plaintext.toString("utf8"));
}

export function tamperEncryptedEventForTest(encryptedEvent) {
  const ciphertext = Buffer.from(encryptedEvent.ciphertext, "base64url");
  ciphertext[0] = ciphertext[0] ^ 1;
  return {
    ...encryptedEvent,
    ciphertext: ciphertext.toString("base64url"),
  };
}

export function createGitHubRendezvousClient({
  owner,
  repo,
  token,
  fetchImpl = globalThis.fetch,
  apiBaseUrl = defaultApiBaseUrl,
}) {
  if (!fetchImpl) {
    throw new Error("fetch is required for GitHub rendezvous");
  }

  async function request(method, path, body) {
    const response = await fetchImpl(`${apiBaseUrl}/repos/${owner}/${repo}${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`GitHub ${method} ${path} failed with ${response.status}: ${await response.text()}`);
    }

    return response.json();
  }

  const client = {
    async createIssue({ title }) {
      return request("POST", "/issues", {
        title,
        body: "Temporary encrypted couple-pet interop rendezvous issue.",
      });
    },
    async postHello({ issueNumber, role, publicKey }) {
      return request("POST", `/issues/${issueNumber}/comments`, {
        body: serializeComment({ kind: "hello", role, publicKey }),
      });
    },
    async postEncryptedEvent({ issueNumber, encryptedEvent }) {
      return request("POST", `/issues/${issueNumber}/comments`, {
        body: serializeComment(encryptedEvent),
      });
    },
    async listComments(issueNumber) {
      return request("GET", `/issues/${issueNumber}/comments`);
    },
    async deleteComment(commentId) {
      return request("DELETE", `/issues/comments/${commentId}`);
    },
    async closeIssue(issueNumber) {
      return request("PATCH", `/issues/${issueNumber}`, { state: "closed" });
    },
    async waitForPeerHello({ issueNumber, selfRole, timeoutMs = 120_000, intervalMs = 2_000 }) {
      const comment = await waitForComment({
        load: () => client.listComments(issueNumber),
        timeoutMs,
        intervalMs,
        predicate: (comment) =>
          comment.kind === "hello" && comment.role !== selfRole && typeof comment.publicKey === "string",
      });
      return { id: comment.id, role: comment.role, publicKey: comment.publicKey };
    },
    async waitForEncryptedEvent({
      issueNumber,
      selfRole,
      timeoutMs = 120_000,
      intervalMs = 2_000,
      event,
    }) {
      return waitForComment({
        load: () => client.listComments(issueNumber),
        timeoutMs,
        intervalMs,
        predicate: (comment) =>
          comment.kind === "encrypted-event" &&
          comment.role !== selfRole &&
          (event ? comment.event === event : true),
      });
    },
    async cleanup(issueNumber) {
      for (const comment of await this.listComments(issueNumber)) {
        await this.deleteComment(comment.id);
      }
      await this.closeIssue(issueNumber);
    },
  };

  return client;
}

function serializeComment(payload) {
  return JSON.stringify({ marker: commentMarker, ...payload });
}

function parseComment(comment) {
  try {
    const payload = JSON.parse(comment.body);
    if (payload.marker && payload.marker !== commentMarker) {
      return null;
    }
    if (payload.kind !== "hello" && payload.kind !== "encrypted-event") {
      return null;
    }
    return { id: comment.id, ...payload };
  } catch {
    return null;
  }
}

async function waitForComment({ load, predicate, timeoutMs, intervalMs }) {
  const deadline = Date.now() + timeoutMs;
  do {
    for (const comment of await load()) {
      const payload = parseComment(comment);
      if (payload && predicate(payload)) {
        return payload;
      }
    }
    if (Date.now() >= deadline) {
      break;
    }
    await wait(intervalMs);
  } while (true);

  throw new Error("Timed out waiting for GitHub rendezvous comment");
}

function wait(delayMs) {
  if (delayMs <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolveWait) => setTimeout(resolveWait, delayMs));
}

export function parseRendezvousArgs(argv) {
  const command = argv[0];
  const repoValue = readRequiredArg(argv, "--repo");
  const [owner, repo] = repoValue.split("/");
  if (!owner || !repo) {
    throw new Error("--repo must be owner/repo");
  }
  const token = readRequiredArg(argv, "--token");

  if (command === "create") {
    return {
      command,
      owner,
      repo,
      token,
      title: readRequiredArg(argv, "--title"),
    };
  }

  if (command === "cleanup") {
    return {
      command,
      owner,
      repo,
      token,
      issueNumber: Number.parseInt(readRequiredArg(argv, "--issue"), 10),
    };
  }

  throw new Error("Usage: github-rendezvous.mjs create|cleanup --repo owner/repo --token token");
}

export function isCliEntrypoint(metaUrl, argvPath = process.argv[1]) {
  if (!argvPath) {
    return false;
  }

  return resolve(fileURLToPath(metaUrl)) === resolve(argvPath);
}

function readRequiredArg(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1 || !argv[index + 1]) {
    throw new Error(`Missing ${name}`);
  }
  return argv[index + 1];
}

export function redactRendezvousLog(text, secrets = process.env) {
  let redacted = text;
  for (const key of sensitiveKeys) {
    const value = secrets[key];
    if (value) {
      redacted = redacted.split(value).join("<redacted>");
    }
    redacted = redacted.replace(new RegExp(`${key}=\\S+`, "g"), `${key}=<redacted>`);
  }
  return redacted;
}

export async function runRendezvousCli(argv, { stdout = console, stderr = console } = {}) {
  try {
    const args = parseRendezvousArgs(argv);
    const client = createGitHubRendezvousClient(args);
    if (args.command === "create") {
      const issue = await client.createIssue({ title: args.title });
      stdout.log(String(issue.number));
      return 0;
    }
    await client.cleanup(args.issueNumber);
    stdout.log("cleanup-complete");
    return 0;
  } catch (error) {
    stderr.error(redactRendezvousLog(error.message ?? String(error), process.env));
    return 1;
  }
}

if (isCliEntrypoint(import.meta.url)) {
  runRendezvousCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
