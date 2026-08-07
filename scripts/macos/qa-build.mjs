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

export function isCliEntrypoint(metaUrl, argvPath = process.argv[1]) {
  if (!argvPath) {
    return false;
  }

  return resolve(fileURLToPath(metaUrl)) === resolve(argvPath);
}

export function findMacosArtifacts(bundleRoot = defaultBundleRoot) {
  const paths = listPaths(bundleRoot);
  const stagingAppPath = selectNewestPath(
    paths.filter((path) => path.endsWith(".app") && statSync(path).isDirectory()),
    ".app artifact",
    bundleRoot,
  );
  const dmgPath = selectNewestPath(
    paths.filter((path) => path.endsWith(".dmg") && statSync(path).isFile()),
    ".dmg artifact",
    bundleRoot,
  );

  return { stagingAppPath, dmgPath };
}

export function findMountedApp(mountPoint) {
  const paths = listPaths(mountPoint).filter(
    (path) => path.endsWith(".app") && statSync(path).isDirectory(),
  );

  if (paths.length !== 1) {
    throw new Error(`Expected exactly one .app under mounted DMG ${mountPoint}, found ${paths.length}`);
  }

  const appPath = paths[0];

  return {
    appPath,
    appBinaryPath: join(appPath, "Contents", "MacOS", "couple-desktop-pet"),
    generatedInfoPlistPath: join(appPath, "Contents", "Info.plist"),
  };
}

function selectNewestPath(paths, artifactName, root) {
  if (paths.length === 0) {
    throw new Error(`No ${artifactName} found under ${root}`);
  }

  return paths
    .map((path) => ({ path, mtimeMs: statSync(path).mtimeMs }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs || left.path.localeCompare(right.path))[0]
    .path;
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
  const lines = output.split(/\r?\n/).filter((line) => line.trim());
  for (const line of lines.reverse()) {
    const columns = line.split(/\t+/);
    const candidate = columns.at(-1)?.trim();
    if (columns.length >= 3 && candidate && (candidate.startsWith("/") || /^[A-Za-z]:[\\/]/.test(candidate))) {
      return candidate;
    }
    const match = line.trim().match(/\/Volumes\/.+$/);
    if (match) {
      return match[0].trim();
    }
  }
  throw new Error("Unable to parse hdiutil attach mount point");
}

export function parseHdiutilAttachTargets(output) {
  const deviceNode = output.match(/\/dev\/disk\S*/)?.[0];
  let mountPoint;
  try {
    mountPoint = parseHdiutilMountPoint(output);
  } catch {
    mountPoint = undefined;
  }

  return { deviceNode, mountPoint };
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
  if (step.command === "__assertPathExists") {
    const [path] = step.args;
    if (!existsSync(path)) {
      return Promise.reject(
        Object.assign(new Error(`${step.name} missing path: ${path}`), {
          code: 1,
          stdout: "",
          stderr: `${path} does not exist`,
        }),
      );
    }
    return Promise.resolve({
      code: 0,
      stdout: `${path} exists\n`,
      stderr: "",
    });
  }

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
      rejectStep(
        Object.assign(error, {
          code: 1,
          stdout,
          stderr: error.message,
        }),
      );
    });
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

export async function runRecordedStep(step, { runner = runStep, evidenceDir, env = process.env }) {
  try {
    const result = await runner(step, env);
    if (result.code !== 0) {
      throw Object.assign(new Error(`${step.name} exited with ${result.code}`), result);
    }
    writeStepLog(evidenceDir, step.name, result, env);
    return result;
  } catch (error) {
    writeStepLog(evidenceDir, step.name, resultFromError(error), env);
    throw error;
  }
}

function resultFromError(error) {
  return {
    code: typeof error.code === "number" ? error.code : 1,
    stdout: error.stdout ?? "",
    stderr: error.stderr ?? error.message ?? String(error),
  };
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

function writeHashLog(evidenceDir, name, path) {
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(join(evidenceDir, name), `${sha256File(path)}  ${path}\n`);
}

export async function runMacosBuildVerification({
  mode,
  bundleRoot = defaultBundleRoot,
  evidenceDir = defaultEvidenceDir,
  env = process.env,
  platform = process.platform,
  runner = runStep,
} = {}) {
  if (platform !== "darwin") {
    throw new Error("macOS build verification must run on a real macOS host");
  }

  const plan = createMacosBuildPlan({ mode });
  await runRecordedStep(plan.buildStep, { runner, evidenceDir, env });

  const artifacts = findMacosArtifacts(bundleRoot);
  await runRecordedStep(
    {
      name: "staging-app-exists",
      command: "__assertPathExists",
      args: [artifacts.stagingAppPath],
      shell: false,
    },
    { runner, evidenceDir, env },
  );

  writeHashLog(evidenceDir, "sha256-dmg.log", artifacts.dmgPath);
  let mountedApp;
  let detachTarget;

  try {
    for (const step of plan.verificationSteps) {
      const stepArtifacts = mountedApp ?? {
        ...artifacts,
        appPath: artifacts.stagingAppPath,
        appBinaryPath: join(artifacts.stagingAppPath, "Contents", "MacOS", "couple-desktop-pet"),
        generatedInfoPlistPath: join(artifacts.stagingAppPath, "Contents", "Info.plist"),
      };
      const resolvedStep = {
        ...step,
        args: resolveStepArgs(step.args, {
          ...artifacts,
          ...stepArtifacts,
          mountPoint: detachTarget,
        }),
      };
      const result = await runRecordedStep(resolvedStep, { runner, evidenceDir, env });
      if (step.name === "hdiutil-attach-dmg") {
        const targets = parseHdiutilAttachTargets(`${result.stdout}\n${result.stderr}`);
        detachTarget = targets.mountPoint ?? targets.deviceNode;
        if (!targets.mountPoint) {
          throw new Error("Unable to parse hdiutil attach mount point");
        }
        mountedApp = findMountedApp(targets.mountPoint);
        writeHashLog(evidenceDir, "sha256-app-binary.log", mountedApp.appBinaryPath);
      }
      if (step.name === "lipo-verify-universal") {
        assertUniversalSlices(`${result.stdout}\n${result.stderr}`);
      }
    }
  } finally {
    if (detachTarget) {
      const detachStep = {
        ...plan.detachStep,
        args: resolveStepArgs(plan.detachStep.args, { ...artifacts, mountPoint: detachTarget }),
      };
      await runRecordedStep(detachStep, { runner, evidenceDir, env });
    }
  }

  return { ...artifacts, mountedApp };
}

function parseCliMode(argv) {
  const index = argv.indexOf("--mode");
  if (index === -1 || !argv[index + 1]) {
    throw new Error("Usage: node scripts/macos/qa-build.mjs --mode qa|formal");
  }
  return argv[index + 1];
}

export async function runMacosBuildCli(
  argv,
  { env = process.env, stderr = console } = {},
) {
  try {
    await runMacosBuildVerification({ mode: parseCliMode(argv), env });
    return 0;
  } catch (error) {
    stderr.error(redactBuildLog(error.message ?? String(error), env));
    return 1;
  }
}

if (isCliEntrypoint(import.meta.url)) {
  runMacosBuildCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
