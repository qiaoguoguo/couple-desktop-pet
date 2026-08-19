import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import appCssSource from "../app/app.css?raw";
import { collectInteractiveRegions } from "../desktop/interactiveRegions";
import type { EdgeCompanionVisualProfile } from "../pet/edgeInteraction";
import type {
  EdgeNoticeState,
  EdgePresenceNotice,
  EdgeRemoteNotice,
} from "../pet/edgeNotice";
import { EdgeCompanionStage } from "./EdgeCompanionStage";

const frameAlphaBoundsMock = vi.hoisted(() => ({
  resolveFrameAlphaBounds: vi.fn(),
}));

vi.mock("./frameAlphaBounds", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./frameAlphaBounds")>();
  return {
    ...actual,
    resolveFrameAlphaBounds: frameAlphaBoundsMock.resolveFrameAlphaBounds,
  };
});

function createVisual(
  overrides: Partial<EdgeCompanionVisualProfile> = {},
): EdgeCompanionVisualProfile {
  return {
    side: "right",
    placement: "side",
    idleUrl: "/edge/side/idle.png",
    blinkUrl: "/edge/side/blink.png",
    mirrorX: false,
    baseVisibleHeightPx: 34,
    minVisibleHeightPx: 30,
    maxVisibleHeightPx: 42,
    fixedBox: {
      widthPx: 100,
      heightPx: 100,
      contactAnchor: { x: 0.8, y: 0.5 },
      idleFrame: { xPx: 0, yPx: 0, widthPx: 100, heightPx: 100 },
      blinkFrame: { xPx: 0, yPx: 0, widthPx: 100, heightPx: 100 },
    },
    ...overrides,
  };
}

const message: EdgeRemoteNotice = {
  kind: "message",
  id: "message-1",
  title: "TA 发来消息",
  detail: "今晚一起看电影吗？",
  iconUrl: "/assets/peer-avatar.png",
  unreadCount: 2,
};

const surprise: EdgeRemoteNotice = {
  kind: "surprise",
  id: "surprise-1",
  title: "有一份小心意",
  detail: "点击查看",
  iconUrl: "/assets/surprise.png",
  unreadCount: 1,
};

const presence: EdgePresenceNotice = {
  kind: "presence",
  revision: "presence-1",
  tone: "online",
  title: "TA 在线",
  detail: "刚刚上线",
  iconUrl: "/assets/peer-avatar.png",
};

function createNoticeState(
  active: EdgeNoticeState["active"],
  presentation: EdgeNoticeState["presentation"] = "expanded",
): EdgeNoticeState {
  return {
    snapshot: {
      presence: active?.kind === "presence" ? active : null,
      remote: active && active.kind !== "presence" ? active : null,
    },
    active,
    presentation,
    expiresAt: presentation === "expanded" ? 8000 : null,
    presenceMarker: active?.kind === "presence" ? active.tone : null,
    announcedPresenceRevision:
      active?.kind === "presence" ? active.revision : null,
    announcedRemoteId:
      active && active.kind !== "presence" ? active.id : null,
  };
}

