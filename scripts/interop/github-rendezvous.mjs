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

export function deriveSharedKey({ privateKey, peerPublicKey, issueNumber, sessionId = "main" }) {
  const secret = diffieHellman({
    privateKey,
    publicKey: importPublicKey(peerPublicKey),
  });
  return Buffer.from(
    hkdfSync(
      "sha256",
      secret,
      Buffer.from(`couple-pet-interop:${issueNumber}:${sessionId}`),
      Buffer.from("github-issue-rendezvous-v1"),
      32,
    ),
  );
}

export function createEncryptedEvent({ role, event, payload, key, sessionId = "main" }) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const aad = createAad({ role, event, sessionId });
  cipher.setAAD(aad);
  const plaintext = Buffer.from(JSON.stringify({ role, event, payload }), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    kind: "encrypted-event",
    role,
    event,
    sessionId,
    nonce: nonce.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  };
}

export function decryptEncryptedEvent({
  encryptedEvent,
  key,
  expectedEvent,
  expectedRole,
  sessionId = encryptedEvent.sessionId ?? "main",
}) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(encryptedEvent.nonce, "base64url"),
  );
  decipher.setAAD(
    createAad({
      role: encryptedEvent.role,
      event: encryptedEvent.event,
      sessionId,
    }),
  );
  decipher.setAuthTag(Buffer.from(encryptedEvent.tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encryptedEvent.ciphertext, "base64url")),
    decipher.final(),
  ]);

  const decoded = JSON.parse(plaintext.toString("utf8"));
  if (decoded.role !== encryptedEvent.role) {
    throw new Error("Encrypted event role does not match outer metadata");
  }
  if (decoded.event !== encryptedEvent.event) {
    throw new Error("Encrypted event name does not match outer metadata");
  }
  if (expectedRole && decoded.role !== expectedRole) {
    throw new Error(`Encrypted event expected role ${expectedRole}, received ${decoded.role}`);
  }
  if (expectedEvent && decoded.event !== expectedEvent) {
    throw new Error(`Encrypted event expected event ${expectedEvent}, received ${decoded.event}`);
  }

  return decoded;
}

function createAad({ role, event, sessionId }) {
  return Buffer.from(JSON.stringify({ marker: commentMarker, role, event, sessionId }), "utf8");
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
    const response = await requestRaw(method, path, body);

    return response.data;
  }

  async function requestRaw(method, path, body) {
    const url = path.startsWith("http") ? path : `${apiBaseUrl}/repos/${owner}/${repo}${path}`;
    const response = await fetchImpl(url, {
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

    if (response.status === 204) {
      return { data: null, headers: response.headers };
    }

    const text = await response.text();
    if (!text.trim()) {
      return { data: null, headers: response.headers };
    }

    try {
      return { data: JSON.parse(text), headers: response.headers };
    } catch {
      return { data: await response.json(), headers: response.headers };
    }
  }

  const client = {
    async createIssue({ title }) {
      return request("POST", "/issues", {
        title,
        body: "Temporary encrypted couple-pet interop rendezvous issue.",
      });
    },
    async postHello({ issueNumber, role, publicKey, sessionId = "main" }) {
      return request("POST", `/issues/${issueNumber}/comments`, {
        body: serializeComment({ kind: "hello", role, publicKey, sessionId }),
      });
    },
    async postEncryptedEvent({ issueNumber, encryptedEvent }) {
      return request("POST", `/issues/${issueNumber}/comments`, {
        body: serializeComment(encryptedEvent),
      });
    },
    async listComments(issueNumber) {
      const comments = [];
      let path = `/issues/${issueNumber}/comments?per_page=100`;
      while (path) {
        const response = await requestRaw("GET", path);
        comments.push(...(response.data ?? []));
        path = readNextLink(response.headers);
      }
      return comments;
    },
    async deleteComment(commentId) {
      return request("DELETE", `/issues/comments/${commentId}`);
    },
    async closeIssue(issueNumber) {
      return request("PATCH", `/issues/${issueNumber}`, { state: "closed" });
    },
    async waitForPeerHello({
      issueNumber,
      selfRole,
      sessionId = "main",
      timeoutMs = 120_000,
      intervalMs = 2_000,
    }) {
      const comment = await waitForComment({
        load: () => client.listComments(issueNumber),
        timeoutMs,
        intervalMs,
        predicate: (comment) =>
          comment.kind === "hello" &&
          comment.role !== selfRole &&
          comment.sessionId === sessionId &&
          typeof comment.publicKey === "string",
      });
      return { id: comment.id, role: comment.role, publicKey: comment.publicKey, sessionId: comment.sessionId };
    },
    async waitForEncryptedEvent({
      issueNumber,
      selfRole,
      sessionId = "main",
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
          comment.sessionId === sessionId &&
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
    if (payload.marker !== commentMarker) {
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

function readNextLink(headers) {
  const link = headers?.get?.("link");
  if (!link) {
    return null;
  }

  for (const part of link.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) {
      return match[1];
    }
  }
  return null;
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

export function parseRendezvousArgs(argv, env = process.env) {
  const command = argv[0];
  const repoValue = readRequiredArg(argv, "--repo");
  const [owner, repo] = repoValue.split("/");
  if (!owner || !repo) {
    throw new Error("--repo must be owner/repo");
  }
  const token = env.INTEROP_GITHUB_TOKEN;
  if (!token) {
    throw new Error("Missing INTEROP_GITHUB_TOKEN");
  }

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

  throw new Error("Usage: github-rendezvous.mjs create|cleanup --repo owner/repo; set INTEROP_GITHUB_TOKEN in the environment");
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

export async function runRendezvousCli(
  argv,
  { stdout = console, stderr = console, env = process.env, fetchImpl = globalThis.fetch } = {},
) {
  try {
    const args = parseRendezvousArgs(argv, env);
    const client = createGitHubRendezvousClient({ ...args, fetchImpl });
    if (args.command === "create") {
      const issue = await client.createIssue({ title: args.title });
      stdout.log(String(issue.number));
      return 0;
    }
    await client.cleanup(args.issueNumber);
    stdout.log("cleanup-complete");
    return 0;
  } catch (error) {
    stderr.error(redactRendezvousLog(error.message ?? String(error), env));
    return 1;
  }
}

if (isCliEntrypoint(import.meta.url)) {
  runRendezvousCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
