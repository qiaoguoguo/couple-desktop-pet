import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
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

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const defaultBundleRoot = join(
  repoRoot,
  "src-tauri",
  "target",
  "universal-apple-darwin",
  "release",
  "bundle",
);
const defaultEvidenceDir = join(
  repoRoot,
  ".superpowers",
  "sdd",
  "2026-08-07-macos-cross-platform",
  "build",
);
const sensitiveEnvKeys = [
  "APPLE_CERTIFICATE",
  "APPLE_CERTIFICATE_PASSWORD",
  "KEYCHAIN_PASSWORD",
  "APPLE_SIGNING_IDENTITY",
  "APPLE_ID",
  "APPLE_PASSWORD",
  "APPLE_TEAM_ID",
];

export function createMacosBuildPlan({ mode }) {
  if (mode !== "qa" && mode !== "formal") {
    throw new Error(`Unsupported macOS build mode: ${mode}`);
  }

  const buildScript = mode === "qa" ? "tauri:build:mac:qa" : "tauri:build:mac";
  const buildStep = {
    name: `tauri-build-${mode}`,
    command: "pnpm",
    args: [buildScript],
    shell: false,
  };

  return {
    mode,
    buildStep,
    verificationSteps: [
      {
        name: "plutil-source-info-plist",
        command: "plutil",
        args: ["-lint", join(repoRoot, "src-tauri", "Info.plist")],
        shell: false,
      },
      {
        name: "hdiutil-verify-dmg",
        command: "hdiutil",
        args: ["verify", "$DMG"],
        shell: false,
      },
      {
        name: "hdiutil-attach-dmg",
        command: "hdiutil",
        args: ["attach", "$DMG", "-nobrowse", "-readonly"],
        shell: false,
      },
      {
        name: "plutil-generated-info-plist",
        command: "plutil",
        args: ["-lint", "$GENERATED_INFO_PLIST"],
        shell: false,
      },
      {
        name: "file-app-binary",
        command: "file",
        args: ["$APP_BINARY"],
        shell: false,
      },
      {
        name: "lipo-verify-universal",
        command: "lipo",
        args: ["-archs", "$APP_BINARY"],
        shell: false,
      },
      {
        name: "codesign-verify-app",
        command: "codesign",
        args: ["--verify", "--deep", "--strict", "--verbose=4", "$APP"],
        shell: false,
      },
      {
        name: "codesign-describe-app",
        command: "codesign",
        args: ["-dv", "--verbose=4", "$APP"],
        shell: false,
      },
    ],
    detachStep: {
      name: "hdiutil-detach-dmg",
      command: "hdiutil",
      args: ["detach", "$MOUNT"],
      shell: false,
    },
  };
}

export function findMacosArtifacts(bundleRoot = defaultBundleRoot) {
  const paths = listPaths(bundleRoot);
  const appPath = paths
    .filter((path) => path.endsWith(".app") && statSync(path).isDirectory())
    .sort()[0];
  const dmgPath = paths
    .filter((path) => path.endsWith(".dmg") && statSync(path).isFile())
    .sort()[0];

  if (!appPath) {
    throw new Error(`No .app artifact found under ${bundleRoot}`);
  }
  if (!dmgPath) {
    throw new Error(`No .dmg artifact found under ${bundleRoot}`);
  }

  return {
    appPath,
    dmgPath,
    appBinaryPath: join(appPath, "Contents", "MacOS", "couple-desktop-pet"),
    generatedInfoPlistPath: join(appPath, "Contents", "Info.plist"),
  };
}

export function listPaths(root) {
  if (!existsSync(root)) {
    return [];
  }

  const entries = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name);
      entries.push(fullPath);
      if (entry.isDirectory() && !entry.name.endsWith(".app")) {
        stack.push(fullPath);
      }
    }
  }
  return entries;
}

export function parseHdiutilMountPoint(output) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines.reverse()) {
    const match = line.match(/\/Volumes\/.+$/);
    if (match) {
      return match[0].trim();
    }
  }
  throw new Error("Unable to parse hdiutil attach mount point");
}

export function resolveStepArgs(args, artifacts) {
  const replacements = {
    $DMG: artifacts.dmgPath,
    $APP: artifacts.appPath,
    $APP_BINARY: artifacts.appBinaryPath,
    $GENERATED_INFO_PLIST: artifacts.generatedInfoPlistPath,
    $MOUNT: artifacts.mountPoint,
  };

  return args.map((arg) => replacements[arg] ?? arg);
}

export function assertUniversalSlices(output) {
  for (const arch of ["x86_64", "arm64"]) {
    if (!output.includes(arch)) {
      throw new Error(`Universal binary is missing ${arch} slice`);
    }
  }
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function redactBuildLog(text, env = process.env) {
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
    child.on("error", rejectStep);
    child.on("close", (code) => {
      const result = { code, stdout, stderr };
      if (code === 0) {
        resolveStep(result);
        return;
      }
      rejectStep(Object.assign(new Error(`${step.name} exited with ${code}`), result));
    });
  });
}

export function writeStepLog(evidenceDir, name, result, env = process.env) {
  mkdirSync(evidenceDir, { recursive: true });
  const output = [
    `exit=${result.code}`,
    "--- stdout ---",
    result.stdout ?? "",
    "--- stderr ---",
    result.stderr ?? "",
  ].join("\n");
  writeFileSync(join(evidenceDir, `${name}.log`), redactBuildLog(output, env));
}

export async function runMacosBuildVerification({
  mode,
  bundleRoot = defaultBundleRoot,
  evidenceDir = defaultEvidenceDir,
  env = process.env,
} = {}) {
  if (process.platform !== "darwin") {
    throw new Error("macOS build verification must run on a real macOS host");
  }

  const plan = createMacosBuildPlan({ mode });
  const buildResult = await runStep(plan.buildStep, env);
  writeStepLog(evidenceDir, plan.buildStep.name, buildResult, env);

  const artifacts = findMacosArtifacts(bundleRoot);
  let mountPoint;

  try {
    for (const step of plan.verificationSteps) {
      const resolvedStep = {
        ...step,
        args: resolveStepArgs(step.args, { ...artifacts, mountPoint }),
      };
      const result = await runStep(resolvedStep, env);
      if (step.name === "hdiutil-attach-dmg") {
        mountPoint = parseHdiutilMountPoint(`${result.stdout}\n${result.stderr}`);
      }
      if (step.name === "lipo-verify-universal") {
        assertUniversalSlices(`${result.stdout}\n${result.stderr}`);
      }
      writeStepLog(evidenceDir, step.name, result, env);
    }

    writeFileSync(
      join(evidenceDir, "sha256-dmg.log"),
      `${sha256File(artifacts.dmgPath)}  ${artifacts.dmgPath}\n`,
    );
  } finally {
    if (mountPoint) {
      const detachStep = {
        ...plan.detachStep,
        args: resolveStepArgs(plan.detachStep.args, { ...artifacts, mountPoint }),
      };
      const detachResult = await runStep(detachStep, env);
      writeStepLog(evidenceDir, plan.detachStep.name, detachResult, env);
    }
  }

  return artifacts;
}

function parseCliMode(argv) {
  const index = argv.indexOf("--mode");
  if (index === -1 || !argv[index + 1]) {
    throw new Error("Usage: node scripts/macos/qa-build.mjs --mode qa|formal");
  }
  return argv[index + 1];
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  runMacosBuildVerification({ mode: parseCliMode(process.argv.slice(2)) }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
