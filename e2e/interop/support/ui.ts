import { $, browser, expect } from "@wdio/globals";
import { isMessageAnimationMotion } from "../../../scripts/interop/cross-platform-smoke.mjs";
import { openPetContextMenu } from "../../support/contextMenu";
import { openInteractionMenu } from "../../support/interactionMenu";
import { dispatchPointerHover } from "../../support/pointerHover";

export const testMessageText = "interop message text";

export async function openSettings() {
  const menu = await openPetContextMenu();
  await menu.$('//button[@role="menuitem" and normalize-space(.)="设置"]').click();
  await expect($('section[aria-label="桌宠设置"]')).toBeDisplayed();
}

export async function closeSettings() {
  await $('button[aria-label="关闭设置"]').click();
  await expect($('section[aria-label="桌宠设置"]')).not.toBeDisplayed();
}

export async function createPairCode() {
  await openSettings();
  await $('button=生成绑定码').click();
  const output = await $('[aria-label="当前绑定码"]');
  await expect(output).toBeDisplayed();
  const code = (await output.getText()).trim();
  await closeSettings();
  return code;
}

export async function acceptPairCode(code: string) {
  await openSettings();
  const input = await $('input[aria-label="输入绑定码"]');
  await input.setValue(code);
  await $('button=绑定').click();
  await browser.waitUntil(async () => (await $('section[aria-label="远程互动"]').getText()).includes("已绑定"), {
    timeout: 120_000,
    timeoutMsg: "binding did not complete",
  });
  await closeSettings();
}

export async function waitForPeerOnline() {
  await openSettings();
  await browser.waitUntil(
    async () => (await $('section[aria-label="远程互动"]').getText()).includes("对方在线"),
    { timeout: 120_000, timeoutMsg: "peer did not become online" },
  );
  await closeSettings();
}

export async function selectMyStatus(label: string) {
  const menu = await openInteractionMenu();
  await menu.$('//button[@role="menuitem" and normalize-space(.)="我的状态"]').click();
  const dialog = await $('[role="dialog"][aria-label="我的状态"]');
  await expect(dialog).toBeDisplayed();
  await dialog.$(`//button[.//*[normalize-space(.)="${label}"] or normalize-space(.)="${label}"]`).click();
  await expect(dialog).not.toBeDisplayed();
}

export async function waitForPeerStatus(text: string) {
  await browser.waitUntil(async () => (await browser.$("body").getText()).includes(text), {
    timeout: 60_000,
    timeoutMsg: `peer status ${text} was not visible`,
  });
}

export async function waitForIncomingMessage(): Promise<void> {
  const layer = await $('[aria-label="对方桌宠消息"]');
  await expect(layer).toBeDisplayed();
}

export async function waitForMessageAnimation() {
  await browser.waitUntil(
    async () => {
      const stage = await $('.pet-frame-stage[data-motion-id="motion-message-pair"]');
      if (!(await stage.isExisting())) {
        return false;
      }
      return isMessageAnimationMotion(await stage.getAttribute("data-motion-id"));
    },
    {
      timeout: 30_000,
      timeoutMsg: "message motion did not switch to motion-message-pair",
    },
  );
}

export async function sendMessage(text = testMessageText) {
  const menu = await openInteractionMenu();
  await menu.$('//button[@role="menuitem" and normalize-space(.)="敲电脑"]').click();
  const composer = await $('section[aria-label="发送消息"]');
  await expect(composer).toBeDisplayed();
  await $('textarea[aria-label="消息内容"]').setValue(text);
  await $('button=发送').click();
  await expect(composer).not.toBeDisplayed();
}

export async function acknowledgeIncomingMessage() {
  await waitForIncomingMessage();
  const layer = await $('[aria-label="对方桌宠消息"]');
  await dispatchPointerHover(layer);
  await browser.waitUntil(async () => !(await layer.isDisplayed()), {
    timeout: 10_000,
    timeoutMsg: "incoming message bubble did not acknowledge after pointer hover",
  });
}

export async function confirmUnpaired() {
  await openSettings();
  await browser.waitUntil(
    async () => {
      const createButton = await $('button=生成绑定码');
      const unpairButton = await $('button=取消绑定');
      return (await createButton.isDisplayed()) && !(await unpairButton.isExisting());
    },
    { timeout: 60_000, timeoutMsg: "local UI did not return to unpaired state" },
  );
  await closeSettings();
}

export async function unpairAndConfirm() {
  await openSettings();
  const button = await $('button=取消绑定');
  if (await button.isExisting()) {
    await button.click();
  }
  await browser.waitUntil(
    async () => {
      const createButton = await $('button=生成绑定码');
      const unpairButton = await $('button=取消绑定');
      return (await createButton.isDisplayed()) && !(await unpairButton.isExisting());
    },
    { timeout: 60_000, timeoutMsg: "unpair did not clear local UI state" },
  );
  await closeSettings();
}
