import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const evidenceRoot = ".superpowers/sdd/2026-08-07-macos-cross-platform";
const appleSecrets = [
  "APPLE_CERTIFICATE",
  "APPLE_CERTIFICATE_PASSWORD",
  "KEYCHAIN_PASSWORD",
  "APPLE_SIGNING_IDENTITY",
  "APPLE_ID",
  "APPLE_PASSWORD",
  "APPLE_TEAM_ID",
];

const actionPins = {
  "actions/checkout": {
    sha: "3d3c42e5aac5ba805825da76410c181273ba90b1",
    version: "v7.0.1",
  },
  "actions/setup-node": {
    sha: "820762786026740c76f36085b0efc47a31fe5020",
    version: "v7.0.0",
  },
  "pnpm/action-setup": {
    sha: "0977fd99725f1db4007ccb2928dbb4e90d06cc86",
    version: "v6.0.10",
  },
  "actions/upload-artifact": {
    sha: "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
    version: "v7.0.1",
  },
  "actions/download-artifact": {
    sha: "3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
    version: "v8.0.1",
  },
  "dtolnay/rust-toolchain": {
    sha: "4360b52568e2003a75bf9bc1d59f33a8e3fc893c",
    version: "stable",
  },
};

function readText(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function readWorkflow(path) {
  const source = readText(path);
  return { path, source, workflow: parse(source) };
}

function workflowDispatchOnly(workflow) {
  const triggers = workflow.on ?? workflow["on"];
  expect(Object.keys(triggers)).toEqual(["workflow_dispatch"]);
}

function jobs(workflow) {
  return workflow.jobs ?? {};
}

function allSteps(workflow) {
  return Object.values(jobs(workflow)).flatMap((job) => job.steps ?? []);
}

function allRunText(workflow) {
  return allSteps(workflow)
    .map((step) => step.run ?? "")
    .join("\n");
}

function jobRunText(job) {
  return (job.steps ?? [])
    .map((step) => step.run ?? "")
    .join("\n");
}

function workflowUses(workflow) {
  return allSteps(workflow)
    .map((step) => step.uses)
    .filter(Boolean);
}

function assertPinnedActions(workflows) {
  const combinedSource = workflows.map(({ source }) => source).join("\n");
  const allowedUses = new Set(
    Object.entries(actionPins).map(([name, pin]) => `${name}@${pin.sha}`),
  );

  for (const { workflow } of workflows) {
    for (const uses of workflowUses(workflow)) {
      expect(allowedUses.has(uses), `unexpected unpinned action ${uses}`).toBe(true);
    }
    for (const step of allSteps(workflow).filter((step) =>
      step.uses?.startsWith("actions/checkout@"),
    )) {
      expect(step.with?.["persist-credentials"]).toBe(false);
    }
  }

  for (const [name, pin] of Object.entries(actionPins)) {
    const line = new RegExp(
      `uses:\\s+${escapeRegExp(name)}@${pin.sha}\\s+#\\s+${escapeRegExp(pin.version)}`,
    );
    expect(combinedSource, `${name} is not pinned with version comment`).toMatch(line);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function setupStepsAreNode22(workflow) {
  for (const step of allSteps(workflow).filter((step) =>
    step.uses?.startsWith("actions/setup-node@"),
  )) {
    expect(step.with?.["node-version"]).toBe(22);
    expect(step.with?.cache).toBe("pnpm");
  }
}

function expectRunContains(workflow, fragments) {
  const runText = allRunText(workflow);
  for (const fragment of fragments) {
    expect(runText).toContain(fragment);
  }
}

function uploadSteps(workflow) {
  return allSteps(workflow).filter((step) => step.uses?.startsWith("actions/upload-artifact@"));
}

function downloadSteps(workflow) {
  return allSteps(workflow).filter((step) => step.uses?.startsWith("actions/download-artifact@"));
}

function stepByName(job, name) {
  const step = (job.steps ?? []).find((candidate) => candidate.name === name);
  expect(step, `missing workflow step ${name}`).toBeTruthy();
  return step;
}

describe("macOS and cross-platform GitHub Actions workflows", () => {
  it("pins the package manager, Node version, checkout credentials, and every third-party action", () => {
    const packageJson = readJson("package.json");
    const workflows = [
      readWorkflow(".github/workflows/macos-qa.yml"),
      readWorkflow(".github/workflows/macos-release.yml"),
      readWorkflow(".github/workflows/cross-platform-interop.yml"),
    ];

    expect(packageJson.packageManager).toBe("pnpm@11.16.0");
    for (const { workflow } of workflows) {
      workflowDispatchOnly(workflow);
      setupStepsAreNode22(workflow);
    }
    assertPinnedActions(workflows);
  });

  it("includes hidden .superpowers evidence in artifact uploads", () => {
    const workflows = [
      readWorkflow(".github/workflows/macos-qa.yml").workflow,
      readWorkflow(".github/workflows/macos-release.yml").workflow,
      readWorkflow(".github/workflows/cross-platform-interop.yml").workflow,
    ];

    for (const workflow of workflows) {
      for (const upload of uploadSteps(workflow)) {
        if (JSON.stringify(upload.with?.path ?? "").includes(".superpowers")) {
          expect(upload.with?.["include-hidden-files"]).toBe(true);
        }
      }
    }
  });

  it("defines macOS QA on a real hosted Mac runner with isolated E2E target and evidence uploads", () => {
    const { source, workflow } = readWorkflow(".github/workflows/macos-qa.yml");
    const job = jobs(workflow)["macos-qa"];

    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(job["runs-on"]).toBe("macos-15");
    expect(job["timeout-minutes"]).toBeGreaterThanOrEqual(90);
    expectRunContains(workflow, [
      "pnpm install --frozen-lockfile",
      "pnpm test",
      "pnpm typecheck",
      "pnpm build",
      "cargo test --manifest-path src-tauri/Cargo.toml",
      "cargo check --manifest-path src-tauri/Cargo.toml",
      "cargo fmt --check --manifest-path src-tauri/Cargo.toml",
      "pnpm macos:qa-build",
      "CARGO_TARGET_DIR=\"${{ runner.temp }}/macos-e2e-target\"",
      "MACOS_TAURI_APP_BINARY=",
      "pnpm e2e:macos",
      "pnpm macos:native-evidence -- --mode qa --app",
    ]);
    expect(source).toContain(`${evidenceRoot}/macos`);
    expect(source).toContain(`${evidenceRoot}/native`);
    expect(source).toContain("x86_64-apple-darwin,aarch64-apple-darwin");
    expect(allRunText(workflow)).toContain("production scan found WDIO symbols");

    const uploads = uploadSteps(workflow);
    expect(uploads.every((step) => step.if === "always()")).toBe(true);
    expect(uploads.every((step) => step.with?.["if-no-files-found"] === "warn")).toBe(true);
    expect(JSON.stringify(uploads)).toContain("src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg");
    expect(JSON.stringify(uploads)).toContain(`${evidenceRoot}/macos/**`);
  });

  it("keeps macOS runner shell scripts compatible with BSD find", () => {
    const qa = readWorkflow(".github/workflows/macos-qa.yml").workflow;
    const release = readWorkflow(".github/workflows/macos-release.yml").workflow;
    const interop = readWorkflow(".github/workflows/cross-platform-interop.yml").workflow;

    for (const job of [
      jobs(qa)["macos-qa"],
      jobs(release)["developer-id-release"],
      jobs(interop).macos,
    ]) {
      expect(job["runs-on"]).toBe("macos-15");
      expect(jobRunText(job)).not.toMatch(/find\b[^\n]*(?:-maxdepth|-quit)/);
    }
  });

  it("defines cross-platform interop as concurrent Windows and macOS runner jobs with cleanup and validation", () => {
    const { workflow } = readWorkflow(".github/workflows/cross-platform-interop.yml");
    const workflowJobs = jobs(workflow);
    const windows = workflowJobs.windows;
    const macos = workflowJobs.macos;
    const validator = workflowJobs.validator;
    const cleanup = workflowJobs.cleanup;

    expect(workflow.permissions).toEqual({
      contents: "read",
      issues: "write",
      actions: "read",
    });
    expect(workflowJobs.coordinator["runs-on"]).toBe("ubuntu-24.04");
    expect(windows["runs-on"]).toBe("windows-2025");
    expect(macos["runs-on"]).toBe("macos-15");
    expect(windows.needs).toBe("coordinator");
    expect(macos.needs).toBe("coordinator");
    expect(windows["timeout-minutes"]).toBeGreaterThanOrEqual(60);
    expect(macos["timeout-minutes"]).toBeGreaterThanOrEqual(60);
    expect(validator.if).toBe("always()");
    expect(cleanup.if).toBe("always()");
    expect(cleanup.needs).toEqual(["coordinator", "windows", "macos", "validator"]);

    expectRunContains(workflow, [
      "pnpm interop:rendezvous:create -- --repo \"${{ github.repository }}\"",
      "pnpm e2e:windows:build",
      "pnpm e2e:interop:windows",
      "pnpm e2e:interop:windows:restart",
      "pnpm e2e:macos:build",
      "pnpm e2e:interop:macos",
      "pnpm e2e:interop:macos:restart",
      "pnpm interop:validate -- --log",
      "pnpm interop:rendezvous:cleanup -- --repo \"${{ github.repository }}\"",
    ]);
    const workflowJson = JSON.stringify(workflow);
    expect(workflowJson).toContain("INTEROP_GITHUB_TOKEN\":\"${{ github.token }}");
    expect(workflowJson).toContain("INTEROP_SESSION_ID\":\"main");
    expect(workflowJson).toContain("INTEROP_SESSION_ID\":\"restart");
    expect(workflowJson).toContain("INTEROP_APP_DATA_ROOT\":\"${{ runner.temp }}/couple-pet-interop-windows");
    expect(workflowJson).toContain("INTEROP_APP_DATA_ROOT\":\"${{ runner.temp }}/couple-pet-interop-macos");
    expect(workflowJson).toContain(`${evidenceRoot}/interop/windows/events.jsonl`);
    expect(workflowJson).toContain(`${evidenceRoot}/interop/macos/events.jsonl`);
    expect(JSON.stringify(windows)).toContain(
      "INTEROP_APP_BINARY\":\"${{ github.workspace }}/src-tauri/target/release/couple-desktop-pet.exe",
    );
    expect(JSON.stringify(macos)).toContain("INTEROP_APP_BINARY\":\"${{ env.MACOS_INTEROP_APP_BINARY }}");

    for (const role of ["windows", "macos", "validator"]) {
      const upload = uploadSteps(workflow).find((step) => step.with?.name?.includes(role));
      expect(upload?.if).toBe("always()");
      expect(upload?.with?.["if-no-files-found"]).toBe("warn");
      expect(JSON.stringify(upload)).not.toContain("wdio.log");
    }
    const validatorDownloads = downloadSteps(workflow).filter((step) =>
      step.with?.path?.includes("interop/validator/artifacts"),
    );
    expect(validatorDownloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          with: expect.objectContaining({
            name: "interop-windows-evidence",
            path: `${evidenceRoot}/interop/validator/artifacts/windows`,
          }),
        }),
        expect.objectContaining({
          with: expect.objectContaining({
            name: "interop-macos-evidence",
            path: `${evidenceRoot}/interop/validator/artifacts/macos`,
          }),
        }),
      ]),
    );
    expect(jobRunText(validator)).toContain('WINDOWS_LOG="$VALIDATOR_DIR/artifacts/windows/events.jsonl"');
    expect(jobRunText(validator)).toContain('MACOS_LOG="$VALIDATOR_DIR/artifacts/macos/events.jsonl"');
    expect(jobRunText(validator)).not.toContain("find \"$VALIDATOR_DIR/artifacts\"");
  });

  it("defines formal Developer ID release with secret preflight and post-build assessment evidence", () => {
    const { workflow } = readWorkflow(".github/workflows/macos-release.yml");
    const job = jobs(workflow)["developer-id-release"];

    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(job["runs-on"]).toBe("macos-15");
    expect(job["timeout-minutes"]).toBeGreaterThanOrEqual(90);
    for (const secret of appleSecrets) {
      expect(job.env ?? {}).not.toHaveProperty(secret);
    }
    const preflight = stepByName(job, "Preflight Apple Developer ID secrets");
    const formalBuild = stepByName(job, "Build Developer ID Universal DMG");
    const postBuild = stepByName(job, "Post-build signing notarization and Gatekeeper evidence");

    for (const secret of appleSecrets) {
      expect(preflight.env?.[secret]).toBe(`\${{ secrets.${secret} }}`);
      expect(formalBuild.env?.[secret]).toBe(`\${{ secrets.${secret} }}`);
    }
    expect(postBuild.env).toEqual({
      APPLE_ID: "${{ secrets.APPLE_ID }}",
      APPLE_PASSWORD: "${{ secrets.APPLE_PASSWORD }}",
      APPLE_TEAM_ID: "${{ secrets.APPLE_TEAM_ID }}",
    });
    expectRunContains(workflow, [
      "pnpm install --frozen-lockfile",
      "pnpm test",
      "pnpm typecheck",
      "pnpm build",
      "cargo test --manifest-path src-tauri/Cargo.toml",
      "cargo check --manifest-path src-tauri/Cargo.toml",
      "cargo fmt --check --manifest-path src-tauri/Cargo.toml",
      "pnpm macos:formal-build",
      "Missing required Apple signing secret",
      "codesign --verify --deep --strict --verbose=4",
      "codesign -dv --verbose=4",
      "xcrun notarytool history",
      "xcrun stapler validate \"$APP_PATH\"",
      "xcrun stapler validate \"$DMG_PATH\"",
      "spctl --assess --type execute --verbose=4 \"$APP_PATH\"",
      "spctl --assess --type open --context context:primary-signature --verbose=4 \"$DMG_PATH\"",
      "hdiutil verify \"$DMG_PATH\"",
      "shasum -a 256 \"$DMG_PATH\"",
      "shasum -a 256 \"$APP_BINARY\"",
    ]);

    const uploads = uploadSteps(workflow);
    expect(uploads.some((step) => step.if === "always()" && step.with?.name === "macos-release-evidence")).toBe(true);
    expect(uploads.some((step) => step.if === "success()" && step.with?.name === "couple-pet-macos-notarized-dmg")).toBe(true);
  });
});
