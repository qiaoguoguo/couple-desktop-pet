import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

const relayBranch = "codex/macos-qa-relay-20260819";
const relayHost = "root@159.75.175.47";
const sourceProductCommit = "f36875af5e6b26bff287f9f6cecdc037afb44b37";
const retryDelayMs = 10_000;
const authorizationTimeoutMs = 20 * 60 * 1_000;

export const MACOS_QA_RELAY_HOST_KEY =
  "159.75.175.47 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOmLkgzjvMo/AYdYa4mRcEpmu9Si0vAbm9G2nHi9fC2S";

const createRemoteDirectoryScript = `set -euo pipefail
RUN_ID="$1"
REMOTE_DIR="/tmp/couple-pet-macos-$RUN_ID"
umask 077
mkdir -p "$REMOTE_DIR"
chmod 700 "$REMOTE_DIR"
`;

const verifyRemoteDmgScript = `set -euo pipefail
RUN_ID="$1"
REMOTE_DIR="/tmp/couple-pet-macos-$RUN_ID"
MANIFEST="$REMOTE_DIR/delivery-manifest.txt"
DMG_BASENAME="$(sed -n 's/^dmg_basename=//p' "$MANIFEST")"
EXPECTED_SHA="$(sed -n 's/^sha256=//p' "$MANIFEST")"
test -n "$DMG_BASENAME"
[[ "$EXPECTED_SHA" =~ ^[0-9a-f]{64}$ ]]
ACTUAL_SHA="$(sha256sum "$REMOTE_DIR/$DMG_BASENAME" | awk '{print $1}')"
if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
  echo "remote DMG SHA-256 mismatch" >&2
  exit 1
fi
`;

export function isMacosQaRelayEnabled({ mode, env = process.env }) {
  return (
    mode === "qa" &&
    env.GITHUB_ACTIONS === "true" &&
    env.GITHUB_REF_NAME === relayBranch &&
    Boolean(env.GITHUB_RUN_ID)
  );
}

export function createMacosQaRelayPlan({ mode, env = process.env }) {
  if (!isMacosQaRelayEnabled({ mode, env })) {
    throw new Error("macOS QA relay is not enabled for this execution");
  }

  const runId = env.GITHUB_RUN_ID;
  if (!/^\d+$/.test(runId)) {
    throw new Error("macOS QA relay run id must contain decimal digits only");
  }
  if (!env.RUNNER_TEMP) {
    throw new Error("macOS QA relay requires RUNNER_TEMP");
  }

  const privateKeyPath = join(env.RUNNER_TEMP, `codex-macos-relay-${runId}`);
  const knownHostsPath = join(env.RUNNER_TEMP, `codex-macos-relay-${runId}.known_hosts`);
  const manifestPath = join(env.RUNNER_TEMP, "delivery-manifest.txt");
  const evidenceArchivePath = join(env.RUNNER_TEMP, `macos-build-evidence-${runId}.tar.gz`);

  return {
    runId,
    privateKeyPath,
    publicKeyPath: `${privateKeyPath}.pub`,
    knownHostsPath,
    manifestPath,
    evidenceArchivePath,
    remoteDir: `/tmp/couple-pet-macos-${runId}`,
    remoteHost: relayHost,
    sshOptions: [
      "-i",
      privateKeyPath,
      "-o",
      "IdentitiesOnly=yes",
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      `UserKnownHostsFile=${knownHostsPath}`,
    ],
  };
}

export async function prepareMacosQaRelay({
  mode,
  env = process.env,
  logger = console,
  commandRunner = runRelayCommand,
}) {
  const session = createMacosQaRelayPlan({ mode, env });
  mkdirSync(dirname(session.privateKeyPath), { recursive: true, mode: 0o700 });

  await commandRunner(
    "ssh-keygen",
    [
      "-q",
      "-t",
      "ed25519",
      "-N",
      "",
      "-C",
      `codex-macos-relay-${session.runId}`,
      "-f",
      session.privateKeyPath,
    ],
    { env, shell: false },
  );

  chmodSync(session.privateKeyPath, 0o600);
  chmodSync(session.publicKeyPath, 0o600);
  const publicKey = readFileSync(session.publicKeyPath, "utf8").trim();
  const expectedComment = `codex-macos-relay-${session.runId}`;
  if (!new RegExp(`^ssh-ed25519 [A-Za-z0-9+/]+={0,3} ${expectedComment}$`).test(publicKey)) {
    throw new Error("ssh-keygen produced an unexpected relay public key");
  }

  writeFileSync(session.knownHostsPath, `${MACOS_QA_RELAY_HOST_KEY}\n`, { mode: 0o600 });
  chmodSync(session.knownHostsPath, 0o600);
  logger.log(`CODEX_MACOS_RELAY_PUBLIC_KEY=${publicKey}`);
  logger.log(`::notice title=CODEX_MACOS_RELAY_PUBLIC_KEY::${publicKey}`);
  return session;
}

