import { $, expect } from "@wdio/globals";
import { createEvidenceRecorder } from "../support/evidence";
import { createRendezvousSession } from "../support/rendezvous";
import { closeSettings, openSettings } from "../support/ui";

describe("Windows macOS restart unpaired state", () => {
  it("restarts with the same isolated app data and shows no active pair", async () => {
    const rendezvous = await createRendezvousSession();
    const evidence = createEvidenceRecorder(rendezvous.role);
    const recordAndSend = evidence.recordAndSend;

    await openSettings();
    await expect($('button=生成绑定码')).toBeDisplayed();
    await expect($('button=取消绑定')).not.toBeExisting();
    await closeSettings();
    await recordAndSend(rendezvous, `${rendezvous.role}-restart-shows-unpaired`, {
      assertion: "restart with isolated app data showed unpaired UI",
    });
  });
});
