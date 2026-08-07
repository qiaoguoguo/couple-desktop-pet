import { $, browser, expect } from "@wdio/globals";

describe("macOS app shell", () => {
  it("opens settings and the activity status dialog from stable app controls", async () => {
    const surface = await $('section[aria-label="情侣桌宠 MVP"]');
    await expect(surface).toBeDisplayed();

    await surface.click({ button: "right" });
    const menu = await $('[role="menu"][aria-label="桌宠菜单"]');
    await expect(menu).toBeDisplayed();

    await menu.$('//button[@role="menuitem" and normalize-space(.)="设置"]').click();
    await expect($('section[aria-label="桌宠设置"]')).toBeDisplayed();
    await expect($('section[aria-label="形象管理"]')).toBeDisplayed();
    await expect($('section[aria-label="远程互动"]')).toBeDisplayed();

    await $('button[aria-label="关闭设置"]').click();
    await expect($('section[aria-label="桌宠设置"]')).not.toBeDisplayed();

    await surface.click();
    const interactionMenu = await $('[role="menu"][aria-label="互动选项"]');
    await expect(interactionMenu).toBeDisplayed();

    await interactionMenu.$('//button[@role="menuitem" and normalize-space(.)="我的状态"]').click();
    const statusDialog = await $('[role="dialog"][aria-label="我的状态"]');
    await expect(statusDialog).toBeDisplayed();

    await browser.keys("Escape");
    await expect(statusDialog).not.toBeDisplayed();
  });
});
