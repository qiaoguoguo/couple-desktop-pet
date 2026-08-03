import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  PetActionDefinition,
  PetActionName,
} from "../assets/builtInPetManifest";
import { REQUIRED_PET_ACTIONS } from "../assets/petPackageContract";
import type { ResolvedPetPackage } from "../assets/petPackageRegistry";
import { RemoteMessageLayer } from "./RemoteMessageLayer";
import type { RemoteMessageCard } from "./remoteMessageQueue";

function remoteMessage(
  stage: RemoteMessageCard["stage"] = "visible",
): RemoteMessageCard {
  return {
    id: "msg_1",
    fromDeviceId: "dev_b",
    text: "想你啦",
    at: "2026-08-03T12:00:00.000Z",
    stage,
  };
}

function resolvedPackage(): ResolvedPetPackage {
  return {
    id: "imported:moon-buddy",
    name: "月亮伙伴",
    baseSize: { width: 256, height: 320 },
    previewUrl: "asset://moon/preview.png",
    source: "imported",
    actions: createActions(),
  };
}

function createActions(): Record<PetActionName, PetActionDefinition> {
  const actions = {} as Record<PetActionName, PetActionDefinition>;

  for (const action of REQUIRED_PET_ACTIONS) {
    actions[action] = {
      fps: 3,
      loop: action.startsWith("idle"),
      durationMs: 6000,
      category: action.startsWith("idle")
        ? "idle"
        : action.startsWith("act-")
          ? "interaction"
          : "movement",
      frames: [`asset://moon/${action}-01.png`],
    };
  }

  return actions;
}

describe("RemoteMessageLayer", () => {
  it("renders the peer pet image and incoming message", () => {
    render(
      <RemoteMessageLayer
        message={remoteMessage()}
        peerPackage={resolvedPackage()}
        onAcknowledge={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("对方桌宠消息")).toBeTruthy();
    expect(screen.getByRole("img", { name: "月亮伙伴来访" })).toBeTruthy();
    expect(screen.getByText("想你啦")).toBeTruthy();
  });

  it("uses a readable fallback when no peer package is selected", () => {
    render(
      <RemoteMessageLayer
        message={remoteMessage()}
        peerPackage={null}
        onAcknowledge={vi.fn()}
      />,
    );

    expect(screen.getByRole("img", { name: "对方桌宠来访占位" })).toBeTruthy();
    expect(screen.getByText("对方桌宠")).toBeTruthy();
  });

  it("acknowledges the message on mouse hover", () => {
    const onAcknowledge = vi.fn();
    render(
      <RemoteMessageLayer
        message={remoteMessage()}
        peerPackage={resolvedPackage()}
        onAcknowledge={onAcknowledge}
      />,
    );

    fireEvent.pointerEnter(screen.getByLabelText("对方桌宠消息"));

    expect(onAcknowledge).toHaveBeenCalledWith("msg_1");
  });

  it("does not render when there is no active message", () => {
    render(
      <RemoteMessageLayer
        message={null}
        peerPackage={resolvedPackage()}
        onAcknowledge={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("对方桌宠消息")).toBeNull();
  });
});
