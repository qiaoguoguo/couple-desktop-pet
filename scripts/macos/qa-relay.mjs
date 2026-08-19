import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  chmodSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";

const relayBranch = "codex/macos-qa-relay-20260819";
const relayHost = "root@159.75.175.47";
const sourceProductCommit = "f36875af5e6b26bff287f9f6cecdc037afb44b37";
const retryDelayMs = 10_000;
const authorizationTimeoutMs = 20 * 60 * 1_000;
const dmgPartCount = 32;
const dmgPartPrefix = "dmg-part-";
const partTransferConcurrency = 10;
const partTransferRetries = 3;
const partTransferRetryDelayMs = 2_000;

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
EXPECTED_BYTES="$(sed -n 's/^bytes=//p' "$MANIFEST")"
PART_COUNT="$(sed -n 's/^part_count=//p' "$MANIFEST")"
PART_PREFIX="$(sed -n 's/^part_prefix=//p' "$MANIFEST")"
test -n "$DMG_BASENAME"
test "$(basename "$DMG_BASENAME")" = "$DMG_BASENAME"
[[ "$EXPECTED_SHA" =~ ^[0-9a-f]{64}$ ]]
[[ "$EXPECTED_BYTES" =~ ^[0-9]+$ ]]
[[ "$PART_COUNT" =~ ^[0-9]+$ ]]
[ "$PART_COUNT" -eq 32 ]
[ "$PART_PREFIX" = "dmg-part-" ]

ACTUAL_PART_COUNT="$(find "$REMOTE_DIR" -maxdepth 1 -type f -name 'dmg-part-*' -print | wc -l | tr -d '[:space:]')"
[ "$ACTUAL_PART_COUNT" -eq "$PART_COUNT" ]

TEMP_DMG="$REMOTE_DIR/.dmg-assembly-$RUN_ID.tmp"
FINAL_DMG="$REMOTE_DIR/$DMG_BASENAME"
rm -f "$TEMP_DMG"
: > "$TEMP_DMG"
for ((index = 0; index < PART_COUNT; index += 1)); do
  printf -v PART_SUFFIX '%03d' "$index"
  PART_PATH="$REMOTE_DIR/\${PART_PREFIX}\${PART_SUFFIX}"
  test -f "$PART_PATH"
  test -s "$PART_PATH"
  cat "$PART_PATH" >> "$TEMP_DMG"
done

ACTUAL_BYTES="$(stat -c '%s' "$TEMP_DMG")"
[ "$ACTUAL_BYTES" -eq "$EXPECTED_BYTES" ]
ACTUAL_SHA="$(sha256sum "$TEMP_DMG" | awk '{print $1}')"
if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
  echo "remote DMG SHA-256 mismatch" >&2
  exit 1
fi

mv "$TEMP_DMG" "$FINAL_DMG"
for ((index = 0; index < PART_COUNT; index += 1)); do
  printf -v PART_SUFFIX '%03d' "$index"
  PART_PATH="$REMOTE_DIR/\${PART_PREFIX}\${PART_SUFFIX}"
  rm "$PART_PATH"
done
REMAINING_PART_COUNT="$(find "$REMOTE_DIR" -maxdepth 1 -type f -name 'dmg-part-*' -print | wc -l | tr -d '[:space:]')"
[ "$REMAINING_PART_COUNT" -eq 0 ]
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
  const partsDir = join(env.RUNNER_TEMP, `codex-macos-relay-${runId}.parts`);

  return {
    runId,
    privateKeyPath,
    publicKeyPath: `${privateKeyPath}.pub`,
    knownHostsPath,
    manifestPath,
    evidenceArchivePath,
    partsDir,
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
  const actualSha = await sha256File(buildResult.dmgPath);
  const expectedSha = readExpectedSha256(join(buildResult.evidenceDir, "sha256-dmg.log"));
  if (actualSha !== expectedSha) {
    throw new Error("macOS QA relay DMG SHA-256 mismatch");
  }

  const dmgBasename = basename(buildResult.dmgPath);
  if (/[\r\n]/.test(dmgBasename)) {
    throw new Error("macOS QA relay DMG basename is invalid");
  }
  const dmgBytes = statSync(buildResult.dmgPath).size;
  const split = await splitDmgIntoParts({
    dmgPath: buildResult.dmgPath,
    partsDir: session.partsDir,
  });
  writeFileSync(
    session.manifestPath,
    [
      `source_product_commit=${sourceProductCommit}`,
      `relay_commit=${env.GITHUB_SHA}`,
      `source_run_id=${session.runId}`,
      `dmg_basename=${dmgBasename}`,
      `bytes=${dmgBytes}`,
      `sha256=${actualSha}`,
      `part_count=${split.partPaths.length}`,
      `part_prefix=${dmgPartPrefix}`,
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
      session.manifestPath,
      session.evidenceArchivePath,
      `${session.remoteHost}:${session.remoteDir}/`,
    ],
    { env, shell: false },
  );
  await transferDmgParts({
    session,
    partPaths: split.partPaths,
    env,
    commandRunner,
    sleep,
  });
  await commandRunner(
    "ssh",
    [...session.sshOptions, session.remoteHost, "bash", "-s", "--", session.runId],
    { env, input: verifyRemoteDmgScript, shell: false },
  );

  logger.log(
    `CODEX_MACOS_RELAY_DELIVERED remote_dir=${session.remoteDir} dmg=${dmgBasename} sha256=${actualSha} transfer_mode=parallel-parts part_count=${split.partPaths.length}`,
  );
}

