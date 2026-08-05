import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PetActionDefinition } from "../assets/builtInPetManifest";
import type { PetActionName } from "../assets/petActionNames";
import {
  PET_ACTION_DURATION_MS,
  PET_ACTION_FPS,
  PET_FRAMES_PER_ACTION,
  REQUIRED_PET_ACTIONS,
} from "../assets/petPackageContract";
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
    frameSize: { width: 768, height: 960 },
    previewUrl: "asset://moon/preview.png",
    source: "imported",
    actions: createActions(),
    defaultMotionId: "idle-breathe",
    motions: {} as ResolvedPetPackage["motions"],
    scenes: {},
  };
}

function createActions(): Record<PetActionName, PetActionDefinition> {
  const actions = {} as Record<PetActionName, PetActionDefinition>;

  for (const action of REQUIRED_PET_ACTIONS) {
    actions[action] = {
      fps: PET_ACTION_FPS,
      loop:
        action.startsWith("idle") ||
        action === "walk" ||
        action === "drag" ||
        action === "sleep",
      frameCount: PET_FRAMES_PER_ACTION,
      durationMs: PET_ACTION_DURATION_MS,
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

async function advanceTypewriterText(text: string) {
  for (let index = 1; index < Array.from(text).length; index += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(35);
    });
  }
}

describe("RemoteMessageLayer", () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("renders the peer pet image and incoming message", async () => {
    vi.useFakeTimers();
    render(
      <RemoteMessageLayer
        message={remoteMessage()}
        peerPackage={resolvedPackage()}
        onAcknowledge={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("对方桌宠消息")).toBeTruthy();
    expect(screen.getByRole("img", { name: "月亮伙伴来访" })).toBeTruthy();
    expect(screen.getByText("想")).toBeTruthy();

    await advanceTypewriterText("想你啦");

    expect(screen.getByText("想你啦")).toBeTruthy();
  });

  it("plays the peer act-wave frame sequence for remote visits", () => {
    vi.useFakeTimers();
    render(
      <RemoteMessageLayer
        message={remoteMessage()}
        peerPackage={resolvedPackage()}
        onAcknowledge={vi.fn()}
      />,
    );

    const image = screen.getByRole("img", {
      name: "月亮伙伴来访",
    }) as HTMLImageElement;

    expect(image.getAttribute("src")).toBe("asset://moon/act-wave/0001.png");

    act(() => vi.advanceTimersByTime(200));

    expect(image.getAttribute("src")).toBe("asset://moon/act-wave/0002.png");
  });

  it("uses the remote-message scene action for remote visit animation", () => {
    const peerPackage = resolvedPackage();
    peerPackage.scenes = {
      "remote-message": {
        action: "act-hug",
        bubbleCues: [{ atMs: 1000, source: "remoteMessage" }],
        waitForAcknowledge: true,
        returnTo: "idle-breathe",
      },
    };

    render(
      <RemoteMessageLayer
        message={remoteMessage()}
        peerPackage={peerPackage}
        onAcknowledge={vi.fn()}
      />,
    );

    const image = screen.getByRole("img", {
      name: "月亮伙伴来访",
    }) as HTMLImageElement;

    expect(image.getAttribute("src")).toBe("asset://moon/act-hug/0001.png");
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

  it("uses the readable fallback when the peer image fails to load", () => {
    render(
      <RemoteMessageLayer
        message={remoteMessage()}
        peerPackage={resolvedPackage()}
        onAcknowledge={vi.fn()}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "月亮伙伴来访" }));

    expect(
      screen.queryByRole("img", { name: "月亮伙伴来访" }),
    ).toBeNull();
    expect(screen.getByRole("img", { name: "对方桌宠来访占位" })).toBeTruthy();
    expect(screen.getByText("月亮伙伴")).toBeTruthy();
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
