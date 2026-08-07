import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readSanitizedJsonl,
  requiredInteropEvents,
  validateInteropEvents,
} from "../interop/cross-platform-smoke.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const defaultEvidenceRoot = ".superpowers/sdd/2026-08-07-macos-cross-platform";
const decisionFileName = "release-decision.md";

export const requiredQaEvidence = [
  "windows/pnpm-test.log",
  "windows/pnpm-typecheck.log",
  "windows/pnpm-build.log",
  "windows/cargo-test.log",
  "windows/cargo-check.log",
  "macos/pnpm-test.log",
  "macos/pnpm-typecheck.log",
  "macos/pnpm-build.log",
  "macos/cargo-test.log",
  "macos/cargo-check.log",
  "macos/cargo-fmt-check.log",
  "macos/production-permission-scan.log",
  "macos/cargo-tree-production.log",
  "macos/e2e-macos-build.log",
  "macos/e2e-macos.log",
  "build/plutil-source-info-plist.log",
  "build/hdiutil-verify-dmg.log",
  "build/hdiutil-attach-dmg.log",
  "build/plutil-generated-info-plist.log",
  "build/file-app-binary.log",
  "build/lipo-verify-universal.log",
  "build/codesign-verify-app.log",
  "build/codesign-describe-app.log",
  "build/hdiutil-detach-dmg.log",
  "build/sha256-dmg.log",
  "build/sha256-app-binary.log",
  "network/macos-http-ws-relay.log",
];

export const requiredManualNativeEvidence = [
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
  "native/app-window.png",
  "native/no-dock-before.png",
  "native/no-dock-after.png",
  "native/manual-checklist.log",
  "native/menu-bar-tray.png",
  "native/tray-show.log",
  "native/tray-settings.log",
  "native/tray-quit.log",
  "native/transparent-light.png",
  "native/transparent-dark.png",
  "native/always-on-top-before.png",
  "native/always-on-top-after.png",
  "native/drag-position-before.log",
  "native/drag-position-after.log",
  "native/restart-position.log",
  "native/scale-auto-move.log",
  "native/scale-auto-move.png",
  "native/click-through-enabled.log",
  "native/click-through-recovered.log",
  "native/click-through-recovered.png",
  "native/close-to-hide.log",
  "native/quit-app.log",
  "native/settings.png",
  "native/package-import.png",
  "native/status-card.png",
  "native/message-composer.png",
  "native/edge-left.png",
  "native/edge-right.png",
  "native/edge-top.png",
  "native/edge-bottom.png",
];

export const requiredManualCheckIds = [
  "no-dock",
  "menu-bar-tray",
  "transparent-window",
  "always-on-top",
  "drag-position-memory",
  "scale-auto-move",
  "click-through-recovery",
  "close-to-hide",
  "settings-package-status-composer",
  "four-edge-current-behavior",
];

export const requiredInteropEvidence = [
  "interop/windows/events.jsonl",
  "interop/macos/events.jsonl",
  "interop/validator/validator.log",
  "interop/windows/screenshots/windows-paired.png",
  "interop/windows/screenshots/windows-peer-status-slacking.png",
  "interop/windows/screenshots/windows-message-animation.png",
  "interop/windows/screenshots/windows-unpaired.png",
  "interop/macos/screenshots/macos-paired.png",
  "interop/macos/screenshots/macos-peer-status-slacking.png",
  "interop/macos/screenshots/macos-message-animation.png",
  "interop/macos/screenshots/macos-unpaired.png",
];

export const requiredFormalEvidence = [
  "build/codesign-verify-app-final.log",
  "build/codesign-describe-app-final.log",
  "build/notarytool-history.log",
  "build/stapler-validate-app.log",
  "build/stapler-validate-dmg.log",
  "build/spctl-assess-app.log",
  "build/spctl-assess-dmg.log",
  "build/hdiutil-verify-formal-dmg.log",
  "build/sha256-dmg-final.log",
  "build/sha256-app-binary-final.log",
];

export const requiredFinalEvidence = uniquePaths([
  ...requiredQaEvidence,
  ...requiredManualNativeEvidence,
  ...requiredInteropEvidence,
  ...requiredFormalEvidence,
]).filter((path) => path !== decisionFileName);

const forbiddenProductionNeedles = [
  "@wdio/tauri-plugin",
  "wdio:default",
  "wdio-webdriver:default",
  "tauri-plugin-wdio",
  "tauri_plugin_wdio",
  "tauri-plugin-wdio-webdriver",
  "tauri_plugin_wdio_webdriver",
];

const textFileExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".mjs",
  ".toml",
  ".txt",
]);

const recordedExitLogEvidence = new Set([
  "build/plutil-source-info-plist.log",
  "build/hdiutil-verify-dmg.log",
  "build/hdiutil-attach-dmg.log",
  "build/plutil-generated-info-plist.log",
  "build/file-app-binary.log",
  "build/lipo-verify-universal.log",
  "build/codesign-verify-app.log",
  "build/codesign-describe-app.log",
  "build/hdiutil-detach-dmg.log",
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
]);

const allowedInteropDiagnosticEvents = new Set([
  "failure",
  "screenshot-skipped",
  "screenshot-failed",
]);

const sensitiveInteropKeys = new Set([
  "deviceSecret",
  "errorMessage",
  "errorSummary",
  "message",
  "messageText",
  "pairCode",
  "secret",
  "stack",
  "stderr",
  "stdout",
  "token",
]);

const githubTokenPattern = /\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[opsu]_[A-Za-z0-9_]{20,})\b/;

function uniquePaths(paths) {
  return [...new Set(paths)];
}

export function inspectEvidenceFile({ evidenceRoot, relativePath }) {
  const fullPath = join(evidenceRoot, relativePath);
  if (!existsSync(fullPath)) {
    return { path: relativePath, status: "missing", reason: "missing evidence file" };
  }

  const stat = statSync(fullPath);
  if (!stat.isFile()) {
    return { path: relativePath, status: "invalid", reason: "evidence path is not a regular file" };
  }

  if (stat.size === 0) {
    return { path: relativePath, status: "invalid", reason: "evidence file is empty" };
  }

  if (relativePath.endsWith(".png")) {
    return { path: relativePath, status: "valid" };
  }

  const content = readFileSync(fullPath, "utf8");
  const validatorError = validateEvidenceContent(relativePath, content);
  if (validatorError) {
    return { path: relativePath, status: "invalid", reason: validatorError };
  }

  return { path: relativePath, status: "valid" };
}

function validateEvidenceContent(relativePath, content) {
  const exitError = validateRecordedExitLog(relativePath, content);
  if (exitError) {
    return exitError;
  }

  if (relativePath.includes("lipo-verify-universal")) {
    const missing = ["x86_64", "arm64"].filter((arch) => !content.includes(arch));
    if (missing.length > 0) {
      return `lipo evidence missing ${missing.join(" and ")} slice`;
    }
  }

  if (relativePath.includes("sha256-") && !/\b[a-fA-F0-9]{64}\b/.test(content)) {
    return "SHA-256 evidence must contain a 64 character hexadecimal digest";
  }

  if (relativePath === "macos/e2e-macos.log") {
    if (!/\b1\s+passed\b/i.test(content) || !/\b0\s+failed\b/i.test(content)) {
      return "macOS WDIO E2E evidence must contain a 1 passed / 0 failed completion marker";
    }
  }

  if (relativePath === "native/manual-checklist.log") {
    return validateManualChecklist(content);
  }

  if (relativePath === "interop/validator/validator.log") {
    return validateInteropValidatorLog(content);
  }

  return undefined;
}

function validateRecordedExitLog(relativePath, content) {
  if (!recordedExitLogEvidence.has(relativePath)) {
    return undefined;
  }
  const firstLine = content.split(/\r?\n/, 1)[0]?.trim() ?? "";
  const match = firstLine.match(/^exit=(\d+)$/);
  if (match && match[1] !== "0") {
    return "recorded evidence log must start with exit=0 when it includes an exit header";
  }
  return undefined;
}

function validateManualChecklist(content) {
  const checks = new Map();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const [id, value] = trimmed.split("=");
    checks.set(id, value);
  }

  const failed = [];
  const missing = [];
  for (const id of requiredManualCheckIds) {
    if (!checks.has(id)) {
      missing.push(id);
      continue;
    }
    if (checks.get(id) !== "PASS") {
      failed.push(id);
    }
  }

  if (missing.length > 0) {
    return `manual checklist missing PASS rows for: ${missing.join(", ")}`;
  }
  if (failed.length > 0) {
    return `manual checklist has non-PASS rows for: ${failed.join(", ")}`;
  }
  return undefined;
}

