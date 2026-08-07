import { $, browser, expect } from "@wdio/globals";

type WdioElement = ReturnType<typeof $>;

export async function dispatchPointerHover(target: WdioElement): Promise<void> {
  await expect(target).toBeDisplayed();

  await browser.execute((targetElement) => {
    if (!(targetElement instanceof HTMLElement)) {
      throw new Error("Pointer hover target was not found");
    }

    const rect = targetElement.getBoundingClientRect();
    const clientX = Math.round(rect.left + rect.width / 2);
    const clientY = Math.round(rect.top + rect.height / 2);
    const init = {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerType: "mouse",
      pointerId: 1,
      isPrimary: true,
      clientX,
      clientY,
      screenX: clientX,
      screenY: clientY,
      view: window,
    };
    const event = typeof PointerEvent === "function"
      ? new PointerEvent("pointerover", init)
      : new MouseEvent("pointerover", init);
    if (typeof PointerEvent !== "function") {
      Object.defineProperties(event, {
        pointerType: { value: "mouse" },
        pointerId: { value: 1 },
        isPrimary: { value: true },
      });
    }
    targetElement.dispatchEvent(event);
  }, target);
}
