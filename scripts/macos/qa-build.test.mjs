import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertUniversalSlices,
  createMacosBuildPlan,
  findMacosArtifacts,
  parseHdiutilMountPoint,
  redactBuildLog,
  resolveStepArgs,
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
      appPath,
      dmgPath,
      appBinaryPath: join(appPath, "Contents", "MacOS", "couple-desktop-pet"),
      generatedInfoPlistPath: join(appPath, "Contents", "Info.plist"),
    });
  });

  it("parses hdiutil attach mount points and always resolves tokenized args", () => {
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
