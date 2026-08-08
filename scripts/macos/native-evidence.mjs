import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const bundleIdentifier = "com.couple.desktoppet";
const sensitiveEnvKeys = [
  "APPLE_CERTIFICATE",
  "APPLE_CERTIFICATE_PASSWORD",
  "KEYCHAIN_PASSWORD",
  "APPLE_SIGNING_IDENTITY",
  "APPLE_ID",
  "APPLE_PASSWORD",
  "APPLE_TEAM_ID",
  "GITHUB_TOKEN",
  "INTEROP_GITHUB_TOKEN",
  "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
];

export function parseNativeEvidenceArgs(argv) {
  const mode = readRequiredArg(argv, "--mode");
  const appPath = readRequiredArg(argv, "--app");
  const outputDir = readRequiredArg(argv, "--output");

  if (mode !== "qa" && mode !== "formal") {
    throw new Error("--mode must be qa or formal");
  }
  if (!isAbsolute(appPath) || !isAbsolute(outputDir)) {
    throw new Error("--app and --output must be absolute paths");
  }

  return { mode, appPath, outputDir };
}

export function isCliEntrypoint(metaUrl, argvPath = process.argv[1]) {
  if (!argvPath) {
    return false;
  }

  return resolve(fileURLToPath(metaUrl)) === resolve(argvPath);
}

export function sanitizeNativeEvidenceEnv(env = process.env) {
  const sanitized = { ...env };
  for (const key of sensitiveEnvKeys) {
    delete sanitized[key];
  }
  return sanitized;
}

function readRequiredArg(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1 || !argv[index + 1]) {
    throw new Error(`Missing ${name}`);
  }
  return argv[index + 1];
}

export function createNativeEvidencePlan({ mode, appPath, outputDir }) {
  const generatedInfoPlist = join(appPath, "Contents", "Info.plist");
  return {
    mode,
    appPath,
    outputDir,
    steps: [
      { name: "sw-vers", command: "sw_vers", args: [], shell: false },
      { name: "uname-machine", command: "uname", args: ["-m"], shell: false },
      {
        name: "system-profiler",
        command: "system_profiler",
        args: ["SPSoftwareDataType", "SPHardwareDataType"],
        shell: false,
      },
      {
        name: "source-info-plist",
        command: "plutil",
        args: ["-p", join(repoRoot, "src-tauri", "Info.plist")],
        shell: false,
      },
      {
        name: "generated-info-plist",
        command: "plutil",
        args: ["-p", generatedInfoPlist],
        shell: false,
      },
      {
        name: "codesign-display",
        command: "codesign",
        args: ["-dv", "--verbose=4", appPath],
        shell: false,
      },
      {
        name: "codesign-verify",
        command: "codesign",
        args: ["--verify", "--deep", "--strict", "--verbose=4", appPath],
        shell: false,
      },
      {
        name: "spctl-assess",
        command: "spctl",
        args: ["--assess", "--type", "execute", "--verbose=4", appPath],
        shell: false,
      },
      { name: "launch-app", command: "open", args: ["-n", appPath], shell: false },
      {
        name: "process-exists",
        command: "osascript",
        args: [
          "-e",
          `tell application "System Events" to count (application processes whose bundle identifier is "${bundleIdentifier}")`,
        ],
        shell: false,
      },
      {
        name: "no-dock-runtime",
        command: "osascript",
        args: [
          "-e",
          `tell application "System Events" to tell (first application process whose bundle identifier is "${bundleIdentifier}") to return "backgroundOnly=" & (background only as text) & linefeed & "visible=" & (visible as text)`,
        ],
        shell: false,
      },
      {
        name: "screencapture",
        command: "screencapture",
        args: ["-x", join(outputDir, "app-window.png")],
        shell: false,
      },
    ],
    cleanupStep: {
      name: "quit-app",
      command: "osascript",
      args: ["-e", `tell application id "${bundleIdentifier}" to quit`],
      shell: false,
    },
  };
}

export async function runNativeEvidenceCollection({
  mode,
  appPath,
  outputDir,
  platform = process.platform,
  env = process.env,
  runner = runStep,
  processWaitAttempts = 20,
  processWaitDelayMs = 250,
}) {
  if (platform !== "darwin") {
    throw new Error("macOS native evidence must run on a real macOS host");
  }
  if (!existsSync(appPath)) {
    throw new Error(`App bundle does not exist: ${appPath}`);
  }

  const plan = createNativeEvidencePlan({ mode, appPath, outputDir });
  const childEnv = sanitizeNativeEvidenceEnv(env);
  let launched = false;

  try {
    for (const step of plan.steps) {
      if (step.name === "launch-app") {
        launched = true;
      }

      if (step.name === "spctl-assess" && mode === "qa") {
        const result = await runLooseStep(step, { runner, outputDir, childEnv, logEnv: env });
        if (result.code !== 0) {
          writeStepLog(
            outputDir,
            step.name,
            {
              ...result,
              stderr: `${result.stderr ?? ""}\nqa-only spctl assessment failure; ad-hoc QA builds are not formal release passes`,
            },
            env,
          );
        }
        continue;
      }

      if (step.name === "process-exists") {
        await waitForProcessRunning(step, {
          runner,
          outputDir,
          childEnv,
          logEnv: env,
          attempts: processWaitAttempts,
          delayMs: processWaitDelayMs,
        });
        continue;
      }

      await runRecordedStep(step, { runner, outputDir, childEnv, logEnv: env });
    }
  } finally {
    if (launched) {
      await runLooseStep(plan.cleanupStep, { runner, outputDir, childEnv, logEnv: env });
    }
  }
}

