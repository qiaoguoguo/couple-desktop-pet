import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PeerStatusCard } from "./PeerStatusCard";
import type { PeerStatusView } from "./peerStatusPresentation";

const slackingView: PeerStatusView = {
  variant: "slacking",
  title: "TA 摸鱼中",
  detail: "偷偷歇一会",
  icon: {
    src: "/status-icons/slacking.svg",
    alt: "摸鱼中",
  },
};
const onlineView: PeerStatusView = {
  variant: "online",
  title: "TA 在线",
  detail: "正在陪你",
  icon: {
    src: "/status-icons/online.svg",
    alt: "在线",
  },
};
const dazingView: PeerStatusView = {
  variant: "dazing",
  title: "TA 发呆中",
  detail: "灵魂出走啦",
  icon: {
    src: "/status-icons/dazing.svg",
    alt: "发呆中",
  },
};
const offlineView: PeerStatusView = {
  variant: "offline",
  title: "TA 离线",
  detail: "等TA回来",
  icon: {
    src: "/status-icons/offline.svg",
    alt: "离线",
  },
};

function readAppCss() {
  return readFileSync(join(process.cwd(), "src/app/app.css"), "utf8");
}

describe("PeerStatusCard", () => {
  it("renders a low-attention foot status tag with one-line status copy", () => {
    render(<PeerStatusCard view={slackingView} imageCandidates={["peer.png"]} />);

    const card = screen.getByLabelText("对方状态");
    expect(card.tagName).toBe("ASIDE");
    expect(card.getAttribute("data-status-variant")).toBe("slacking");
    expect(card.hasAttribute("data-desktop-interactive-region")).toBe(false);
    expect(screen.getByText("TA摸鱼中")).toBeTruthy();
    expect(screen.queryByText("偷偷歇一会")).toBeNull();
    expect(card.className).toContain("peer-presence-tag");
    expect(card.className).not.toContain("peer-presence-bubble");
    expect(card.className).not.toContain("peer-status-card");

    const surface = card.querySelector(".peer-presence-surface");
    expect(surface?.tagName).toBe("IMG");
    expect(surface?.getAttribute("src")).toMatch(/presence-tag-surface\.png$/);
    expect(surface?.getAttribute("alt")).toBe("");

    const iconSlot = card.querySelector(".peer-status-icon");
    const iconImage = iconSlot?.querySelector("img");
    expect(iconSlot?.textContent).toBe("");
    expect(iconImage?.getAttribute("src")).toBe("/status-icons/slacking.svg");
    expect(iconImage?.getAttribute("alt")).toBe("");

    const image = screen.getByRole("img", { name: "对方头像" });
    expect(image.getAttribute("src")).toBe("peer.png");
    expect(image.getAttribute("width")).toBe("12");
    expect(image.getAttribute("height")).toBe("16");
  });

  it("renders the reference avatar-dot-icon-label sequence for the offline state", () => {
    render(<PeerStatusCard view={offlineView} />);

    const card = screen.getByLabelText("对方状态");
    const content = card.querySelector(".peer-status-content");
    const sequence = Array.from(card.children).map((child) => child.className);

    expect(sequence).toEqual([
      "peer-presence-surface",
      "peer-status-avatar",
      "peer-status-content",
    ]);
    expect(
      Array.from(content?.children ?? []).map((child) => child.className),
    ).toEqual([
      "peer-status-dot",
      "peer-status-icon",
      "peer-status-label",
    ]);
    expect(screen.getByText("TA离线")).toBeTruthy();
    expect(
      card.querySelector(".peer-status-icon img")?.getAttribute("src"),
    ).toBe("/status-icons/offline.svg");
  });

  it("falls back through image candidates before showing the generated default peer avatar", () => {
    render(
      <PeerStatusCard
        view={slackingView}
        imageCandidates={[null, "first.png", "second.png"]}
      />,
    );

    const firstImage = screen.getByRole("img", { name: "对方头像" });
    expect(firstImage.getAttribute("src")).toBe("first.png");

    fireEvent.error(firstImage);
    const secondImage = screen.getByRole("img", { name: "对方头像" });
    expect(secondImage.getAttribute("src")).toBe("second.png");

    fireEvent.error(secondImage);
    const generatedFallback = screen.getByRole("img", { name: "对方头像" });
    expect(generatedFallback.getAttribute("src")).toMatch(/peer-avatar\.png$/);
    expect(screen.queryByText("TA")).toBeNull();
  });

  it("does not reset to a failed image when rerendered with an equivalent candidate array", () => {
    const { rerender } = render(
      <PeerStatusCard
        view={slackingView}
        imageCandidates={["failed.png", "good.png"]}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "对方头像" }));
    expect(screen.getByRole("img", { name: "对方头像" }).getAttribute("src")).toBe(
      "good.png",
    );

    rerender(
      <PeerStatusCard
        view={slackingView}
        imageCandidates={["failed.png", "good.png"]}
      />,
    );

    expect(screen.getByRole("img", { name: "对方头像" }).getAttribute("src")).toBe(
      "good.png",
    );
  });

  it("deduplicates image candidates before falling back", () => {
    render(
      <PeerStatusCard
        view={slackingView}
        imageCandidates={["failed.png", "failed.png", "good.png"]}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "对方头像" }));

    expect(screen.getByRole("img", { name: "对方头像" }).getAttribute("src")).toBe(
      "good.png",
    );
  });

  it("resets fallback state when the candidate content changes", () => {
    const { rerender } = render(
      <PeerStatusCard
        view={slackingView}
        imageCandidates={["failed.png", "good.png"]}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "对方头像" }));
    expect(screen.getByRole("img", { name: "对方头像" }).getAttribute("src")).toBe(
      "good.png",
    );

    rerender(
      <PeerStatusCard view={slackingView} imageCandidates={["fresh.png"]} />,
    );

    expect(screen.getByRole("img", { name: "对方头像" }).getAttribute("src")).toBe(
      "fresh.png",
    );
  });

  it("remounts only the copy content when the status variant changes", () => {
    const { rerender } = render(
      <PeerStatusCard
        view={onlineView}
        imageCandidates={["failed.png", "good.png"]}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "对方头像" }));
    const originalContent = document.querySelector(".peer-status-content");

    expect(screen.getByRole("img", { name: "对方头像" }).getAttribute("src")).toBe(
      "good.png",
    );
    expect(originalContent).toBeTruthy();

    rerender(
      <PeerStatusCard
        view={dazingView}
        imageCandidates={["failed.png", "good.png"]}
      />,
    );

    expect(screen.getByRole("img", { name: "对方头像" }).getAttribute("src")).toBe(
      "good.png",
    );
    expect(document.querySelector(".peer-status-content")).not.toBe(
      originalContent,
    );
  });

  it("defines semantic status colors and reduced-motion-safe transition CSS", () => {
    const css = readAppCss();

    expect(css).toContain('.peer-presence-tag[data-status-variant="online"]');
    expect(css).toContain("--peer-status-dot: #e8645a;");
    expect(css).toContain("--peer-status-dot: #34bfa3;");
    expect(css).toContain("--peer-status-dot: #a78bfa;");
    expect(css).toContain("--peer-status-dot: #d99a2b;");
    expect(css).toContain("--peer-status-dot: #868c94;");
    expect(css).toContain("--peer-status-dot: #8b929a;");
    expect(css).toContain(".peer-status-content");
    expect(css).toContain("animation: peer-status-content-settle 220ms");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("anchors the presence bubble to the pet scale variable", () => {
    const css = readAppCss();

    expect(css).toContain(".pet-frame-stage {");
    expect(css).toContain("transform: scale(var(--pet-scale))");
    expect(css).toContain(".peer-presence-tag {");
    expect(css).toContain("position: absolute");
    expect(css).toContain("transform-origin: center bottom");
  });

  it("keeps the reference footnote tag proportions inside the maximum pet scale", () => {
    const css = readAppCss();

    expect(css).toContain(".peer-presence-tag {");
    expect(css).toContain("right: 20px;");
    expect(css).toContain("bottom: 10px;");
    expect(css).toContain("width: 96px;");
    expect(css).toContain("height: 24px;");
    expect(css).toContain("height: calc(100% + 4px);");
    expect(css).toContain("grid-template-columns: 4px 15px minmax(0, 1fr);");
    expect(css).toContain("gap: 4px;");
    expect(css).toContain("font-weight: 500;");
    expect(css).toContain("color: #b9bdc4;");
  });
});
