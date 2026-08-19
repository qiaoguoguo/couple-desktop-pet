import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
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
  writeFileSync(dmgPath, "verified universal dmg");
  writeFileSync(join(evidenceDir, "verification.log"), "verified\n");
  const sha256 = createHash("sha256").update(readFileSync(dmgPath)).digest("hex");
  writeFileSync(join(evidenceDir, "sha256-dmg.log"), `${sha256}  ${dmgPath}\n`);
  return { dmgPath, evidenceDir, sha256 };
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

  it("waits for authorization, relays only the DMG, manifest, and build evidence, then verifies remotely", async () => {
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
    const scp = commands.find((entry) => entry.command === "scp");
    expect(scp.args).toEqual([
      ...session.sshOptions,
      buildResult.dmgPath,
      session.manifestPath,
      session.evidenceArchivePath,
      `root@159.75.175.47:${session.remoteDir}/`,
    ]);
    expect(scp.args.join(" ")).not.toMatch(/(?:\.app|target|E2E)/);
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
    expect(commands.every((entry) => entry.options.shell === false)).toBe(true);
    expect(logs).toContain(
      `CODEX_MACOS_RELAY_DELIVERED remote_dir=${session.remoteDir} dmg=${basename(buildResult.dmgPath)} sha256=${buildResult.sha256}`,
    );
  });
});
