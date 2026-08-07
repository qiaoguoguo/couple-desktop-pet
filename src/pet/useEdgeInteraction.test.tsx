import { act, renderHook } from "@testing-library/react";
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
  };
}

interface RenderEdgeHookOptions {
  packageId?: string;
  snapWindowToEdgeIfNeeded?: () => Promise<EdgeSide | null>;
  restoreWindowFromEdgePeek?: (side: EdgeSide) => Promise<void>;
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
  resetWindowPosition = vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  preloadFrames = vi.fn<(_: readonly string[]) => Promise<void>>().mockResolvedValue(undefined),
  getProfile = vi.fn((candidatePackageId: string, side: EdgeSide) =>
    candidatePackageId === "builtin:q-girl" ? createProfile(side) : null,
  ),
  wrapper,
}: RenderEdgeHookOptions = {}) {
  const view = renderHook(() =>
    useEdgeInteraction({
      packageId,
      snapWindowToEdgeIfNeeded,
      restoreWindowFromEdgePeek,
      resetWindowPosition,
      preloadFrames,
      getProfile,
    }),
    { wrapper },
  );

  return {
    ...view,
    snapWindowToEdgeIfNeeded,
    restoreWindowFromEdgePeek,
    resetWindowPosition,
    preloadFrames,
    getProfile,
  };
}

function StrictModeWrapper({ children }: PropsWithChildren) {
  return <StrictMode>{children}</StrictMode>;
}

describe("useEdgeInteraction", () => {
  it("enters idle, reacts on hover, and returns to idle after react completes", async () => {
    const { result, snapWindowToEdgeIfNeeded, preloadFrames } = renderEdgeHook();

    await act(async () => {
      await result.current.snapAfterDrag();
    });

    expect(preloadFrames).toHaveBeenNthCalledWith(1, [
      "/left/enter/0001.png",
      "/right/enter/0001.png",
      "/top/enter/0001.png",
      "/bottom/enter/0001.png",
    ]);
    expect(snapWindowToEdgeIfNeeded).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({ side: "left", phase: "enter" });
    expect(result.current.renderState?.profile.side).toBe("left");

    await act(async () => {
      await result.current.handlePhaseComplete();
    });
    expect(result.current.state).toEqual({ side: "left", phase: "idle" });

    act(() => result.current.handlePointerEnter());
    expect(result.current.state).toEqual({ side: "left", phase: "react" });

    await act(async () => {
      await result.current.handlePhaseComplete();
    });
    expect(result.current.state).toEqual({ side: "left", phase: "idle" });
  });

  it("works after React StrictMode mounts, cleans up, and mounts effects again", async () => {
    const onExit = vi.fn();
    const { result, restoreWindowFromEdgePeek } = renderEdgeHook({
      wrapper: StrictModeWrapper,
    });

    await act(async () => {
      await result.current.snapAfterDrag();
    });
    expect(result.current.state).toEqual({ side: "left", phase: "enter" });

    act(() => {
      result.current.requestExitThen(onExit);
    });
    await act(async () => {
      await result.current.handlePhaseComplete();
    });

    expect(restoreWindowFromEdgePeek).toHaveBeenCalledWith("left");
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBeNull();
  });

  it("restores after exit completes before running the queued action once", async () => {
    const onExit = vi.fn();
    const { result, restoreWindowFromEdgePeek } = renderEdgeHook();

    await act(async () => {
      await result.current.snapAfterDrag();
    });
    await act(async () => {
      await result.current.handlePhaseComplete();
    });

    act(() => {
      result.current.requestExitThen(onExit);
      result.current.requestExitThen(onExit);
      result.current.handlePointerEnter();
    });

    expect(result.current.state).toEqual({ side: "left", phase: "exit" });
    expect(onExit).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.handlePhaseComplete();
    });

    expect(restoreWindowFromEdgePeek).toHaveBeenCalledTimes(1);
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

  it("does not call native snap when enter frame preload fails", async () => {
    const snapWindowToEdgeIfNeeded = vi.fn<() => Promise<EdgeSide | null>>().mockResolvedValue("left");
    const preloadFrames = vi
      .fn<(_: readonly string[]) => Promise<void>>()
      .mockRejectedValueOnce(new Error("enter failed"));
    const { result } = renderEdgeHook({
      snapWindowToEdgeIfNeeded,
      preloadFrames,
    });

    await act(async () => {
      await result.current.snapAfterDrag();
    });

    expect(preloadFrames).toHaveBeenCalledTimes(1);
    expect(snapWindowToEdgeIfNeeded).not.toHaveBeenCalled();
    expect(result.current.state).toBeNull();
  });

  it("restores the native window when idle or react preload fails after snapping", async () => {
    const preloadFrames = vi
      .fn<(_: readonly string[]) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("idle failed"));
    const { result, restoreWindowFromEdgePeek } = renderEdgeHook({
      preloadFrames,
    });

    await act(async () => {
      await result.current.snapAfterDrag();
      await Promise.resolve();
    });

    expect(preloadFrames).toHaveBeenNthCalledWith(2, [
      "/left/idle/0001.png",
      "/left/react/0001.png",
    ]);
    expect(restoreWindowFromEdgePeek).toHaveBeenCalledWith("left");
    expect(result.current.state).toBeNull();
  });

  it("recovers from edge image load failure once without running a pending user command", async () => {
    const onExit = vi.fn();
    const { result, restoreWindowFromEdgePeek } = renderEdgeHook();

    await act(async () => {
      await result.current.snapAfterDrag();
    });
    act(() => {
      result.current.requestExitThen(onExit);
    });

    await act(async () => {
      await result.current.handleLoadError();
      await result.current.handleLoadError();
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
    const restorePromise = Promise.resolve();
    const onExit = vi.fn();
    const { result, unmount } = renderEdgeHook({
      restoreWindowFromEdgePeek: vi.fn(() => restorePromise),
    });

    await act(async () => {
      await result.current.snapAfterDrag();
    });
    act(() => {
      result.current.requestExitThen(onExit);
    });

    const completion = act(async () => {
      await result.current.handlePhaseComplete();
    });

    unmount();
    await completion;

    expect(onExit).not.toHaveBeenCalled();
  });
});
