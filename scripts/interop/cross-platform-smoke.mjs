import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const requiredInteropEvents = [
  "windows-pair-code-created",
  "macos-pair-accepted",
  "windows-peer-online",
  "macos-peer-online",
  "windows-observed-macos-status-slacking",
  "windows-observed-macos-status-dazing",
  "windows-observed-macos-status-overtime",
  "windows-observed-macos-status-null",
  "macos-observed-windows-status-slacking",
  "macos-observed-windows-status-dazing",
  "macos-observed-windows-status-overtime",
  "macos-observed-windows-status-null",
  "windows-message-sent",
  "macos-message-received",
  "macos-message-sent",
  "windows-message-received",
  "windows-bubble-acknowledged",
  "macos-bubble-acknowledged",
  "windows-message-animation-observed",
  "macos-message-animation-observed",
  "windows-unpair-completed",
  "macos-unpair-completed",
  "windows-restart-shows-unpaired",
  "macos-restart-shows-unpaired",
];

const sensitiveEnvNames = [
  "GITHUB_TOKEN",
  "INTEROP_GITHUB_TOKEN",
  "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
];

const sensitiveDetailKeys = new Set([
  "pairCode",
  "deviceSecret",
  "secret",
  "token",
  "message",
  "messageText",
]);

export function createIsolatedAppEnv({ platform, root }) {
  if (platform === "windows") {
    return {
      APPDATA: joinPortable(root, "AppData", "Roaming"),
      LOCALAPPDATA: joinPortable(root, "AppData", "Local"),
      USERPROFILE: joinPortable(root, "UserProfile"),
    };
  }

  if (platform === "macos") {
    return {
      HOME: joinPortable(root, "home"),
    };
  }

  throw new Error(`Unsupported interop platform: ${platform}`);
}

function joinPortable(...segments) {
  return join(...segments).replace(/\\/g, "/");
}

export function filterChildAppEnv(env = process.env) {
  const filtered = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      continue;
    }
    if (sensitiveEnvNames.includes(key) || key.startsWith("APPLE_")) {
      filtered[key] = "";
      continue;
    }
    filtered[key] = value;
  }
  return filtered;
}

export function createInteropEventLogger({ logPath, role, platform, now = () => new Date() }) {
  return {
    record(event, details = {}) {
      const entry = {
        event,
        role,
        platform,
        at: now().toISOString(),
        details: redactInteropEvent(details),
      };
      mkdirSync(dirname(logPath), { recursive: true });
      appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
      return entry;
    },
  };
}

export function readSanitizedJsonl(paths, { forbiddenPlaintext = [] } = {}) {
  const events = [];
  for (const path of paths) {
    if (!existsSync(path)) {
      throw new Error(`Missing interop event log: ${path}`);
    }
    const text = readFileSync(path, "utf8");
    for (const forbidden of forbiddenPlaintext) {
      if (forbidden && text.includes(forbidden)) {
        throw new Error(`Interop log contains sensitive plaintext: ${path}`);
      }
    }
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }
      events.push(JSON.parse(line));
    }
  }
  return events;
}

export function validateInteropEvents(events) {
  const present = new Set(events.map((event) => event.event));
  const missing = requiredInteropEvents.filter((event) => !present.has(event));

  return { ok: missing.length === 0, missing };
}

export function isMessageAnimationMotion(motionId) {
  return motionId === "motion-message-pair";
}

export function redactInteropEvent(event) {
  return redactValue(event);
}

function redactValue(value) {
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const redacted = {};
  for (const [key, child] of Object.entries(value)) {
    redacted[key] = sensitiveDetailKeys.has(key) ? "<redacted>" : redactValue(child);
  }
  return redacted;
}

export async function runInteropCli(argv, { stdout = console, stderr = console } = {}) {
  try {
    if (argv[0] !== "validate") {
      throw new Error("Usage: cross-platform-smoke.mjs validate --log <jsonl> [--log <jsonl>]");
    }
    const logs = [];
    for (let index = 1; index < argv.length; index += 1) {
      if (argv[index] === "--log" && argv[index + 1]) {
        logs.push(argv[index + 1]);
        index += 1;
      }
    }
    if (logs.length === 0) {
      throw new Error("At least one --log file is required");
    }
    const result = validateInteropEvents(readSanitizedJsonl(logs));
    stdout.log(JSON.stringify(result));
    return result.ok ? 0 : 1;
  } catch (error) {
    stderr.error(error.message ?? String(error));
    return 1;
  }
}

export function isCliEntrypoint(metaUrl, argvPath = process.argv[1]) {
  if (!argvPath) {
    return false;
  }

  return resolve(fileURLToPath(metaUrl)) === resolve(argvPath);
}

if (isCliEntrypoint(import.meta.url)) {
  runInteropCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
