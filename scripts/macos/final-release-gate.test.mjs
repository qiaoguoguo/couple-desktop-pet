import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { requiredInteropEvents } from "../interop/cross-platform-smoke.mjs";
import {
  collectEvidenceStatus,
  evaluateMacosReleaseGate,
  requiredFinalEvidence,
  requiredFormalEvidence,
  requiredManualNativeEvidence,
  requiredManualCheckIds,
  requiredQaEvidence,
  runFinalReleaseGateCli,
  scanProductionArtifacts,
} from "./final-release-gate.mjs";

const hash64 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
let tempRoots = [];

function makeTempRoot() {
  const root = mkdtempSync(join(tmpdir(), "couple-pet-final-gate-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tempRoots = [];
});

function writeEvidence(root, relativePath, text = "ok\n") {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function writeCompleteEvidence(root, { includeFormal = true } = {}) {
  const required = includeFormal
    ? requiredFinalEvidence
    : requiredFinalEvidence.filter((path) => !requiredFormalEvidence.includes(path));

  for (const relativePath of required) {
    if (relativePath === "interop/windows/events.jsonl" || relativePath === "interop/macos/events.jsonl") {
      continue;
    }
    if (relativePath === "interop/validator/validator.log") {
      writeEvidence(root, relativePath, JSON.stringify({ ok: true, missing: [] }));
      continue;
    }
    if (relativePath === "native/manual-checklist.log") {
      writeEvidence(root, relativePath, `${requiredManualCheckIds.map((id) => `${id}=PASS`).join("\n")}\n`);
      continue;
    }
    if (relativePath === "macos/e2e-macos.log") {
      writeEvidence(root, relativePath, "Spec Files: 1 passed, 0 failed\n");
      continue;
    }
    if (relativePath.endsWith(".png")) {
      writeEvidence(root, relativePath, "\x89PNG\r\n");
      continue;
    }
    if (relativePath.includes("lipo-verify-universal")) {
      writeEvidence(root, relativePath, "exit=0\n--- stdout ---\nArchitectures in the fat file: app are: x86_64 arm64\n");
      continue;
    }
    if (isRecordedExitLogFixture(relativePath)) {
      writeEvidence(root, relativePath, "exit=0\n--- stdout ---\nok\n--- stderr ---\n");
      continue;
    }
    if (relativePath.includes("sha256-")) {
      writeEvidence(root, relativePath, `${hash64}  artifact\n`);
      continue;
    }
    writeEvidence(root, relativePath);
  }

  writeInteropLogs(root);
}

function isRecordedExitLogFixture(relativePath) {
  return (
    relativePath.startsWith("native/") &&
    [
      "native/sw-vers.log",
      "native/uname-machine.log",
      "native/system-profiler.log",
      "native/source-info-plist.log",
      "native/generated-info-plist.log",
      "native/codesign-display.log",
      "native/codesign-verify.log",
      "native/spctl-assess.log",
      "native/launch-app.log",
      "native/process-exists.log",
      "native/quit-app.log",
    ].includes(relativePath)
  ) || (
    relativePath.startsWith("build/") &&
    [
      "build/plutil-source-info-plist.log",
      "build/hdiutil-verify-dmg.log",
      "build/hdiutil-attach-dmg.log",
      "build/plutil-generated-info-plist.log",
      "build/file-app-binary.log",
      "build/lipo-verify-universal.log",
      "build/codesign-verify-app.log",
      "build/codesign-describe-app.log",
      "build/hdiutil-detach-dmg.log",
    ].includes(relativePath)
  );
}

function writeInteropLogs(root, omitEvent) {
  const windowsRows = [];
  const macosRows = [];
  for (const event of requiredInteropEvents) {
    if (event === omitEvent) {
      continue;
    }
    const row = JSON.stringify({
      event,
      role: event.startsWith("windows") ? "windows" : "macos",
      platform: event.startsWith("windows") ? "windows" : "macos",
      at: "2026-08-07T12:00:00.000Z",
      details: { assertion: "non-sensitive assertion passed" },
    });
    if (event.startsWith("macos")) {
      macosRows.push(row);
    } else {
      windowsRows.push(row);
    }
  }
  writeEvidence(root, "interop/windows/events.jsonl", `${windowsRows.join("\n")}\n`);
  writeEvidence(root, "interop/macos/events.jsonl", `${macosRows.join("\n")}\n`);
}

describe("macOS final release gate", () => {
  it("defines external evidence without using the generated decision as input", () => {
    expect(requiredQaEvidence).toContain("build/plutil-generated-info-plist.log");
    expect(requiredQaEvidence).toContain("network/macos-http-ws-relay.log");
    expect(requiredQaEvidence).toContain("macos/cargo-tree-production.log");
    expect(requiredQaEvidence).toContain("build/lipo-verify-universal.log");
    expect(requiredQaEvidence).toContain("macos/e2e-macos-build.log");
    expect(requiredQaEvidence).toContain("macos/e2e-macos.log");
    expect(requiredManualNativeEvidence).toContain("native/app-window.png");
    expect(requiredFormalEvidence).toContain("build/stapler-validate-dmg.log");
    expect(requiredFinalEvidence).toContain("interop/windows/events.jsonl");
    expect(requiredFinalEvidence).toContain("interop/macos/events.jsonl");
    expect(requiredFinalEvidence).toContain("interop/validator/validator.log");
    expect(requiredFinalEvidence).toContain("interop/windows/screenshots/windows-paired.png");
    expect(requiredFinalEvidence).toContain("interop/windows/screenshots/windows-peer-status-slacking.png");
    expect(requiredFinalEvidence).toContain("interop/windows/screenshots/windows-message-animation.png");
    expect(requiredFinalEvidence).toContain("interop/windows/screenshots/windows-unpaired.png");
    expect(requiredFinalEvidence).toContain("interop/macos/screenshots/macos-paired.png");
    expect(requiredFinalEvidence).toContain("interop/macos/screenshots/macos-peer-status-slacking.png");
    expect(requiredFinalEvidence).toContain("interop/macos/screenshots/macos-message-animation.png");
    expect(requiredFinalEvidence).toContain("interop/macos/screenshots/macos-unpaired.png");
    expect(requiredFinalEvidence).not.toContain("interop/events.jsonl");
    expect(requiredFinalEvidence).not.toContain("release-decision.md");
  });

  it("completes only when QA, native, interop, and formal evidence are valid", () => {
    const root = makeTempRoot();
    writeCompleteEvidence(root);

    const collected = collectEvidenceStatus({ evidenceRoot: root });

    expect(evaluateMacosReleaseGate(collected)).toMatchObject({
      status: "complete",
      missing: [],
      invalid: [],
    });
  });

  it("returns qa-only after non-formal evidence passes but formal Developer ID evidence is absent", () => {
    const root = makeTempRoot();
    writeCompleteEvidence(root, { includeFormal: false });

    const result = evaluateMacosReleaseGate(collectEvidenceStatus({ evidenceRoot: root }));

    expect(result).toMatchObject({
      status: "qa-only",
      reason: expect.stringContaining("Developer ID"),
    });
    expect(result.missing).toContain("build/codesign-verify-app-final.log");
  });

  it("blocks before qa-only when runtime or interop evidence is missing", () => {
    const root = makeTempRoot();
    writeCompleteEvidence(root, { includeFormal: false });
    rmSync(join(root, "native", "app-window.png"));

    const result = evaluateMacosReleaseGate(collectEvidenceStatus({ evidenceRoot: root }));

    expect(result.status).toBe("blocked");
    expect(result.missing).toContain("native/app-window.png");
  });

  it("blocks on zero-byte files, bad universal slices, bad hashes, and incomplete interop events", () => {
    const root = makeTempRoot();
    writeCompleteEvidence(root);
    writeEvidence(root, "native/process-exists.log", "");
    writeEvidence(root, "build/lipo-verify-universal.log", "Architectures in the fat file: app are: arm64\n");
    writeEvidence(root, "build/sha256-dmg.log", "not-a-sha  artifact\n");
    writeInteropLogs(root, "macos-message-animation-observed");

    const result = evaluateMacosReleaseGate(collectEvidenceStatus({ evidenceRoot: root }));

    expect(result.status).toBe("blocked");
    expect(result.invalid).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "native/process-exists.log", reason: expect.stringContaining("empty") }),
        expect.objectContaining({ path: "build/lipo-verify-universal.log", reason: expect.stringContaining("x86_64") }),
        expect.objectContaining({ path: "build/sha256-dmg.log", reason: expect.stringContaining("SHA-256") }),
        expect.objectContaining({
          path: "interop/windows/events.jsonl",
          reason: expect.stringContaining("macos-message-animation-observed"),
        }),
      ]),
    );
  });

  it("blocks when WDIO macOS E2E, validator JSON, or required interop screenshots are not semantically valid", () => {
    const root = makeTempRoot();
    writeCompleteEvidence(root);
    writeEvidence(root, "macos/e2e-macos.log", "Spec Files: 0 passed, 1 failed\n");
    writeEvidence(root, "interop/validator/validator.log", JSON.stringify({ ok: false, missing: ["windows-peer-online"] }));
    writeEvidence(root, "interop/windows/screenshots/windows-paired.png", "");

    const result = evaluateMacosReleaseGate(collectEvidenceStatus({ evidenceRoot: root }));

    expect(result.status).toBe("blocked");
    expect(result.invalid).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "macos/e2e-macos.log", reason: expect.stringContaining("1 passed") }),
        expect.objectContaining({ path: "interop/validator/validator.log", reason: expect.stringContaining("ok=true") }),
        expect.objectContaining({ path: "interop/windows/screenshots/windows-paired.png", reason: expect.stringContaining("empty") }),
      ]),
    );
  });

  it("blocks when interop JSONL role schema or privacy constraints are violated", () => {
    const root = makeTempRoot();
    writeCompleteEvidence(root);
    const sensitiveRows = [
      JSON.stringify({
        event: "windows-pair-code-created",
        role: "macos",
        platform: "windows",
        details: { message: "interop message text", token: "<redacted>" },
      }),
      JSON.stringify({
        event: "failure",
        role: "windows",
        platform: "windows",
        details: { errorSummary: "github_pat_1234567890abcdefghijklmnopqrstuv" },
      }),
    ];
    writeEvidence(root, "interop/windows/events.jsonl", `${sensitiveRows.join("\n")}\n`);

    const result = evaluateMacosReleaseGate(collectEvidenceStatus({ evidenceRoot: root }));

    expect(result.status).toBe("blocked");
    expect(result.invalid).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "interop/windows/events.jsonl",
          reason: expect.stringContaining("role"),
        }),
      ]),
    );
    const reasonText = result.invalid.map((entry) => entry.reason).join("\n");
    expect(reasonText).not.toContain("interop message text");
    expect(reasonText).not.toContain("github_pat_");
  });

  it("requires every manual native check id to pass explicitly", () => {
    const root = makeTempRoot();
    writeCompleteEvidence(root);
    writeEvidence(
      root,
      "native/manual-checklist.log",
      `${requiredManualCheckIds.filter((id) => id !== "four-edge-current-behavior").map((id) => `${id}=PASS`).join("\n")}\n`,
    );

    expect(evaluateMacosReleaseGate(collectEvidenceStatus({ evidenceRoot: root }))).toMatchObject({
      status: "blocked",
      invalid: expect.arrayContaining([
        expect.objectContaining({
          path: "native/manual-checklist.log",
          reason: expect.stringContaining("four-edge-current-behavior"),
        }),
      ]),
    });

    writeEvidence(
      root,
      "native/manual-checklist.log",
      `${requiredManualCheckIds.map((id) => `${id}=${id === "no-dock" ? "FAIL" : "PASS"}`).join("\n")}\n`,
    );
    expect(evaluateMacosReleaseGate(collectEvidenceStatus({ evidenceRoot: root }))).toMatchObject({
      status: "blocked",
      invalid: expect.arrayContaining([
        expect.objectContaining({
          path: "native/manual-checklist.log",
          reason: expect.stringContaining("no-dock"),
        }),
      ]),
    });
  });

  it("does not read PNG files as UTF-8 while rejecting recorded exit logs with nonzero exit", () => {
    const root = makeTempRoot();
    writeCompleteEvidence(root);
    writeEvidence(root, "native/app-window.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]));
    writeEvidence(root, "build/hdiutil-attach-dmg.log", "exit=1\n--- stdout ---\nok\n");

    const result = evaluateMacosReleaseGate(collectEvidenceStatus({ evidenceRoot: root }));

    expect(result.status).toBe("blocked");
    expect(result.invalid).toEqual([
      expect.objectContaining({
        path: "build/hdiutil-attach-dmg.log",
        reason: expect.stringContaining("exit=0"),
      }),
    ]);
  });

  it("scans only production artifacts for forbidden E2E symbols", () => {
    expect(
      scanProductionArtifacts({
        "dist/assets/index.js": "console.log('production');",
        "src-tauri/capabilities/default.json": '{"permissions":[]}',
        "src-tauri/tauri.conf.json": '{"app":{}}',
      }),
    ).toEqual({ ok: true, findings: [] });

    expect(
      scanProductionArtifacts({
        "dist/assets/index.js": "import '@wdio/tauri-plugin';",
        "src-tauri/capabilities/default.json": '"wdio:default"',
        "src-tauri/tauri.conf.json": '"tauri-plugin-wdio"',
      }),
    ).toEqual({
      ok: false,
      findings: [
        { path: "dist/assets/index.js", needle: "@wdio/tauri-plugin" },
        { path: "src-tauri/capabilities/default.json", needle: "wdio:default" },
        { path: "src-tauri/tauri.conf.json", needle: "tauri-plugin-wdio" },
      ],
    });
  });

  it("writes a safe decision after evaluation and uses exit codes for each status", async () => {
    const completeRoot = makeTempRoot();
    writeCompleteEvidence(completeRoot);
    const stdout = { log: () => {} };
    const stderr = { error: () => {} };

    await expect(
      runFinalReleaseGateCli(["--evidence-root", completeRoot], {
        stdout,
        stderr,
        now: () => new Date("2026-08-07T12:00:00Z"),
      }),
    ).resolves.toBe(0);
    const completeDecision = readFileSync(join(completeRoot, "release-decision.md"), "utf8");
    expect(completeDecision).toContain("Status: complete");
    expect(completeDecision).not.toContain("Architectures in the fat file");
    expect(completeDecision).not.toContain(hash64);

    const qaRoot = makeTempRoot();
    writeCompleteEvidence(qaRoot, { includeFormal: false });
    await expect(runFinalReleaseGateCli(["--evidence-root", qaRoot], { stdout, stderr })).resolves.toBe(1);
    expect(readFileSync(join(qaRoot, "release-decision.md"), "utf8")).toContain("Status: qa-only");

    const blockedRoot = makeTempRoot();
    mkdirSync(blockedRoot, { recursive: true });
    await expect(
      runFinalReleaseGateCli(["--evidence-root", blockedRoot], { stdout, stderr }),
    ).resolves.toBe(1);
    expect(readFileSync(join(blockedRoot, "release-decision.md"), "utf8")).toContain("Status: blocked");
  });

  it("runs production scan mode without shelling out and reports forbidden findings", async () => {
    const cleanStdout = { log: (text) => cleanLines.push(text) };
    const cleanLines = [];
    await expect(
      runFinalReleaseGateCli(["--scan-production"], {
        stdout: cleanStdout,
        textByPath: {
          "dist/index.js": "ok",
          "src-tauri/capabilities/default.json": "{}",
          "src-tauri/tauri.conf.json": "{}",
        },
      }),
    ).resolves.toBe(0);
    expect(cleanLines.join("\n")).toContain("production scan clean");

    const errorLines = [];
    await expect(
      runFinalReleaseGateCli(["--scan-production"], {
        stdout: { log: (text) => errorLines.push(text) },
        textByPath: {
          "dist/index.js": "tauri_plugin_wdio_webdriver",
        },
      }),
    ).resolves.toBe(1);
    expect(errorLines.join("\n")).toContain("dist/index.js");
    expect(errorLines.join("\n")).toContain("tauri_plugin_wdio_webdriver");
  });

  it("keeps evidence checks tied to regular non-empty files", () => {
    const root = makeTempRoot();
    writeCompleteEvidence(root);
    rmSync(join(root, "build", "codesign-verify-app.log"));
    mkdirSync(join(root, "build", "codesign-verify-app.log"), { recursive: true });

    const status = collectEvidenceStatus({ evidenceRoot: root });

    expect(status.invalid).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "build/codesign-verify-app.log",
          reason: expect.stringContaining("regular file"),
        }),
      ]),
    );
    expect(statSync(join(root, "release-decision.md"), { throwIfNoEntry: false })).toBeUndefined();
  });
});
