import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode, type ComponentType, type PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import type { EdgeInteractionProfile, EdgeSide } from "./edgeInteraction";
import { useEdgeInteraction } from "./useEdgeInteraction";

function createProfile(side: EdgeSide): EdgeInteractionProfile {
  const contactAnchor =
    side === "left"
      ? { x: 0.275, y: 0.5 }
      : side === "right"
        ? { x: 0.725, y: 0.5 }
        : side === "top"
          ? { x: 0.5, y: 0.05 }
          : { x: 0.5, y: 0.367 };

  return {
    side,
    contactAnchor,
    enter: {
      frames: [`/${side}/enter/0001.png`],
      fps: 8,
      loop: false,
      durationMs: 125,
      frameAnchors: [contactAnchor],
    },
    idle: {
      frames: [`/${side}/idle/0001.png`],
      fps: 4,
      loop: true,
      durationMs: 5500,
      frameAnchors: [contactAnchor],
    },
    react: {
      frames: [`/${side}/react/0001.png`],
      fps: 6,
      loop: false,
      durationMs: 167,
      frameAnchors: [contactAnchor],
    },
    ...(side !== "top"
      ? {
          companion: {
            side,
            placement: side === "bottom" ? ("bottom" as const) : ("side" as const),
            idleUrl: `/${side}/companion/idle.png`,
            mirrorX: side === "left",
            baseVisibleHeightPx: 34 as const,
            minVisibleHeightPx: 30 as const,
            maxVisibleHeightPx: 42 as const,
            fixedBox: {
              widthPx: 100,
              heightPx: 100,
              contactAnchor: { x: 0.5, y: 0.5 },
              idleFrame: { xPx: 0, yPx: 0, widthPx: 100, heightPx: 100 },
            },
          },
        }
      : {}),
  };
}

function createDeferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

interface RenderEdgeHookOptions {
  packageId?: string;
  snapWindowToEdgeIfNeeded?: () => Promise<EdgeSide | null>;
  restoreWindowFromEdgePeek?: (side: EdgeSide) => Promise<void>;
  dockWindowAtEdge?: (side: EdgeSide) => Promise<void>;
  resetWindowPosition?: () => Promise<void>;
  preloadFrames?: (frames: readonly string[]) => Promise<void>;
  getProfile?: (
    candidatePackageId: string,
    side: EdgeSide,
  ) => EdgeInteractionProfile | null;
  wrapper?: ComponentType<PropsWithChildren>;
}

function renderEdgeHook({
  packageId = "builtin:q-girl",
  snapWindowToEdgeIfNeeded = vi.fn<() => Promise<EdgeSide | null>>().mockResolvedValue("left"),
  restoreWindowFromEdgePeek = vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  dockWindowAtEdge = vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  resetWindowPosition = vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  preloadFrames = vi.fn<(_: readonly string[]) => Promise<void>>().mockResolvedValue(undefined),
  getProfile = vi.fn((candidatePackageId: string, side: EdgeSide) =>
    candidatePackageId === "builtin:q-girl" ? createProfile(side) : null,
  ),
  wrapper,
}: RenderEdgeHookOptions = {}) {
  const view = renderHook(
    ({ currentPackageId }: { currentPackageId: string }) =>
      useEdgeInteraction({
        packageId: currentPackageId,
        snapWindowToEdgeIfNeeded,
        restoreWindowFromEdgePeek,
        dockWindowAtEdge,
        resetWindowPosition,
        preloadFrames,
        getProfile,
      }),
    { initialProps: { currentPackageId: packageId }, wrapper },
  );

  return {
    ...view,
    snapWindowToEdgeIfNeeded,
    restoreWindowFromEdgePeek,
    dockWindowAtEdge,
    resetWindowPosition,
    preloadFrames,
    getProfile,
  };
}

function StrictModeWrapper({ children }: PropsWithChildren) {
  return <StrictMode>{children}</StrictMode>;
}

const staticCandidateFrames = [
  "/left/companion/idle.png",
  "/right/companion/idle.png",
  "/top/idle/0001.png",
  "/bottom/companion/idle.png",
];

