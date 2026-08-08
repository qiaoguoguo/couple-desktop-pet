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
  requiredNativeParityEvents,
  requiredQaEvidence,
  runFinalReleaseGateCli,
  scanProductionArtifacts,
} from "./final-release-gate.mjs";

const hash64 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const qaOnlySpctlMarker = "qa-only spctl assessment failure; ad-hoc QA builds are not formal release passes";
const nativeParitySession = {
  sessionId: "native-parity-session-test",
  githubRunId: "31194601620",
  githubRunAttempt: "2",
  githubSha: "05cd7a84fc03b3e2c206c8cd5598b351327708ca",
};
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

function minimalPng(width = 16, height = 16) {
  const buffer = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = 8;
  buffer[25] = 6;
  buffer[26] = 0;
  buffer[27] = 0;
  buffer[28] = 0;
  return buffer;
}

function nativeParitySessionMarker(session = nativeParitySession) {
  return `NATIVE_PARITY_EVIDENCE_SESSION ${JSON.stringify(session)}`;
}

function nativeParityDetailsFor(event) {
  const shared = { assertion: "non-sensitive assertion passed" };
  switch (event) {
    case "window-shell-observed":
      return {
        visible: true,
        decorated: false,
        resizable: false,
        alwaysOnTop: true,
        trayExists: true,
      };
    case "settings-persisted":
      return {
        autoMovePersisted: true,
        bubblesPersisted: true,
        alwaysOnTopPersisted: true,
      };
    case "tray-show":
      return { visible: true, trayExists: true };
    case "tray-settings":
      return { settingsVisible: true, trayExists: true };
    case "position-persisted":
      return { persisted: true };
    case "position-restored-after-restart":
      return { restored: true };
    case "scale-auto-move":
      return {
        scale: 1.2,
        moved: true,
        trigger: "e2e-native-auto-move-command",
        schedulerEvidence: "frontend-regression",
      };
    case "click-through-recovered":
      return { clickThrough: false };
    case "close-to-hide":
      return { visible: false };
    case "package-import-select-delete":
      return { imported: true, selected: true, deleted: true };
    case "status-card-opened":
      return {
        visible: true,
        source: "paired-state-ui-injection",
        pairingEvidence: "interop-workflow",
      };
    case "message-composer-opened":
      return {
        visible: true,
        source: "paired-state-ui-injection",
        pairingEvidence: "interop-workflow",
      };
    case "edge-left":
    case "edge-right":
    case "edge-top":
    case "edge-bottom":
      return { idle: true };
    default:
      return shared;
  }
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
    if (relativePath === "native/native-parity-events.jsonl") {
      writeEvidence(
        root,
        relativePath,
        `${requiredNativeParityEvents.map((event) => JSON.stringify({
          event,
          platform: "macos",
          role: "macos-native-parity",
          at: "2026-08-07T12:00:00.000Z",
          ...nativeParitySession,
          details: nativeParityDetailsFor(event),
        })).join("\n")}\n`,
      );
      continue;
    }
    if (relativePath === "macos/e2e-macos.log") {
      writeEvidence(
        root,
        relativePath,
        [
          nativeParitySessionMarker(),
          "Spec Files:      1 passed, 1 total (100% completed)",
          "1 passing",
          "",
        ].join("\n"),
      );
      continue;
    }
    if (relativePath === "native/no-dock-runtime.log") {
      writeEvidence(root, relativePath, "exit=0\n--- stdout ---\nbackgroundOnly=true\nvisible=true\n");
      continue;
    }
    if (relativePath.endsWith(".png")) {
      writeEvidence(root, relativePath, minimalPng());
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
      "native/no-dock-runtime.log",
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
    expect(requiredManualNativeEvidence).toContain("native/native-parity-events.jsonl");
    expect(requiredManualNativeEvidence).toContain("native/no-dock-runtime.log");
    expect(requiredManualNativeEvidence).toContain("native/app-window.png");
    expect(requiredNativeParityEvents).toContain("position-restored-after-restart");
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

  it("accepts explicit QA-only Gatekeeper evidence before formal signing evidence exists", () => {
    const root = makeTempRoot();
    writeCompleteEvidence(root, { includeFormal: false });
    writeEvidence(
      root,
      "native/spctl-assess.log",
      `exit=1\n--- stdout ---\n\n--- stderr ---\nrejected\n${qaOnlySpctlMarker}\n`,
    );

    const result = evaluateMacosReleaseGate(collectEvidenceStatus({ evidenceRoot: root }));

    expect(result).toMatchObject({
      status: "qa-only",
      reason: expect.stringContaining("Developer ID"),
    });
    expect(result.invalid).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "native/spctl-assess.log",
        }),
      ]),
    );
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
    writeEvidence(root, "build/lipo-verify-universal.log", "exit=0\n--- stdout ---\nArchitectures in the fat file: app are: arm64\n");
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
        expect.objectContaining({ path: "macos/e2e-macos.log", reason: expect.stringContaining("macOS WDIO") }),
        expect.objectContaining({ path: "interop/validator/validator.log", reason: expect.stringContaining("ok=true") }),
        expect.objectContaining({ path: "interop/windows/screenshots/windows-paired.png", reason: expect.stringContaining("empty") }),
      ]),
    );
  });

  it("accepts real WDIO completion output without a synthetic zero-failed line", () => {
    const root = makeTempRoot();
    writeCompleteEvidence(root, { includeFormal: false });
    writeEvidence(
      root,
      "macos/e2e-macos.log",
        [
          nativeParitySessionMarker(),
          "Spec Files:      1 passed, 1 total (100% completed)",
          "1 passing",
          "",
      ].join("\n"),
    );

    const result = evaluateMacosReleaseGate(collectEvidenceStatus({ evidenceRoot: root }));

    expect(result.status).toBe("qa-only");
    expect(result.invalid).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "macos/e2e-macos.log" })]),
    );
  });

  it("accepts real macOS WDIO output with multiple spec files and per-spec passing summaries", () => {
    const root = makeTempRoot();
    writeCompleteEvidence(root, { includeFormal: false });
    writeEvidence(
      root,
      "macos/e2e-macos.log",
      [
        nativeParitySessionMarker(),
        "[0-0] RUNNING in chrome - file:///app-shell.e2e.ts",
        "[0-0] 1 passing",
        "[0-1] RUNNING in chrome - file:///native-parity.e2e.ts",
        "[0-1] 7 passing",
        "Spec Files:      2 passed, 2 total (100% completed)",
        "",
      ].join("\n"),
    );

    const result = evaluateMacosReleaseGate(collectEvidenceStatus({ evidenceRoot: root }));

    expect(result.status).toBe("qa-only");
    expect(result.invalid).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "macos/e2e-macos.log" })]),
    );
  });

  it.each(
    [
      `[0-0] ${nativeParitySessionMarker()}`,
      `2026-08-08T05:42:00.123Z INFO webdriver: ${nativeParitySessionMarker()}`,
    ].map((markerLine) => [markerLine]),
  )("accepts native parity session marker with prefix: %s", (markerLine) => {
      const root = makeTempRoot();
      writeCompleteEvidence(root, { includeFormal: false });
      writeEvidence(
        root,
        "macos/e2e-macos.log",
        [
          markerLine,
          "Spec Files:      1 passed, 1 total (100% completed)",
          "1 passing",
          "",
        ].join("\n"),
      );

      const result = evaluateMacosReleaseGate(collectEvidenceStatus({ evidenceRoot: root }));

      expect(result.status).toBe("qa-only");
      expect(result.invalid).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ path: "macos/e2e-macos.log" })]),
      );
  });

  it.each([
      [[nativeParitySessionMarker(), `[0-0] ${nativeParitySessionMarker()}`], "exactly one"],
      [[`[0-0] ${nativeParitySessionMarker()} trailing-garbage`], "not valid JSON"],
      [["[0-0] NATIVE_PARITY_EVIDENCE_SESSION {not-json}"], "not valid JSON"],
  ])("rejects malformed native parity marker evidence: %s", (markerLines, reason) => {
      const root = makeTempRoot();
      writeCompleteEvidence(root, { includeFormal: false });
      writeEvidence(
        root,
        "macos/e2e-macos.log",
        [
          ...markerLines,
          "Spec Files:      1 passed, 1 total (100% completed)",
          "1 passing",
          "",
        ].join("\n"),
      );

      const result = evaluateMacosReleaseGate(collectEvidenceStatus({ evidenceRoot: root }));

      expect(result.status).toBe("blocked");
      expect(result.invalid).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "macos/e2e-macos.log",
            reason: expect.stringContaining(reason),
          }),
        ]),
      );
  });

  it("blocks malformed WDIO completion output even when it contains passing text", () => {
    for (const text of [
      "Spec Files:      1 passed, 2 total (100% completed)\n1 passing\n",
      "Spec Files:      1 passed, 1 total (50% completed)\n1 passing\n",
      "Spec Files:      1 passed, 1 total (100% completed)\nFAILED in native-parity.e2e.ts\n",
      "Spec Files:      1 passed, 1 total (100% completed)\n1 failed\n",
      `${nativeParitySessionMarker()}\nSpec Files:      2 passed, 2 total (100% completed)\n8 passing\n`,
    ]) {
      const root = makeTempRoot();
      writeCompleteEvidence(root);
      writeEvidence(root, "macos/e2e-macos.log", text);

      const result = evaluateMacosReleaseGate(collectEvidenceStatus({ evidenceRoot: root }));

      expect(result.status).toBe("blocked");
      expect(result.invalid).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "macos/e2e-macos.log",
            reason: expect.stringContaining("macOS WDIO"),
          }),
        ]),
      );
    }
  }, 20_000);

  it("allows empty cargo fmt evidence while still rejecting other empty required logs", () => {
    const cargoFmtRoot = makeTempRoot();
    writeCompleteEvidence(cargoFmtRoot, { includeFormal: false });
    writeEvidence(cargoFmtRoot, "macos/cargo-fmt-check.log", "");

    const cargoFmtResult = evaluateMacosReleaseGate(
      collectEvidenceStatus({ evidenceRoot: cargoFmtRoot }),
    );

    expect(cargoFmtResult.status).toBe("qa-only");
    expect(cargoFmtResult.invalid).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "macos/cargo-fmt-check.log" })]),
    );

    const ordinaryLogRoot = makeTempRoot();
    writeCompleteEvidence(ordinaryLogRoot, { includeFormal: false });
    writeEvidence(ordinaryLogRoot, "macos/pnpm-test.log", "");

    const ordinaryLogResult = evaluateMacosReleaseGate(
      collectEvidenceStatus({ evidenceRoot: ordinaryLogRoot }),
    );

    expect(ordinaryLogResult.status).toBe("blocked");
    expect(ordinaryLogResult.invalid).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "macos/pnpm-test.log",
          reason: expect.stringContaining("empty"),
        }),
      ]),
    );
  });

  it("blocks when native parity events are missing from the structured macOS WDIO evidence", () => {
    const root = makeTempRoot();
    writeCompleteEvidence(root);
    writeEvidence(
      root,
      "native/native-parity-events.jsonl",
      `${requiredNativeParityEvents
        .filter((event) => event !== "edge-bottom")
        .map((event) => JSON.stringify({
          event,
          platform: "macos",
          role: "macos-native-parity",
          at: "2026-08-07T12:00:00.000Z",
          ...nativeParitySession,
          details: nativeParityDetailsFor(event),
        }))
        .join("\n")}\n`,
    );

    const result = evaluateMacosReleaseGate(collectEvidenceStatus({ evidenceRoot: root }));

    expect(result.status).toBe("blocked");
    expect(result.invalid).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "native/native-parity-events.jsonl",
          reason: expect.stringContaining("edge-bottom"),
        }),
      ]),
    );
  });

  it("blocks when native parity event details are false or missing", () => {
    for (const [event, details, reason] of [
      ["window-shell-observed", { ...nativeParityDetailsFor("window-shell-observed"), trayExists: false }, "trayExists"],
      ["position-restored-after-restart", {}, "restored"],
      ["scale-auto-move", { scale: 1.2, moved: false }, "moved"],
      ["scale-auto-move", { scale: 1.2, moved: true }, "trigger"],
      ["status-card-opened", { visible: true }, "source"],
      ["edge-left", { idle: false }, "idle"],
    ]) {
      const root = makeTempRoot();
      writeCompleteEvidence(root);
      writeEvidence(
        root,
        "native/native-parity-events.jsonl",
        `${requiredNativeParityEvents.map((requiredEvent) => JSON.stringify({
          event: requiredEvent,
          platform: "macos",
          role: "macos-native-parity",
          at: "2026-08-07T12:00:00.000Z",
          ...nativeParitySession,
          details: requiredEvent === event ? details : nativeParityDetailsFor(requiredEvent),
        })).join("\n")}\n`,
      );

      const result = evaluateMacosReleaseGate(collectEvidenceStatus({ evidenceRoot: root }));

      expect(result.status).toBe("blocked");
      expect(result.invalid).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "native/native-parity-events.jsonl",
            reason: expect.stringContaining(reason),
          }),
        ]),
      );
    }
  }, 20_000);

  it("blocks when interop JSONL role schema or privacy constraints are violated", () => {
    const root = makeTempRoot();
    writeCompleteEvidence(root);
    const sensitiveRows = [
      JSON.stringify({
        event: "windows-pair-code-created",
        role: "macos",
        platform: "windows",
        at: "2026-08-07T12:00:00.000Z",
        details: { message: "interop message text", token: "<redacted>" },
      }),
      JSON.stringify({
        event: "failure",
        role: "windows",
        platform: "windows",
        at: "2026-08-07T12:00:01.000Z",
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

  it("requires every interop JSONL row to use the complete safe top-level schema", () => {
    const root = makeTempRoot();
    writeCompleteEvidence(root);
    writeEvidence(
      root,
      "interop/macos/events.jsonl",
      `${JSON.stringify({ event: "macos-pair-accepted", role: "macos" })}\n`,
    );

    const missingSchema = evaluateMacosReleaseGate(collectEvidenceStatus({ evidenceRoot: root }));

    expect(missingSchema.status).toBe("blocked");
    expect(missingSchema.invalid).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "interop/macos/events.jsonl",
          reason: expect.stringContaining("platform"),
        }),
      ]),
    );

    writeCompleteEvidence(root);
    writeEvidence(
      root,
      "interop/macos/events.jsonl",
      `${JSON.stringify({
        event: "macos-pair-accepted",
        role: "macos",
        platform: "windows",
        at: "not-a-date",
        details: [],
      })}\n`,
    );

    const invalidSchema = evaluateMacosReleaseGate(collectEvidenceStatus({ evidenceRoot: root }));
    expect(invalidSchema.status).toBe("blocked");
    expect(invalidSchema.invalid).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "interop/macos/events.jsonl",
          reason: expect.stringContaining("platform"),
        }),
      ]),
    );
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

    writeEvidence(
      root,
      "native/manual-checklist.log",
      `${requiredManualCheckIds.map((id) => `${id}=PASS`).join("\n")}\nno-dock=PASS=garbage\n`,
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

  it("requires PNG evidence to have a valid signature and positive IHDR dimensions", () => {
    for (const [relativePath, content, reason] of [
      ["native/app-window.png", "not a png", "PNG signature"],
      [
        "native/edge-left.png",
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        "IHDR",
      ],
      ["interop/windows/screenshots/windows-paired.png", minimalPng(8, 16), "at least 16x16"],
    ]) {
      const root = makeTempRoot();
      writeCompleteEvidence(root);
      writeEvidence(root, relativePath, content);

      const result = evaluateMacosReleaseGate(collectEvidenceStatus({ evidenceRoot: root }));

      expect(result.status).toBe("blocked");
      expect(result.invalid).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: relativePath,
            reason: expect.stringContaining(reason),
          }),
        ]),
      );
    }
  });

  it("blocks stale or mixed native parity sessions that do not match the WDIO log marker", () => {
    const mixedRoot = makeTempRoot();
    writeCompleteEvidence(mixedRoot, { includeFormal: false });
    writeEvidence(
      mixedRoot,
      "native/native-parity-events.jsonl",
      `${requiredNativeParityEvents.map((event, index) => JSON.stringify({
        event,
        platform: "macos",
        role: "macos-native-parity",
        at: "2026-08-07T12:00:00.000Z",
        ...nativeParitySession,
        sessionId: index === 0 ? "stale-session" : nativeParitySession.sessionId,
        details: nativeParityDetailsFor(event),
      })).join("\n")}\n`,
    );

    const mixedResult = evaluateMacosReleaseGate(collectEvidenceStatus({ evidenceRoot: mixedRoot }));
    expect(mixedResult.status).toBe("blocked");
    expect(mixedResult.invalid).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "native/native-parity-events.jsonl",
          reason: expect.stringContaining("same native parity session"),
        }),
      ]),
    );

    const mismatchRoot = makeTempRoot();
    writeCompleteEvidence(mismatchRoot, { includeFormal: false });
    writeEvidence(
      mismatchRoot,
      "macos/e2e-macos.log",
      [
        nativeParitySessionMarker({ ...nativeParitySession, githubSha: "different-sha" }),
        "Spec Files:      1 passed, 1 total (100% completed)",
        "1 passing",
        "",
      ].join("\n"),
    );

    const mismatchResult = evaluateMacosReleaseGate(collectEvidenceStatus({ evidenceRoot: mismatchRoot }));
    expect(mismatchResult.status).toBe("blocked");
    expect(mismatchResult.invalid).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "native/native-parity-events.jsonl",
          reason: expect.stringContaining("does not match macos/e2e-macos.log"),
        }),
      ]),
    );
  });

  it("does not read PNG files as UTF-8 while rejecting recorded exit logs with nonzero exit", () => {
    const root = makeTempRoot();
    writeCompleteEvidence(root);
    writeEvidence(root, "native/app-window.png", minimalPng());
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

  it.each([
      ["build/hdiutil-attach-dmg.log", "exit=-1\n--- stdout ---\nok\n"],
      ["native/process-exists.log", "exit=foo\n--- stdout ---\nok\n"],
      ["build/codesign-verify-app.log", "--- stdout ---\nok\n"],
  ])("requires recorded command log to start with exact exit=0: %s", (relativePath, text) => {
      const root = makeTempRoot();
      writeCompleteEvidence(root);
      writeEvidence(root, relativePath, text);

      const result = evaluateMacosReleaseGate(collectEvidenceStatus({ evidenceRoot: root }));

      expect(result.status).toBe("blocked");
      expect(result.invalid).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: relativePath,
            reason: expect.stringContaining("exit=0"),
          }),
        ]),
      );
  });

  it.each([
      [`exit=foo\n--- stderr ---\n${qaOnlySpctlMarker}\n`, "positive nonzero"],
      ["exit=1\n--- stderr ---\nrejected\n", "QA-only marker"],
      [`--- stderr ---\n${qaOnlySpctlMarker}\n`, "exit="],
  ])("rejects malformed QA-only Gatekeeper evidence: %s", (text, reason) => {
      const root = makeTempRoot();
      writeCompleteEvidence(root, { includeFormal: false });
      writeEvidence(root, "native/spctl-assess.log", text);

      const result = evaluateMacosReleaseGate(collectEvidenceStatus({ evidenceRoot: root }));

      expect(result.status).toBe("blocked");
      expect(result.invalid).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "native/spctl-assess.log",
            reason: expect.stringContaining(reason),
          }),
        ]),
      );
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
        "dist/assets/realtime.js": "__COUPLE_PET_E2E_REALTIME_OVERRIDE__",
        "src-tauri/capabilities/default.json": '"wdio:default"',
        "src-tauri/tauri.conf.json": '"tauri-plugin-wdio"',
      }),
    ).toEqual({
      ok: false,
      findings: [
        { path: "dist/assets/index.js", needle: "@wdio/tauri-plugin" },
        {
          path: "dist/assets/realtime.js",
          needle: "__COUPLE_PET_E2E_REALTIME_OVERRIDE__",
        },
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
}, 15000);
