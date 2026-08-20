import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ResolvedPetPackage } from "../assets/petPackageRegistry";
import { AppearancePanel } from "./AppearancePanel";

const packages: ResolvedPetPackage[] = [
  {
    id: "builtin:q-girl",
    name: "桃桃",
    source: "built-in",
    baseSize: { width: 256, height: 320 },
    frameSize: { width: 768, height: 960 },
    previewUrl: null,
    portraitUrl: null,
    offlinePortraitUrl: null,
    defaultMotionId: "idle-breathe",
    motions: {} as ResolvedPetPackage["motions"],
    actions: {} as ResolvedPetPackage["actions"],
    scenes: {},
  },
  {
    id: "builtin:q-boy",
    name: "青禾",
    source: "built-in",
    baseSize: { width: 256, height: 320 },
    frameSize: { width: 512, height: 640 },
    previewUrl: null,
    portraitUrl: null,
    offlinePortraitUrl: null,
    defaultMotionId: "motion-001",
    motions: {} as ResolvedPetPackage["motions"],
    actions: {} as ResolvedPetPackage["actions"],
    scenes: {},
  },
  {
    id: "imported:moon-buddy",
    name: "月亮伙伴",
    source: "imported",
    baseSize: { width: 256, height: 320 },
    frameSize: { width: 768, height: 960 },
    previewUrl: "asset://moon/preview.png",
    portraitUrl: "asset://moon/preview.png",
    offlinePortraitUrl: "asset://moon/preview.png",
    defaultMotionId: "idle-breathe",
    motions: {} as ResolvedPetPackage["motions"],
    actions: {} as ResolvedPetPackage["actions"],
    scenes: {},
  },
];

describe("AppearancePanel", () => {
  it("imports and switches pet packages", () => {
    const onImportPackage = vi.fn();
    const onSelectPackage = vi.fn();

    render(
      <AppearancePanel
        packages={packages}
        selectedPackageId="builtin:q-girl"
        peerDeviceId={null}
        selectedPeerPackageId={null}
        error={null}
        onImportPackage={onImportPackage}
        onSelectPackage={onSelectPackage}
        onSelectPeerPackage={vi.fn()}
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

  it("lists both built-ins and a custom package while only the import is deletable", () => {
    render(
      <AppearancePanel
        packages={packages}
        selectedPackageId="builtin:q-girl"
        peerDeviceId="dev_b"
        selectedPeerPackageId="builtin:q-boy"
        error={null}
        onImportPackage={vi.fn()}
        onSelectPackage={vi.fn()}
        onSelectPeerPackage={vi.fn()}
        onDeletePackage={vi.fn()}
      />,
    );

    const currentSelect = screen.getByLabelText("当前形象");
    const peerSelect = screen.getByLabelText("对方形象");
    for (const select of [currentSelect, peerSelect]) {
      expect(within(select).getByRole("option", { name: "桃桃" })).toBeTruthy();
      expect(within(select).getByRole("option", { name: "青禾" })).toBeTruthy();
      expect(
        within(select).getByRole("option", { name: "月亮伙伴" }),
      ).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: "删除桃桃" })).toBeNull();
    expect(screen.queryByRole("button", { name: "删除青禾" })).toBeNull();
    expect(screen.getByRole("button", { name: "删除月亮伙伴" })).toBeTruthy();
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
        selectedPackageId="builtin:q-girl"
        peerDeviceId={null}
        selectedPeerPackageId={null}
        error={null}
        onImportPackage={vi.fn()}
        onSelectPackage={vi.fn()}
        onSelectPeerPackage={vi.fn()}
        onDeletePackage={onDeletePackage}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "删除月亮伙伴" }));

    expect(onDeletePackage).toHaveBeenCalledWith("imported:moon-buddy");
  });

  it("does not show delete actions for the selected import or either built-in", () => {
    render(
      <AppearancePanel
        packages={packages}
        selectedPackageId="imported:moon-buddy"
        peerDeviceId={null}
        selectedPeerPackageId={null}
        error={null}
        onImportPackage={vi.fn()}
        onSelectPackage={vi.fn()}
        onSelectPeerPackage={vi.fn()}
        onDeletePackage={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "删除月亮伙伴" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "删除桃桃" })).toBeNull();
    expect(screen.queryByRole("button", { name: "删除青禾" })).toBeNull();
  });

  it("does not show a delete button for the selected peer package", () => {
    render(
      <AppearancePanel
        packages={packages}
        selectedPackageId="builtin:q-girl"
        peerDeviceId="dev_b"
        selectedPeerPackageId="imported:moon-buddy"
        error={null}
        onImportPackage={vi.fn()}
        onSelectPackage={vi.fn()}
        onSelectPeerPackage={vi.fn()}
        onDeletePackage={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "删除月亮伙伴" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "删除桃桃" })).toBeNull();
    expect(screen.queryByRole("button", { name: "删除青禾" })).toBeNull();
  });

  it("selects a peer pet package when a paired device exists", () => {
    const onSelectPeerPackage = vi.fn();

    render(
      <AppearancePanel
        packages={packages}
        selectedPackageId="builtin:q-girl"
        peerDeviceId="dev_b"
        selectedPeerPackageId={null}
        error={null}
        onImportPackage={vi.fn()}
        onSelectPackage={vi.fn()}
        onSelectPeerPackage={onSelectPeerPackage}
        onDeletePackage={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("对方形象"), {
      target: { value: "builtin:q-boy" },
    });

    expect(onSelectPeerPackage).toHaveBeenCalledWith("builtin:q-boy");
  });

  it("uses Taotao as the empty-registry fallback name", () => {
    render(
      <AppearancePanel
        packages={[]}
        selectedPackageId="builtin:missing"
        peerDeviceId={null}
        selectedPeerPackageId={null}
        error={null}
        onImportPackage={vi.fn()}
        onSelectPackage={vi.fn()}
        onSelectPeerPackage={vi.fn()}
        onDeletePackage={vi.fn()}
      />,
    );

    expect(screen.getByText("桃桃")).toBeTruthy();
  });
});
