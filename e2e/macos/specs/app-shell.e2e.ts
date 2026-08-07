import { $, expect } from "@wdio/globals";

describe("macOS app shell", () => {
  it("opens and closes settings from the desktop pet context menu", async () => {
    const surface = await $('section[aria-label="情侣桌宠 MVP"]');
    await expect(surface).toBeDisplayed();

    await surface.click({ button: "right" });
    const menu = await $('[role="menu"][aria-label="桌宠菜单"]');
    await expect(menu).toBeDisplayed();

    await menu.$('button[role="menuitem"]').click();
    await expect($('section[aria-label="桌宠设置"]')).toBeDisplayed();

    await $('button[aria-label="关闭设置"]').click();
    await expect($('section[aria-label="桌宠设置"]')).not.toBeDisplayed();
  });
});
