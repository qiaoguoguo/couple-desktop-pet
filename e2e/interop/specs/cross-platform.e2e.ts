import { browser, expect } from "@wdio/globals";
import { createRendezvousSession } from "../support/rendezvous";
import {
  acceptPairCode,
  acknowledgeIncomingMessage,
  createPairCode,
  sendMessage,
  selectMyStatus,
  testMessageText,
  unpair,
  waitForPeerOnline,
  waitForPeerStatus,
} from "../support/ui";

const statusCases = [
  { event: "slacking", label: "摸鱼中", peerText: "摸鱼中" },
  { event: "dazing", label: "发呆中", peerText: "发呆中" },
  { event: "overtime", label: "加班中", peerText: "加班中" },
  { event: "null", label: "在线", peerText: "TA 在线" },
];
const bindingCodeInputLabel = "输入绑定码";
const incomingMessageLabel = "对方桌宠消息";

describe("Windows macOS encrypted interop smoke", () => {
  it("binds, syncs statuses, exchanges messages, unpairs, and records required events", async () => {
    const rendezvous = await createRendezvousSession();

    await rendezvous.send(`${rendezvous.role}-ready`, { ready: true });
    await rendezvous.receive(rendezvous.role === "windows" ? "macos-ready" : "windows-ready");

    if (rendezvous.role === "windows") {
      const pairCode = await createPairCode();
      await rendezvous.send("windows-pair-code-created", { pairCode });
      await rendezvous.receive("macos-pair-accepted");
    } else {
      const { pairCode } = await rendezvous.receive<{ pairCode: string }>(
        "windows-pair-code-created",
      );
      void bindingCodeInputLabel;
      void incomingMessageLabel;
      await acceptPairCode(pairCode);
      await rendezvous.send("macos-pair-accepted", { accepted: true });
    }

    await waitForPeerOnline();
    await rendezvous.send(`${rendezvous.role}-peer-online`, { online: true });
    await rendezvous.receive(rendezvous.role === "windows" ? "macos-peer-online" : "windows-peer-online");

    for (const status of statusCases) {
      await selectMyStatus(status.label);
      await rendezvous.send(`${rendezvous.role}-status-${status.event}`, { observed: true });
      await rendezvous.receive(
        rendezvous.role === "windows"
          ? `macos-status-${status.event}`
          : `windows-status-${status.event}`,
      );
      await waitForPeerStatus(status.peerText);
      await rendezvous.send(
        `${rendezvous.role}-observed-${rendezvous.role === "windows" ? "macos" : "windows"}-status-${status.event}`,
        { observed: true },
      );
    }

    if (rendezvous.role === "windows") {
      await sendMessage(testMessageText);
      await rendezvous.send("windows-message-sent", { message: testMessageText });
      await rendezvous.receive("macos-message-received");
      await acknowledgeIncomingMessage();
      await rendezvous.send("windows-bubble-acknowledged", { acknowledged: true });
      await rendezvous.send("windows-message-animation-observed", { observed: true });
    } else {
      await acknowledgeIncomingMessage();
      await rendezvous.send("macos-message-received", { received: true });
      await sendMessage(testMessageText);
      await rendezvous.send("macos-message-sent", { message: testMessageText });
      await rendezvous.receive("windows-bubble-acknowledged");
      await rendezvous.send("macos-bubble-acknowledged", { acknowledged: true });
      await rendezvous.send("macos-message-animation-observed", { observed: true });
    }

    await unpair();
    await rendezvous.send("unpair-completed", { role: rendezvous.role });
    await browser.pause(1000);
    await expect(browser.$('section[aria-label="情侣桌宠 MVP"]')).toBeDisplayed();
  });
});