function validateInteropValidatorLog(content) {
  const summary = parseLastJsonObjectLine(content);
  if (!summary) {
    return "interop validator evidence must contain a JSON summary";
  }
  if (summary.ok !== true || !Array.isArray(summary.missing) || summary.missing.length !== 0) {
    return "interop validator JSON must report ok=true with an empty missing array";
  }
  return undefined;
}

function parseLastJsonObjectLine(content) {
  for (const line of content.split(/\r?\n/).reverse()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
      continue;
    }
    try {
      return JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function collectEvidenceStatus({ evidenceRoot }) {
  const normalizedRoot = resolve(evidenceRoot);
  const results = requiredFinalEvidence.map((relativePath) =>
    inspectEvidenceFile({ evidenceRoot: normalizedRoot, relativePath }),
  );
  const missing = results
    .filter((result) => result.status === "missing")
    .map((result) => result.path);
  const invalid = results
    .filter((result) => result.status === "invalid")
    .map(({ path, reason }) => ({ path, reason }));
  const valid = results
    .filter((result) => result.status === "valid")
    .map((result) => result.path);

  const interopValidation = validateInteropEvidence(normalizedRoot, missing, invalid);
  invalid.push(...interopValidation.invalid);

  return {
    evidenceRoot: normalizedRoot,
    valid,
    missing,
    invalid,
  };
}

function validateInteropEvidence(evidenceRoot, missing, invalid) {
  const logs = [
    "interop/windows/events.jsonl",
    "interop/macos/events.jsonl",
  ];
  if (logs.some((path) => missing.includes(path) || invalid.some((entry) => entry.path === path))) {
    return { invalid: [] };
  }

  try {
    const events = [];
    for (const relativePath of logs) {
      const role = relativePath.includes("/windows/") ? "windows" : "macos";
      events.push(...readAndValidateInteropLog(join(evidenceRoot, relativePath), relativePath, role));
    }
    const result = validateInteropEvents(events);
    if (!result.ok) {
      return {
        invalid: [
          {
            path: "interop/windows/events.jsonl",
            reason: `interop event matrix missing: ${result.missing.join(", ")}`,
          },
        ],
      };
    }
  } catch (error) {
    return {
      invalid: [
        {
          path: "interop/windows/events.jsonl",
          reason: error.message ?? String(error),
        },
      ],
    };
  }

  return { invalid: [] };
}

function readAndValidateInteropLog(fullPath, relativePath, expectedRole) {
  const events = readSanitizedJsonl([fullPath]);
  const allowedEvents = new Set(requiredInteropEvents);
  for (const eventName of allowedInteropDiagnosticEvents) {
    allowedEvents.add(eventName);
  }

  for (const event of events) {
    if (event.role !== expectedRole) {
      throw new Error(`${relativePath} contains an event with a role that does not match the file role`);
    }
    if (!allowedEvents.has(event.event)) {
      throw new Error(`${relativePath} contains an event outside the required interop schema`);
    }
    const sensitiveError = findUnsafeInteropEvidence(event);
    if (sensitiveError) {
      throw new Error(`${relativePath} contains unsafe interop evidence: ${sensitiveError}`);
    }
  }

  return events;
}

function findUnsafeInteropEvidence(value) {
  if (typeof value === "string") {
    return githubTokenPattern.test(value) ? "token pattern present" : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findUnsafeInteropEvidence(item);
      if (result) {
        return result;
      }
    }
    return undefined;
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }

  for (const [key, child] of Object.entries(value)) {
    if (sensitiveInteropKeys.has(key) && child !== "<redacted>") {
      return `sensitive key ${key} was not redacted`;
    }
    const result = findUnsafeInteropEvidence(child);
    if (result) {
      return result;
    }
  }
  return undefined;
}

export function evaluateMacosReleaseGate(evidenceStatus) {
  const missing = [...evidenceStatus.missing];
  const invalid = [...evidenceStatus.invalid];
  const nonFormalRequired = [
    ...requiredQaEvidence,
    ...requiredManualNativeEvidence,
    ...requiredInteropEvidence,
  ];
  const hasNonFormalIssue =
    missing.some((path) => nonFormalRequired.includes(path)) ||
    invalid.some((entry) => nonFormalRequired.includes(entry.path));

  if (hasNonFormalIssue) {
    return {
      status: "blocked",
      missing,
      invalid,
      reason: "Required QA, real macOS runtime, native manual, or Windows-macOS interop evidence is missing or invalid",
    };
  }

  const hasFormalIssue =
    missing.some((path) => requiredFormalEvidence.includes(path)) ||
    invalid.some((entry) => requiredFormalEvidence.includes(entry.path));

  if (hasFormalIssue) {
    return {
      status: "qa-only",
      missing,
      invalid,
      reason: "Developer ID signing, notarization, stapling, Gatekeeper, or formal hash evidence is missing or invalid",
    };
  }

  return {
    status: "complete",
    missing,
    invalid,
    reason: "All external QA, native runtime, interop, and formal Developer ID evidence is present and valid",
  };
}

export function scanProductionArtifacts(textByPath) {
  const findings = [];
  for (const [path, text] of Object.entries(textByPath)) {
    for (const needle of forbiddenProductionNeedles) {
      if (text.includes(needle)) {
        findings.push({ path, needle });
      }
    }
  }

  return { ok: findings.length === 0, findings };
}

export function collectProductionArtifactText({ cwd = repoRoot } = {}) {
  const textByPath = {};
  const distRoot = join(cwd, "dist");
  for (const path of listTextFiles(distRoot, cwd)) {
    textByPath[path] = readFileSync(join(cwd, path), "utf8");
  }

  for (const relativePath of [
    "src-tauri/capabilities/default.json",
    "src-tauri/tauri.conf.json",
  ]) {
    const fullPath = join(cwd, relativePath);
    if (existsSync(fullPath) && statSync(fullPath).isFile()) {
      textByPath[relativePath] = readFileSync(fullPath, "utf8");
    }
  }

  return textByPath;
}

function listTextFiles(root, cwd) {
  if (!existsSync(root)) {
    return [];
  }

  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && textFileExtensions.has(extensionOf(entry.name))) {
        files.push(fullPath.slice(cwd.length + 1).replace(/\\/g, "/"));
      }
    }
  }
  return files.sort();
}