export async function splitDmgIntoParts({
  dmgPath,
  partsDir,
  partCount = dmgPartCount,
}) {
  const totalBytes = statSync(dmgPath).size;
  if (!Number.isSafeInteger(partCount) || partCount < 1) {
    throw new Error("macOS QA relay part count must be a positive integer");
  }
  const partSize = Math.ceil(totalBytes / partCount);
  if (totalBytes - partSize * (partCount - 1) <= 0) {
    throw new Error(`macOS QA relay DMG is too small for ${partCount} non-empty parts`);
  }

  rmSync(partsDir, { recursive: true, force: true });
  mkdirSync(partsDir, { recursive: true, mode: 0o700 });
  const partPaths = [];
  for (let index = 0; index < partCount; index += 1) {
    const partPath = join(partsDir, `${dmgPartPrefix}${String(index).padStart(3, "0")}`);
    const start = index * partSize;
    const remainingBytes = totalBytes - start;
    const currentPartSize = Math.min(partSize, remainingBytes);
    if (currentPartSize <= 0) {
      throw new Error(`macOS QA relay part ${index} would be empty`);
    }
    await pipeline(
      createReadStream(dmgPath, { start, end: start + currentPartSize - 1 }),
      createWriteStream(partPath, { flags: "wx", mode: 0o600 }),
    );
    chmodSync(partPath, 0o600);
    if (statSync(partPath).size !== currentPartSize) {
      throw new Error(`macOS QA relay part ${index} has an unexpected size`);
    }
    partPaths.push(partPath);
  }

  const expectedNames = partPaths.map((path) => basename(path));
  const actualNames = readdirSync(partsDir).sort();
  if (actualNames.length !== partCount || actualNames.some((name, index) => name !== expectedNames[index])) {
    throw new Error("macOS QA relay part directory contains unexpected files");
  }
  return { partPaths, partSize, totalBytes };
}

export async function transferDmgParts({
  session,
  partPaths,
  env = process.env,
  commandRunner = runRelayCommand,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  concurrency = partTransferConcurrency,
  maxRetries = partTransferRetries,
  retryDelay = partTransferRetryDelayMs,
}) {
  assertPartPaths(partPaths);
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 10) {
    throw new Error("macOS QA relay part transfer concurrency must be between 1 and 10");
  }

  let nextIndex = 0;
  const failures = [];
  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= partPaths.length) {
        return;
      }

      const partPath = partPaths[index];
      try {
        await transferPartWithRetry({
          session,
          partPath,
          env,
          commandRunner,
          sleep,
          maxRetries,
          retryDelay,
        });
      } catch (error) {
        failures.push({ partPath, error });
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(concurrency, partPaths.length) },
    () => worker(),
  );
  await Promise.all(workers);
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map(({ error }) => error),
      `${failures.length} DMG part transfer${failures.length === 1 ? "" : "s"} failed`,
    );
  }
}

async function transferPartWithRetry({
  session,
  partPath,
  env,
  commandRunner,
  sleep,
  maxRetries,
  retryDelay,
}) {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      await commandRunner(
        "scp",
        [
          ...session.sshOptions,
          partPath,
          `${session.remoteHost}:${session.remoteDir}/`,
        ],
        { env, shell: false },
      );
      return;
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      await sleep(retryDelay);
    }
  }
}

function assertPartPaths(partPaths) {
  if (!Array.isArray(partPaths) || partPaths.length !== dmgPartCount) {
    throw new Error(`macOS QA relay requires exactly ${dmgPartCount} DMG parts`);
  }
  for (let index = 0; index < partPaths.length; index += 1) {
    const expectedName = `${dmgPartPrefix}${String(index).padStart(3, "0")}`;
    const partPath = partPaths[index];
    if (basename(partPath) !== expectedName || !statSync(partPath).isFile() || statSync(partPath).size <= 0) {
      throw new Error(`macOS QA relay part ${index} is missing, empty, or misnamed`);
    }
  }
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

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
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
