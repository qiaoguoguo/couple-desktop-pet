import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
