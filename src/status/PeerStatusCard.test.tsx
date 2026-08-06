import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PeerStatusCard } from "./PeerStatusCard";
import type { PeerStatusView } from "./peerStatusPresentation";

const slackingView: PeerStatusView = {
  variant: "slacking",
  title: "TA 摸鱼中",
  detail: "偷偷歇一会",
  iconText: "鱼",
};

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
});
