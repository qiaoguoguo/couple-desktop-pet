import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MACOS_QA_RELAY_HOST_KEY,
  createMacosQaRelayPlan,
  deliverMacosQaRelay,
  isMacosQaRelayEnabled,
  prepareMacosQaRelay,
  splitDmgIntoParts,
  transferDmgParts,
} from "./qa-relay.mjs";

const sourceProductCommit = "f36875af5e6b26bff287f9f6cecdc037afb44b37";
const relayCommit = "0123456789abcdef0123456789abcdef01234567";
let tempRoots = [];

function makeTempRoot() {
  const root = mkdtempSync(join(tmpdir(), "couple-pet-macos-relay-"));
  tempRoots.push(root);
  return root;
}

function enabledEnv(root = makeTempRoot()) {
  return {
    GITHUB_ACTIONS: "true",
    GITHUB_REF_NAME: "codex/macos-qa-relay-20260819",
    GITHUB_RUN_ID: "32260000001",
    GITHUB_SHA: relayCommit,
    RUNNER_TEMP: root,
  };
}

function writeVerifiedDmg(root) {
  const evidenceDir = join(root, "build");
  const dmgPath = join(root, "Couple Pet Universal QA.dmg");
  mkdirSync(evidenceDir, { recursive: true });
  const contents = Buffer.from(Array.from({ length: 4_097 }, (_, index) => index % 251));
  writeFileSync(dmgPath, contents);
  writeFileSync(join(evidenceDir, "verification.log"), "verified\n");
  const sha256 = createHash("sha256").update(readFileSync(dmgPath)).digest("hex");
  writeFileSync(join(evidenceDir, "sha256-dmg.log"), `${sha256}  ${dmgPath}\n`);
  return { dmgPath, evidenceDir, sha256 };
}

function writePartFixtures(root) {
  const partsDir = join(root, "parts");
  mkdirSync(partsDir, { recursive: true });
  return Array.from({ length: 32 }, (_, index) => {
    const path = join(partsDir, `dmg-part-${String(index).padStart(3, "0")}`);
    writeFileSync(path, Buffer.from([index]));
    return path;
  });
}

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tempRoots = [];
});

