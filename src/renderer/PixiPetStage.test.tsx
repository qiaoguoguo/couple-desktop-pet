import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PixiPetStage } from "./PixiPetStage";

function renderStage() {
  const props = {
    action: "idle" as const,
    scale: 1,
    onPetClick: vi.fn(),
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
  };
  const view = render(<PixiPetStage {...props} />);
  const stage = view.container.querySelector(".pixi-pet-stage");

  if (!stage) {
    throw new Error("PixiPetStage root missing");
  }

  return { ...view, props, stage };
}

describe("PixiPetStage DOM frame rendering", () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("renders the generated pet frame image instead of the fallback when a frame URL exists", () => {
    renderStage();

    const frameImage = screen.getByRole("img", { name: "星星睡衣小星人" });

    expect(frameImage.getAttribute("src")).toContain("idle-01");
    expect(document.querySelector(".pet-fallback-card")).toBeNull();
  });

  it("shows the fallback only after the generated frame image fails to load", () => {
    renderStage();

    fireEvent.error(screen.getByRole("img", { name: "星星睡衣小星人" }));

    expect(screen.getByLabelText("星星睡衣小星人开发占位")).toBeTruthy();
  });

  it("advances frame image URLs with the animation timer", () => {
    vi.useFakeTimers();
    renderStage();

    expect(screen.getByRole("img", { name: "星星睡衣小星人" }).getAttribute("src")).toContain(
      "idle-01",
    );

    act(() => vi.advanceTimersByTime(200));

    expect(screen.getByRole("img", { name: "星星睡衣小星人" }).getAttribute("src")).toContain(
      "idle-02",
    );
  });
});

describe("PixiPetStage runtime dependencies", () => {
  it("does not import PixiJS on the MVP render path", async () => {
    const [{ readFile }, { join }] = await Promise.all([
      import("node:fs/promises"),
      import("node:path"),
    ]);
    const source = await readFile(
      join(process.cwd(), "src/renderer/PixiPetStage.tsx"),
      "utf8",
    );

    expect(source).not.toContain('import("pixi.js")');
    expect(source).not.toContain('from "pixi.js"');
  });
});

describe("PixiPetStage pointer interactions", () => {
  it("does not end dragging on ordinary hover leave", () => {
    const { props, stage } = renderStage();

    fireEvent.pointerLeave(stage);

    expect(props.onDragStart).not.toHaveBeenCalled();
    expect(props.onDragEnd).not.toHaveBeenCalled();
  });

  it("ends dragging on leave only after pointer down", () => {
    const { props, stage } = renderStage();

    fireEvent.pointerDown(stage, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerLeave(stage, { pointerId: 1 });

    expect(props.onDragStart).toHaveBeenCalledTimes(1);
    expect(props.onDragEnd).toHaveBeenCalledTimes(1);
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
