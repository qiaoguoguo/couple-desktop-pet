import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PetActionDefinition } from "../assets/builtInPetManifest";
import type { PetActionName } from "../assets/petActionNames";
import {
  PET_FRAMES_PER_ACTION,
  REQUIRED_PET_ACTIONS,
} from "../assets/petPackageContract";
import {
  buildPetPackageRegistry,
  type ResolvedPetMotion,
  type ResolvedPetPackage,
} from "../assets/petPackageRegistry";
import type {
  EdgeCompanionVisualProfile,
  EdgeInteractionProfile,
} from "../pet/edgeInteraction";
import type { EdgeNoticeState, EdgeRemoteNotice } from "../pet/edgeNotice";
import { FramePetStage } from "./FramePetStage";
import framePetStageSource from "./FramePetStage.tsx?raw";

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

const builtInPackage = buildPetPackageRegistry([], (path) => `asset://${path}`)[0];

const importedActionsRecord = createImportedActions();
const importedPackage: ResolvedPetPackage = {
  id: "imported:moon-buddy",
  name: "月亮伙伴",
  baseSize: { width: 256, height: 320 },
  frameSize: { width: 768, height: 960 },
  previewUrl: "asset://moon/preview.png",
  portraitUrl: "asset://moon/preview.png",
  offlinePortraitUrl: "asset://moon/preview.png",
  source: "imported",
  actions: importedActionsRecord,
  defaultMotionId: "idle-breathe",
  motions: createImportedMotions(importedActionsRecord),
  scenes: {},
};

beforeEach(() => {
  frameAlphaBoundsMock.resolveFrameAlphaBounds.mockReset();
  frameAlphaBoundsMock.resolveFrameAlphaBounds.mockResolvedValue({
    x: 0,
    y: 0,
    width: 768,
    height: 960,
    imageWidth: 768,
    imageHeight: 960,
  });
});

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

function createImportedMotions(
  actions: Record<PetActionName, PetActionDefinition>,
): Record<string, ResolvedPetMotion> {
  return Object.fromEntries(
    Object.entries(actions).map(([action, definition]) => [
      action,
      {
        id: action,
        fps: definition.fps,
        loop: definition.loop,
        frameCount: definition.frameCount,
        durationMs: definition.durationMs,
        frames: [...definition.frames],
        weight: action.startsWith("idle-") ? 2 : 1,
        tags: ["idle", "legacy-action", action],
      },
    ]),
  );
}

function createEdgeProfile(
  side: EdgeInteractionProfile["side"] = "right",
): EdgeInteractionProfile {
  const contactAnchor = { x: 0.725, y: 0.5 };

  return {
    side,
    contactAnchor,
    enter: {
      frames: ["/edge/right/enter/0001.png"],
      fps: 8,
      loop: false,
      durationMs: 125,
      frameAnchors: [contactAnchor],
    },
    idle: {
      frames: ["/edge/right/idle/0001.png"],
      fps: 4,
      loop: true,
      durationMs: 5500,
      frameAnchors: [contactAnchor],
    },
    react: {
      frames: ["/edge/right/react/0001.png"],
      fps: 6,
      loop: false,
      durationMs: 167,
      frameAnchors: [contactAnchor],
    },
  };
}

function createCompanionVisual(
  side: EdgeCompanionVisualProfile["side"] = "right",
): EdgeCompanionVisualProfile {
  return {
    side,
    placement: side === "bottom" ? "bottom" : "side",
    idleUrl: `/edge/${side}/micro-idle.png`,
    blinkUrl: `/edge/${side}/micro-blink.png`,
    mirrorX: side === "left",
    baseVisibleHeightPx: 34,
    minVisibleHeightPx: 30,
    maxVisibleHeightPx: 42,
    fixedBox: {
      widthPx: 100,
      heightPx: 100,
      contactAnchor: {
        x: side === "left" ? 0.2 : side === "right" ? 0.8 : 0.5,
        y: side === "bottom" ? 0.9 : 0.5,
      },
      idleFrame: { xPx: 0, yPx: 0, widthPx: 100, heightPx: 100 },
      blinkFrame: { xPx: 0, yPx: 0, widthPx: 100, heightPx: 100 },
    },
  };
}

function createMicroEdgeProfile(
  side: EdgeCompanionVisualProfile["side"] = "right",
) {
  return {
    ...createEdgeProfile(side),
    companion: createCompanionVisual(side),
  };
}

