import { $, expect } from "@wdio/globals";
import { createRendezvousSession } from "../support/rendezvous";
import { openSettings } from "../support/ui";

describe("Windows macOS restart unpaired state", () => {
  it("restarts with the same isolated app data and shows no active pair", async () => {
    const rendezvous = await createRendezvousSession();

    await openSettings();
    await expect($('button=生成绑定码')).toBeDisplayed();
    await expect($('button=取消绑定')).not.toBeExisting();
    await rendezvous.send(`${rendezvous.role}-restart-shows-unpaired`, { unpaired: true });
  });
});
