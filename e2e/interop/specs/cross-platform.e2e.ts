import { browser, expect } from "@wdio/globals";
import { createEvidenceRecorder } from "../support/evidence";
import { createRendezvousSession } from "../support/rendezvous";
import {
  acceptPairCode,
  acknowledgeIncomingMessage,
  confirmUnpaired,
  createPairCode,
  sendMessage,
  selectMyStatus,
  testMessageText,
  unpairAndConfirm,
  waitForIncomingMessage,
  waitForMessageAnimation,
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
    const evidence = createEvidenceRecorder(rendezvous.role);
    const recordAndSend = evidence.recordAndSend;
    const captureEvidenceScreenshot = evidence.captureEvidenceScreenshot;

    try {
      await rendezvous.send(`${rendezvous.role}-ready`, { ready: true });
      await rendezvous.receive(rendezvous.role === "windows" ? "macos-ready" : "windows-ready");

      if (rendezvous.role === "windows") {
        const pairCode = await createPairCode();
        await recordAndSend(rendezvous, "windows-pair-code-created", {
          assertion: "binding code output was visible before settings closed",
          pairCode,
        });
        await rendezvous.receive("macos-pair-accepted");
      } else {
        const { pairCode } = await rendezvous.receive<{ pairCode: string }>(
          "windows-pair-code-created",
        );
        void bindingCodeInputLabel;
        void incomingMessageLabel;
        await acceptPairCode(pairCode);
        await recordAndSend(rendezvous, "macos-pair-accepted", {
          assertion: "macOS accepted encrypted binding code through real UI",
        });
      }

      await captureEvidenceScreenshot("paired");

      await waitForPeerOnline();
      await recordAndSend(rendezvous, `${rendezvous.role}-peer-online`, {
        assertion: "remote peer online label was visible",
      });
      await rendezvous.receive(
        rendezvous.role === "windows" ? "macos-peer-online" : "windows-peer-online",
      );

      for (const status of statusCases) {
        await selectMyStatus(status.label);
        await rendezvous.send(`${rendezvous.role}-status-${status.event}`, {
          assertion: "local status selected through status picker",
        });
        await rendezvous.receive(
          rendezvous.role === "windows"
            ? `macos-status-${status.event}`
            : `windows-status-${status.event}`,
        );
        await waitForPeerStatus(status.peerText);
        await captureEvidenceScreenshot(`peer-status-${status.event}`);
        const observedEvent = `${rendezvous.role}-observed-${
          rendezvous.role === "windows" ? "macos" : "windows"
        }-status-${status.event}`;
        await recordAndSend(rendezvous, observedEvent, {
          assertion: `peer status ${status.peerText} was visible before advancing`,
        });
        await rendezvous.receive(
          rendezvous.role === "windows"
            ? `macos-observed-windows-status-${status.event}`
            : `windows-observed-macos-status-${status.event}`,
        );
      }

      if (rendezvous.role === "windows") {
        await sendMessage(testMessageText);
        await recordAndSend(rendezvous, "windows-message-sent", {
          assertion: "Windows sent message through composer",
          message: testMessageText,
        });
        await waitForIncomingMessage();
        await evidence.recordAndSend(rendezvous, "windows-message-received", {
          assertion: "Windows received macOS message bubble",
          message: testMessageText,
        });
        await waitForMessageAnimation();
        await captureEvidenceScreenshot(
          "message-animation",
          '.pet-frame-stage[data-motion-id="motion-message-pair"]',
        );
        await recordAndSend(rendezvous, "windows-message-animation-observed", {
          assertion: "main pet motion id was motion-message-pair",
        });
        await acknowledgeIncomingMessage();
        await recordAndSend(rendezvous, "windows-bubble-acknowledged", {
          assertion: "hover acknowledgement removed the incoming bubble",
        });
        await rendezvous.receive("macos-message-received");
        await rendezvous.receive("macos-message-animation-observed");
        await rendezvous.receive("macos-bubble-acknowledged");
      } else {
        await waitForIncomingMessage();
        await recordAndSend(rendezvous, "macos-message-received", {
          assertion: "macOS received Windows message bubble",
          message: testMessageText,
        });
        await waitForMessageAnimation();
        await captureEvidenceScreenshot(
          "message-animation",
          '.pet-frame-stage[data-motion-id="motion-message-pair"]',
        );
        await recordAndSend(rendezvous, "macos-message-animation-observed", {
          assertion: "main pet motion id was motion-message-pair",
        });
        await acknowledgeIncomingMessage();
        await recordAndSend(rendezvous, "macos-bubble-acknowledged", {
          assertion: "hover acknowledgement removed the incoming bubble",
        });
        await sendMessage(testMessageText);
        await recordAndSend(rendezvous, "macos-message-sent", {
          assertion: "macOS sent message through composer",
          message: testMessageText,
        });
        await rendezvous.receive("windows-message-sent");
        await rendezvous.receive("windows-message-received");
        await rendezvous.receive("windows-message-animation-observed");
        await rendezvous.receive("windows-bubble-acknowledged");
      }

      await unpairAndConfirm();
      await captureEvidenceScreenshot("unpaired");
      await recordAndSend(rendezvous, `${rendezvous.role}-unpair-completed`, {
        assertion: "local UI showed generate binding code and no cancel binding action",
      });
      await rendezvous.receive(
        rendezvous.role === "windows" ? "macos-unpair-completed" : "windows-unpair-completed",
      );
      await confirmUnpaired();
      await browser.pause(1000);
      await expect(browser.$('section[aria-label="情侣桌宠 MVP"]')).toBeDisplayed();
    } catch (error) {
      await captureEvidenceScreenshot("failure");
      evidence.record("failure", {
        assertion: "interop spec failed after saving screenshot",
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });
});
