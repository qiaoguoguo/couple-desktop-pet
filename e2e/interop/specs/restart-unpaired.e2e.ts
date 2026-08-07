import { $, expect } from "@wdio/globals";
import {
  createEvidenceRecorder,
  readEvidenceRoleFromEnv,
  summarizeInteropError,
} from "../support/evidence";
import { createRendezvousSession } from "../support/rendezvous";
import { closeSettings, openSettings } from "../support/ui";

describe("Windows macOS restart unpaired state", () => {
  it("restarts with the same isolated app data and shows no active pair", async () => {
    const evidence = createEvidenceRecorder(readEvidenceRoleFromEnv());

    try {
      const rendezvous = await createRendezvousSession();
      const recordAndSend = evidence.recordAndSend;

      await openSettings();
      await expect($('button=生成绑定码')).toBeDisplayed();
      await expect($('button=取消绑定')).not.toBeExisting();
      await closeSettings();
      await recordAndSend(rendezvous, `${rendezvous.role}-restart-shows-unpaired`, {
        assertion: "restart with isolated app data showed unpaired UI",
      });
    } catch (error) {
      await evidence.captureEvidenceScreenshot("restart-failure");
      evidence.record("failure", {
        assertion: "restart interop spec failed after saving screenshot",
        errorSummary: summarizeInteropError(error),
      });
      throw error;
    }
  });
});
