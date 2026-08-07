import { act, renderHook } from "@testing-library/react";
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

function renderEdgeHook({
  packageId = "builtin:q-girl",
  snapWindowToEdgeIfNeeded = vi.fn<() => Promise<EdgeSide | null>>().mockResolvedValue("left"),
  restoreWindowFromEdgePeek = vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  getProfile = vi.fn((candidatePackageId: string, side: EdgeSide) =>
    candidatePackageId === "builtin:q-girl" ? createProfile(side) : null,
  ),
} = {}) {
  const view = renderHook(() =>
    useEdgeInteraction({
      packageId,
      snapWindowToEdgeIfNeeded,
      restoreWindowFromEdgePeek,
      getProfile,
    }),
  );

  return {
    ...view,
    snapWindowToEdgeIfNeeded,
    restoreWindowFromEdgePeek,
    getProfile,
  };
}

describe("useEdgeInteraction", () => {
  it("enters idle, reacts on hover, and returns to idle after react completes", async () => {
    const { result, snapWindowToEdgeIfNeeded } = renderEdgeHook();

    await act(async () => {
      await result.current.snapAfterDrag();
    });

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