describe("useEdgeInteraction", () => {
  it("preloads only static candidate frames before docking and enters idle directly", async () => {
    const snapWindowToEdgeIfNeeded = vi
      .fn<() => Promise<EdgeSide | null>>()
      .mockResolvedValue("left");
    const preloadFrames = vi
      .fn<(frames: readonly string[]) => Promise<void>>()
      .mockResolvedValue(undefined);
    const { result } = renderEdgeHook({
      snapWindowToEdgeIfNeeded,
      preloadFrames,
    });

    await act(async () => {
      await result.current.snapAfterDrag();
    });

    expect(snapWindowToEdgeIfNeeded).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({ side: "left", phase: "idle" });
    expect(result.current.renderState?.profile.side).toBe("left");
    expect(result.current.renderState?.phase).toBe("idle");
    expect(preloadFrames).toHaveBeenCalledTimes(1);
    expect(preloadFrames).toHaveBeenCalledWith(staticCandidateFrames);
    expect(preloadFrames.mock.invocationCallOrder[0]).toBeLessThan(
      snapWindowToEdgeIfNeeded.mock.invocationCallOrder[0],
    );

    const requestedFrames = preloadFrames.mock.calls.flatMap(([frames]) => frames);
    expect(requestedFrames).not.toContain("/left/enter/0001.png");
    expect(requestedFrames).not.toContain("/left/react/0001.png");
  });

  it("preloads the first legacy idle frame for top", async () => {
    const { result, preloadFrames } = renderEdgeHook({
      snapWindowToEdgeIfNeeded: vi.fn().mockResolvedValue("top"),
      getProfile: vi.fn((_: string, side: EdgeSide) =>
        side === "top" ? createProfile(side) : null,
      ),
    });

    await act(async () => {
      await result.current.snapAfterDrag();
    });

    expect(result.current.state).toEqual({ side: "top", phase: "idle" });
    expect(preloadFrames).toHaveBeenCalledTimes(1);
    expect(preloadFrames).toHaveBeenCalledWith(["/top/idle/0001.png"]);
  });

  it("works after React StrictMode mounts, cleans up, and mounts effects again", async () => {
    const onExit = vi.fn();
    const { result, restoreWindowFromEdgePeek } = renderEdgeHook({
      wrapper: StrictModeWrapper,
    });

    await act(async () => {
      await result.current.snapAfterDrag();
    });
    expect(result.current.state).toEqual({ side: "left", phase: "idle" });

    act(() => {
      result.current.requestExitThen(onExit);
    });

    await waitFor(() =>
      expect(restoreWindowFromEdgePeek).toHaveBeenCalledWith("left"),
    );
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.state).toBeNull());
  });

  it("restores directly before running the queued action once", async () => {
    const restoreDeferred = createDeferred<void>();
    const onExit = vi.fn();
    const restoreWindowFromEdgePeek = vi
      .fn<(_: EdgeSide) => Promise<void>>()
      .mockReturnValue(restoreDeferred.promise);
    const { result } = renderEdgeHook({ restoreWindowFromEdgePeek });

    await act(async () => {
      await result.current.snapAfterDrag();
    });

    act(() => {
      result.current.requestExitThen(onExit);
      result.current.requestExitThen(onExit);
    });

    expect(onExit).not.toHaveBeenCalled();
    expect(restoreWindowFromEdgePeek).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({ side: "left", phase: "idle" });

    await act(async () => {
      restoreDeferred.resolve();
      await restoreDeferred.promise;
    });

    expect(restoreWindowFromEdgePeek).toHaveBeenCalledWith("left");
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBeNull();
    expect(result.current.renderState).toBeNull();
  });

  it("does not call native snap for packages without edge profiles", async () => {
    const snapWindowToEdgeIfNeeded = vi.fn<() => Promise<EdgeSide | null>>().mockResolvedValue("left");
    const { result } = renderEdgeHook({
      packageId: "imported:moon-buddy",
      snapWindowToEdgeIfNeeded,
    });

    await act(async () => {
      await result.current.snapAfterDrag();
    });

    expect(snapWindowToEdgeIfNeeded).not.toHaveBeenCalled();
    expect(result.current.state).toBeNull();
  });

  it("does not dock when static frame preload fails", async () => {
    const snapWindowToEdgeIfNeeded = vi.fn<() => Promise<EdgeSide | null>>().mockResolvedValue("left");
    const preloadFrames = vi
      .fn<(_: readonly string[]) => Promise<void>>()
      .mockRejectedValueOnce(new Error("idle failed"));
    const { result, restoreWindowFromEdgePeek } = renderEdgeHook({
      snapWindowToEdgeIfNeeded,
      preloadFrames,
    });

    await act(async () => {
      await result.current.snapAfterDrag();
    });

    expect(preloadFrames).toHaveBeenCalledTimes(1);
    expect(preloadFrames).toHaveBeenCalledWith(staticCandidateFrames);
    expect(snapWindowToEdgeIfNeeded).not.toHaveBeenCalled();
    expect(restoreWindowFromEdgePeek).not.toHaveBeenCalled();
    expect(result.current.state).toBeNull();
  });

  it("keeps state clear when native docking fails", async () => {
    const snapWindowToEdgeIfNeeded = vi
      .fn<() => Promise<EdgeSide | null>>()
      .mockRejectedValue(new Error("dock failed"));
    const { result, preloadFrames } = renderEdgeHook({
      snapWindowToEdgeIfNeeded,
    });

    await expect(
      act(async () => result.current.snapAfterDrag()),
    ).resolves.toBeUndefined();

    expect(preloadFrames).toHaveBeenCalledWith(staticCandidateFrames);
    expect(result.current.state).toBeNull();
  });

  it("recovers from edge image load failure once without running a pending user command", async () => {
    const onExit = vi.fn();
    const restoreDeferred = createDeferred<void>();
    const restoreWindowFromEdgePeek = vi
      .fn<(_: EdgeSide) => Promise<void>>()
      .mockReturnValue(restoreDeferred.promise);
    const { result } = renderEdgeHook({ restoreWindowFromEdgePeek });

    await act(async () => {
      await result.current.snapAfterDrag();
    });
    act(() => {
      result.current.requestExitThen(onExit);
    });

    await act(async () => {
      await result.current.handleLoadError();
      await result.current.handleLoadError();
      restoreDeferred.resolve();
      await restoreDeferred.promise;
    });

    expect(restoreWindowFromEdgePeek).toHaveBeenCalledTimes(1);
    expect(restoreWindowFromEdgePeek).toHaveBeenCalledWith("left");
    expect(onExit).not.toHaveBeenCalled();
    expect(result.current.state).toBeNull();
  });

  it("falls back to a safe reset when edge image load recovery cannot restore", async () => {
    const { result, restoreWindowFromEdgePeek, resetWindowPosition } =
      renderEdgeHook({
        restoreWindowFromEdgePeek: vi.fn<() => Promise<void>>().mockRejectedValueOnce(
          new Error("restore failed"),
        ),
      });

    await act(async () => {
      await result.current.snapAfterDrag();
    });
    await act(async () => {
      await result.current.handleLoadError();
    });

    expect(restoreWindowFromEdgePeek).toHaveBeenCalledWith("left");
    expect(resetWindowPosition).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBeNull();
  });

  it("clears pending callbacks on unmount", async () => {
    const restoreDeferred = createDeferred<void>();
    const onExit = vi.fn();
    const { result, unmount } = renderEdgeHook({
      restoreWindowFromEdgePeek: vi.fn(() => restoreDeferred.promise),
    });

    await act(async () => {
      await result.current.snapAfterDrag();
    });
    act(() => {
      result.current.requestExitThen(onExit);
    });

    unmount();
    restoreDeferred.resolve();
    await restoreDeferred.promise;

    expect(onExit).not.toHaveBeenCalled();
  });

  it("waits for static resources before native docking and idle entry", async () => {
    const targetPreload = createDeferred<void>();
    const preloadFrames = vi
      .fn<(_: readonly string[]) => Promise<void>>()
      .mockReturnValue(targetPreload.promise);
    const { result, snapWindowToEdgeIfNeeded } = renderEdgeHook({
      preloadFrames,
    });
    let snapPromise: Promise<void>;

    act(() => {
      snapPromise = result.current.snapAfterDrag();
    });
    await act(async () => Promise.resolve());

    expect(preloadFrames).toHaveBeenCalledWith(staticCandidateFrames);
    expect(snapWindowToEdgeIfNeeded).not.toHaveBeenCalled();
    expect(result.current.state).toBeNull();

    await act(async () => {
      targetPreload.resolve();
      await snapPromise;
    });
    expect(snapWindowToEdgeIfNeeded).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({ side: "left", phase: "idle" });
  });

  it("does not revive a canceled initial activation after target preload resolves", async () => {
    const targetPreload = createDeferred<void>();
    const preloadFrames = vi
      .fn<(_: readonly string[]) => Promise<void>>()
      .mockReturnValue(targetPreload.promise);
    const { result, snapWindowToEdgeIfNeeded, restoreWindowFromEdgePeek } =
      renderEdgeHook({ preloadFrames });
    let snapPromise: Promise<void>;

    act(() => {
      snapPromise = result.current.snapAfterDrag();
    });
    await act(async () => Promise.resolve());
    expect(result.current.state).toBeNull();

    act(() => result.current.cancel());
    await act(async () => {
      targetPreload.resolve();
      await snapPromise;
    });

    expect(result.current.state).toBeNull();
    expect(result.current.renderState).toBeNull();
    expect(snapWindowToEdgeIfNeeded).not.toHaveBeenCalled();
    expect(restoreWindowFromEdgePeek).not.toHaveBeenCalled();
  });

  it("keeps a replacement activation locked when the canceled activation settles", async () => {
    const canceledPreload = createDeferred<void>();
    const replacementPreload = createDeferred<void>();
    const preloadFrames = vi
      .fn<(_: readonly string[]) => Promise<void>>()
      .mockReturnValueOnce(canceledPreload.promise)
      .mockReturnValueOnce(replacementPreload.promise);
    const snapWindowToEdgeIfNeeded = vi
      .fn<() => Promise<EdgeSide | null>>()
      .mockResolvedValue("right");
    const { result } = renderEdgeHook({
      preloadFrames,
      snapWindowToEdgeIfNeeded,
    });
    let canceledSnap: Promise<void>;
    let replacementSnap: Promise<void>;

    act(() => {
      canceledSnap = result.current.snapAfterDrag();
    });
    await act(async () => Promise.resolve());
    act(() => result.current.cancel());
    act(() => {
      replacementSnap = result.current.snapAfterDrag();
    });
    await act(async () => Promise.resolve());

    expect(snapWindowToEdgeIfNeeded).not.toHaveBeenCalled();
    expect(result.current.state).toBeNull();

    await act(async () => {
      canceledPreload.resolve();
      await canceledSnap;
    });
    await act(async () => {
      await result.current.snapAfterDrag();
    });

    expect(snapWindowToEdgeIfNeeded).not.toHaveBeenCalled();
    expect(result.current.state).toBeNull();

    await act(async () => {
      replacementPreload.resolve();
      await replacementSnap;
    });
    expect(snapWindowToEdgeIfNeeded).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({ side: "right", phase: "idle" });
  });

  it("waits for a canceled native snap and its restore before starting the replacement", async () => {
    const canceledSnap = createDeferred<EdgeSide | null>();
    const replacementSnap = createDeferred<EdgeSide | null>();
    const canceledRestore = createDeferred<void>();
    const snapWindowToEdgeIfNeeded = vi
      .fn<() => Promise<EdgeSide | null>>()
      .mockReturnValueOnce(canceledSnap.promise)
      .mockReturnValueOnce(replacementSnap.promise);
    const restoreWindowFromEdgePeek = vi
      .fn<(_: EdgeSide) => Promise<void>>()
      .mockReturnValue(canceledRestore.promise);
    const { result } = renderEdgeHook({
      snapWindowToEdgeIfNeeded,
      restoreWindowFromEdgePeek,
    });
    let canceledActivation: Promise<void>;
    let replacementActivation: Promise<void>;

    act(() => {
      canceledActivation = result.current.snapAfterDrag();
    });
    await waitFor(() =>
      expect(snapWindowToEdgeIfNeeded).toHaveBeenCalledTimes(1),
    );
    act(() => result.current.cancel());
    act(() => {
      replacementActivation = result.current.snapAfterDrag();
    });

    await act(async () => {
      canceledSnap.resolve("left");
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(restoreWindowFromEdgePeek).toHaveBeenCalledWith("left"),
    );
    expect(snapWindowToEdgeIfNeeded).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBeNull();

    await act(async () => {
      canceledRestore.resolve();
      await canceledActivation;
    });
    await waitFor(() =>
      expect(snapWindowToEdgeIfNeeded).toHaveBeenCalledTimes(2),
    );
    await act(async () => {
      replacementSnap.resolve("right");
      await replacementActivation;
    });

    expect(restoreWindowFromEdgePeek.mock.invocationCallOrder[0]).toBeLessThan(
      snapWindowToEdgeIfNeeded.mock.invocationCallOrder[1],
    );
    expect(result.current.state).toEqual({ side: "right", phase: "idle" });
  });

  it("does not publish a replacement whose snap promise resolves before the canceled snap", async () => {
    const canceledSnap = createDeferred<EdgeSide | null>();
    const replacementSnap = createDeferred<EdgeSide | null>();
    const snapWindowToEdgeIfNeeded = vi
      .fn<() => Promise<EdgeSide | null>>()
      .mockReturnValueOnce(canceledSnap.promise)
      .mockReturnValueOnce(replacementSnap.promise);
    const restoreWindowFromEdgePeek = vi
      .fn<(_: EdgeSide) => Promise<void>>()
      .mockResolvedValue(undefined);
    const { result } = renderEdgeHook({
      snapWindowToEdgeIfNeeded,
      restoreWindowFromEdgePeek,
    });
    let canceledActivation: Promise<void>;
    let replacementActivation: Promise<void>;

    act(() => {
      canceledActivation = result.current.snapAfterDrag();
    });
    await waitFor(() =>
      expect(snapWindowToEdgeIfNeeded).toHaveBeenCalledTimes(1),
    );
    act(() => result.current.cancel());
    act(() => {
      replacementActivation = result.current.snapAfterDrag();
    });

    await act(async () => {
      replacementSnap.resolve("right");
      await Promise.resolve();
    });
    const stateBeforeCanceledSnapSettles = result.current.state;

    await act(async () => {
      canceledSnap.resolve("left");
      await canceledActivation;
      await replacementActivation;
    });

    expect(stateBeforeCanceledSnapSettles).toBeNull();
    expect(restoreWindowFromEdgePeek).toHaveBeenCalledTimes(1);
    expect(restoreWindowFromEdgePeek).toHaveBeenCalledWith("left");
    expect(restoreWindowFromEdgePeek.mock.invocationCallOrder[0]).toBeLessThan(
      snapWindowToEdgeIfNeeded.mock.invocationCallOrder[1],
    );
    expect(result.current.state).toEqual({ side: "right", phase: "idle" });
  });

  it("restores and clears the old edge profile when the selected package changes", async () => {
    const { result, rerender, restoreWindowFromEdgePeek } = renderEdgeHook();

    await act(async () => {
      await result.current.snapAfterDrag();
    });
    expect(result.current.state).toEqual({ side: "left", phase: "idle" });
    expect(result.current.renderState?.profile.side).toBe("left");

    rerender({ currentPackageId: "imported:moon-buddy" });

    expect(result.current.renderState).toBeNull();
    await waitFor(() =>
      expect(restoreWindowFromEdgePeek).toHaveBeenCalledWith("left"),
    );
    await waitFor(() => expect(result.current.state).toBeNull());
  });

  it("invalidates an edge activation before docking when the package changes during preload", async () => {
    const targetPreload = createDeferred<void>();
    const preloadFrames = vi
      .fn<(_: readonly string[]) => Promise<void>>()
      .mockReturnValue(targetPreload.promise);
    const {
      result,
      rerender,
      snapWindowToEdgeIfNeeded,
      restoreWindowFromEdgePeek,
    } = renderEdgeHook({ preloadFrames });
    let snapPromise: Promise<void>;

    act(() => {
      snapPromise = result.current.snapAfterDrag();
    });
    await act(async () => Promise.resolve());
    expect(result.current.state).toBeNull();

    rerender({ currentPackageId: "imported:moon-buddy" });

    await act(async () => {
      targetPreload.resolve();
      await snapPromise;
    });
    expect(result.current.state).toBeNull();
    expect(result.current.renderState).toBeNull();
    expect(snapWindowToEdgeIfNeeded).not.toHaveBeenCalled();
    expect(restoreWindowFromEdgePeek).not.toHaveBeenCalled();
  });

  it("runs the safe reset and keeps edge idle available for retry when direct restore fails", async () => {
    const onExit = vi.fn();
    const onRetry = vi.fn();
    const restoreWindowFromEdgePeek = vi
      .fn<(_: EdgeSide) => Promise<void>>()
      .mockRejectedValueOnce(new Error("restore failed"))
      .mockResolvedValueOnce(undefined);
    const { result, resetWindowPosition } = renderEdgeHook({
      restoreWindowFromEdgePeek,
    });

    await act(async () => {
      await result.current.snapAfterDrag();
    });
    act(() => result.current.requestExitThen(onExit));

    await waitFor(() => expect(resetWindowPosition).toHaveBeenCalledTimes(1));
    expect(onExit).not.toHaveBeenCalled();
    expect(result.current.state).toEqual({ side: "left", phase: "idle" });
    expect(result.current.renderState?.profile.side).toBe("left");

    act(() => result.current.requestExitThen(onRetry));

    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
    expect(restoreWindowFromEdgePeek).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBeNull();
  });
});
