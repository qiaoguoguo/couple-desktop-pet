import { $, browser, expect } from "@wdio/globals";

export const testMessageText = "interop message text";

export async function openSettings() {
  const surface = await $('section[aria-label="情侣桌宠 MVP"]');
  await expect(surface).toBeDisplayed();
  await surface.click({ button: "right" });
  const menu = await $('[role="menu"][aria-label="桌宠菜单"]');
  await expect(menu).toBeDisplayed();
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
  const surface = await $('section[aria-label="情侣桌宠 MVP"]');
  await surface.click();
  const menu = await $('[role="menu"][aria-label="互动选项"]');
  await expect(menu).toBeDisplayed();
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

export async function sendMessage(text = testMessageText) {
  const surface = await $('section[aria-label="情侣桌宠 MVP"]');
  await surface.click();
  const menu = await $('[role="menu"][aria-label="互动选项"]');
  await expect(menu).toBeDisplayed();
  await menu.$('//button[@role="menuitem" and normalize-space(.)="敲电脑"]').click();
  const composer = await $('section[aria-label="发送消息"]');
  await expect(composer).toBeDisplayed();
  await $('textarea[aria-label="消息内容"]').setValue(text);
  await $('button=发送').click();
  await expect(composer).not.toBeDisplayed();
}

export async function acknowledgeIncomingMessage() {
  const layer = await $('[aria-label="对方桌宠消息"]');
  await expect(layer).toBeDisplayed();
  const stage = await $("[data-motion-id]");
  await browser.waitUntil(async () => (await stage.getAttribute("data-motion-id")) !== null, {
    timeout: 30_000,
  });
  await layer.moveTo();
  await expect(layer).not.toBeDisplayed();
}

export async function unpair() {
  await openSettings();
  const button = await $('button=取消绑定');
  if (await button.isExisting()) {
    await button.click();
  }
  await closeSettings();
}