describe("one-time macOS QA relay", () => {
  it("enables only the exact QA GitHub Actions branch and run", () => {
    const env = enabledEnv();
    expect(isMacosQaRelayEnabled({ mode: "qa", env })).toBe(true);
    expect(isMacosQaRelayEnabled({ mode: "formal", env })).toBe(false);
    expect(isMacosQaRelayEnabled({ mode: "qa", env: { ...env, GITHUB_ACTIONS: "false" } })).toBe(
      false,
    );
    expect(
      isMacosQaRelayEnabled({ mode: "qa", env: { ...env, GITHUB_REF_NAME: "main" } }),
    ).toBe(false);
    expect(
      isMacosQaRelayEnabled({ mode: "qa", env: { ...env, GITHUB_RUN_ID: "" } }),
    ).toBe(false);
  });

  it("plans decimal-run paths and strict host-verified SSH arguments without key material", () => {
    const env = enabledEnv();
    const plan = createMacosQaRelayPlan({ mode: "qa", env });

    expect(plan.privateKeyPath).toBe(join(env.RUNNER_TEMP, `codex-macos-relay-${env.GITHUB_RUN_ID}`));
    expect(plan.publicKeyPath).toBe(`${plan.privateKeyPath}.pub`);
    expect(plan.partsDir).toBe(
      join(env.RUNNER_TEMP, `codex-macos-relay-${env.GITHUB_RUN_ID}.parts`),
    );
    expect(plan.remoteDir).toBe(`/tmp/couple-pet-macos-${env.GITHUB_RUN_ID}`);
    expect(plan.sshOptions).toEqual([
      "-i",
      plan.privateKeyPath,
      "-o",
      "IdentitiesOnly=yes",
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      `UserKnownHostsFile=${plan.knownHostsPath}`,
    ]);
    expect(MACOS_QA_RELAY_HOST_KEY).toBe(
      "159.75.175.47 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOmLkgzjvMo/AYdYa4mRcEpmu9Si0vAbm9G2nHi9fC2S",
    );
    expect(JSON.stringify(plan)).not.toContain("PRIVATE KEY");
    expect(() =>
      createMacosQaRelayPlan({ mode: "qa", env: { ...env, GITHUB_RUN_ID: "12;rm" } }),
    ).toThrow(/decimal/);
  });

  it("generates an ed25519 key before build and prints only the complete public key marker", async () => {
    const env = enabledEnv();
    const privateKeyMaterial = "-----BEGIN OPENSSH PRIVATE KEY-----\nprivate-test-value";
    const publicKey = `ssh-ed25519 AAAAC3NzaTestOnly codex-macos-relay-${env.GITHUB_RUN_ID}`;
    const commands = [];
    const logs = [];

    const session = await prepareMacosQaRelay({
      mode: "qa",
      env,
      logger: { log: (line) => logs.push(line) },
      commandRunner: async (command, args, options) => {
        commands.push({ command, args, options });
        const keyPath = args[args.indexOf("-f") + 1];
        writeFileSync(keyPath, privateKeyMaterial);
        writeFileSync(`${keyPath}.pub`, `${publicKey}\n`);
        return { code: 0, stdout: "", stderr: "" };
      },
    });

    expect(commands).toEqual([
      expect.objectContaining({
        command: "ssh-keygen",
        args: [
          "-q",
          "-t",
          "ed25519",
          "-N",
          "",
          "-C",
          `codex-macos-relay-${env.GITHUB_RUN_ID}`,
          "-f",
          session.privateKeyPath,
        ],
        options: expect.objectContaining({ shell: false }),
      }),
    ]);
    expect(logs).toEqual([
      `CODEX_MACOS_RELAY_PUBLIC_KEY=${publicKey}`,
      `::notice title=CODEX_MACOS_RELAY_PUBLIC_KEY::${publicKey}`,
    ]);
    expect(logs.join("\n")).not.toContain(privateKeyMaterial);
    expect(readFileSync(session.knownHostsPath, "utf8")).toBe(`${MACOS_QA_RELAY_HOST_KEY}\n`);
  });

  it("fails before transport when the recorded DMG digest does not match", async () => {
    const root = makeTempRoot();
    const env = enabledEnv(root);
    const buildResult = writeVerifiedDmg(root);
    writeFileSync(join(buildResult.evidenceDir, "sha256-dmg.log"), `${"0".repeat(64)}  bad.dmg\n`);
    const session = createMacosQaRelayPlan({ mode: "qa", env });

    await expect(
      deliverMacosQaRelay({
        session,
        buildResult,
        env,
        commandRunner: async () => {
          throw new Error("transport must not start");
        },
      }),
    ).rejects.toThrow(/SHA-256 mismatch/);
  });

  it("streams the DMG into exactly 32 ordered non-empty parts that reconstruct its bytes", async () => {
    const root = makeTempRoot();
    const buildResult = writeVerifiedDmg(root);
    const partsDir = join(root, "relay.parts");

    const split = await splitDmgIntoParts({
      dmgPath: buildResult.dmgPath,
      partsDir,
    });

    const expectedNames = Array.from(
      { length: 32 },
      (_, index) => `dmg-part-${String(index).padStart(3, "0")}`,
    );
    expect(split.partPaths.map((path) => basename(path))).toEqual(expectedNames);
    expect(readdirSync(partsDir).sort()).toEqual(expectedNames);
    expect(split.partPaths).toHaveLength(32);
    const partSizes = split.partPaths.map((path) => statSync(path).size);
    expect(partSizes.every((size) => size > 0)).toBe(true);
    expect(partSizes.slice(0, -1).every((size) => size === split.partSize)).toBe(true);
    expect(partSizes.at(-1)).toBeLessThanOrEqual(split.partSize);
    expect(Buffer.concat(split.partPaths.map((path) => readFileSync(path)))).toEqual(
      readFileSync(buildResult.dmgPath),
    );
  });

  it("limits parallel part SCP transfers to the sshd threshold of 10", async () => {
    const root = makeTempRoot();
    const env = enabledEnv(root);
    const session = createMacosQaRelayPlan({ mode: "qa", env });
    const partPaths = writePartFixtures(root);
    let active = 0;
    let maximumActive = 0;
    let releaseTransfers;
    const transferGate = new Promise((resolve) => {
      releaseTransfers = resolve;
    });

    const transfer = transferDmgParts({
      session,
      partPaths,
      env,
      commandRunner: async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await transferGate;
        active -= 1;
        return { code: 0, stdout: "", stderr: "" };
      },
    });

    expect(active).toBe(10);
    releaseTransfers();
    await transfer;
    expect(maximumActive).toBeLessThanOrEqual(10);
  });

  it("retries one failed part up to success with a two-second interval", async () => {
    const root = makeTempRoot();
    const env = enabledEnv(root);
    const session = createMacosQaRelayPlan({ mode: "qa", env });
    const partPaths = writePartFixtures(root);
    const attempts = new Map();
    const sleeps = [];
    const retryPart = partPaths[5];

    await transferDmgParts({
      session,
      partPaths,
      env,
      sleep: async (milliseconds) => sleeps.push(milliseconds),
      commandRunner: async (_command, args) => {
        const partPath = args.at(-2);
        const attempt = (attempts.get(partPath) ?? 0) + 1;
        attempts.set(partPath, attempt);
        if (partPath === retryPart && attempt === 1) {
          throw new Error("transient transfer failure");
        }
        return { code: 0, stdout: "", stderr: "" };
      },
    });

    expect(attempts.get(retryPart)).toBe(2);
    expect(sleeps).toEqual([2_000]);
    expect(attempts.size).toBe(32);
  });

  it("waits for every in-flight part before reporting a permanent transfer failure", async () => {
    const root = makeTempRoot();
    const env = enabledEnv(root);
    const session = createMacosQaRelayPlan({ mode: "qa", env });
    const partPaths = writePartFixtures(root);
    const failedPart = partPaths[0];
    const completedParts = new Set();
    let failedAttempts = 0;
    let releaseSuccessfulTransfers;
    const successfulTransferGate = new Promise((resolve) => {
      releaseSuccessfulTransfers = resolve;
    });
    let outcome = "pending";
    let observedError;

    const observed = transferDmgParts({
      session,
      partPaths,
      env,
      sleep: async () => {},
      commandRunner: async (_command, args) => {
        const partPath = args.at(-2);
        if (partPath === failedPart) {
          failedAttempts += 1;
          throw new Error("permanent transfer failure");
        }
        await successfulTransferGate;
        completedParts.add(partPath);
        return { code: 0, stdout: "", stderr: "" };
      },
    }).then(
      () => {
        outcome = "resolved";
      },
      (error) => {
        outcome = "rejected";
        observedError = error;
      },
    );

    await new Promise((resolve) => setImmediate(resolve));
    expect(outcome).toBe("pending");
    releaseSuccessfulTransfers();
    await observed;
    expect(outcome).toBe("rejected");
    expect(observedError.message).toMatch(/1 DMG part transfer/);
    expect(failedAttempts).toBe(4);
    expect(completedParts.size).toBe(31);
  });

  it("relays small evidence first, transfers only individual parts, and verifies ordered remote assembly", async () => {
    const root = makeTempRoot();
    const env = enabledEnv(root);
    const buildResult = writeVerifiedDmg(root);
    const session = createMacosQaRelayPlan({ mode: "qa", env });
    const commands = [];
    const sleeps = [];
    const logs = [];
    let clock = 0;
    let authorizationAttempts = 0;

    await deliverMacosQaRelay({
      session,
      buildResult,
      env,
      logger: { log: (line) => logs.push(line) },
      now: () => clock,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
        clock += milliseconds;
      },
      commandRunner: async (command, args, options) => {
        commands.push({ command, args, options });
        if (command === "ssh" && options.input?.includes("mkdir -p")) {
          authorizationAttempts += 1;
          if (authorizationAttempts < 3) {
            throw new Error("not authorized yet");
          }
        }
        return { code: 0, stdout: "", stderr: "" };
      },
    });

    expect(authorizationAttempts).toBe(3);
    expect(sleeps).toEqual([10_000, 10_000]);
    const authorizationCommands = commands.filter(
      (entry) => entry.command === "ssh" && entry.options.input?.includes("mkdir -p"),
    );
    expect(authorizationCommands.every((entry) => entry.options.timeout === 10_000)).toBe(true);
    const manifest = readFileSync(session.manifestPath, "utf8");
    expect(manifest).toContain(`source_product_commit=${sourceProductCommit}`);
    expect(manifest).toContain(`relay_commit=${relayCommit}`);
    expect(manifest).toContain(`source_run_id=${env.GITHUB_RUN_ID}`);
    expect(manifest).toContain(`dmg_basename=${basename(buildResult.dmgPath)}`);
    expect(manifest).toContain(`bytes=${readFileSync(buildResult.dmgPath).byteLength}`);
    expect(manifest).toContain(`sha256=${buildResult.sha256}`);
    expect(manifest).toContain("part_count=32");
    expect(manifest).toContain("part_prefix=dmg-part-");
    expect(manifest).toContain(
      "classification=Universal QA / ad-hoc signed / not notarized",
    );

    const tar = commands.find((entry) => entry.command === "tar");
    expect(tar.args).toEqual([
      "-czf",
      session.evidenceArchivePath,
      "-C",
      root,
      basename(buildResult.evidenceDir),
    ]);
    const scpCommands = commands.filter((entry) => entry.command === "scp");
    const smallFilesScp = scpCommands.find((entry) => entry.args.includes(session.manifestPath));
    expect(smallFilesScp.args).toEqual([
      ...session.sshOptions,
      session.manifestPath,
      session.evidenceArchivePath,
      `root@159.75.175.47:${session.remoteDir}/`,
    ]);
    const partScpCommands = scpCommands.filter((entry) =>
      entry.args.at(-2)?.startsWith(session.partsDir),
    );
    expect(partScpCommands).toHaveLength(32);
    expect(
      partScpCommands.every(
        (entry) => entry.args.length === session.sshOptions.length + 2,
      ),
    ).toBe(true);
    expect(partScpCommands.map((entry) => basename(entry.args.at(-2))).sort()).toEqual(
      Array.from(
        { length: 32 },
        (_, index) => `dmg-part-${String(index).padStart(3, "0")}`,
      ),
    );
    expect(scpCommands.every((entry) => !entry.args.includes(buildResult.dmgPath))).toBe(true);
    expect(scpCommands.every((entry) => !entry.args.includes("-C"))).toBe(true);
    expect(scpCommands.every((entry) => entry.args.join(" ").match(/(?:\.app|target|E2E)/) === null)).toBe(
      true,
    );
    const remoteVerification = commands.at(-1);
    expect(remoteVerification.command).toBe("ssh");
    expect(remoteVerification.args).toEqual([
      ...session.sshOptions,
      "root@159.75.175.47",
      "bash",
      "-s",
      "--",
      env.GITHUB_RUN_ID,
    ]);
    expect(remoteVerification.options.input).toContain("sha256sum");
    expect(remoteVerification.options.input).toContain("delivery-manifest.txt");
    expect(remoteVerification.options.input).toContain('[ "$PART_COUNT" -eq 32 ]');
    expect(remoteVerification.options.input).toContain('[ "$PART_PREFIX" = "dmg-part-" ]');
    expect(remoteVerification.options.input).toContain("printf -v PART_SUFFIX '%03d'");
    expect(remoteVerification.options.input).toContain("ACTUAL_PART_COUNT");
    expect(remoteVerification.options.input).toContain('test -f "$PART_PATH"');
    expect(remoteVerification.options.input).toContain('test -s "$PART_PATH"');
    expect(remoteVerification.options.input).toContain('cat "$PART_PATH" >> "$TEMP_DMG"');
    expect(remoteVerification.options.input).toContain('stat -c \'%s\' "$TEMP_DMG"');
    expect(remoteVerification.options.input).toContain('sha256sum "$TEMP_DMG"');
    expect(remoteVerification.options.input).toContain('mv "$TEMP_DMG" "$FINAL_DMG"');
    expect(remoteVerification.options.input).toContain('rm "$PART_PATH"');
    expect(remoteVerification.options.input).toContain("REMAINING_PART_COUNT");
    expect(commands.every((entry) => entry.options.shell === false)).toBe(true);
    expect(logs).toContain(
      `CODEX_MACOS_RELAY_DELIVERED remote_dir=${session.remoteDir} dmg=${basename(buildResult.dmgPath)} sha256=${buildResult.sha256} transfer_mode=parallel-parts part_count=32`,
    );
  });
});