const topMessage: EdgeRemoteNotice = {
  kind: "message",
  id: "top-message-1",
  title: "今晚一起看电影吗？",
  detail: "收到一条新消息",
  iconUrl: "/assets/peer-avatar.png",
  unreadCount: 1,
};

const expandedTopMessageState: EdgeNoticeState = {
  snapshot: { presence: null, remote: topMessage },
  active: topMessage,
  presentation: "expanded",
  expiresAt: 8000,
  presenceMarker: null,
  announcedPresenceRevision: null,
  announcedRemoteId: topMessage.id,
};

function renderStage(petPackage = builtInPackage) {
  const props = {
    action: "idle-breathe" as const,
    motion: petPackage.motions["idle-breathe"],
    scale: 1,
    petPackage,
    onPetClick: vi.fn(),
    onDragStart: vi.fn(),
    onDragMove: vi.fn(),
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
    vi.restoreAllMocks();
  });

  it("renders the generated pet frame image instead of the fallback when a frame URL exists", () => {
    const { stage } = renderStage();

    const frameImage = screen.getByRole("img", { name: "Q 版小人" });

    expect(stage.getAttribute("data-motion-id")).toBe("idle-breathe");
    expect(frameImage.getAttribute("src")).toContain(
      "pets/q-girl/frames/idle-breathe/0001.png",
    );
    expect(document.querySelector(".pet-fallback-card")).toBeNull();
  });

  it("renders frames from the selected imported pet package", () => {
    const { stage } = renderStage(importedPackage);

    const frameImage = screen.getByRole("img", { name: "月亮伙伴" });

    expect(stage.getAttribute("data-pet-package-id")).toBe("imported:moon-buddy");
    expect(stage.getAttribute("data-motion-id")).toBe("idle-breathe");
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

  it("renders from the supplied motion while preserving the legacy action", () => {
    const actionFrames = createImportedActions();
    actionFrames["idle-breathe"] = {
      ...actionFrames["idle-breathe"],
      frames: ["legacy://idle-breathe.png"],
    };
    const motion: ResolvedPetMotion = {
      id: "motion-001",
      fps: 5,
      loop: true,
      frameCount: 2,
      durationMs: 6000,
      frames: [
        "asset://moon/motions/motion-001/0001.png",
        "asset://moon/motions/motion-001/0002.png",
      ],
      weight: 1,
      tags: ["idle"],
    };
    const motionOnlyPackage: ResolvedPetPackage = {
      ...importedPackage,
      actions: actionFrames,
      defaultMotionId: motion.id,
      motions: { [motion.id]: motion },
    };

    const view = render(
      <FramePetStage
        action="idle-breathe"
        motion={motion}
        scale={1}
        petPackage={motionOnlyPackage}
        onPetClick={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
      />,
    );
    const stage = view.container.querySelector(".pet-frame-stage");

    expect(stage?.getAttribute("data-action")).toBe("idle-breathe");
    expect(stage?.getAttribute("data-motion-id")).toBe("motion-001");
    expect(
      screen.getByRole("img", { name: "月亮伙伴" }).getAttribute("src"),
    ).toBe("asset://moon/motions/motion-001/0001.png");
  });

  it("renders top as a frozen first idle frame without edge mascot callbacks", async () => {
    let pendingFrame: FrameRequestCallback | null = null;
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        pendingFrame = callback;
        return 1;
      });
    const profile = createEdgeProfile("top");
    profile.contactAnchor = { x: 0.5, y: 0.05 };
    profile.idle = {
      ...profile.idle,
      frames: ["/edge/top/idle/0001.png", "/edge/top/idle/0002.png"],
      frameAnchors: [
        { x: 0.5, y: 0.05 },
        { x: 0.5, y: 0.05 },
      ],
    };
    const onEdgePhaseComplete = vi.fn();
    const onEdgePointerEnter = vi.fn();
    const onEdgePointerLeave = vi.fn();
    const onPetClick = vi.fn();

    render(
      <FramePetStage
        action="idle-breathe"
        motion={builtInPackage.motions["idle-breathe"]}
        scale={0.7}
        petPackage={builtInPackage}
        edgeInteraction={{
          profile,
          phase: "idle",
        }}
        onEdgePhaseComplete={onEdgePhaseComplete}
        onEdgePointerEnter={onEdgePointerEnter}
        onEdgePointerLeave={onEdgePointerLeave}
        onPetClick={onPetClick}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
      />,
    );
    await act(async () => Promise.resolve());

    const stage = document.querySelector(".pet-frame-stage") as HTMLElement;

    expect(stage.classList.contains("is-edge-interaction")).toBe(true);
    expect(stage.classList.contains("is-edge-top")).toBe(true);
    expect(stage.dataset.edgeInteractionSide).toBe("top");
    expect(stage.style.getPropertyValue("--pet-scale")).toBe("0.7");
    const edgeStage = screen.getByTestId("edge-pet-stage");
    const frame = screen.getByAltText("桌宠边缘待机");
    fireEvent.pointerEnter(edgeStage);
    fireEvent.pointerLeave(edgeStage);
    fireEvent.click(edgeStage);
    act(() => pendingFrame?.(0));
    act(() => pendingFrame?.(500));

    expect(frame.getAttribute("src")).toBe("/edge/top/idle/0001.png");
    expect(edgeStage.getAttribute("data-frame-index")).toBe("0");
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(onEdgePhaseComplete).not.toHaveBeenCalled();
    expect(onEdgePointerEnter).not.toHaveBeenCalled();
    expect(onEdgePointerLeave).not.toHaveBeenCalled();
    expect(onPetClick).not.toHaveBeenCalled();
    expect(screen.queryByRole("img", { name: "Q 版小人" })).toBeNull();
  });

  it.each(["idle", "react"] as const)(
    "renders the micro companion for non-top %s",
    (phase) => {
      render(
        <FramePetStage
          action="idle-breathe"
          motion={builtInPackage.motions["idle-breathe"]}
          scale={1}
          petPackage={builtInPackage}
          edgeInteraction={{ profile: createMicroEdgeProfile(), phase }}
          onEdgePhaseComplete={vi.fn()}
          onPetClick={vi.fn()}
          onDragStart={vi.fn()}
          onDragEnd={vi.fn()}
        />,
      );

      expect(screen.getByTestId("edge-companion-stage")).toBeTruthy();
      expect(screen.queryByTestId("edge-pet-stage")).toBeNull();
    },
  );

  it.each(["enter", "exit"] as const)(
    "keeps %s on the existing edge animation stage",
    (phase) => {
      render(
        <FramePetStage
          action="idle-breathe"
          motion={builtInPackage.motions["idle-breathe"]}
          scale={1}
          petPackage={builtInPackage}
          edgeInteraction={{ profile: createMicroEdgeProfile(), phase }}
          edgeNotice={expandedTopMessageState}
          onEdgePhaseComplete={vi.fn()}
          onPetClick={vi.fn()}
          onDragStart={vi.fn()}
          onDragEnd={vi.fn()}
        />,
      );

      expect(screen.getByTestId("edge-pet-stage")).toBeTruthy();
      expect(screen.queryByTestId("edge-companion-stage")).toBeNull();
      expect(screen.queryByTestId("edge-notice-surface")).toBeNull();
    },
  );

  it("keeps top idle on the hanging stage and keeps its notice card clickable", () => {
    const onNoticeActivate = vi.fn();
    render(
      <FramePetStage
        action="idle-breathe"
        motion={builtInPackage.motions["idle-breathe"]}
        scale={1}
        petPackage={builtInPackage}
        edgeInteraction={{ profile: createEdgeProfile("top"), phase: "idle" }}
        edgeNotice={expandedTopMessageState}
        onEdgeNoticeActivate={onNoticeActivate}
        onEdgePhaseComplete={vi.fn()}
        onPetClick={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
      />,
    );

    expect(screen.getByTestId("edge-pet-stage")).toBeTruthy();
    expect(screen.queryByTestId("edge-companion-stage")).toBeNull();
    const surface = screen.getByTestId("edge-notice-surface");
    const button = screen.getByRole("button", { name: /今晚一起看电影吗/ });

    expect(surface.dataset.edgeSide).toBe("top");
    expect(surface.dataset.edgeNoticePlacement).toBe("inward-below");
    expect(surface.hasAttribute("data-desktop-interactive-region")).toBe(false);
    expect(button.hasAttribute("data-desktop-interactive-region")).toBe(true);

    fireEvent.pointerEnter(button);
    expect(onNoticeActivate).not.toHaveBeenCalled();

    fireEvent.click(button);
    expect(onNoticeActivate).toHaveBeenCalledWith(topMessage);
  });

  it("routes micro companion asset errors through the existing edge error callback", async () => {
    const onEdgeLoadError = vi.fn();
    render(
      <FramePetStage
        action="idle-breathe"
        motion={builtInPackage.motions["idle-breathe"]}
        scale={1}
        petPackage={builtInPackage}
        edgeInteraction={{ profile: createMicroEdgeProfile(), phase: "idle" }}
        onEdgePhaseComplete={vi.fn()}
        onEdgeLoadError={onEdgeLoadError}
        onPetClick={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
      />,
    );

    await act(async () => Promise.resolve());
    fireEvent.error(screen.getByTestId("edge-companion-frame"));
    expect(onEdgeLoadError).toHaveBeenCalledTimes(1);
  });

  it("registers only the current frame alpha foreground as the desktop hit region", async () => {
    frameAlphaBoundsMock.resolveFrameAlphaBounds.mockResolvedValueOnce({
      x: 192,
      y: 96,
      width: 384,
      height: 768,
      imageWidth: 768,
      imageHeight: 960,
    });

    const { stage } = renderStage();
    const hitRegion = await screen.findByTestId("pet-alpha-hit-region");

    expect(stage.hasAttribute("data-desktop-interactive-region")).toBe(false);
    expect(hitRegion.hasAttribute("data-desktop-interactive-region")).toBe(true);
    await waitFor(() => expect(hitRegion.style.left).toBe("64px"));
    expect(hitRegion.style.top).toBe("32px");
    expect(hitRegion.style.width).toBe("128px");
    expect(hitRegion.style.height).toBe("256px");
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

    fireEvent.pointerDown(stage, {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      screenX: 110,
      screenY: 120,
    });
    fireEvent.pointerUp(stage, {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      screenX: 110,
      screenY: 120,
    });
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

    fireEvent.pointerDown(stage, {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      screenX: 110,
      screenY: 120,
    });
    fireEvent.pointerLeave(stage, {
      pointerId: 1,
      clientX: 11,
      clientY: 11,
      screenX: 111,
      screenY: 121,
    });

    expect(props.onDragStart).not.toHaveBeenCalled();
    expect(props.onDragEnd).not.toHaveBeenCalled();
  });

  it("starts dragging only after pointer movement crosses the threshold", () => {
    const { props, stage } = renderStage();

    fireEvent.pointerDown(stage, {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      screenX: 110,
      screenY: 120,
    });
    fireEvent.pointerMove(stage, {
      pointerId: 1,
      clientX: 12,
      clientY: 10,
      screenX: 112,
      screenY: 120,
    });
    expect(props.onDragStart).not.toHaveBeenCalled();

    fireEvent.pointerMove(stage, {
      pointerId: 1,
      clientX: 18,
      clientY: 10,
      screenX: 118,
      screenY: 120,
    });
    expect(props.onDragStart).toHaveBeenCalledTimes(1);

    fireEvent.pointerMove(stage, {
      pointerId: 1,
      clientX: 22,
      clientY: 10,
      screenX: 122,
      screenY: 120,
    });
    expect(props.onDragStart).toHaveBeenCalledTimes(1);
  });

  it("reports incremental screen-coordinate drag deltas after crossing the threshold", () => {
    const { stage, props } = renderStage();

    fireEvent.pointerDown(stage, {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      screenX: 1010,
      screenY: 510,
    });
    fireEvent.pointerMove(stage, {
      pointerId: 1,
      clientX: 18,
      clientY: 10,
      screenX: 1018,
      screenY: 510,
    });
    fireEvent.pointerMove(stage, {
      pointerId: 1,
      clientX: 23,
      clientY: 7,
      screenX: 1023,
      screenY: 507,
    });

    expect(props.onDragStart).toHaveBeenCalledTimes(1);
    expect(props.onDragMove).toHaveBeenNthCalledWith(1, { x: 8, y: 0 });
    expect(props.onDragMove).toHaveBeenNthCalledWith(2, { x: 5, y: -3 });
  });

  it("keeps zero screen coordinates in the same coordinate space for drag deltas", () => {
    const { stage, props } = renderStage();

    fireEvent.pointerDown(stage, {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      screenX: -4,
      screenY: -2,
    });
    fireEvent.pointerMove(stage, {
      pointerId: 1,
      clientX: 18,
      clientY: 18,
      screenX: 0,
      screenY: 0,
    });
    fireEvent.pointerMove(stage, {
      pointerId: 1,
      clientX: 24,
      clientY: 18,
      screenX: 6,
      screenY: 0,
    });

    expect(props.onDragStart).toHaveBeenCalledTimes(1);
    expect(props.onDragMove).toHaveBeenNthCalledWith(1, { x: 4, y: 2 });
    expect(props.onDragMove).toHaveBeenNthCalledWith(2, { x: 6, y: 0 });
  });

  it("continues an alpha-surface drag across an edge-to-normal rerender until release", async () => {
    const profile = createMicroEdgeProfile();
    const onDragStart = vi.fn();
    const onDragMove = vi.fn();
    const onDragEnd = vi.fn();
    const { container, rerender } = render(
      <FramePetStage
        action="idle-breathe"
        motion={builtInPackage.motions["idle-breathe"]}
        scale={1}
        petPackage={builtInPackage}
        edgeInteraction={{ profile, phase: "idle" }}
        onEdgePhaseComplete={vi.fn()}
        onPetClick={vi.fn()}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
      />,
    );
    const stage = container.querySelector(".pet-frame-stage");

    if (!stage) {
      throw new Error("FramePetStage root missing");
    }

    const alphaHitRegion = await screen.findByTestId(
      "edge-companion-alpha-hit-region",
    );

    fireEvent.pointerDown(alphaHitRegion, {
      pointerId: 7,
      clientX: 10,
      clientY: 10,
      screenX: -8,
      screenY: 0,
    });
    fireEvent.pointerMove(alphaHitRegion, {
      pointerId: 7,
      clientX: 18,
      clientY: 10,
      screenX: 0,
      screenY: 0,
    });

    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onDragMove).toHaveBeenNthCalledWith(1, { x: 8, y: 0 });

    rerender(
      <FramePetStage
        action="drag"
        motion={builtInPackage.motions.drag}
        scale={1}
        petPackage={builtInPackage}
        edgeInteraction={null}
        onPetClick={vi.fn()}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
      />,
    );

    expect(container.querySelector(".pet-frame-stage")).toBe(stage);

    fireEvent.pointerMove(stage, {
      pointerId: 7,
      clientX: 23,
      clientY: 10,
      screenX: 5,
      screenY: 0,
    });
    fireEvent.pointerMove(stage, {
      pointerId: 7,
      clientX: 31,
      clientY: 8,
      screenX: 13,
      screenY: -2,
    });
    fireEvent.pointerUp(stage, {
      pointerId: 7,
      clientX: 31,
      clientY: 8,
      screenX: 13,
      screenY: -2,
    });
    fireEvent.pointerCancel(stage, {
      pointerId: 7,
      clientX: 31,
      clientY: 8,
      screenX: 13,
      screenY: -2,
    });

    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onDragMove).toHaveBeenNthCalledWith(2, { x: 5, y: 0 });
    expect(onDragMove).toHaveBeenNthCalledWith(3, { x: 8, y: -2 });
    expect(onDragMove).toHaveBeenCalledTimes(3);
    expect(onDragEnd).toHaveBeenCalledTimes(1);
  });

  it("stops reporting drag deltas after pointer cancel", () => {
    const { stage, props } = renderStage();

    fireEvent.pointerDown(stage, {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      screenX: 100,
      screenY: 100,
    });
    fireEvent.pointerMove(stage, {
      pointerId: 1,
      clientX: 18,
      clientY: 10,
      screenX: 108,
      screenY: 100,
    });
    fireEvent.pointerCancel(stage, {
      pointerId: 1,
      clientX: 18,
      clientY: 10,
      screenX: 108,
      screenY: 100,
    });
    fireEvent.pointerMove(stage, {
      pointerId: 1,
      clientX: 24,
      clientY: 10,
      screenX: 114,
      screenY: 100,
    });

    expect(props.onDragMove).toHaveBeenCalledTimes(1);
    expect(props.onDragEnd).toHaveBeenCalledTimes(1);
  });

  it("suppresses the click that follows a real drag", () => {
    const { props, stage } = renderStage();

    fireEvent.pointerDown(stage, {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      screenX: 110,
      screenY: 120,
    });
    fireEvent.pointerMove(stage, {
      pointerId: 1,
      clientX: 18,
      clientY: 10,
      screenX: 118,
      screenY: 120,
    });
    fireEvent.pointerUp(stage, {
      pointerId: 1,
      clientX: 18,
      clientY: 10,
      screenX: 118,
      screenY: 120,
    });
    fireEvent.click(stage);

    expect(props.onDragStart).toHaveBeenCalledTimes(1);
    expect(props.onDragEnd).toHaveBeenCalledTimes(1);
    expect(props.onPetClick).not.toHaveBeenCalled();
  });
});
