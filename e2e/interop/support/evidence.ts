import { $ } from "@wdio/globals";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createInteropEventLogger } from "../../../scripts/interop/cross-platform-smoke.mjs";
import type { InteropRole } from "./rendezvous";

interface RendezvousLike {
  send<TPayload>(event: string, payload: TPayload): Promise<void>;
}

export function createEvidenceRecorder(role: InteropRole) {
  const logPath = process.env.INTEROP_EVENT_LOG;
  if (!logPath) {
    throw new Error("Missing INTEROP_EVENT_LOG");
  }
  const logger = createInteropEventLogger({
    logPath,
    role,
    platform: role,
  });

  return {
    record(event: string, details: Record<string, unknown> = {}) {
      return logger.record(event, details);
    },
    async recordAndSend(
      rendezvous: RendezvousLike,
      event: string,
      details: Record<string, unknown> = {},
    ) {
      logger.record(event, details);
      await rendezvous.send(event, details);
    },
    async captureEvidenceScreenshot(name: string, selector = ".pet-frame-stage") {
      const screenshotDir = process.env.INTEROP_SCREENSHOT_DIR;
      if (!screenshotDir) {
        return null;
      }
      mkdirSync(screenshotDir, { recursive: true });
      const path = join(screenshotDir, `${role}-${sanitizeScreenshotName(name)}.png`);
      const target = await $(selector);
      if (await target.isExisting()) {
        await target.saveScreenshot(path);
        return path;
      }
      logger.record("screenshot-skipped", {
        assertion: "safe screenshot target was not present",
        screenshotName: sanitizeScreenshotName(name),
        selector,
      });
      return null;
    },
  };
}

export function readEvidenceRoleFromEnv(env: NodeJS.ProcessEnv = process.env): InteropRole {
  const role = env.INTEROP_ROLE;
  if (role !== "windows" && role !== "macos") {
    throw new Error("INTEROP_ROLE must be windows or macos");
  }
  return role;
}

export function summarizeInteropError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/\b\d{6,}\b/g, "<redacted-number>")
    .replace(/\b(?:gh[opsu]_|github_pat_)[A-Za-z0-9_]+/g, "<redacted-token>");
}

function sanitizeScreenshotName(name: string): string {
  return name.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
}
