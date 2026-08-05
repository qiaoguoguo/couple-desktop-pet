import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { interactionOptions } from "../assets/builtInPetManifest";
import { InteractionMenu } from "./InteractionMenu";

describe("InteractionMenu", () => {
  it("renders nothing when closed", () => {
    render(
      <InteractionMenu
        open={false}
        x={10}
        y={20}
        options={interactionOptions}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByRole("menu", { name: "互动选项" })).toBeNull();
  });

  it("renders all interaction choices when open", () => {
    render(
      <InteractionMenu
        open
        x={10}
        y={20}
        options={interactionOptions}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole("menu", { name: "互动选项" })).toBeTruthy();
    expect(screen.getAllByRole("menuitem")).toHaveLength(6);
    expect(screen.getByRole("menuitem", { name: "撒娇卖萌" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "敲电脑" })).toBeTruthy();
  });

  it("renders Q sticker buttons with icon containers and stagger variables", () => {
    render(
      <InteractionMenu
        open
        x={10}
        y={20}
        options={interactionOptions}
        onSelect={vi.fn()}
      />,
    );

    const firstButton = screen.getByRole("menuitem", { name: "撒娇卖萌" });

    expect(firstButton.classList.contains("pet-interaction-button")).toBe(true);
    expect(firstButton.getAttribute("style")).toContain("--menu-x");
    expect(firstButton.getAttribute("style")).toContain("--menu-y");
    expect(firstButton.getAttribute("style")).toContain("--menu-delay");
    expect(firstButton.querySelector(".pet-interaction-icon img")).toBeTruthy();
    expect(firstButton.querySelector(".pet-interaction-label")?.textContent).toBe(
      "撒娇卖萌",
    );
  });

  it("selects an interaction via callback", () => {
    const onSelect = vi.fn();
    render(
      <InteractionMenu
        open
        x={10}
        y={20}
        options={interactionOptions}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "撒娇卖萌" }));

    expect(onSelect).toHaveBeenCalledWith("act-cute");
  });
});
