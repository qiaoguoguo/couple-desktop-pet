import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectInteractiveRegions } from "../desktop/interactiveRegions";
import type { EdgeInteractionProfile } from "../pet/edgeInteraction";
import { EdgePetStage } from "./EdgePetStage";
import type { FrameAlphaBounds } from "./frameAlphaBounds";

const frameAlphaBoundsMock = vi.hoisted(() => ({
  resolveFrameAlphaBounds: vi.fn(),
}));

vi.mock("./frameAlphaBounds", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./frameAlphaBounds")>();

  return {
    ...actual,
    resolveFrameAlphaBounds: frameAlphaBoundsMock.resolveFrameAlphaBounds,
  };
});

function createProfile(): EdgeInteractionProfile {
  const contactAnchor = { x: 0.275, y: 0.5 };

  return {
    side: "left",
    contactAnchor,
    enter: {
      frames: Array.from(
        { length: 6 },
        (_, index) => `/edge/left/enter/${String(index + 1).padStart(4, "0")}.png`,
      ),
      fps: 8,
      loop: false,
      durationMs: 750,
      frameAnchors: Array.from({ length: 6 }, () => contactAnchor),
    },
    idle: {
      frames: Array.from(
        { length: 22 },
        (_, index) => `/edge/left/idle/${String(index + 1).padStart(4, "0")}.png`,
      ),
      fps: 4,
      loop: true,
      durationMs: 5500,
      frameAnchors: Array.from({ length: 22 }, () => contactAnchor),
    },
    react: {
      frames: Array.from(
        { length: 6 },
        (_, index) => `/edge/left/react/${String(index + 1).padStart(4, "0")}.png`,
      ),
      fps: 6,
      loop: false,
      durationMs: 1000,
      frameAnchors: Array.from({ length: 6 }, () => contactAnchor),
    },
  };
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
        act(() => callback(timeMs));
      }
    },
    pendingCount() {
      return callbacks.size;
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function calculateTransformedContactPoint(
  element: HTMLElement,
  frameAnchor: { x: number; y: number },
) {
  const transformMatch = element.style.transform.match(
    /^translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\((-?[\d.]+)\)$/,
  );
  const originMatch = element.style.transformOrigin.match(
    /^(-?[\d.]+)px (-?[\d.]+)px$/,
  );

  if (!transformMatch || !originMatch) {
    throw new Error("Unexpected legacy edge transform format");
  }

  const [, translateX, translateY, scale] = transformMatch.map(Number);
  const [, originX, originY] = originMatch.map(Number);
  const frameX = frameAnchor.x * 320;
  const frameY = frameAnchor.y * 360;

  return {
    x: originX + scale * (frameX - originX) + translateX,
    y: originY + scale * (frameY - originY) + translateY,
  };
}

function expectContactPointAt(
  actual: { x: number; y: number },
  expected: { x: number; y: number },
) {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(0.001);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(0.001);
}

describe("EdgePetStage", () => {
  beforeEach(() => {
    frameAlphaBoundsMock.resolveFrameAlphaBounds.mockReset();
    frameAlphaBoundsMock.resolveFrameAlphaBounds.mockResolvedValue({
      x: 0,
      y: 0,
      width: 320,
      height: 360,
      imageWidth: 320,
      imageHeight: 360,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("plays a non-looping enter motion and completes only once", () => {
    const raf = installRafController();
    const onPhaseComplete = vi.fn();

    render(
      <EdgePetStage
        profile={createProfile()}
        phase="enter"
        scale={1}
        onPhaseComplete={onPhaseComplete}
      />,
    );

    expect(screen.getByAltText("桌宠边缘进入").getAttribute("src")).toContain(
      "enter/0001.png",
    );

    raf.step(0);
    raf.step(625);

    expect(screen.getByAltText("桌宠边缘进入").getAttribute("src")).toContain(
      "enter/0006.png",
    );
    expect(onPhaseComplete).not.toHaveBeenCalled();

    raf.step(750);
    raf.step(1000);

    expect(onPhaseComplete).toHaveBeenCalledTimes(1);
    expect(raf.pendingCount()).toBe(0);
  });

  it("loops idle back to the first frame after its full duration", () => {
    const raf = installRafController();

    render(
      <EdgePetStage
        profile={createProfile()}
        phase="idle"
        scale={1}
        onPhaseComplete={vi.fn()}
      />,
    );

    raf.step(0);
    raf.step(250);
    expect(screen.getByAltText("桌宠边缘待机").getAttribute("src")).toContain(
      "idle/0002.png",
    );

    raf.step(5500);
    expect(screen.getByAltText("桌宠边缘待机").getAttribute("src")).toContain(
      "idle/0001.png",
    );
  });

  it("freezes top on the first idle frame without RAF or mascot interactions", async () => {
    const raf = installRafController();
    const profile = createProfile();
    const onPhaseComplete = vi.fn();
    const onPointerEnter = vi.fn();
    const onPointerLeave = vi.fn();
    const onPetClick = vi.fn();
    profile.side = "top";
    profile.contactAnchor = { x: 0.5, y: 0.05 };
    profile.idle.frameAnchors = profile.idle.frames.map(() => ({
      x: 0.5,
      y: 0.05,
    }));

    render(
      <EdgePetStage
        profile={profile}
        phase="idle"
        scale={1}
        frozen
        onPhaseComplete={onPhaseComplete}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onPetClick={onPetClick}
      />,
    );
    await act(async () => Promise.resolve());

    const stage = screen.getByTestId("edge-pet-stage");
    const frame = screen.getByAltText("桌宠边缘待机");
    fireEvent.pointerEnter(stage);
    fireEvent.pointerLeave(stage);
    fireEvent.click(stage);
    raf.step(0);
    raf.step(500);
    raf.step(5500);
    await act(async () => Promise.resolve());

    expect(frame.getAttribute("src")).toContain("idle/0001.png");
    expect(stage.getAttribute("data-frame-index")).toBe("0");
    expect(raf.pendingCount()).toBe(0);
    expect(onPhaseComplete).not.toHaveBeenCalled();
    expect(onPointerEnter).not.toHaveBeenCalled();
    expect(onPointerLeave).not.toHaveBeenCalled();
    expect(onPetClick).not.toHaveBeenCalled();
  });

  it("exposes the frozen top mascot rectangle to the native region collector", async () => {
    const profile = createProfile();
    profile.side = "top";
    profile.contactAnchor = { x: 0.5, y: 0.05 };
    profile.idle.frameAnchors = profile.idle.frames.map(() => ({
      x: 0.5,
      y: 0.05,
    }));

    render(
      <EdgePetStage
        profile={profile}
        phase="idle"
        scale={1}
        frozen
      />,
    );

    const hitRegion = await screen.findByTestId("edge-pet-alpha-hit-region");
    vi.spyOn(hitRegion, "getBoundingClientRect").mockReturnValue({
      x: 96,
      y: 8,
      left: 96,
      top: 8,
      width: 128,
      height: 220,
      right: 224,
      bottom: 228,
      toJSON: () => ({}),
    });

    expect(collectInteractiveRegions(document)).toEqual([
      { x: 96, y: 8, width: 128, height: 220 },
    ]);
  });

  it("resets elapsed time when the phase changes", () => {
    const raf = installRafController();
    const profile = createProfile();
    const { rerender } = render(
      <EdgePetStage
        profile={profile}
        phase="idle"
        scale={1}
        onPhaseComplete={vi.fn()}
      />,
    );

    raf.step(0);
    raf.step(500);
    expect(screen.getByAltText("桌宠边缘待机").getAttribute("src")).toContain(
      "idle/0003.png",
    );

    rerender(
      <EdgePetStage
        profile={profile}
        phase="react"
        scale={1}
        onPhaseComplete={vi.fn()}
      />,
    );

    expect(screen.getByAltText("桌宠边缘反应").getAttribute("src")).toContain(
      "react/0001.png",
    );
  });

  it("keeps frame progress on parent rerender while calling the latest completion callback", () => {
    const raf = installRafController();
    const profile = createProfile();
    const staleComplete = vi.fn();
    const latestComplete = vi.fn();
    const { rerender } = render(
      <EdgePetStage
        profile={profile}
        phase="enter"
        scale={1}
        onPhaseComplete={staleComplete}
      />,
    );

    raf.step(0);
    raf.step(625);
    expect(screen.getByAltText("桌宠边缘进入").getAttribute("src")).toContain(
      "enter/0006.png",
    );

    rerender(
      <EdgePetStage
        profile={profile}
        phase="enter"
        scale={1}
        onPhaseComplete={latestComplete}
      />,
    );

    expect(screen.getByAltText("桌宠边缘进入").getAttribute("src")).toContain(
      "enter/0006.png",
    );
    raf.step(750);

    expect(staleComplete).not.toHaveBeenCalled();
    expect(latestComplete).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["left", "translate(-64px, 28.8px) scale(0.8)", "0px 180px"],
    ["right", "translate(192px, 28.8px) scale(0.8)", "320px 180px"],
    ["top", "translate(64px, -115.2px) scale(0.8)", "160px 0px"],
    ["bottom", "translate(64px, 172.8px) scale(0.8)", "160px 360px"],
  ] as const)(
    "aligns the %s legacy frame anchor and hit transform to the real stage edge",
    (side, expectedTransform, expectedOrigin) => {
      const profile = createProfile();
      profile.side = side;
      profile.contactAnchor = { x: 0.91, y: 0.13 };
      profile.idle = {
        ...profile.idle,
        frames: [`/edge/${side}/idle/0001.png`],
        frameAnchors: [{ x: 0.25, y: 0.4 }],
      };

      render(
        <EdgePetStage
          profile={profile}
          phase="idle"
          scale={0.8}
          onPhaseComplete={vi.fn()}
        />,
      );

      const frame = screen.getByAltText("桌宠边缘待机") as HTMLImageElement;
      const hitTransform = document.querySelector(
        ".edge-pet-hit-transform",
      ) as HTMLElement;

      expect(frame.style.transform).toBe(expectedTransform);
      expect(frame.style.transformOrigin).toBe(expectedOrigin);
      expect(hitTransform.style.transform).toBe(expectedTransform);
      expect(hitTransform.style.transformOrigin).toBe(expectedOrigin);
    },
  );

  it.each([
    ["left", 0.6, { x: 0.22, y: 0.5 }, { x: 0, y: 180 }],
    ["left", 1, { x: 0.22, y: 0.5 }, { x: 0, y: 180 }],
    ["left", 1.45, { x: 0.22, y: 0.5 }, { x: 0, y: 180 }],
    ["top", 0.6, { x: 0.5, y: 0.05 }, { x: 160, y: 0 }],
    ["top", 1, { x: 0.5, y: 0.05 }, { x: 160, y: 0 }],
    ["top", 1.45, { x: 0.5, y: 0.05 }, { x: 160, y: 0 }],
  ] as const)(
    "keeps the %s contact point on the real stage edge at scale %s",
    (side, scale, frameAnchor, expectedContact) => {
      const profile = createProfile();
      profile.side = side;
      profile.contactAnchor = { x: 0.91, y: 0.13 };
      profile.idle = {
        ...profile.idle,
        frames: [`/edge/${side}/idle/0001.png`],
        frameAnchors: [frameAnchor],
      };

      render(
        <EdgePetStage
          profile={profile}
          phase="idle"
          scale={scale}
          onPhaseComplete={vi.fn()}
        />,
      );

      const frame = screen.getByAltText("桌宠边缘待机") as HTMLImageElement;
      const hitTransform = document.querySelector(
        ".edge-pet-hit-transform",
      ) as HTMLElement;

      expect(hitTransform.style.transform).toBe(frame.style.transform);
      expect(hitTransform.style.transformOrigin).toBe(
        frame.style.transformOrigin,
      );
      expectContactPointAt(
        calculateTransformedContactPoint(frame, frameAnchor),
        expectedContact,
      );
      expectContactPointAt(
        calculateTransformedContactPoint(hitTransform, frameAnchor),
        expectedContact,
      );
    },
  );

  it("passes hover and click gestures through to the caller", () => {
    const onPointerEnter = vi.fn();
    const onPointerLeave = vi.fn();
    const onPetClick = vi.fn();

    render(
      <EdgePetStage
        profile={createProfile()}
        phase="idle"
        scale={1}
        onPhaseComplete={vi.fn()}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onPetClick={onPetClick}
      />,
    );

    const stage = screen.getByTestId("edge-pet-stage");

    fireEvent.pointerEnter(stage);
    fireEvent.pointerLeave(stage);
    fireEvent.click(stage);

    expect(onPointerEnter).toHaveBeenCalledTimes(1);
    expect(onPointerLeave).toHaveBeenCalledTimes(1);
    expect(onPetClick).toHaveBeenCalledTimes(1);
  });

  it("registers only the transformed edge frame alpha foreground as a desktop hit region", async () => {
    frameAlphaBoundsMock.resolveFrameAlphaBounds.mockResolvedValueOnce({
      x: 80,
      y: 36,
      width: 160,
      height: 252,
      imageWidth: 320,
      imageHeight: 360,
    });

    render(
      <EdgePetStage
        profile={createProfile()}
        phase="idle"
        scale={1}
        onPhaseComplete={vi.fn()}
      />,
    );

    const stage = screen.getByTestId("edge-pet-stage");
    const hitRegion = await screen.findByTestId("edge-pet-alpha-hit-region");

    expect(stage.hasAttribute("data-desktop-interactive-region")).toBe(false);
    expect(hitRegion.hasAttribute("data-desktop-interactive-region")).toBe(true);
    expect(hitRegion.style.left).toBe("80px");
    expect(hitRegion.style.top).toBe("36px");
    expect(hitRegion.style.width).toBe("160px");
    expect(hitRegion.style.height).toBe("252px");
  });

  it("does not register an interactive region while alpha bounds are pending", () => {
    const pendingBounds = createDeferred<null>();
    frameAlphaBoundsMock.resolveFrameAlphaBounds.mockReturnValueOnce(
      pendingBounds.promise,
    );

    render(
      <EdgePetStage
        profile={createProfile()}
        phase="enter"
        scale={1}
        onPhaseComplete={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("edge-pet-alpha-hit-region")).toBeNull();
  });

  it("routes null alpha bounds through the load failure path exactly once", async () => {
    const onLoadError = vi.fn();
    frameAlphaBoundsMock.resolveFrameAlphaBounds.mockResolvedValueOnce(null);

    render(
      <EdgePetStage
        profile={createProfile()}
        phase="enter"
        scale={1}
        onPhaseComplete={vi.fn()}
        onLoadError={onLoadError}
      />,
    );
    await act(async () => Promise.resolve());

    expect(onLoadError).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("edge-pet-alpha-hit-region")).toBeNull();

    fireEvent.error(screen.getByAltText("桌宠边缘进入"));

    expect(onLoadError).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("edge-pet-alpha-hit-region")).toBeNull();
  });

  it("catches resolver rejection and routes it through the load failure path exactly once", async () => {
    const onLoadError = vi.fn();
    frameAlphaBoundsMock.resolveFrameAlphaBounds.mockRejectedValueOnce(
      new Error("alpha decode failed"),
    );

    render(
      <EdgePetStage
        profile={createProfile()}
        phase="enter"
        scale={1}
        onPhaseComplete={vi.fn()}
        onLoadError={onLoadError}
      />,
    );
    await act(async () => Promise.resolve());

    expect(onLoadError).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("edge-pet-alpha-hit-region")).toBeNull();

    fireEvent.error(screen.getByAltText("桌宠边缘进入"));

    expect(onLoadError).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("edge-pet-alpha-hit-region")).toBeNull();
  });

  it("notifies once for duplicate image errors in one frame generation", () => {
    const onLoadError = vi.fn();
    const pendingBounds = createDeferred<FrameAlphaBounds | null>();
    frameAlphaBoundsMock.resolveFrameAlphaBounds.mockReturnValueOnce(
      pendingBounds.promise,
    );

    render(
      <EdgePetStage
        profile={createProfile()}
        phase="enter"
        scale={1}
        onPhaseComplete={vi.fn()}
        onLoadError={onLoadError}
      />,
    );

    fireEvent.error(screen.getByAltText("桌宠边缘进入"));
    fireEvent.error(screen.getByAltText("桌宠边缘进入"));

    expect(onLoadError).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("edge-pet-alpha-hit-region")).toBeNull();
  });

  it("ignores stale null bounds after a new frame generation succeeds", async () => {
    const onLoadError = vi.fn();
    const staleBounds = createDeferred<FrameAlphaBounds | null>();
    const activeBounds = createDeferred<FrameAlphaBounds | null>();
    frameAlphaBoundsMock.resolveFrameAlphaBounds
      .mockReturnValueOnce(staleBounds.promise)
      .mockReturnValueOnce(activeBounds.promise);
    const profile = createProfile();
    const { rerender } = render(
      <EdgePetStage
        profile={profile}
        phase="enter"
        scale={1}
        onLoadError={onLoadError}
      />,
    );

    rerender(
      <EdgePetStage
        profile={profile}
        phase="react"
        scale={1}
        onLoadError={onLoadError}
      />,
    );
    await act(async () => {
      activeBounds.resolve({
        x: 120,
        y: 40,
        width: 80,
        height: 200,
        imageWidth: 320,
        imageHeight: 360,
      });
    });
    await act(async () => {
      staleBounds.resolve(null);
    });

    expect(onLoadError).not.toHaveBeenCalled();
    expect(screen.getByTestId("edge-pet-alpha-hit-region").style.left).toBe(
      "120px",
    );
  });

  it("ignores a stale resolver rejection after unmount", async () => {
    const onLoadError = vi.fn();
    const staleBounds = createDeferred<FrameAlphaBounds | null>();
    frameAlphaBoundsMock.resolveFrameAlphaBounds.mockReturnValueOnce(
      staleBounds.promise,
    );
    const { unmount } = render(
      <EdgePetStage
        profile={createProfile()}
        phase="enter"
        scale={1}
        onLoadError={onLoadError}
      />,
    );

    unmount();
    await act(async () => {
      staleBounds.reject(new Error("late alpha decode failure"));
      await staleBounds.promise.catch(() => undefined);
    });

    expect(onLoadError).not.toHaveBeenCalled();
  });

  it("ignores stale alpha bounds that resolve after the frame advances", async () => {
    const raf = installRafController();
    const firstBounds = createDeferred<{
      x: number;
      y: number;
      width: number;
      height: number;
      imageWidth: number;
      imageHeight: number;
    }>();
    const secondBounds = createDeferred<{
      x: number;
      y: number;
      width: number;
      height: number;
      imageWidth: number;
      imageHeight: number;
    }>();
    frameAlphaBoundsMock.resolveFrameAlphaBounds
      .mockReturnValueOnce(firstBounds.promise)
      .mockReturnValueOnce(secondBounds.promise);

    render(
      <EdgePetStage
        profile={createProfile()}
        phase="enter"
        scale={1}
        onPhaseComplete={vi.fn()}
      />,
    );
    raf.step(0);
    raf.step(125);
    expect(screen.getByAltText("桌宠边缘进入").getAttribute("src")).toContain(
      "enter/0002.png",
    );
    expect(screen.queryByTestId("edge-pet-alpha-hit-region")).toBeNull();

    await act(async () => {
      secondBounds.resolve({
        x: 120,
        y: 40,
        width: 80,
        height: 200,
        imageWidth: 320,
        imageHeight: 360,
      });
    });
    expect(screen.getByTestId("edge-pet-alpha-hit-region").style.left).toBe(
      "120px",
    );

    await act(async () => {
      firstBounds.resolve({
        x: 10,
        y: 10,
        width: 300,
        height: 340,
        imageWidth: 320,
        imageHeight: 360,
      });
    });
    expect(screen.getByTestId("edge-pet-alpha-hit-region").style.left).toBe(
      "120px",
    );
  });
});
