import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ResolvedPetMotion,
  ResolvedPetPackage,
} from "../assets/petPackageRegistry";
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
    actions: {} as ResolvedPetPackage["actions"],
    defaultMotionId: "motion-001",
    motions: {
      "motion-001": motion("motion-001", {
        frames: [
          "asset://moon/motions/motion-001/0001.png",
          "asset://moon/motions/motion-001/0002.png",
        ],
        tags: ["idle"],
      }),
    },
    scenes: {},
  };
}

function motion(
  id: string,
  overrides: Partial<ResolvedPetMotion> = {},
): ResolvedPetMotion {
  return {
    id,
    fps: 5,
    loop: true,
    frameCount: 1,
    durationMs: 6000,
    frames: [`asset://moon/motions/${id}/0001.png`],
    weight: 1,
    tags: [],
    ...overrides,
  };
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

  it("renders a peer v3 default motion when act-wave is unavailable", () => {
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

    expect(image.getAttribute("src")).toBe(
      "asset://moon/motions/motion-001/0001.png",
    );

    act(() => vi.advanceTimersByTime(200));

    expect(image.getAttribute("src")).toBe(
      "asset://moon/motions/motion-001/0002.png",
    );
  });

  it("prefers a message tagged motion over the default motion", () => {
    const peerPackage = resolvedPackage();
    peerPackage.motions = {
      ...peerPackage.motions,
      "motion-message": motion("motion-message", {
        frames: ["asset://moon/motions/motion-message/0001.png"],
        tags: ["message"],
      }),
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

    expect(image.getAttribute("src")).toBe(
      "asset://moon/motions/motion-message/0001.png",
    );
  });

  it("falls back to preview when no usable motion frames exist", () => {
    const peerPackage = resolvedPackage();
    peerPackage.defaultMotionId = "missing-default";
    peerPackage.motions = {
      empty: motion("empty", { frames: [], tags: ["message"] }),
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

    expect(image.getAttribute("src")).toBe("asset://moon/preview.png");
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
