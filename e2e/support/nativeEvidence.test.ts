import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createNativeParityEvidenceSession,
  initializeNativeParityEvidenceSession,
  recordNativeParityEvent,
  resolveNativeParityEvidenceDir,
} from "./nativeEvidence";

let tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tempRoots = [];
  delete process.env.MACOS_NATIVE_PARITY_EVIDENCE_DIR;
  delete process.env.GITHUB_ACTIONS;
  delete process.env.GITHUB_WORKSPACE;
  delete process.env.GITHUB_RUN_ID;
  delete process.env.GITHUB_RUN_ATTEMPT;
  delete process.env.GITHUB_SHA;
});

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "couple-pet-native-evidence-"));
  tempRoots.push(root);
  return root;
}

describe("native parity evidence directory resolution", () => {
  it("uses the explicit evidence directory first", () => {
    expect(
      resolveNativeParityEvidenceDir({
        MACOS_NATIVE_PARITY_EVIDENCE_DIR: "/tmp/explicit-native",
        GITHUB_ACTIONS: "true",
        GITHUB_WORKSPACE: "/tmp/workspace",
      }),
    ).toBe("/tmp/explicit-native");
  });

  it("defaults to the hidden SDD native directory in GitHub Actions", () => {
    expect(
      resolveNativeParityEvidenceDir({
        GITHUB_ACTIONS: "true",
        GITHUB_WORKSPACE: "/Users/runner/work/情侣 桌宠/repo",
      }),
    ).toBe(
      "/Users/runner/work/情侣 桌宠/repo/.superpowers/sdd/2026-08-07-macos-cross-platform/native",
    );
  });

  it("does not write evidence outside explicit or GitHub Actions environments", () => {
    expect(
      resolveNativeParityEvidenceDir({
        GITHUB_ACTIONS: "false",
        GITHUB_WORKSPACE: "/Users/runner/work/repo",
      }),
    ).toBeUndefined();
    expect(
      resolveNativeParityEvidenceDir({
        GITHUB_ACTIONS: "true",
        GITHUB_WORKSPACE: "relative/workspace",
      }),
    ).toBeUndefined();
  });

  it("initializes a fresh correlated session and truncates stale JSONL evidence", () => {
    const evidenceDir = makeTempRoot();
    const eventsPath = join(evidenceDir, "native-parity-events.jsonl");
    writeFileSync(eventsPath, "{\"event\":\"stale\"}\n");
    process.env.MACOS_NATIVE_PARITY_EVIDENCE_DIR = evidenceDir;
    process.env.GITHUB_RUN_ID = "31194601620";
    process.env.GITHUB_RUN_ATTEMPT = "2";
    process.env.GITHUB_SHA = "05cd7a84fc03b3e2c206c8cd5598b351327708ca";
    const consoleLines: string[] = [];

    const session = initializeNativeParityEvidenceSession({
      sessionId: "native-parity-session-test",
      logger: { log: (line: string) => consoleLines.push(line) },
    });
    recordNativeParityEvent("window-shell-observed", { visible: true });

    expect(session).toMatchObject({
      sessionId: "native-parity-session-test",
      githubRunId: "31194601620",
      githubRunAttempt: "2",
      githubSha: "05cd7a84fc03b3e2c206c8cd5598b351327708ca",
    });
    expect(consoleLines).toEqual([
      expect.stringContaining("NATIVE_PARITY_EVIDENCE_SESSION "),
    ]);
    expect(consoleLines[0]).toContain("native-parity-session-test");
    const rows = readFileSync(eventsPath, "utf8")
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      event: "window-shell-observed",
      sessionId: "native-parity-session-test",
      githubRunId: "31194601620",
      githubRunAttempt: "2",
      githubSha: "05cd7a84fc03b3e2c206c8cd5598b351327708ca",
    });
  });

  it("uses stable local fallback metadata when GitHub Actions env is absent", () => {
    const session = createNativeParityEvidenceSession(
      {},
      "native-parity-local-session",
    );

    expect(session).toEqual({
      sessionId: "native-parity-local-session",
      githubRunId: "local-run",
      githubRunAttempt: "local-attempt",
      githubSha: "local-sha",
    });
  });
});
