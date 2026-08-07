import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertUniversalSlices,
  createMacosBuildPlan,
  findMacosArtifacts,
  findMountedApp,
  parseHdiutilAttachTargets,
  parseHdiutilMountPoint,
  redactBuildLog,
  resolveStepArgs,
  runMacosBuildVerification,
  sha256File,
} from "./qa-build.mjs";

let tempRoots = [];

function makeTempRoot() {
  const root = mkdtempSync(join(tmpdir(), "couple-pet-macos-qa-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tempRoots = [];
});

describe("macOS QA build verifier", () => {
  it("creates distinct shell-free plans for QA and formal builds", () => {
    expect(createMacosBuildPlan({ mode: "qa" }).buildStep).toEqual({
      name: "tauri-build-qa",
      command: "pnpm",
      args: ["tauri:build:mac:qa"],
      shell: false,
    });
    expect(createMacosBuildPlan({ mode: "formal" }).buildStep).toEqual({
      name: "tauri-build-formal",
      command: "pnpm",
      args: ["tauri:build:mac"],
      shell: false,
    });
  });

  it("plans concrete verification commands without shell expansion", () => {
    const plan = createMacosBuildPlan({ mode: "qa" });
    const names = plan.verificationSteps.map((step) => step.name);

    expect(names).toEqual([
      "plutil-source-info-plist",
      "hdiutil-verify-dmg",
      "hdiutil-attach-dmg",
      "plutil-generated-info-plist",
      "file-app-binary",
      "lipo-verify-universal",
      "codesign-verify-app",
      "codesign-describe-app",
    ]);

    for (const step of [plan.buildStep, ...plan.verificationSteps]) {
      expect(step.shell).toBe(false);
      expect(step.args.join(" ")).not.toContain("*");
    }
  });

  it("discovers the generated app and dmg by enumerating paths", () => {
    const root = makeTempRoot();
    const appPath = join(root, "bundle", "macos", "情侣桌宠.app");
    const dmgPath = join(root, "bundle", "dmg", "情侣桌宠_0.1.0_universal.dmg");
    mkdirSync(appPath, { recursive: true });
    mkdirSync(join(root, "bundle", "dmg"), { recursive: true });
    writeFileSync(dmgPath, "dmg");

    expect(findMacosArtifacts(join(root, "bundle"))).toEqual({
      stagingAppPath: appPath,
      dmgPath,
    });
  });

  it("selects the newest staging app and dmg instead of the lexicographic first", () => {
    const root = makeTempRoot();
    const oldAppPath = join(root, "bundle", "macos", "A-old.app");
    const newAppPath = join(root, "bundle", "macos", "Z-new.app");
    const oldDmgPath = join(root, "bundle", "dmg", "A-old.dmg");
    const newDmgPath = join(root, "bundle", "dmg", "Z-new.dmg");
    mkdirSync(oldAppPath, { recursive: true });
    mkdirSync(newAppPath, { recursive: true });
    mkdirSync(join(root, "bundle", "dmg"), { recursive: true });
    writeFileSync(oldDmgPath, "old");
    writeFileSync(newDmgPath, "new");

    const oldDate = new Date("2026-08-07T01:00:00Z");
    const newDate = new Date("2026-08-07T02:00:00Z");
    utimesSync(oldAppPath, oldDate, oldDate);
    utimesSync(oldDmgPath, oldDate, oldDate);
    utimesSync(newAppPath, newDate, newDate);
    utimesSync(newDmgPath, newDate, newDate);

    expect(findMacosArtifacts(join(root, "bundle"))).toEqual({
      stagingAppPath: newAppPath,
      dmgPath: newDmgPath,
    });
  });

  it("discovers exactly one mounted dmg app and its verification paths", () => {
    const root = makeTempRoot();
    const mountedAppPath = join(root, "Volumes", "情侣桌宠", "情侣桌宠.app");
    mkdirSync(join(mountedAppPath, "Contents", "MacOS"), { recursive: true });
    writeFileSync(join(mountedAppPath, "Contents", "Info.plist"), "plist");
    writeFileSync(join(mountedAppPath, "Contents", "MacOS", "couple-desktop-pet"), "binary");

    expect(findMountedApp(join(root, "Volumes", "情侣桌宠"))).toEqual({
      appPath: mountedAppPath,
      appBinaryPath: join(mountedAppPath, "Contents", "MacOS", "couple-desktop-pet"),
      generatedInfoPlistPath: join(mountedAppPath, "Contents", "Info.plist"),
    });

    mkdirSync(join(root, "Volumes", "情侣桌宠", "Other.app"), { recursive: true });
    expect(() => findMountedApp(join(root, "Volumes", "情侣桌宠"))).toThrow(/exactly one .app/);
  });

  it("parses hdiutil attach mount targets and always resolves tokenized args", () => {
    expect(
      parseHdiutilAttachTargets(
        "/dev/disk4\tGUID_partition_scheme\t\n/dev/disk4s1\tApple_HFS\t/Volumes/情侣桌宠",
      ),
    ).toEqual({
      deviceNode: "/dev/disk4",
      mountPoint: "/Volumes/情侣桌宠",
    });
    expect(
      parseHdiutilMountPoint(
        "/dev/disk4s1\tApple_HFS\t/Volumes/情侣桌宠\n/dev/disk4s2\tApple_Free\t",
      ),
    ).toBe("/Volumes/情侣桌宠");

    expect(
      resolveStepArgs(["verify", "$DMG", "$APP", "$MOUNT"], {
        dmgPath: "/tmp/app.dmg",
        appPath: "/tmp/App.app",
        appBinaryPath: "/tmp/App.app/Contents/MacOS/app",
        generatedInfoPlistPath: "/tmp/App.app/Contents/Info.plist",
        mountPoint: "/Volumes/App",
      }),
    ).toEqual(["verify", "/tmp/app.dmg", "/tmp/App.app", "/Volumes/App"]);
  });

  it("verifies the mounted dmg app, records hashes, and detaches after a successful attach", async () => {
    const root = makeTempRoot();
    const bundleRoot = join(root, "bundle");
    const evidenceDir = join(root, "evidence");
    const stagingAppPath = join(bundleRoot, "macos", "情侣桌宠.app");
    const dmgPath = join(bundleRoot, "dmg", "情侣桌宠.dmg");
    const mountedAppPath = join(root, "mounted", "情侣桌宠.app");
    mkdirSync(stagingAppPath, { recursive: true });
    mkdirSync(join(bundleRoot, "dmg"), { recursive: true });
    mkdirSync(join(mountedAppPath, "Contents", "MacOS"), { recursive: true });
    writeFileSync(dmgPath, "dmg");
    writeFileSync(join(mountedAppPath, "Contents", "Info.plist"), "plist");
    writeFileSync(join(mountedAppPath, "Contents", "MacOS", "couple-desktop-pet"), "mounted-binary");
    const calls = [];

    await runMacosBuildVerification({
      mode: "qa",
      bundleRoot,
      evidenceDir,
      platform: "darwin",
      runner: async (step) => {
        calls.push({ name: step.name, args: step.args, shell: step.shell });
        if (step.name === "hdiutil-attach-dmg") {
          return {
            code: 0,
            stdout: `/dev/disk4\tGUID_partition_scheme\t\n/dev/disk4s1\tApple_HFS\t${join(root, "mounted")}\n`,
            stderr: "",
          };
        }
        if (step.name === "lipo-verify-universal") {
          return { code: 0, stdout: "x86_64 arm64", stderr: "" };
        }
        return { code: 0, stdout: "ok", stderr: "" };
      },
    });

    expect(calls.every((call) => call.shell === false)).toBe(true);
    expect(calls.find((call) => call.name === "staging-app-exists")?.args).toEqual([
      stagingAppPath,
    ]);
    expect(calls.find((call) => call.name === "plutil-generated-info-plist")?.args).toEqual([
      "-lint",
      join(mountedAppPath, "Contents", "Info.plist"),
    ]);
    expect(calls.find((call) => call.name === "file-app-binary")?.args).toEqual([
      join(mountedAppPath, "Contents", "MacOS", "couple-desktop-pet"),
    ]);
    expect(calls.find((call) => call.name === "codesign-verify-app")?.args).toContain(
      mountedAppPath,
    );
    expect(calls.at(-1)).toEqual({
      name: "hdiutil-detach-dmg",
      args: ["detach", join(root, "mounted")],
      shell: false,
    });
    expect(readFileSync(join(evidenceDir, "sha256-dmg.log"), "utf8")).toContain(
      sha256File(dmgPath),
    );
    expect(readFileSync(join(evidenceDir, "sha256-app-binary.log"), "utf8")).toContain(
      sha256File(join(mountedAppPath, "Contents", "MacOS", "couple-desktop-pet")),
    );
  });

  it("writes failed step logs and detaches the dmg after later verification failures", async () => {
    const root = makeTempRoot();
    const bundleRoot = join(root, "bundle");
    const evidenceDir = join(root, "evidence");
    const stagingAppPath = join(bundleRoot, "macos", "情侣桌宠.app");
    const dmgPath = join(bundleRoot, "dmg", "情侣桌宠.dmg");
    const mountedAppPath = join(root, "mounted", "情侣桌宠.app");
    mkdirSync(stagingAppPath, { recursive: true });
    mkdirSync(join(bundleRoot, "dmg"), { recursive: true });
    mkdirSync(join(mountedAppPath, "Contents", "MacOS"), { recursive: true });
    writeFileSync(dmgPath, "dmg");
    writeFileSync(join(mountedAppPath, "Contents", "Info.plist"), "plist");
    writeFileSync(join(mountedAppPath, "Contents", "MacOS", "couple-desktop-pet"), "binary");
    const calls = [];

    await expect(
      runMacosBuildVerification({
        mode: "qa",
        bundleRoot,
        evidenceDir,
        platform: "darwin",
        env: { APPLE_PASSWORD: "secret-value" },
        runner: async (step) => {
          calls.push(step.name);
          if (step.name === "hdiutil-attach-dmg") {
            return {
              code: 0,
              stdout: `/dev/disk4\tGUID_partition_scheme\t\n/dev/disk4s1\tApple_HFS\t${join(root, "mounted")}\n`,
              stderr: "",
            };
          }
          if (step.name === "lipo-verify-universal") {
            throw Object.assign(new Error("lipo failed"), {
              code: 1,
              stdout: "missing arm64",
              stderr: "APPLE_PASSWORD=secret-value",
            });
          }
          return { code: 0, stdout: "ok", stderr: "" };
        },
      }),
    ).rejects.toThrow(/lipo failed/);

    expect(calls).toContain("hdiutil-detach-dmg");
    const failedLog = readFileSync(join(evidenceDir, "lipo-verify-universal.log"), "utf8");
    expect(failedLog).toContain("missing arm64");
    expect(failedLog).toContain("APPLE_PASSWORD=<redacted>");
    expect(failedLog).not.toContain("secret-value");
  });

  it("detaches by device node if attach output has no parseable mount point", async () => {
    const root = makeTempRoot();
    const bundleRoot = join(root, "bundle");
    const evidenceDir = join(root, "evidence");
    mkdirSync(join(bundleRoot, "macos", "情侣桌宠.app"), { recursive: true });
    mkdirSync(join(bundleRoot, "dmg"), { recursive: true });
    writeFileSync(join(bundleRoot, "dmg", "情侣桌宠.dmg"), "dmg");
    const calls = [];

    await expect(
      runMacosBuildVerification({
        mode: "qa",
        bundleRoot,
        evidenceDir,
        platform: "darwin",
        runner: async (step) => {
          calls.push({ name: step.name, args: step.args });
          if (step.name === "hdiutil-attach-dmg") {
            return {
              code: 0,
              stdout: "/dev/disk9\tGUID_partition_scheme\t\n/dev/disk9s1\tApple_HFS\t\n",
              stderr: "",
            };
          }
          return { code: 0, stdout: "ok", stderr: "" };
        },
      }),
    ).rejects.toThrow(/mount point/);

    expect(calls.at(-1)).toEqual({
      name: "hdiutil-detach-dmg",
      args: ["detach", "/dev/disk9"],
    });
    expect(existsSync(join(evidenceDir, "hdiutil-attach-dmg.log"))).toBe(true);
    expect(existsSync(join(evidenceDir, "hdiutil-detach-dmg.log"))).toBe(true);
  });

  it("requires both universal slices", () => {
    expect(() => assertUniversalSlices("Architectures in the fat file: app are: x86_64 arm64")).not.toThrow();
    expect(() => assertUniversalSlices("Architectures in the fat file: app are: arm64")).toThrow(
      /x86_64/,
    );
  });

  it("redacts Apple secrets and computes dmg hashes without shelling out", () => {
    const root = makeTempRoot();
    const dmgPath = join(root, "artifact.dmg");
    writeFileSync(dmgPath, "artifact");

    expect(sha256File(dmgPath)).toBe(
      "c7c5c1d70c5dec4416ab6158afd0b223ef40c29b1dc1f97ed9428b94d4cadb1c",
    );
    expect(
      redactBuildLog("APPLE_ID=user@example.com token secret-value", {
        APPLE_ID: "user@example.com",
        APPLE_PASSWORD: "secret-value",
      }),
    ).toBe("APPLE_ID=<redacted> token <redacted>");
  });
});
