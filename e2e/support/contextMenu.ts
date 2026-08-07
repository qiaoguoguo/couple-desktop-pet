import { $, browser, expect } from "@wdio/globals";

const petSurfaceSelector = 'section[aria-label="情侣桌宠 MVP"]';
const petContextMenuSelector = '[role="menu"][aria-label="桌宠菜单"]';

type WdioElement = ReturnType<typeof $>;

export async function openPetContextMenu(): Promise<WdioElement> {
  const surface = await $(petSurfaceSelector);
  await expect(surface).toBeDisplayed();

  await browser.execute((selector) => {
    const target = document.querySelector(selector);
    if (!(target instanceof HTMLElement)) {
      throw new Error(`Pet surface not found for context menu: ${selector}`);
    }

    const rect = target.getBoundingClientRect();
    const clientX = Math.round(rect.left + rect.width / 2);
    const clientY = Math.round(rect.top + rect.height / 2);
    target.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 2,
        buttons: 0,
        clientX,
        clientY,
        screenX: clientX,
        screenY: clientY,
        view: window,
      }),
    );
  }, petSurfaceSelector);

  const menu = await $(petContextMenuSelector);
  await expect(menu).toBeDisplayed();
  return menu;
}
