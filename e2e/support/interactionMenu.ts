import { $, expect } from "@wdio/globals";

const petFrameStageSelector = ".pet-frame-stage";
const interactionMenuSelector = '[role="menu"][aria-label="互动选项"]';

type WdioElement = ReturnType<typeof $>;

export async function openInteractionMenu(): Promise<WdioElement> {
  const stage = await $(petFrameStageSelector);
  await expect(stage).toBeDisplayed();
  await stage.click();

  const menu = await $(interactionMenuSelector);
  await expect(menu).toBeDisplayed();
  return menu;
}
