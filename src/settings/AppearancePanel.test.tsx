import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ResolvedPetPackage } from "../assets/petPackageRegistry";
import { AppearancePanel } from "./AppearancePanel";

const packages: ResolvedPetPackage[] = [
  {
    id: "builtin:star-sleeper",
    name: "星星睡衣小星人",
    source: "built-in",
    baseSize: { width: 256, height: 320 },
    previewUrl: null,
    actions: {} as ResolvedPetPackage["actions"],
  },
  {
    id: "imported:moon-buddy",
    name: "月亮伙伴",
    source: "imported",
    baseSize: { width: 256, height: 320 },
    previewUrl: "asset://moon/preview.png",
    actions: {} as ResolvedPetPackage["actions"],
  },
  {
    id: "imported:sun-buddy",
    name: "太阳伙伴",
    source: "imported",
    baseSize: { width: 256, height: 320 },
    previewUrl: null,
    actions: {} as ResolvedPetPackage["actions"],
  },
];

describe("AppearancePanel", () => {
  it("imports and switches pet packages", () => {
    const onImportPackage = vi.fn();
    const onSelectPackage = vi.fn();

    render(
      <AppearancePanel
        packages={packages}
        selectedPackageId="builtin:star-sleeper"
        error={null}
        onImportPackage={onImportPackage}
        onSelectPackage={onSelectPackage}
        onDeletePackage={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "导入形象资源包" }));
    fireEvent.change(screen.getByLabelText("当前形象"), {
      target: { value: "imported:moon-buddy" },
    });

    expect(onImportPackage).toHaveBeenCalledTimes(1);
    expect(onSelectPackage).toHaveBeenCalledWith("imported:moon-buddy");
  });

  it("does not allow deleting the built-in package or selected package", () => {
    render(
      <AppearancePanel
        packages={packages}
        selectedPackageId="imported:moon-buddy"
        error={null}
        onImportPackage={vi.fn()}
        onSelectPackage={vi.fn()}
        onDeletePackage={vi.fn()}
      />,
    );

    expect(
      (screen.getByRole("button", { name: "删除当前导入形象" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("deletes a non-selected imported package", () => {
    const onDeletePackage = vi.fn();

    render(
      <AppearancePanel
        packages={packages}
        selectedPackageId="imported:moon-buddy"
        error={null}
        onImportPackage={vi.fn()}
        onSelectPackage={vi.fn()}
        onDeletePackage={onDeletePackage}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "删除太阳伙伴" }));

    expect(onDeletePackage).toHaveBeenCalledWith("imported:sun-buddy");
  });
});
