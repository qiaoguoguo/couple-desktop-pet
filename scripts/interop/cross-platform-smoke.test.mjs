import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createIsolatedAppEnv,
  createInteropEventLogger,
  filterChildAppEnv,
  isMessageAnimationMotion,
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
      "windows-unpair-completed",
      "macos-unpair-completed",
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

    expect(childEnv).toEqual({
      PATH: "/bin",
      GITHUB_TOKEN: "",
      INTEROP_GITHUB_TOKEN: "",
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "",
      APPLE_PASSWORD: "",
      KEEP_ME: "yes",
    });
    expect({ ...{
      GITHUB_TOKEN: "ghs_secret",
      INTEROP_GITHUB_TOKEN: "ghs_secret",
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "oidc",
      APPLE_PASSWORD: "apple",
    }, ...childEnv }).toEqual(
      expect.objectContaining({
        GITHUB_TOKEN: "",
        INTEROP_GITHUB_TOKEN: "",
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: "",
        APPLE_PASSWORD: "",
      }),
    );
  });

  it("appends sanitized JSONL evidence and creates parent directories", () => {
    const root = makeTempRoot();
    const logPath = join(root, "nested", "windows.jsonl");
    const logger = createInteropEventLogger({
      logPath,
      role: "windows",
      platform: "windows",
      now: () => new Date("2026-08-07T12:00:00.000Z"),
    });

    logger.record("windows-pair-code-created", {
      pairCode: "123456",
      deviceSecret: "secret",
      assertion: "binding code output was visible",
    });
    logger.record("windows-peer-online", { assertion: "peer online label visible" });

    const lines = readFileSync(logPath, "utf8").trim().split(/\r?\n/).map(JSON.parse);
    expect(lines).toEqual([
      {
        event: "windows-pair-code-created",
        role: "windows",
        platform: "windows",
        at: "2026-08-07T12:00:00.000Z",
        details: {
          pairCode: "<redacted>",
          deviceSecret: "<redacted>",
          assertion: "binding code output was visible",
        },
      },
      {
        event: "windows-peer-online",
        role: "windows",
        platform: "windows",
        at: "2026-08-07T12:00:00.000Z",
        details: { assertion: "peer online label visible" },
      },
    ]);
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

  it("redacts dynamic failure summaries before writing JSONL evidence", () => {
    const root = makeTempRoot();
    const logPath = join(root, "events.jsonl");
    const logger = createInteropEventLogger({
      logPath,
      role: "macos",
      platform: "macos",
      now: () => new Date("2026-08-07T12:01:00.000Z"),
    });

    logger.record("failure", {
      assertion: "interop failed before peer connected",
      errorSummary:
        "pairCode=123456 message=interop message text github_pat_secret deviceSecret=abc",
    });

    const logText = readFileSync(logPath, "utf8");
    expect(logText).not.toContain("123456");
    expect(logText).not.toContain("interop message text");
    expect(logText).not.toContain("github_pat_secret");
    expect(logText).not.toContain("deviceSecret=abc");
    expect(JSON.parse(logText).details).toEqual({
      assertion: "interop failed before peer connected",
      errorSummary: "<redacted>",
    });
  });

  it("only treats the pair message motion as received message animation evidence", () => {
    expect(isMessageAnimationMotion("motion-message-pair")).toBe(true);
    expect(isMessageAnimationMotion("idle-breathe")).toBe(false);
    expect(isMessageAnimationMotion(null)).toBe(false);
  });
});
