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
  iconText: "鱼",
};
const onlineView: PeerStatusView = {
  variant: "online",
  title: "TA 在线",
  detail: "正在陪你",
  iconText: "心",
};
const dazingView: PeerStatusView = {
  variant: "dazing",
  title: "TA 发呆中",
  detail: "灵魂出走啦",
  iconText: "云",
};

function readAppCss() {
  return readFileSync(join(process.cwd(), "src/app/app.css"), "utf8");
}

describe("PeerStatusCard", () => {
  it("renders a compact non-interactive status card with the view copy", () => {
    render(<PeerStatusCard view={slackingView} imageCandidates={["peer.png"]} />);

    const card = screen.getByLabelText("对方状态");
    expect(card.tagName).toBe("ASIDE");
    expect(card.getAttribute("data-status-variant")).toBe("slacking");
    expect(screen.getByText("TA 摸鱼中")).toBeTruthy();
    expect(screen.getByText("偷偷歇一会")).toBeTruthy();
    expect(screen.getByText("鱼")).toBeTruthy();
    expect(card.className).toContain("peer-status-card");

    const image = screen.getByRole("img", { name: "对方头像" });
    expect(image.getAttribute("src")).toBe("peer.png");
    expect(image.getAttribute("width")).toBe("28");
    expect(image.getAttribute("height")).toBe("28");
  });

  it("falls back through image candidates before showing a text placeholder", () => {
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
    expect(screen.queryByRole("img", { name: "对方头像" })).toBeNull();
    expect(screen.getByText("TA")).toBeTruthy();
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

    expect(css).toContain('.peer-status-card[data-status-variant="online"]');
    expect(css).toContain("--peer-status-dot: #e8645a;");
    expect(css).toContain("--peer-status-dot: #34bfa3;");
    expect(css).toContain("--peer-status-dot: #a78bfa;");
    expect(css).toContain("--peer-status-dot: #d99a2b;");
    expect(css).toContain("--peer-status-dot: #6f8191;");
    expect(css).toContain("--peer-status-dot: #8b929a;");
    expect(css).toContain(".peer-status-content");
    expect(css).toContain("animation: peer-status-content-settle 220ms");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
