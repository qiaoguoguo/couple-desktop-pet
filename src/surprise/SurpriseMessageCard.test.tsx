import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SurpriseMessageContent } from "../../shared/syncProtocol";
import type { RemoteMessageCard } from "../sync/remoteMessageQueue";
import { SURPRISE_THEME_COPY } from "./surpriseThemes";
import { SurpriseMessageCard } from "./SurpriseMessageCard";

const forbiddenWords = [
  "外卖",
  "订单",
  "配送",
  "取件码",
  "取餐",
  "美团",
  "饿了么",
] as const;

const surpriseContent: SurpriseMessageContent = {
  kind: "surprise",
  version: 1,
  theme: "apology",
  secret: "A-1024",
  note: "是我不好。",
};

function surpriseMessage(
  stage: RemoteMessageCard["stage"] = "collapsed",
  content: SurpriseMessageContent = surpriseContent,
): RemoteMessageCard & { content: SurpriseMessageContent } {
  return {
    id: "surprise_1",
    fromDeviceId: "dev_b",
    text: "一份小心意在等你。惊喜暗号：A-1024。是我不好。",
    at: "2026-08-12T10:00:00.000Z",
    stage,
    content,
  };
}

describe("SurpriseMessageCard", () => {
  it("renders a collapsed card without leaking the secret or note anywhere in the DOM", () => {
    const { container } = render(
      <SurpriseMessageCard
        message={surpriseMessage("collapsed")}
        onReveal={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    const copy = SURPRISE_THEME_COPY.apology;

    expect(container.querySelector("img")?.getAttribute("src")).toContain(
      "heart-surprise",
    );
    expect(screen.getByText(copy.collapsedEyebrow)).toBeTruthy();
    expect(screen.getByText(copy.collapsedTitle)).toBeTruthy();
    expect(screen.getByText("轻轻点开看看")).toBeTruthy();
    expect(screen.queryByText("惊喜暗号")).toBeNull();
    expect(screen.queryByText("A-1024")).toBeNull();
    expect(screen.queryByText("是我不好。")).toBeNull();
    expect(screen.queryByRole("button", { name: "我收下啦" })).toBeNull();
    expect(container.innerHTML).not.toContain("A-1024");
    expect(container.innerHTML).not.toContain("是我不好。");
  });

  it("does not reveal on hover and reveals only on click", () => {
    const onReveal = vi.fn();
    render(
      <SurpriseMessageCard
        message={surpriseMessage("collapsed")}
        onReveal={onReveal}
        onDismiss={vi.fn()}
      />,
    );

    const cardButton = screen.getByRole("button", { name: /轻轻点开看看/ });

    fireEvent.pointerEnter(cardButton);
    expect(onReveal).not.toHaveBeenCalled();

    fireEvent.click(cardButton);
    expect(onReveal).toHaveBeenCalledWith("surprise_1");
  });

  it("renders the revealed copy, secret, optional note, and close action", () => {
    const onDismiss = vi.fn();
    render(
      <SurpriseMessageCard
        message={surpriseMessage("revealed")}
        onReveal={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    const copy = SURPRISE_THEME_COPY.apology;

    expect(screen.getByRole("status", { name: "小心意已展开" })).toBeTruthy();
    expect(screen.getByText(copy.revealedEyebrow)).toBeTruthy();
    expect(screen.getByText(copy.revealedTitle)).toBeTruthy();
    expect(screen.getByText("惊喜暗号")).toBeTruthy();
    expect(screen.getByText("A-1024")).toBeTruthy();
    expect(screen.getByText("是我不好。")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "我收下啦" }));

    expect(onDismiss).toHaveBeenCalledWith("surprise_1");
  });

  it("omits the note area when the surprise note is absent", () => {
    render(
      <SurpriseMessageCard
        message={surpriseMessage("revealed", {
          kind: "surprise",
          version: 1,
          theme: "general",
          secret: "7482",
        })}
        onReveal={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("7482")).toBeTruthy();
    expect(screen.queryByTestId("surprise-note")).toBeNull();
  });

  it("keeps receiver copy free of forbidden delivery wording", () => {
    const { container } = render(
      <SurpriseMessageCard
        message={surpriseMessage("revealed")}
        onReveal={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    for (const word of forbiddenWords) {
      expect(container.textContent).not.toContain(word);
    }
  });
});
