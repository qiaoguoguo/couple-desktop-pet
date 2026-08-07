import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const evidenceRoot = ".superpowers/sdd/2026-08-07-macos-cross-platform";
const readmePath = `${evidenceRoot}/README.md`;
const matrixPath = `${evidenceRoot}/final-acceptance-matrix.md`;
const planPath = "docs/superpowers/plans/2026-08-07-macos-cross-platform-release.md";

function readText(path) {
  return readFileSync(path, "utf8");
}

describe("macOS release evidence manifest templates", () => {
  it("declares every required README section and privacy rule", () => {
    const readme = readText(readmePath);

    for (const section of [
      "Environment",
      "Raw Logs",
      "Screenshots",
      "Interop",
      "DMG Hashes",
      "Signing And Notarization",
      "Final Matrix",
    ]) {
      expect(readme).toContain(`## ${section}`);
    }

    for (const forbiddenEvidence of [
      "token",
      "binding code",
      "device secret",
      "message body",
    ]) {
      expect(readme.toLowerCase()).toContain(forbiddenEvidence);
    }
  });

  it("lists evidence paths that match current QA build, native, and interop outputs", () => {
    const combined = `${readText(readmePath)}\n${readText(matrixPath)}`;

    for (const expectedPath of [
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
      "macos/pnpm-test.log",
      "macos/production-permission-scan.log",
      "macos/cargo-tree-production.log",
      "native/launch-app.log",
      "native/app-window.png",
      "interop/windows/events.jsonl",
      "interop/macos/events.jsonl",
      "interop/validator/validator.log",
      "interop/windows/screenshots/",
      "interop/macos/screenshots/",
    ]) {
      expect(combined).toContain(expectedPath);
    }

    expect(combined).not.toContain("interop/events.jsonl");
  });

  it("separates QA evidence from formal Developer ID release evidence", () => {
    const matrix = readText(matrixPath);

    for (const formalPath of [
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
    ]) {
      expect(matrix).toContain(formalPath);
    }

    expect(matrix).toContain("Developer ID");
    expect(matrix).toContain("ad-hoc QA");
    expect(matrix).not.toContain("release-decision.md");
  });

  it("starts with pending results for every acceptance row", () => {
    const matrix = readText(matrixPath);
    const rows = matrix
      .split(/\r?\n/)
      .filter((line) => line.startsWith("|") && !line.includes("---") && !line.includes("Gate"));

    expect(rows.length).toBeGreaterThanOrEqual(20);
    for (const row of rows) {
      expect(row).toMatch(/\|\s*(Pending|Not run)\s*\|$/);
    }
  });

  it("keeps Task 10 aligned with the Vitest include and force-add scope", () => {
    const plan = readText(planPath);

    expect(plan).toContain("scripts/macos/evidence-manifest.test.mjs");
    expect(plan).toContain("pnpm vitest run scripts/macos/evidence-manifest.test.mjs");
    expect(plan).toContain("git add -f .superpowers/sdd/2026-08-07-macos-cross-platform/README.md .superpowers/sdd/2026-08-07-macos-cross-platform/final-acceptance-matrix.md");
    expect(plan).not.toContain("scripts/macos/evidence-manifest.test.ts");
  });
});
