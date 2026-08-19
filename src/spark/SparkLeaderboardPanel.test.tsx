import { fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SparkLeaderboardResponseV1 } from "../../shared/sparkProtocol";
import { SparkLeaderboardPanel } from "./SparkLeaderboardPanel";

describe("SparkLeaderboardPanel", () => {
  it("renders the approved loaded hierarchy and one continuous remaining list", () => {
    renderPanel({ status: "ready", response: loadedResponse() });

    expect(screen.getByText("续火花")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "全服火花榜" })).toBeTruthy();
    expect(screen.getByText("看看哪一对把心意守得最久")).toBeTruthy();
    const podium = screen.getByTestId("spark-podium");
    expect(within(podium).getByText("林* & 周*")).toBeTruthy();
    expect(within(podium).getAllByText("1")).toHaveLength(2);
    expect(within(podium).getByText("3")).toBeTruthy();
    const list = screen.getByTestId("spark-ranking-list");
    expect(within(list).getByText("安* & 七*")).toBeTruthy();
    expect(within(list).getByText("城市待设置 · 广州")).toBeTruthy();
    expect(list.querySelectorAll(".spark-ranking-row")).toHaveLength(2);
    expect(screen.getByText("今天的火花已经续上")).toBeTruthy();

    const self = screen.getByTestId("spark-self-strip");
    expect(within(self).getByText("小雨 & 阿程")).toBeTruthy();
    expect(within(self).getByText("长沙 · 深圳")).toBeTruthy();
    expect(within(self).getByText("28天")).toBeTruthy();
    expect(within(self).getByText("27")).toBeTruthy();
    expect(within(self).getByText("心焰")).toBeTruthy();
  });

  it.each([
    ["qualified_today", "今天的火花已经续上"],
    ["pending_today", "今天等一次互动"],
    ["weekend_protected", "周末休息，火花会替你们守到周一"],
  ] as const)("renders %s copy without changing structure", (calendarState, copy) => {
    const response = loadedResponse();
    response.snapshot.calendarState = calendarState;
    renderPanel({ status: "ready", response });
    expect(screen.getByText(copy)).toBeTruthy();
    expect(screen.getByTestId("spark-self-strip")).toBeTruthy();
  });

  it("keeps stable loading structure and renders zero-day empty ranking", () => {
    const { rerender } = render(
      <SparkLeaderboardPanel {...baseProps()} state={{ status: "loading" }} />,
    );
    expect(screen.getByLabelText("火花榜加载中")).toBeTruthy();
    expect(screen.getByTestId("spark-panel").classList).toContain("spark-panel");

    const response = loadedResponse();
    response.top20 = [];
    response.snapshot = { ...response.snapshot, streakDays: 0, tier: "unlit" };
    response.self = { ...response.self, rank: null, streakDays: 0, tier: "unlit" };
    rerender(
      <SparkLeaderboardPanel
        {...baseProps()}
        state={{ status: "ready", response }}
      />,
    );
    expect(screen.getByText("还没有上榜火花")).toBeTruthy();
    expect(screen.getByText("暂未上榜").classList).toContain(
      "spark-self-rank-value--unranked",
    );
    expect(screen.getByText("未点亮")).toBeTruthy();
  });

  it("shows unpaired/auth recovery and unavailable retry commands", () => {
    const onOpenBinding = vi.fn();
    const onRetry = vi.fn();
    const { rerender } = render(
      <SparkLeaderboardPanel
        {...baseProps()}
        paired={false}
        state={{ status: "idle" }}
        onOpenBinding={onOpenBinding}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "进入绑定设置" }));
    expect(onOpenBinding).toHaveBeenCalledTimes(1);

    rerender(
      <SparkLeaderboardPanel
        {...baseProps()}
        state={{ status: "failed", code: "auth_failed" }}
        onOpenBinding={onOpenBinding}
      />,
    );
    expect(screen.getByText("绑定信息需要重新确认")).toBeTruthy();

    rerender(
      <SparkLeaderboardPanel
        {...baseProps()}
        state={{ status: "failed", code: "rate_limited" }}
        onRetry={onRetry}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("closes from a body-dispatched Escape or the Lucide close command", () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <SparkLeaderboardPanel
        {...baseProps()}
        state={{ status: "ready", response: loadedResponse() }}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "关闭火花榜" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    unmount();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("locks the exact panel geometry, palette, zero spacing, and transparent gutter input contract", () => {
    const css = readFileSync(
      join(process.cwd(), "src", "app", "app.css"),
      "utf8",
    );
    expect(css).toMatch(
      /\.spark-panel,\s*\.spark-panel \*\s*\{[^}]*letter-spacing:\s*0px;/s,
    );
    expect(css).toMatch(
      /\.spark-panel\s*\{[^}]*width:\s*424px;[^}]*height:\s*600px;[^}]*border:\s*1px solid #171717;[^}]*border-radius:\s*7px;[^}]*background:\s*#fffefa;/s,
    );
    expect(css).toMatch(
      /\.spark-composer-region\s*\{[^}]*width:\s*424px;[^}]*pointer-events:\s*auto;/s,
    );
    expect(css).toMatch(
      /\.spark-podium-entry:nth-child\(1\) \.spark-podium-flame\s*\{[^}]*width:\s*90px;[^}]*height:\s*98px;/s,
    );
    expect(css).toMatch(
      /\.spark-podium-entry:nth-child\(2\) \.spark-podium-flame\s*\{[^}]*width:\s*70px;[^}]*height:\s*80px;/s,
    );
    expect(css).toMatch(
      /\.spark-podium-entry:nth-child\(3\) \.spark-podium-flame\s*\{[^}]*width:\s*56px;[^}]*height:\s*68px;/s,
    );
    expect(css).toMatch(
      /\.composer-surface\s*\{[^}]*background:\s*transparent;[^}]*pointer-events:\s*none;/s,
    );
    expect(css).toMatch(
      /\.spark-command-state,\s*\.spark-loading-state\s*\{[^}]*min-height:\s*0;[^}]*margin:\s*0 12px 12px;/s,
    );
    expect(css).not.toMatch(
      /\.spark-command-state,\s*\.spark-loading-state\s*\{[^}]*height:\s*100%;/s,
    );
    expect(css).toContain("#d52820");
    expect(css).toContain("#dad6cf");
    expect(css).toContain("#f2f0eb");
    expect(css).toMatch(
      /\.spark-self-rank strong\.spark-self-rank-value--unranked\s*\{[^}]*font-size:\s*12px;[^}]*white-space:\s*nowrap;/s,
    );
  });
});

