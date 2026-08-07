import { $, browser, expect } from "@wdio/globals";
import { openPetContextMenu } from "../../support/contextMenu";
import { openInteractionMenu } from "../../support/interactionMenu";

describe("macOS app shell", () => {
  it("opens settings and the activity status dialog from stable app controls", async () => {
    const surface = await $('section[aria-label="情侣桌宠 MVP"]');
    await expect(surface).toBeDisplayed();

    const menu = await openPetContextMenu();

    await menu.$('//button[@role="menuitem" and normalize-space(.)="设置"]').click();
    await expect($('section[aria-label="桌宠设置"]')).toBeDisplayed();
    await expect($('section[aria-label="形象管理"]')).toBeDisplayed();
    await expect($('section[aria-label="远程互动"]')).toBeDisplayed();

    await $('button[aria-label="关闭设置"]').click();
    await expect($('section[aria-label="桌宠设置"]')).not.toBeDisplayed();

    const interactionMenu = await openInteractionMenu();
    await interactionMenu.$('//button[@role="menuitem" and normalize-space(.)="我的状态"]').click();
    const statusDialog = await $('[role="dialog"][aria-label="我的状态"]');
    await expect(statusDialog).toBeDisplayed();

    await browser.keys("Escape");
    await expect(statusDialog).not.toBeDisplayed();
  });
});
