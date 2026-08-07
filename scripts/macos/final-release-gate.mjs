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

export const requiredInteropEvidence = [
  "interop/windows/events.jsonl",
  "interop/macos/events.jsonl",
  "interop/validator/validator.log",
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

  const content = readFileSync(fullPath, "utf8");
  const validatorError = validateEvidenceContent(relativePath, content);
  if (validatorError) {
    return { path: relativePath, status: "invalid", reason: validatorError };
  }

  return { path: relativePath, status: "valid" };
}

function validateEvidenceContent(relativePath, content) {
  if (relativePath.includes("lipo-verify-universal")) {
    const missing = ["x86_64", "arm64"].filter((arch) => !content.includes(arch));
    if (missing.length > 0) {
      return `lipo evidence missing ${missing.join(" and ")} slice`;
    }
  }

  if (relativePath.includes("sha256-") && !/\b[a-fA-F0-9]{64}\b/.test(content)) {
    return "SHA-256 evidence must contain a 64 character hexadecimal digest";
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
    const events = readSanitizedJsonl(logs.map((relativePath) => join(evidenceRoot, relativePath)));
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
