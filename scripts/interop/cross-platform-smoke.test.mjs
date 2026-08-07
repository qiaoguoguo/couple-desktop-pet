import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createIsolatedAppEnv,
  filterChildAppEnv,
  readSanitizedJsonl,
  redactInteropEvent,
  requiredInteropEvents,
  validateInteropEvents,
} from "./cross-platform-smoke.mjs";

let tempRoots = [];

function makeTempRoot() {
  const root = mkdtempSync(join(tmpdir(), "couple-pet-interop-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tempRoots = [];
});

describe("cross platform interop smoke utilities", () => {
  it("defines the full required real-client event matrix", () => {
    expect(requiredInteropEvents).toEqual([
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
      "unpair-completed",
      "windows-restart-shows-unpaired",
      "macos-restart-shows-unpaired",
    ]);
  });

  it("creates isolated app-data environments and strips runner secrets from child app env", () => {
    expect(createIsolatedAppEnv({ platform: "windows", root: "C:/tmp/interoperability" })).toEqual({
      APPDATA: "C:/tmp/interoperability/AppData/Roaming",
      LOCALAPPDATA: "C:/tmp/interoperability/AppData/Local",
      USERPROFILE: "C:/tmp/interoperability/UserProfile",
    });
    expect(createIsolatedAppEnv({ platform: "macos", root: "/tmp/interoperability" })).toEqual({
      HOME: "/tmp/interoperability/home",
    });

    const childEnv = filterChildAppEnv({
      PATH: "/bin",
      GITHUB_TOKEN: "ghs_secret",
      INTEROP_GITHUB_TOKEN: "ghs_secret",
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "oidc",
      APPLE_PASSWORD: "apple",
      KEEP_ME: "yes",
    });

    expect(childEnv).toEqual({ PATH: "/bin", KEEP_ME: "yes" });
  });

  it("merges sanitized JSONL logs and rejects sensitive plaintext", () => {
    const root = makeTempRoot();
    const logPath = join(root, "events.jsonl");
    writeFileSync(
      logPath,
      [
        JSON.stringify({ event: "windows-pair-code-created", details: { pairCode: "<redacted>" } }),
        JSON.stringify({ event: "macos-pair-accepted" }),
      ].join("\n"),
    );

    expect(readSanitizedJsonl([logPath])).toEqual([
      { event: "windows-pair-code-created", details: { pairCode: "<redacted>" } },
      { event: "macos-pair-accepted" },
    ]);
    expect(() =>
      readSanitizedJsonl([logPath], {
        forbiddenPlaintext: ["123456", "secret message"],
      }),
    ).not.toThrow();
    writeFileSync(logPath, JSON.stringify({ event: "bad", details: { pairCode: "123456" } }));
    expect(() =>
      readSanitizedJsonl([logPath], {
        forbiddenPlaintext: ["123456"],
      }),
    ).toThrow(/sensitive plaintext/);
  });

  it("validates the required event set and redacts event details", () => {
    expect(validateInteropEvents(requiredInteropEvents.map((event) => ({ event })))).toEqual({
      ok: true,
      missing: [],
    });
    expect(validateInteropEvents([{ event: "windows-pair-code-created" }])).toEqual({
      ok: false,
      missing: requiredInteropEvents.filter((event) => event !== "windows-pair-code-created"),
    });
    expect(
      redactInteropEvent({
        event: "windows-pair-code-created",
        details: {
          pairCode: "123456",
          deviceSecret: "secret",
          message: "hello",
          visible: "ok",
        },
      }),
    ).toEqual({
      event: "windows-pair-code-created",
      details: {
        pairCode: "<redacted>",
        deviceSecret: "<redacted>",
        message: "<redacted>",
        visible: "ok",
      },
    });
  });
});
