import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createNativeEvidencePlan,
  parseNativeEvidenceArgs,
  redactNativeEvidenceLog,
  runNativeEvidenceCollection,
} from "./native-evidence.mjs";

let tempRoots = [];

function makeTempRoot() {
  const root = mkdtempSync(join(tmpdir(), "couple-pet-native-evidence-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tempRoots = [];
});

describe("macOS native evidence collector", () => {
  it("parses required CLI arguments and rejects relative app paths", () => {
    expect(
      parseNativeEvidenceArgs([
        "--mode",
        "qa",
        "--app",
        "/Applications/情侣桌宠.app",
        "--output",
        "/tmp/evidence",
      ]),
    ).toEqual({
      mode: "qa",
      appPath: "/Applications/情侣桌宠.app",
      outputDir: "/tmp/evidence",
    });

    expect(() =>
      parseNativeEvidenceArgs(["--mode", "qa", "--app", "relative.app", "--output", "/tmp/out"]),
    ).toThrow(/absolute/);
  });

  it("plans only shell-free commands and includes provable native evidence steps", () => {
    const plan = createNativeEvidencePlan({
      mode: "formal",
      appPath: "/Applications/情侣桌宠.app",
      outputDir: "/tmp/evidence",
    });
    const stepNames = plan.steps.map((step) => step.name);

    expect(stepNames).toEqual([
      "sw-vers",
      "uname-machine",
      "system-profiler",
      "source-info-plist",
      "generated-info-plist",
      "codesign-display",
      "codesign-verify",
      "spctl-assess",
      "launch-app",
      "process-exists",
      "screencapture",
    ]);
    expect(plan.steps.every((step) => step.shell === false)).toBe(true);
    expect(plan.cleanupStep).toEqual({
      name: "quit-app",
      command: "osascript",
      args: [
        "-e",
        'tell application id "com.couple.desktoppet" to quit',
      ],
      shell: false,
    });
  });

  it("records qa spctl failure as qa-only while formal mode fails", async () => {
    const root = makeTempRoot();
    const appPath = join(root, "情侣桌宠.app");
    const outputDir = join(root, "evidence");
    mkdirSync(join(appPath, "Contents"), { recursive: true });
    writeFileSync(join(appPath, "Contents", "Info.plist"), "<plist/>");
    const calls = [];

    await runNativeEvidenceCollection({
      mode: "qa",
      appPath,
      outputDir,
      platform: "darwin",
      runner: async (step) => {
        calls.push(step.name);
        if (step.name === "spctl-assess") {
          return { code: 3, stdout: "", stderr: "rejected" };
        }
        return { code: 0, stdout: "ok", stderr: "" };
      },
    });

    expect(calls).toContain("quit-app");
    expect(readFileSync(join(outputDir, "spctl-assess.log"), "utf8")).toContain(
      "qa-only spctl assessment failure",
    );

    const formalRoot = makeTempRoot();
    const formalApp = join(formalRoot, "情侣桌宠.app");
    const formalOut = join(formalRoot, "evidence");
    mkdirSync(join(formalApp, "Contents"), { recursive: true });
    writeFileSync(join(formalApp, "Contents", "Info.plist"), "<plist/>");

    await expect(
      runNativeEvidenceCollection({
        mode: "formal",
        appPath: formalApp,
        outputDir: formalOut,
        platform: "darwin",
        runner: async (step) =>
          step.name === "spctl-assess"
            ? { code: 3, stdout: "", stderr: "rejected" }
            : { code: 0, stdout: "ok", stderr: "" },
      }),
    ).rejects.toThrow(/spctl-assess/);
    expect(readFileSync(join(formalOut, "spctl-assess.log"), "utf8")).toContain("rejected");
  });

  it("cleans up the launched app and redacts sensitive values after later failures", async () => {
    const root = makeTempRoot();
    const appPath = join(root, "情侣桌宠.app");
    const outputDir = join(root, "evidence");
    mkdirSync(join(appPath, "Contents"), { recursive: true });
    writeFileSync(join(appPath, "Contents", "Info.plist"), "<plist/>");
    const calls = [];

    await expect(
      runNativeEvidenceCollection({
        mode: "formal",
        appPath,
        outputDir,
        platform: "darwin",
        env: { APPLE_ID: "user@example.com" },
        runner: async (step) => {
          calls.push(step.name);
          if (step.name === "process-exists") {
            throw Object.assign(new Error("process missing"), {
              code: 1,
              stdout: "APPLE_ID=user@example.com",
              stderr: "",
            });
          }
          return { code: 0, stdout: "ok", stderr: "" };
        },
      }),
    ).rejects.toThrow(/process missing/);

    expect(calls).toContain("launch-app");
    expect(calls).toContain("quit-app");
    const processLog = readFileSync(join(outputDir, "process-exists.log"), "utf8");
    expect(processLog).toContain("APPLE_ID=<redacted>");
    expect(processLog).not.toContain("user@example.com");
  });

  it("redacts Apple and GitHub tokens from logs", () => {
    expect(
      redactNativeEvidenceLog("APPLE_PASSWORD=secret GITHUB_TOKEN=ghs_token", {
        APPLE_PASSWORD: "secret",
        GITHUB_TOKEN: "ghs_token",
      }),
    ).toBe("APPLE_PASSWORD=<redacted> GITHUB_TOKEN=<redacted>");
  });
});
