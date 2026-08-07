import { describe, expect, it } from "vitest";
import {
  buildSafeInteropFailureDetails,
  recordFailureAndRethrow,
} from "./evidence";

describe("interop failure evidence", () => {
  it("builds failure details without copying dynamic error messages", () => {
    const error = new Error(
      "pairCode=123456 message=interop message text github_pat_secret deviceSecret=abc",
    );
    error.name = "AssertionError";

    const details = buildSafeInteropFailureDetails(error, {
      assertion: "interop assertion failed",
    });
    const serialized = JSON.stringify(details);

    expect(details).toEqual({
      assertion: "interop assertion failed",
      errorType: "AssertionError",
    });
    expect(serialized).not.toContain("123456");
    expect(serialized).not.toContain("interop message text");
    expect(serialized).not.toContain("github_pat_secret");
    expect(serialized).not.toContain("deviceSecret=abc");
  });

  it("records failure before attempting a best-effort screenshot", async () => {
    const calls: Array<{ kind: string; event?: string; screenshotName?: string }> = [];
    const originalError = new TypeError("original interop failure");
    const evidence = {
      record(event: string) {
        calls.push({ kind: "record", event });
      },
      async captureEvidenceScreenshot(name: string) {
        calls.push({ kind: "screenshot", screenshotName: name });
        return "safe.png";
      },
    };

    await expect(
      recordFailureAndRethrow(evidence, originalError, {
        assertion: "interop failed",
        screenshotName: "failure",
      }),
    ).rejects.toBe(originalError);

    expect(calls).toEqual([
      { kind: "record", event: "failure" },
      { kind: "screenshot", screenshotName: "failure" },
    ]);
  });

  it("does not let screenshot errors replace the original test failure", async () => {
    const records: Array<{ event: string; details: Record<string, unknown> }> = [];
    const originalError = new Error("pairCode=123456 message=interop message text");
    const evidence = {
      record(event: string, details: Record<string, unknown> = {}) {
        records.push({ event, details });
      },
      async captureEvidenceScreenshot() {
        throw new Error("screenshot failed with github_pat_secret deviceSecret=abc");
      },
    };

    await expect(
      recordFailureAndRethrow(evidence, originalError, {
        assertion: "interop failed",
        screenshotName: "failure",
      }),
    ).rejects.toBe(originalError);

    expect(records.map((record) => record.event)).toEqual([
      "failure",
      "screenshot-failed",
    ]);
    const serialized = JSON.stringify(records);
    expect(serialized).not.toContain("123456");
    expect(serialized).not.toContain("interop message text");
    expect(serialized).not.toContain("github_pat_secret");
    expect(serialized).not.toContain("deviceSecret=abc");
  });
});
