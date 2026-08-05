import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PetActionDefinition } from "../assets/builtInPetManifest";
import type { PetActionName } from "../assets/petActionNames";
import {
  PET_FRAMES_PER_ACTION,
  REQUIRED_PET_ACTIONS,
} from "../assets/petPackageContract";
import {
  buildPetPackageRegistry,
  type ResolvedPetPackage,
} from "../assets/petPackageRegistry";
import { FramePetStage } from "./FramePetStage";
import framePetStageSource from "./FramePetStage.tsx?raw";

const builtInPackage = buildPetPackageRegistry([], (path) => `asset://${path}`)[0];

const importedPackage: ResolvedPetPackage = {
  id: "imported:moon-buddy",
  name: "月亮伙伴",
  baseSize: { width: 256, height: 320 },
  frameSize: { width: 768, height: 960 },
  previewUrl: "asset://moon/preview.png",
  source: "imported",
  actions: createImportedActions(),
  scenes: {},
};

function createImportedActions(): Record<PetActionName, PetActionDefinition> {
  const actions = {} as Record<PetActionName, PetActionDefinition>;

  for (const action of REQUIRED_PET_ACTIONS) {
    actions[action] = {
      fps: 3,
      loop:
        action.startsWith("idle") ||
        action === "walk" ||
        action === "drag" ||
        action === "sleep",
      frameCount: PET_FRAMES_PER_ACTION,
      durationMs: 6000,
      category: action.startsWith("idle")
        ? "idle"
        : action.startsWith("act-")
          ? "interaction"
          : "movement",
      frames: Array.from(
        { length: PET_FRAMES_PER_ACTION },
        (_, index) =>
          `asset://moon/${action}/${String(index + 1).padStart(4, "0")}.png`,
      ),
    };
  }

  return actions;
}

function renderStage(petPackage = builtInPackage) {
  const props = {
    action: "idle-breathe" as const,
    scale: 1,
    petPackage,
    onPetClick: vi.fn(),
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
  };
  const view = render(<FramePetStage {...props} />);
  const stage = view.container.querySelector(".pet-frame-stage");

  if (!stage) {
    throw new Error("FramePetStage root missing");
  }

  return { ...view, props, stage };
}

describe("FramePetStage DOM frame rendering", () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("renders the generated pet frame image instead of the fallback when a frame URL exists", () => {
    renderStage();

    const frameImage = screen.getByRole("img", { name: "Q 版小人" });

    expect(frameImage.getAttribute("src")).toContain(
      "pets/q-girl/frames/idle-breathe/0001.png",
    );
    expect(document.querySelector(".pet-fallback-card")).toBeNull();
  });

  it("renders frames from the selected imported pet package", () => {
    const { stage } = renderStage(importedPackage);

    const frameImage = screen.getByRole("img", { name: "月亮伙伴" });

    expect(stage.getAttribute("data-pet-package-id")).toBe("imported:moon-buddy");
    expect(frameImage.getAttribute("src")).toBe(
      "asset://moon/idle-breathe/0001.png",
    );
    expect(document.querySelector(".pet-fallback-card")).toBeNull();
  });

  it("shows the fallback only after the generated frame image fails to load", () => {
    renderStage();

    fireEvent.error(screen.getByRole("img", { name: "Q 版小人" }));

    expect(screen.getByLabelText("Q 版小人开发占位")).toBeTruthy();
  });

  it("advances frame image URLs with the animation timer", () => {
    vi.useFakeTimers();
    renderStage();

    expect(screen.getByRole("img", { name: "Q 版小人" }).getAttribute("src")).toContain(
      "idle-breathe/0001",
    );

    act(() => vi.advanceTimersByTime(200));

    expect(screen.getByRole("img", { name: "Q 版小人" }).getAttribute("src")).toContain(
      "idle-breathe/0002",
    );
  });
});

describe("FramePetStage runtime dependencies", () => {
  it("does not import PixiJS on the MVP render path", () => {
    expect(framePetStageSource).not.toContain('import("pixi.js")');
    expect(framePetStageSource).not.toContain('from "pixi.js"');
  });
});

describe("FramePetStage pointer interactions", () => {
  it("opens pet click without starting or ending drag on a simple click", () => {
    const { props, stage } = renderStage();

    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(stage, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.click(stage);

    expect(props.onDragStart).not.toHaveBeenCalled();
    expect(props.onDragEnd).not.toHaveBeenCalled();
    expect(props.onPetClick).toHaveBeenCalledTimes(1);
  });

  it("does not end dragging on ordinary hover leave", () => {
    const { props, stage } = renderStage();

    fireEvent.pointerLeave(stage);

    expect(props.onDragStart).not.toHaveBeenCalled();
    expect(props.onDragEnd).not.toHaveBeenCalled();
  });

  it("does not start or end dragging when pointer leaves before crossing the drag threshold", () => {
    const { props, stage } = renderStage();

    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerLeave(stage, { pointerId: 1, clientX: 11, clientY: 11 });

    expect(props.onDragStart).not.toHaveBeenCalled();
    expect(props.onDragEnd).not.toHaveBeenCalled();
  });

  it("starts dragging only after pointer movement crosses the threshold", () => {
    const { props, stage } = renderStage();

    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 12, clientY: 10 });
    expect(props.onDragStart).not.toHaveBeenCalled();

    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 18, clientY: 10 });
    expect(props.onDragStart).toHaveBeenCalledTimes(1);

    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 22, clientY: 10 });
    expect(props.onDragStart).toHaveBeenCalledTimes(1);
  });

  it("suppresses the click that follows a real drag", () => {
    const { props, stage } = renderStage();

    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 18, clientY: 10 });
    fireEvent.pointerUp(stage, { pointerId: 1, clientX: 18, clientY: 10 });
    fireEvent.click(stage);

    expect(props.onDragStart).toHaveBeenCalledTimes(1);
    expect(props.onDragEnd).toHaveBeenCalledTimes(1);
    expect(props.onPetClick).not.toHaveBeenCalled();
  });
});