describe("EdgeCompanionStage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    frameAlphaBoundsMock.resolveFrameAlphaBounds.mockReset();
    frameAlphaBoundsMock.resolveFrameAlphaBounds.mockResolvedValue({
      x: 10,
      y: 20,
      width: 60,
      height: 68,
      imageWidth: 100,
      imageHeight: 100,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders only the idle frame without timers or mascot interactions", async () => {
    const profile = createVisual();
    const obsoleteCallbacks = {
      phase: "react" as const,
      reactDurationMs: 1,
      random: () => 0,
      onPhaseComplete: vi.fn(),
      onPointerEnter: vi.fn(),
      onPointerLeave: vi.fn(),
      onPetClick: vi.fn(),
    };
    render(
      <EdgeCompanionStage
        profile={profile}
        scale={1}
        {...obsoleteCallbacks}
      />,
    );

    await act(async () => Promise.resolve());
    const stage = screen.getByTestId("edge-companion-stage");
    const frame = screen.getByTestId("edge-companion-frame");
    const hitRegion = screen.getByTestId("edge-companion-alpha-hit-region");

    fireEvent.pointerEnter(hitRegion);
    fireEvent.pointerLeave(hitRegion);
    fireEvent.click(hitRegion);
    act(() => vi.advanceTimersByTime(20_000));

    expect(frame.getAttribute("src")).toBe(profile.idleUrl);
    expect(frame.getAttribute("data-frame-kind")).toBe("idle");
    expect(stage.classList.contains("is-hovered")).toBe(false);
    expect(obsoleteCallbacks.onPhaseComplete).not.toHaveBeenCalled();
    expect(obsoleteCallbacks.onPointerEnter).not.toHaveBeenCalled();
    expect(obsoleteCallbacks.onPointerLeave).not.toHaveBeenCalled();
    expect(obsoleteCallbacks.onPetClick).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("registers only the resolved mascot alpha bounds and expanded notice card", async () => {
    render(
      <EdgeCompanionStage
        profile={createVisual()}
        scale={1}
        noticeState={createNoticeState(message)}
      />,
    );

    const stage = screen.getByTestId("edge-companion-stage");
    const surface = screen.getByTestId("edge-notice-surface");
    await act(async () => Promise.resolve());
    const hitRegion = screen.getByTestId("edge-companion-alpha-hit-region");
    const card = screen.getByRole("button", { name: /TA 发来消息/ });

    expect(stage.hasAttribute("data-desktop-interactive-region")).toBe(false);
    expect(surface.hasAttribute("data-desktop-interactive-region")).toBe(false);
    expect(hitRegion.hasAttribute("data-desktop-interactive-region")).toBe(true);
    expect(card.hasAttribute("data-desktop-interactive-region")).toBe(true);
    expect(hitRegion.style.left).toBe("5px");
    expect(hitRegion.style.top).toBe("10px");
    expect(hitRegion.style.width).toBe("30px");
    expect(hitRegion.style.height).toBe("34px");
  });

  it("exposes the resolved micro mascot rectangle to the native region collector", async () => {
    render(<EdgeCompanionStage profile={createVisual()} scale={1} />);
    await act(async () => Promise.resolve());

    const hitRegion = screen.getByTestId("edge-companion-alpha-hit-region");
    vi.spyOn(hitRegion, "getBoundingClientRect").mockReturnValue({
      x: 12.5,
      y: 18,
      left: 12.5,
      top: 18,
      width: 30,
      height: 34,
      right: 42.5,
      bottom: 52,
      toJSON: () => ({}),
    });

    expect(collectInteractiveRegions(document)).toEqual([
      { x: 12.5, y: 18, width: 30, height: 34 },
    ]);
  });

  it("keeps the micro frame and hit region hidden until alpha bounds resolve", async () => {
    const bounds = {
      x: 10,
      y: 20,
      width: 60,
      height: 68,
      imageWidth: 100,
      imageHeight: 100,
    };
    let resolveBounds: (value: typeof bounds) => void = () => undefined;
    frameAlphaBoundsMock.resolveFrameAlphaBounds.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveBounds = resolve;
      }),
    );

    render(<EdgeCompanionStage profile={createVisual()} scale={1} />);

    expect(screen.queryByTestId("edge-companion-frame")).toBeNull();
    expect(screen.queryByTestId("edge-companion-alpha-hit-region")).toBeNull();

    await act(async () => {
      resolveBounds(bounds);
      await Promise.resolve();
    });

    expect(screen.getByTestId("edge-companion-frame")).toBeTruthy();
    expect(screen.getByTestId("edge-companion-alpha-hit-region")).toBeTruthy();
  });

  it("recovers exactly once when alpha bounds resolve null", async () => {
    const onLoadError = vi.fn();
    frameAlphaBoundsMock.resolveFrameAlphaBounds.mockResolvedValueOnce(null);

    render(
      <EdgeCompanionStage
        profile={createVisual()}
        scale={1}
        onLoadError={onLoadError}
      />,
    );
    await act(async () => Promise.resolve());

    expect(onLoadError).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("edge-companion-frame")).toBeNull();
    expect(screen.queryByTestId("edge-companion-alpha-hit-region")).toBeNull();
  });

  it("recovers exactly once when alpha bounds resolution rejects", async () => {
    const onLoadError = vi.fn();
    frameAlphaBoundsMock.resolveFrameAlphaBounds.mockRejectedValueOnce(
      new Error("alpha resolution failed"),
    );

    render(
      <EdgeCompanionStage
        profile={createVisual()}
        scale={1}
        onLoadError={onLoadError}
      />,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onLoadError).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("edge-companion-frame")).toBeNull();
    expect(screen.queryByTestId("edge-companion-alpha-hit-region")).toBeNull();
  });

  it("renders only expanded message or surprise cards and activates them only on click", async () => {
    const onNoticeActivate = vi.fn();
    const { rerender } = render(
      <EdgeCompanionStage
        profile={createVisual()}
        scale={1}
        noticeState={createNoticeState(message)}
        onNoticeActivate={onNoticeActivate}
      />,
    );
    await act(async () => Promise.resolve());

    const messageCard = screen.getByRole("button", { name: /TA 发来消息/ });
    fireEvent.pointerEnter(messageCard);
    fireEvent.pointerLeave(messageCard);
    expect(onNoticeActivate).not.toHaveBeenCalled();
    fireEvent.click(messageCard);
    expect(onNoticeActivate).toHaveBeenCalledWith(message);

    rerender(
      <EdgeCompanionStage
        profile={createVisual()}
        scale={1}
        noticeState={createNoticeState(message, "marker")}
        onNoticeActivate={onNoticeActivate}
      />,
    );
    expect(screen.queryByTestId("edge-notice-surface")).toBeNull();

    rerender(
      <EdgeCompanionStage
        profile={createVisual()}
        scale={1}
        noticeState={createNoticeState(presence)}
        onNoticeActivate={onNoticeActivate}
      />,
    );
    expect(screen.queryByTestId("edge-notice-surface")).toBeNull();

    rerender(
      <EdgeCompanionStage
        profile={createVisual()}
        scale={1}
        noticeState={createNoticeState(surprise)}
        onNoticeActivate={onNoticeActivate}
      />,
    );
    const surpriseCard = screen.getByRole("button", {
      name: /有一份心意正在等你/,
    });
    fireEvent.click(surpriseCard);
    expect(onNoticeActivate).toHaveBeenLastCalledWith(surprise);
  });

  it("stops rendering a failed idle asset and invokes the exit path without timers", async () => {
    const onLoadError = vi.fn();
    render(
      <EdgeCompanionStage
        profile={createVisual()}
        scale={1}
        onLoadError={onLoadError}
      />,
    );

    await act(async () => Promise.resolve());
    expect(vi.getTimerCount()).toBe(0);
    const frame = screen.getByTestId("edge-companion-frame");
    act(() => {
      frame.dispatchEvent(new Event("error", { bubbles: true }));
      frame.dispatchEvent(new Event("error", { bubbles: true }));
    });

    expect(onLoadError).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("edge-companion-frame")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("contains no hover offset selector or companion box transition", () => {
    expect(appCssSource).not.toContain(".edge-companion-stage.is-hovered");
    expect(appCssSource).not.toMatch(
      /\.edge-companion-box\s*\{[^}]*\btransition\s*:/s,
    );
  });
});
