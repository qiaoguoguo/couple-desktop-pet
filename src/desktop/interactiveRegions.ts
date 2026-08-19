import type { InteractiveRegion } from "./windowCommands";

export const interactiveRegionAttribute = "data-desktop-interactive-region";
export const interactiveRegionSelector = `[${interactiveRegionAttribute}]`;
export const nonGeometricAnimationAttribute =
  "data-desktop-non-geometric-animation";

export function collectInteractiveRegions(
  root: ParentNode = document,
): InteractiveRegion[] {
  return Array.from(root.querySelectorAll<HTMLElement>(interactiveRegionSelector))
    .filter(isElementVisible)
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map((rect) => ({
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    }));
}

export function observeInteractiveRegions(
  onChange: () => void,
  root: ParentNode = document,
): () => void {
  let animationFrame: number | null = null;
  let motionFrame: number | null = null;
  let activeCssMotionCount = 0;
  const animationSamplingByTarget = new WeakMap<
    EventTarget,
    Map<string, boolean[]>
  >();
  const observedElements = new Set<HTMLElement>();
  let resizeObserver: ResizeObserver | null = null;
  const syncObservedElements = () => {
    if (!resizeObserver) {
      return;
    }

    const nextElements = new Set(
      root.querySelectorAll<HTMLElement>(interactiveRegionSelector),
    );

    for (const element of observedElements) {
      if (!nextElements.has(element)) {
        resizeObserver.unobserve(element);
        observedElements.delete(element);
      }
    }

    for (const element of nextElements) {
      if (!observedElements.has(element)) {
        resizeObserver.observe(element);
        observedElements.add(element);
      }
    }
  };
  const scheduleChange = () => {
    if (animationFrame !== null) {
      return;
    }

    animationFrame = window.requestAnimationFrame(() => {
      animationFrame = null;
      syncObservedElements();
      onChange();
    });
  };
  const scheduleMotionSample = () => {
    if (motionFrame !== null) {
      return;
    }

    motionFrame = window.requestAnimationFrame(() => {
      motionFrame = null;
      syncObservedElements();
      onChange();

      if (activeCssMotionCount > 0) {
        scheduleMotionSample();
      }
    });
  };
  const startSampledMotion = () => {
    activeCssMotionCount += 1;
    scheduleMotionSample();
  };
  const finishSampledMotion = () => {
    activeCssMotionCount = Math.max(0, activeCssMotionCount - 1);
    scheduleMotionSample();
  };
  const handleAnimationStart = (event: Event) => {
    const animationName = readAnimationName(event);
    const shouldSample = !isDeclaredNonGeometricAnimation(
      event.target,
      animationName,
    );
    rememberAnimationSampling(
      animationSamplingByTarget,
      event.target,
      animationName,
      shouldSample,
    );
    if (!shouldSample) {
      return;
    }
    startSampledMotion();
  };
  const handleAnimationEnd = (event: Event) => {
    const shouldSample = consumeAnimationSampling(
      animationSamplingByTarget,
      event.target,
      readAnimationName(event),
    );
    if (shouldSample === false) {
      return;
    }
    if (shouldSample === true) {
      finishSampledMotion();
      return;
    }
    scheduleMotionSample();
  };
  const handleTransitionStart = () => startSampledMotion();
  const handleTransitionEnd = () => finishSampledMotion();
  resizeObserver =
    "ResizeObserver" in window ? new ResizeObserver(scheduleChange) : null;

  const mutationObserver = new MutationObserver(scheduleChange);
  mutationObserver.observe(root, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: [
      "class",
      "style",
      "hidden",
      "aria-hidden",
      interactiveRegionAttribute,
    ],
  });

  syncObservedElements();

  window.addEventListener("resize", scheduleChange);
  window.visualViewport?.addEventListener("resize", scheduleChange);
  const eventTarget = resolveObserverEventTarget(root);
  eventTarget.addEventListener("animationstart", handleAnimationStart);
  eventTarget.addEventListener("animationend", handleAnimationEnd);
  eventTarget.addEventListener("animationcancel", handleAnimationEnd);
  eventTarget.addEventListener("transitionstart", handleTransitionStart);
  eventTarget.addEventListener("transitionend", handleTransitionEnd);
  eventTarget.addEventListener("transitioncancel", handleTransitionEnd);
  scheduleChange();

  return () => {
    if (animationFrame !== null) {
      window.cancelAnimationFrame(animationFrame);
    }

    if (motionFrame !== null) {
      window.cancelAnimationFrame(motionFrame);
    }

    mutationObserver.disconnect();
    resizeObserver?.disconnect();
    window.removeEventListener("resize", scheduleChange);
    window.visualViewport?.removeEventListener("resize", scheduleChange);
    eventTarget.removeEventListener("animationstart", handleAnimationStart);
    eventTarget.removeEventListener("animationend", handleAnimationEnd);
    eventTarget.removeEventListener("animationcancel", handleAnimationEnd);
    eventTarget.removeEventListener("transitionstart", handleTransitionStart);
    eventTarget.removeEventListener("transitionend", handleTransitionEnd);
    eventTarget.removeEventListener("transitioncancel", handleTransitionEnd);
  };
}

function readAnimationName(event: Event): string {
  const animationName = Reflect.get(event, "animationName");
  return typeof animationName === "string" ? animationName : "";
}

function isDeclaredNonGeometricAnimation(
  target: EventTarget | null,
  animationName: string,
): boolean {
  if (!(target instanceof Element) || animationName.length === 0) {
    return false;
  }

  return (target.getAttribute(nonGeometricAnimationAttribute) ?? "")
    .split(/[\s,]+/u)
    .includes(animationName);
}

function rememberAnimationSampling(
  samplingByTarget: WeakMap<EventTarget, Map<string, boolean[]>>,
  target: EventTarget | null,
  animationName: string,
  shouldSample: boolean,
) {
  if (target === null) {
    return;
  }

  let samplingByName = samplingByTarget.get(target);
  if (!samplingByName) {
    samplingByName = new Map();
    samplingByTarget.set(target, samplingByName);
  }
  const pending = samplingByName.get(animationName) ?? [];
  pending.push(shouldSample);
  samplingByName.set(animationName, pending);
}

function consumeAnimationSampling(
  samplingByTarget: WeakMap<EventTarget, Map<string, boolean[]>>,
  target: EventTarget | null,
  animationName: string,
): boolean | undefined {
  if (target === null) {
    return undefined;
  }

  const samplingByName = samplingByTarget.get(target);
  const pending = samplingByName?.get(animationName);
  const shouldSample = pending?.shift();
  if (pending?.length === 0) {
    samplingByName?.delete(animationName);
  }
  if (samplingByName?.size === 0) {
    samplingByTarget.delete(target);
  }
  return shouldSample;
}

function resolveObserverEventTarget(root: ParentNode): Document | Element {
  if (root instanceof Document) {
    return root;
  }

  if (root instanceof Element) {
    return root;
  }

  return document;
}

function isElementVisible(element: HTMLElement) {
  if (element.closest('[hidden], [aria-hidden="true"]')) {
    return false;
  }

  const style = window.getComputedStyle(element);

  return style.display !== "none" && style.visibility !== "hidden";
}