export async function deliverMacosQaRelay({
  session,
  buildResult,
  env = process.env,
  logger = console,
  commandRunner = runRelayCommand,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now = Date.now,
}) {
  assertDeliveryInputs({ session, buildResult, env });
  const actualSha = sha256File(buildResult.dmgPath);
  const expectedSha = readExpectedSha256(join(buildResult.evidenceDir, "sha256-dmg.log"));
  if (actualSha !== expectedSha) {
    throw new Error("macOS QA relay DMG SHA-256 mismatch");
  }

  const dmgBasename = basename(buildResult.dmgPath);
  if (/[\r\n]/.test(dmgBasename)) {
    throw new Error("macOS QA relay DMG basename is invalid");
  }
  const dmgBytes = statSync(buildResult.dmgPath).size;
  writeFileSync(
    session.manifestPath,
    [
      `source_product_commit=${sourceProductCommit}`,
      `relay_commit=${env.GITHUB_SHA}`,
      `source_run_id=${session.runId}`,
      `dmg_basename=${dmgBasename}`,
      `bytes=${dmgBytes}`,
      `sha256=${actualSha}`,
      "classification=Universal QA / ad-hoc signed / not notarized",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  chmodSync(session.manifestPath, 0o600);

  await commandRunner(
    "tar",
    [
      "-czf",
      session.evidenceArchivePath,
      "-C",
      dirname(buildResult.evidenceDir),
      basename(buildResult.evidenceDir),
    ],
    { env, shell: false },
  );

  await waitForRelayAuthorization({ session, env, logger, commandRunner, sleep, now });
  await commandRunner(
    "scp",
    [
      ...session.sshOptions,
      buildResult.dmgPath,
      session.manifestPath,
      session.evidenceArchivePath,
      `${session.remoteHost}:${session.remoteDir}/`,
    ],
    { env, shell: false },
  );
  await commandRunner(
    "ssh",
    [...session.sshOptions, session.remoteHost, "bash", "-s", "--", session.runId],
    { env, input: verifyRemoteDmgScript, shell: false },
  );

  logger.log(
    `CODEX_MACOS_RELAY_DELIVERED remote_dir=${session.remoteDir} dmg=${dmgBasename} sha256=${actualSha}`,
  );
}

async function waitForRelayAuthorization({
  session,
  env,
  logger,
  commandRunner,
  sleep,
  now,
}) {
  const startedAt = now();
  const deadline = startedAt + authorizationTimeoutMs;
  let attempt = 0;

  while (true) {
    const attemptStartedAt = now();
    if (attemptStartedAt >= deadline) {
      throw new Error("macOS QA relay SSH authorization was not granted within 20 minutes");
    }
    attempt += 1;
    try {
      await commandRunner(
        "ssh",
        [...session.sshOptions, session.remoteHost, "bash", "-s", "--", session.runId],
        {
          env,
          input: createRemoteDirectoryScript,
          shell: false,
          timeout: Math.min(retryDelayMs, deadline - attemptStartedAt),
        },
      );
      return;
    } catch {
      const currentTime = now();
      if (currentTime >= deadline) {
        throw new Error("macOS QA relay SSH authorization was not granted within 20 minutes");
      }
      logger.log(
        `CODEX_MACOS_RELAY_WAITING attempt=${attempt} elapsed_seconds=${Math.floor((currentTime - startedAt) / 1000)}`,
      );
      await sleep(Math.min(retryDelayMs, deadline - currentTime));
    }
  }
}

function assertDeliveryInputs({ session, buildResult, env }) {
  if (!/^\d+$/.test(session.runId) || session.runId !== env.GITHUB_RUN_ID) {
    throw new Error("macOS QA relay session run id is invalid");
  }
  if (!/^[0-9a-f]{40}$/.test(env.GITHUB_SHA ?? "")) {
    throw new Error("macOS QA relay commit must be a 40-character lowercase SHA");
  }
  if (!buildResult?.dmgPath || !existsSync(buildResult.dmgPath) || !statSync(buildResult.dmgPath).isFile()) {
    throw new Error("macOS QA relay requires the verified DMG path");
  }
  if (
    !buildResult?.evidenceDir ||
    !existsSync(buildResult.evidenceDir) ||
    !statSync(buildResult.evidenceDir).isDirectory()
  ) {
    throw new Error("macOS QA relay requires the build evidence directory");
  }
}

function readExpectedSha256(path) {
  const match = readFileSync(path, "utf8").match(/\b[0-9a-fA-F]{64}\b/);
  if (!match) {
    throw new Error("macOS QA relay sha256-dmg.log has no SHA-256 digest");
  }
  return match[0].toLowerCase();
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function runRelayCommand(
  command,
  args,
  { env = process.env, input, shell = false, timeout } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, shell, timeout });
    let stdout = "";
    let stderr = "";
    let settled = false;

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(Object.assign(new Error(`${command} failed to start`), { cause: error, stdout, stderr }));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      const result = { code, stdout, stderr };
      if (code === 0) {
        resolve(result);
      } else {
        reject(Object.assign(new Error(`${command} exited with ${code}`), result));
      }
    });

    child.stdin.end(input ?? "");
  });
}