async function waitForProcessRunning(
  step,
  { runner, outputDir, childEnv, logEnv, attempts, delayMs },
) {
  let lastResult = { code: 1, stdout: "", stderr: "process check did not run" };

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    lastResult = await runLooseStep(step, { runner, outputDir, childEnv, logEnv });
    if (isBundleRunning(lastResult)) {
      return lastResult;
    }
    if (attempt < attempts) {
      await wait(delayMs);
    }
  }

  const timeoutResult = {
    code: 1,
    stdout: lastResult.stdout ?? "",
    stderr: `Timed out waiting for ${bundleIdentifier} after ${attempts} attempts${
      lastResult.stderr ? `\n${lastResult.stderr}` : ""
    }`,
  };
  writeStepLog(outputDir, step.name, timeoutResult, logEnv);
  throw Object.assign(new Error(timeoutResult.stderr), timeoutResult);
}

function isBundleRunning(result) {
  if (result.code !== 0) {
    return false;
  }

  const value = String(result.stdout ?? "").trim().toLowerCase();
  if (!value || value === "0" || value === "false" || value === "not-running") {
    return false;
  }
  if (/^\d+$/.test(value)) {
    return Number.parseInt(value, 10) > 0;
  }

  return true;
}

function wait(delayMs) {
  if (delayMs <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolveWait) => {
    setTimeout(resolveWait, delayMs);
  });
}

async function runLooseStep(step, { runner, outputDir, childEnv, logEnv }) {
  try {
    const result = await runner(step, childEnv);
    writeStepLog(outputDir, step.name, result, logEnv);
    return result;
  } catch (error) {
    const result = resultFromError(error);
    writeStepLog(outputDir, step.name, result, logEnv);
    return result;
  }
}

async function runRecordedStep(step, { runner, outputDir, childEnv, logEnv }) {
  const result = await runLooseStep(step, { runner, outputDir, childEnv, logEnv });
  if (result.code !== 0) {
    const detail = result.stderr || result.stdout;
    throw Object.assign(
      new Error(`${step.name} exited with ${result.code}${detail ? `: ${detail}` : ""}`),
      result,
    );
  }
  return result;
}

export function runStep(step, env = process.env) {
  return new Promise((resolveStep, rejectStep) => {
    const child = spawn(step.command, step.args, {
      cwd: repoRoot,
      env,
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      rejectStep(Object.assign(error, { code: 1, stdout, stderr: error.message }));
    });
    child.on("close", (code) => {
      resolveStep({ code, stdout, stderr });
    });
  });
}

export async function runNativeEvidenceCli(
  argv,
  {
    env = process.env,
    platform = process.platform,
    runner = runStep,
    stderr = console,
  } = {},
) {
  try {
    const args = parseNativeEvidenceArgs(argv);
    await runNativeEvidenceCollection({ ...args, env, platform, runner });
    return 0;
  } catch (error) {
    stderr.error(redactNativeEvidenceLog(error.message ?? String(error), env));
    return 1;
  }
}

function resultFromError(error) {
  return {
    code: typeof error.code === "number" ? error.code : 1,
    stdout: error.stdout ?? "",
    stderr: error.stderr || error.message || String(error),
  };
}

function writeStepLog(outputDir, name, result, env = process.env) {
  mkdirSync(outputDir, { recursive: true });
  const output = [
    `exit=${result.code}`,
    "--- stdout ---",
    result.stdout ?? "",
    "--- stderr ---",
    result.stderr ?? "",
  ].join("\n");
  writeFileSync(join(outputDir, `${name}.log`), redactNativeEvidenceLog(output, env));
}

export function redactNativeEvidenceLog(text, env = process.env) {
  let redacted = text;
  for (const key of sensitiveEnvKeys) {
    const value = env[key];
    if (value) {
      redacted = redacted.split(value).join("<redacted>");
    }
    redacted = redacted.replace(new RegExp(`${key}=\\S+`, "g"), `${key}=<redacted>`);
  }
  return redacted;
}

if (isCliEntrypoint(import.meta.url)) {
  runNativeEvidenceCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
