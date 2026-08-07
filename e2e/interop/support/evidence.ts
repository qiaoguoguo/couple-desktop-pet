import { $, browser } from "@wdio/globals";
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
    async captureEvidenceScreenshot(name: string, selector = 'section[aria-label="情侣桌宠 MVP"]') {
      const screenshotDir = process.env.INTEROP_SCREENSHOT_DIR;
      if (!screenshotDir) {
        return null;
      }
      mkdirSync(screenshotDir, { recursive: true });
      const path = join(screenshotDir, `${role}-${sanitizeScreenshotName(name)}.png`);
      const target = await $(selector);
      if (await target.isExisting()) {
        await target.saveScreenshot(path);
      } else {
        await browser.saveScreenshot(path);
      }
      return path;
    },
  };
}

function sanitizeScreenshotName(name: string): string {
  return name.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
}
