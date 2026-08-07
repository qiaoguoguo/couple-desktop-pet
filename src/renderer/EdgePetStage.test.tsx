import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EdgeInteractionProfile } from "../pet/edgeInteraction";
import { EdgePetStage } from "./EdgePetStage";

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

describe("EdgePetStage", () => {
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

  it("compensates frame anchors in 320 by 360 display coordinates", () => {
    const profile = createProfile();
    profile.contactAnchor = { x: 0.5, y: 0.5 };
    profile.idle = {
      ...profile.idle,
      frames: ["/edge/left/idle/0001.png"],
      frameAnchors: [{ x: 0.51, y: 0.48 }],
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

    expect(frame.style.transform).toBe("translate(-3.2px, 7.2px) scale(0.8)");
    expect(frame.style.transformOrigin).toBe("160px 180px");
  });

  it("passes hover, click and drag gestures through to the caller", () => {
    const onPointerEnter = vi.fn();
    const onPointerLeave = vi.fn();
    const onPetClick = vi.fn();
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();

    render(
      <EdgePetStage
        profile={createProfile()}
        phase="idle"
        scale={1}
        onPhaseComplete={vi.fn()}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onPetClick={onPetClick}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />,
    );

    const stage = screen.getByTestId("edge-pet-stage");

    fireEvent.pointerEnter(stage);
    fireEvent.pointerLeave(stage);
    fireEvent.click(stage);
    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 18, clientY: 10 });
    fireEvent.pointerUp(stage, { pointerId: 1, clientX: 18, clientY: 10 });

    expect(onPointerEnter).toHaveBeenCalledTimes(1);
    expect(onPointerLeave).toHaveBeenCalledTimes(1);
    expect(onPetClick).toHaveBeenCalledTimes(1);
    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onDragEnd).toHaveBeenCalledTimes(1);
  });
});
