import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  EdgeNoticeState,
  EdgePresenceNotice,
  EdgeRemoteNotice,
} from "../pet/edgeNotice";
import { EdgeNoticeCard } from "./EdgeNoticeCard";

function createState(
  active: EdgePresenceNotice | EdgeRemoteNotice,
  presentation: EdgeNoticeState["presentation"],
): EdgeNoticeState {
  return {
    snapshot: {
      presence: active.kind === "presence" ? active : null,
      remote: active.kind === "presence" ? null : active,
    },
    active,
    presentation,
    expiresAt: presentation === "expanded" ? 1000 : null,
    presenceMarker: active.kind === "presence" ? active.tone : null,
    announcedPresenceRevision:
      active.kind === "presence" ? active.revision : null,
    announcedRemoteId: active.kind === "presence" ? null : active.id,
  };
}

const message: EdgeRemoteNotice = {
  kind: "message",
  id: "message-1",
  title: "今晚一起看电影吗？这是一条非常长的消息原文并且只能显示一行",
  detail: "收到一条新消息",
  iconUrl: "/assets/peer-avatar.png",
  unreadCount: 12,
};

const surprise: EdgeRemoteNotice = {
  kind: "surprise",
  id: "surprise-1",
  title: "外卖到了",
  detail: "取件码和暗号都是 7482，这是秘密码和配送详情",
  iconUrl: "/assets/private-delivery.png",
  unreadCount: 1,
};

describe("EdgeNoticeCard", () => {
  it.each(["expanded", "marker"] as const)(
    "places top %s notices inward below the hanging character",
    (presentation) => {
      render(
        <EdgeNoticeCard
          side="top"
          state={createState(message, presentation)}
        />,
      );

      const surface = screen.getByTestId("edge-notice-surface");
      expect(surface.dataset.edgeSide).toBe("top");
      expect(surface.dataset.edgeNoticePlacement).toBe("inward-below");
    },
  );

  it("anchors only top notice surfaces to the lower stage remainder", () => {
    const appCss = readFileSync(
      join(process.cwd(), "src/app/App.css"),
      "utf8",
    );
    const topRule = appCss.match(
      /\.edge-notice-surface\[data-edge-side="top"\]\s*\{([^}]*)\}/,
    )?.[1];

    expect(topRule).toBeDefined();
    expect(topRule).toMatch(/bottom:\s*10px;/);
    expect(topRule).toMatch(/left:\s*50%;/);
    expect(topRule).toMatch(/transform:\s*translateX\(-50%\);/);
    expect(topRule).not.toMatch(/(?:^|\s)top\s*:/);
  });

  it("renders expanded messages as concrete interactive buttons with image previews", () => {
    render(
      <EdgeNoticeCard
        side="left"
        state={createState(message, "expanded")}
      />,
    );

    const surface = screen.getByTestId("edge-notice-surface");
    const card = screen.getByRole("button", { name: /今晚一起看电影吗/ });
    const image = surface.querySelector("img");
    const title = screen.getByText(message.title);

    expect(surface.hasAttribute("data-desktop-interactive-region")).toBe(false);
    expect(card.getAttribute("data-edge-notice-kind")).toBe("message");
    expect(card.hasAttribute("data-desktop-interactive-region")).toBe(true);
    expect(image?.getAttribute("src")).toBe("/assets/peer-avatar.png");
    expect(title.tagName).toBe("STRONG");
    expect(title.classList).toContain("edge-notice-title--ellipsis");
  });

  it("caps message markers at 9+ and hover never activates the remote message", () => {
    const onPointerEnter = vi.fn();
    const onPointerLeave = vi.fn();
    const onActivate = vi.fn();
    render(
      <EdgeNoticeCard
        side="right"
        state={createState(message, "marker")}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onActivate={onActivate}
      />,
    );

    const marker = screen.getByRole("button", { name: /12 条未读消息/ });
    expect(marker.textContent).toBe("9+");
    expect(marker.hasAttribute("data-desktop-interactive-region")).toBe(true);

    fireEvent.pointerEnter(marker);
    fireEvent.pointerLeave(marker);
    expect(onPointerEnter).toHaveBeenCalledTimes(1);
    expect(onPointerLeave).toHaveBeenCalledTimes(1);
    expect(onActivate).not.toHaveBeenCalled();

    fireEvent.click(marker);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("uses the approved surprise image and privacy-safe copy regardless of payload secrets", () => {
    const { container } = render(
      <EdgeNoticeCard
        side="bottom"
        state={createState(surprise, "expanded")}
      />,
    );

    expect(screen.getByText("有一份心意正在等你")).toBeTruthy();
    expect(screen.getByText("点一下，让惊喜慢慢打开")).toBeTruthy();
    expect(container.textContent).not.toMatch(
      /外卖|取件码|暗号|秘密码|配送|7482/,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toContain(
      "heart-surprise.png",
    );
  });

  it("renders the surprise marker as an image control rather than a text glyph", () => {
    render(
      <EdgeNoticeCard
        side="bottom"
        state={createState(surprise, "marker")}
      />,
    );

    const marker = screen.getByRole("button", { name: /查看小心意/ });
    expect(marker.textContent).toBe("");
    expect(marker.querySelector("img")?.getAttribute("src")).toContain(
      "heart-surprise.png",
    );
    expect(marker.textContent).not.toMatch(/[♥❤]/);
  });
});