function extensionOf(name) {
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index).toLowerCase();
}

export function writeReleaseDecision({ evidenceRoot, result, now = () => new Date() }) {
  mkdirSync(evidenceRoot, { recursive: true });
  const lines = [
    "# macOS Release Decision",
    "",
    `Generated At: ${now().toISOString()}`,
    `Status: ${result.status}`,
    `Reason: ${result.reason}`,
    "",
    "## Missing Evidence",
    ...formatList(result.missing),
    "",
    "## Invalid Evidence",
    ...formatInvalidList(result.invalid),
    "",
    "This file is generated after scanning external evidence. It is not an input to the release gate.",
    "",
  ];
  writeFileSync(join(evidenceRoot, decisionFileName), `${lines.join("\n")}`);
}

function formatList(items) {
  if (!items || items.length === 0) {
    return ["- none"];
  }
  return items.map((item) => `- ${item}`);
}

function formatInvalidList(items) {
  if (!items || items.length === 0) {
    return ["- none"];
  }
  return items.map((item) => `- ${item.path}: ${item.reason}`);
}

export async function runFinalReleaseGateCli(
  argv,
  {
    cwd = repoRoot,
    stdout = console,
    stderr = console,
    now = () => new Date(),
    textByPath,
  } = {},
) {
  try {
    if (argv.includes("--scan-production")) {
      const scan = scanProductionArtifacts(textByPath ?? collectProductionArtifactText({ cwd }));
      if (scan.ok) {
        stdout.log("production scan clean: no forbidden E2E symbols found");
        return 0;
      }
      for (const finding of scan.findings) {
        stdout.log(`${finding.path}: ${finding.needle}`);
      }
      return 1;
    }

    const evidenceRoot = resolve(cwd, readOptionalArg(argv, "--evidence-root") ?? defaultEvidenceRoot);
    const collected = collectEvidenceStatus({ evidenceRoot });
    const result = evaluateMacosReleaseGate(collected);
    writeReleaseDecision({ evidenceRoot, result, now });
    stdout.log(`macOS final release gate status: ${result.status}`);
    if (result.status !== "complete") {
      stderr.error(result.reason);
      return 1;
    }
    return 0;
  } catch (error) {
    stderr.error(error.message ?? String(error));
    return 1;
  }
}

function readOptionalArg(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  if (!argv[index + 1]) {
    throw new Error(`Missing value for ${name}`);
  }
  return argv[index + 1];
}

export function isCliEntrypoint(metaUrl, argvPath = process.argv[1]) {
  if (!argvPath) {
    return false;
  }

  return resolve(fileURLToPath(metaUrl)) === resolve(argvPath);
}

if (isCliEntrypoint(import.meta.url)) {
  runFinalReleaseGateCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