function baseProps() {
  return {
    paired: true,
    onClose: vi.fn(),
    onRetry: vi.fn(),
    onOpenBinding: vi.fn(),
  };
}

function renderPanel(state: Parameters<typeof SparkLeaderboardPanel>[0]["state"]) {
  return render(<SparkLeaderboardPanel {...baseProps()} state={state} />);
}

function loadedResponse(): SparkLeaderboardResponseV1 {
  const snapshot = {
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
  return {
    version: 1,
    snapshot,
    top20: [
      entry(1, ["林*", "周*"], ["上海", "杭州"], 128, "stellar"),
      entry(1, ["阿*", "小*"], ["长沙", "深圳"], 128, "stellar"),
      entry(3, ["星*", "云*"], ["北京", "成都"], 63, "everbright"),
      entry(4, ["安*", "七*"], ["武汉", "南京"], 52, "blaze"),
      entry(5, ["南*", "鹿*"], ["城市待设置", "广州"], 41, "blaze"),
    ],
    self: {
      rank: 27,
      displayNames: ["小雨", "阿程"],
      cities: ["长沙", "深圳"],
      streakDays: 28,
      tier: "heartflame",
    },
    asOf: snapshot.asOf,
  };
}

function entry(
  rank: number,
  displayNames: [string, string],
  cities: [string, string],
  streakDays: number,
  tier: SparkLeaderboardResponseV1["top20"][number]["tier"],
) {
  return { rank, displayNames, cities, streakDays, tier };
}
