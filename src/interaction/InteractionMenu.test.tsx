import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { interactionOptions } from "../assets/builtInPetManifest";
import {
  InteractionMenu,
  type InteractionMenuSelection,
} from "./InteractionMenu";

describe("InteractionMenu", () => {
  it("renders nothing when closed", () => {
    render(
      <InteractionMenu
        open={false}
        x={10}
        y={20}
        options={interactionOptions}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByRole("menu", { name: "互动选项" })).toBeNull();
  });

  it("renders six function buttons with the approved labels", () => {
    render(
      <InteractionMenu
        open
        x={10}
        y={20}
        options={interactionOptions}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole("menu", { name: "互动选项" })).toBeTruthy();
    expect(
      screen.getAllByRole("menuitem").map((button) => button.textContent),
    ).toEqual([
      "双方天气",
      "发消息",
      "专注一下",
      "续火花",
      "外卖到啦",
      "我的状态",
    ]);
    expect(screen.queryByRole("menuitem", { name: "敲电脑" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "生气鼓脸" })).toBeNull();
  });

  it("renders PNG icons with exact radial positions and stagger variables", () => {
    render(
      <InteractionMenu
        open
        x={10}
        y={20}
        options={interactionOptions}
        onSelect={vi.fn()}
      />,
    );

    const buttons = screen.getAllByRole("menuitem");
    const expectedPositions = [
      ["-76px", "-88px"],
      ["0px", "-112px"],
      ["76px", "-88px"],
      ["-92px", "-12px"],
      ["92px", "-12px"],
      ["0px", "62px"],
    ];

    buttons.forEach((button, index) => {
      const style = button.getAttribute("style") ?? "";
      const img = button.querySelector(".pet-interaction-icon img");

      expect(button.classList.contains("pet-interaction-button")).toBe(true);
      expect(style).toContain(`--menu-x: ${expectedPositions[index]?.[0]}`);
      expect(style).toContain(`--menu-y: ${expectedPositions[index]?.[1]}`);
      expect(style).toContain(`--menu-delay: ${index * 24}ms`);
      expect(img?.getAttribute("src")).toBeTruthy();
    });

    expect(
      screen
        .getByRole("menuitem", { name: "双方天气" })
        .querySelector(".pet-interaction-icon--weather img")
        ?.getAttribute("src"),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("menuitem", { name: "专注一下" })
        .querySelector(".pet-interaction-icon--focus img")
        ?.getAttribute("src"),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("menuitem", { name: "外卖到啦" })
        .querySelector(".pet-interaction-icon--surprise img")
        ?.getAttribute("src"),
    ).toBeTruthy();
  });

  it("selects the weather surface via callback", () => {
    const onSelect = vi.fn();
    render(
      <InteractionMenu
        open
        x={10}
        y={20}
        options={interactionOptions}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "双方天气" }));

    expect(onSelect).toHaveBeenCalledWith("open-weather");
  });

  it("selects the message function via callback", () => {
    const onSelect = vi.fn();
    render(
      <InteractionMenu
        open
        x={10}
        y={20}
        options={interactionOptions}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "发消息" }));

    expect(onSelect).toHaveBeenCalledWith("send-message");
  });

  it("selects the local focus timer via callback", () => {
    const onSelect = vi.fn();
    render(
      <InteractionMenu
        open
        x={10}
        y={20}
        options={interactionOptions}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "专注一下" }));

    expect(onSelect).toHaveBeenCalledWith("open-focus-timer");
  });

  it("selects the surprise function via callback", () => {
    const onSelect = vi.fn();
    render(
      <InteractionMenu
        open
        x={10}
        y={20}
        options={interactionOptions}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "外卖到啦" }));

    expect(onSelect).toHaveBeenCalledWith("send-surprise");
  });

  it("renders stable spark loading and ready labels in a 34px icon slot", () => {
    const { rerender } = render(
      <InteractionMenu
        open
        x={10}
        y={20}
        options={interactionOptions}
        paired
        snapshot={null}
        sparkAvailability="loading"
        onSelect={vi.fn()}
      />,
    );
    const loading = screen.getByRole("menuitem", {
      name: "续火花，连续天数加载中",
    });
    expect(loading.textContent).toBe("--天");
    expect(loading.querySelector(".pet-interaction-icon")?.className).toContain(
      "pet-interaction-icon--spark",
    );

    rerender(
      <InteractionMenu
        open
        x={10}
        y={20}
        options={interactionOptions}
        paired
        snapshot={{
          version: 1,
          pairId: "pair_1",
          streakDays: 28,
          tier: "heartflame",
          calendarState: "qualified_today",
          lastQualifiedDate: "2026-08-19",
          timezone: "Asia/Shanghai",
          asOf: "2026-08-19T08:00:00.000Z",
          refreshAt: "2026-08-19T16:00:00.000Z",
        }}
        sparkAvailability="available"
        onSelect={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("menuitem", { name: "续火花，当前连续 28 天" }).textContent,
    ).toBe("28天");
  });

  it("retains known days while refreshing and marks failed data unavailable", () => {
    const knownSnapshot = {
      version: 1 as const,
      pairId: "pair_1",
      streakDays: 28,
      tier: "heartflame" as const,
      calendarState: "qualified_today" as const,
      lastQualifiedDate: "2026-08-19",
      timezone: "Asia/Shanghai" as const,
      asOf: "2026-08-19T08:00:00.000Z",
      refreshAt: "2026-08-19T16:00:00.000Z",
    };
    const { rerender } = render(
      <InteractionMenu
        open
        x={10}
        y={20}
        options={interactionOptions}
        paired
        snapshot={knownSnapshot}
        sparkAvailability="loading"
        onSelect={vi.fn()}
      />,
    );

    const refreshing = screen.getByRole("menuitem", {
      name: "续火花，当前连续 28 天，正在更新",
    });
    expect(refreshing.textContent).toBe("28天");
    expect(refreshing.getAttribute("data-spark-availability")).toBe("loading");
    expect(refreshing.classList).not.toContain(
      "pet-interaction-button--spark-unavailable",
    );

    rerender(
      <InteractionMenu
        open
        x={10}
        y={20}
        options={interactionOptions}
        paired
        snapshot={knownSnapshot}
        sparkAvailability="unavailable"
        onSelect={vi.fn()}
      />,
    );
    const unavailable = screen.getByRole("menuitem", {
      name: "续火花，上次连续 28 天，数据暂不可用",
    });
    expect(unavailable.textContent).toBe("28天");
    expect(unavailable.getAttribute("data-spark-availability")).toBe(
      "unavailable",
    );
    expect(unavailable.classList).toContain(
      "pet-interaction-button--spark-unavailable",
    );

    rerender(
      <InteractionMenu
        open
        x={10}
        y={20}
        options={interactionOptions}
        paired
        snapshot={null}
        sparkAvailability="unavailable"
        onSelect={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("menuitem", {
        name: "续火花，连续天数暂不可用",
      }).textContent,
    ).toBe("--天");
  });

  it.each([
    ["heartflame", false],
    ["blaze", true],
    ["everbright", true],
    ["stellar", true],
  ] as const)("uses breathing motion only for the high %s tier", (tier, expected) => {
    render(
      <InteractionMenu
        open
        x={10}
        y={20}
        options={interactionOptions}
        paired
        snapshot={{
          version: 1,
          pairId: "pair_1",
          streakDays: tier === "heartflame" ? 28 : tier === "blaze" ? 30 : tier === "everbright" ? 60 : 100,
          tier,
          calendarState: "qualified_today",
          lastQualifiedDate: "2026-08-19",
          timezone: "Asia/Shanghai",
          asOf: "2026-08-19T08:00:00.000Z",
          refreshAt: "2026-08-19T16:00:00.000Z",
        }}
        onSelect={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("menuitem", { name: /续火花/u })
        .querySelector(".spark-tier-icon--breathing") !== null,
    ).toBe(expected);
    expect(
      screen
        .getByRole("menuitem", { name: /续火花/u })
        .querySelector(
          '[data-desktop-non-geometric-animation="spark-tier-breathe"]',
        ) !== null,
    ).toBe(expected);
  });

  it("styles unavailable known days without changing the low-frequency breathing contract", () => {
    const css = readFileSync(
      join(process.cwd(), "src", "app", "app.css"),
      "utf8",
    );

    expect(css).toMatch(
      /\.pet-interaction-button--spark-unavailable[\s\S]*?opacity:/u,
    );
    expect(css).toContain(
      ".spark-tier-icon--breathing {\n  animation: spark-tier-breathe 3.6s ease-in-out infinite;",
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.spark-tier-icon--breathing \{[\s\S]*?animation: none;/u,
    );
  });

  it("exposes the surprise function as a public menu selection", () => {
    const selection: InteractionMenuSelection = "send-surprise";

    expect(selection).toBe("send-surprise");
  });

  it("selects the status function via callback", () => {
    const onSelect = vi.fn();
    render(
      <InteractionMenu
        open
        x={10}
        y={20}
        options={interactionOptions}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "我的状态" }));

    expect(onSelect).toHaveBeenCalledWith("open-status");
  });
});
