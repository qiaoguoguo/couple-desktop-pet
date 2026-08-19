import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectInteractiveRegions,
  interactiveRegionAttribute,
  observeInteractiveRegions,
} from "./interactiveRegions";

const nonGeometricAnimationAttribute =
  "data-desktop-non-geometric-animation";

function rect(left: number, top: number, width: number, height: number) {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } satisfies DOMRect;
}

function installRafController() {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextHandle = 1;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const handle = nextHandle;
    nextHandle += 1;
    callbacks.set(handle, callback);
    return handle;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => {
    callbacks.delete(handle);
  });

  return {
    step(timeMs: number) {
      const pending = Array.from(callbacks.entries());
      callbacks.clear();

      for (const [, callback] of pending) {
        callback(timeMs);
      }
    },
    pendingCount() {
      return callbacks.size;
    },
  };
}

function animationEvent(type: string, animationName: string): Event {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "animationName", { value: animationName });
  return event;
}

describe("interactiveRegions", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("collects only visible desktop hit regions with CSS viewport coordinates", () => {
    const visible = document.createElement("button");
    visible.setAttribute(interactiveRegionAttribute, "");
    const hidden = document.createElement("button");
    hidden.setAttribute(interactiveRegionAttribute, "");
    hidden.hidden = true;
    document.body.append(visible, hidden);

    vi.spyOn(visible, "getBoundingClientRect").mockReturnValue(
      rect(12.5, 18, 96, 144.5),
    );
    vi.spyOn(hidden, "getBoundingClientRect").mockReturnValue(
      rect(200, 200, 24, 24),
    );

    expect(collectInteractiveRegions()).toEqual([
      { x: 12.5, y: 18, width: 96, height: 144.5 },
    ]);
  });

  it("excludes a hit region inside an aria-hidden surface", () => {
    const hiddenSurface = document.createElement("section");
    hiddenSurface.setAttribute("aria-hidden", "true");
    const region = document.createElement("button");
    region.setAttribute(interactiveRegionAttribute, "");
    hiddenSurface.append(region);
    document.body.append(hiddenSurface);

    vi.spyOn(region, "getBoundingClientRect").mockReturnValue(
      rect(20, 30, 80, 40),
    );

    expect(collectInteractiveRegions()).toEqual([]);
  });

  it("coalesces DOM changes into one animation-frame callback", () => {
    vi.useFakeTimers();
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextHandle = 1;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      const handle = nextHandle;
      nextHandle += 1;
      callbacks.set(handle, callback);
      return handle;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => {
      callbacks.delete(handle);
    });
    const onChange = vi.fn();

    const stop = observeInteractiveRegions(onChange);
    document.body.append(document.createElement("div"));
    document.body.append(document.createElement("span"));

    expect(onChange).not.toHaveBeenCalled();
    for (const [handle, callback] of callbacks) {
      callbacks.delete(handle);
      callback(16);
    }

    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
    vi.useRealTimers();
  });

  it.each([
    ["animationstart", "animationend"],
    ["transitionstart", "transitionend"],
  ])(
    "resamples transformed hit regions during CSS %s/%s and stops after the final frame",
    (startEventName, endEventName) => {
      const raf = installRafController();
      const region = document.createElement("button");
      region.setAttribute(interactiveRegionAttribute, "");
      document.body.append(region);
      let left = 0;
      vi.spyOn(region, "getBoundingClientRect").mockImplementation(() =>
        rect(left, 20, 30, 40),
      );
      const sampledLefts: number[] = [];
      const onChange = vi.fn(() => {
        sampledLefts.push(collectInteractiveRegions()[0]?.x ?? Number.NaN);
      });

      const stop = observeInteractiveRegions(onChange);
      raf.step(0);
      onChange.mockClear();
      sampledLefts.length = 0;

      region.dispatchEvent(new Event(startEventName, { bubbles: true }));
      left = 12;
      raf.step(16);
      left = 24;
      raf.step(32);

      expect(sampledLefts).toEqual([12, 24]);
      expect(onChange).toHaveBeenCalledTimes(2);

      region.dispatchEvent(new Event(endEventName, { bubbles: true }));
      left = 36;
      raf.step(48);

      expect(sampledLefts).toEqual([12, 24, 36]);
      expect(onChange).toHaveBeenCalledTimes(3);
      expect(raf.pendingCount()).toBe(0);

      left = 48;
      raf.step(64);
      expect(sampledLefts).toEqual([12, 24, 36]);

      stop();
    },
  );

  it("does not sample the named spark breathing animation", () => {
    const raf = installRafController();
    const region = document.createElement("button");
    region.setAttribute(interactiveRegionAttribute, "");
    region.setAttribute(
      nonGeometricAnimationAttribute,
      "spark-tier-breathe",
    );
    document.body.append(region);
    const onChange = vi.fn();

    const stop = observeInteractiveRegions(onChange);
    raf.step(0);
    onChange.mockClear();

    region.dispatchEvent(animationEvent("animationstart", "spark-tier-breathe"));
    expect(raf.pendingCount()).toBe(0);
    raf.step(16);
    raf.step(32);
    expect(onChange).not.toHaveBeenCalled();

    region.dispatchEvent(animationEvent("animationend", "spark-tier-breathe"));
    expect(raf.pendingCount()).toBe(0);
    expect(onChange).not.toHaveBeenCalled();

    stop();
  });

  it("still samples transitions on an element with a non-geometric animation", () => {
    const raf = installRafController();
    const region = document.createElement("button");
    region.setAttribute(interactiveRegionAttribute, "");
    region.setAttribute(
      nonGeometricAnimationAttribute,
      "spark-tier-breathe",
    );
    document.body.append(region);
    const onChange = vi.fn();

    const stop = observeInteractiveRegions(onChange);
    raf.step(0);
    onChange.mockClear();

    region.dispatchEvent(new Event("transitionstart", { bubbles: true }));
    raf.step(16);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(raf.pendingCount()).toBe(1);

    region.dispatchEvent(new Event("transitionend", { bubbles: true }));
    raf.step(32);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(raf.pendingCount()).toBe(0);

    stop();
  });

  it("samples another named animation on the same marked element", () => {
    const raf = installRafController();
    const region = document.createElement("button");
    region.setAttribute(interactiveRegionAttribute, "");
    region.setAttribute(
      nonGeometricAnimationAttribute,
      "spark-tier-breathe",
    );
    document.body.append(region);
    const onChange = vi.fn();

    const stop = observeInteractiveRegions(onChange);
    raf.step(0);
    onChange.mockClear();

    region.dispatchEvent(animationEvent("animationstart", "geometric-slide"));
    raf.step(16);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(raf.pendingCount()).toBe(1);

    region.dispatchEvent(animationEvent("animationend", "geometric-slide"));
    raf.step(32);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(raf.pendingCount()).toBe(0);

    stop();
  });

  it("uses the animation-start classification after the marker changes", () => {
    const raf = installRafController();
    const region = document.createElement("button");
    region.setAttribute(interactiveRegionAttribute, "");
    document.body.append(region);
    const onChange = vi.fn();

    const stop = observeInteractiveRegions(onChange);
    raf.step(0);
    onChange.mockClear();

    region.dispatchEvent(animationEvent("animationstart", "geometric-slide"));
    region.setAttribute(nonGeometricAnimationAttribute, "geometric-slide");
    region.dispatchEvent(animationEvent("animationend", "geometric-slide"));
    raf.step(16);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(raf.pendingCount()).toBe(0);

    region.setAttribute(
      nonGeometricAnimationAttribute,
      "spark-tier-breathe",
    );
    region.dispatchEvent(animationEvent("animationstart", "geometric-slide"));
    region.dispatchEvent(animationEvent("animationstart", "spark-tier-breathe"));
    region.removeAttribute(nonGeometricAnimationAttribute);
    region.dispatchEvent(animationEvent("animationend", "spark-tier-breathe"));
    raf.step(32);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(raf.pendingCount()).toBe(1);

    region.dispatchEvent(animationEvent("animationcancel", "geometric-slide"));
    raf.step(48);
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(raf.pendingCount()).toBe(0);

    stop();
  });
});
