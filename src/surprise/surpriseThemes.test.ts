import { describe, expect, it } from "vitest";
import type { SurpriseTheme } from "../../shared/syncProtocol";
import * as surpriseThemes from "./surpriseThemes";

const {
  buildSurpriseFallbackText,
  getSurpriseThemeCopy,
  recoverSurpriseContentFromFallbackText,
  SURPRISE_THEME_COPY,
  SURPRISE_THEME_ORDER,
} = surpriseThemes;

describe("surprise theme copy", () => {
  const expectedRows: Array<{
    theme: SurpriseTheme;
    label: string;
    collapsedEyebrow: string;
    collapsedTitle: string;
    revealedEyebrow: string;
    revealedTitle: string;
    defaultNote: string;
  }> = [
    {
      theme: "cheer",
      label: "哄你开心",
      collapsedEyebrow: "想让你开心一点",
      collapsedTitle: "给你藏了一点小甜",
      revealedEyebrow: "不开心先暂停一下",
      revealedTitle: "这份小惊喜负责哄你",
      defaultNote: "别不开心啦，这份小惊喜先替我抱抱你。",
    },
    {
      theme: "apology",
      label: "想说抱歉",
      collapsedEyebrow: "有句话想认真说",
      collapsedTitle: "先收下这份小心意",
      revealedEyebrow: "我的道歉没有敷衍",
      revealedTitle: "对不起，也想好好哄你",
      defaultNote: "是我不好。等你愿意的时候，我想认真听你说。",
    },
    {
      theme: "birthday",
      label: "生日惊喜",
      collapsedEyebrow: "今天的主角请注意",
      collapsedTitle: "生日惊喜正在敲门",
      revealedEyebrow: "只属于你的这一天",
      revealedTitle: "愿新一岁被爱意包围",
      defaultNote: "生日快乐。你的每一岁，我都想认真参与。",
    },
    {
      theme: "festival",
      label: "节日心意",
      collapsedEyebrow: "节日的小心意抵达",
      collapsedTitle: "这一刻想和你一起过",
      revealedEyebrow: "节日快乐",
      revealedTitle: "把今天的仪式感送给你",
      defaultNote: "不管离得多远，节日的心意都不能缺席。",
    },
    {
      theme: "miss",
      label: "只是想你",
      collapsedEyebrow: "想你的时候做了件小事",
      collapsedTitle: "有份心意正在等你",
      revealedEyebrow: "没有特别的理由",
      revealedTitle: "只是刚好很想你",
      defaultNote: "看到它的时候，就当我偷偷抱了你一下。",
    },
    {
      theme: "general",
      label: "小小惊喜",
      collapsedEyebrow: "一份心意悄悄抵达",
      collapsedTitle: "有个小惊喜在等你",
      revealedEyebrow: "只为你准备",
      revealedTitle: "请收下这一刻的心意",
      defaultNote: "没有特别的日子，也可以有一份小惊喜。",
    },
  ];

  it("keeps the approved theme order", () => {
    expect(SURPRISE_THEME_ORDER).toEqual([
      "cheer",
      "apology",
      "birthday",
      "festival",
      "miss",
      "general",
    ]);
  });

  it.each(expectedRows)("uses the approved copy for $theme", (row) => {
    expect(SURPRISE_THEME_COPY[row.theme]).toEqual({
      label: row.label,
      collapsedEyebrow: row.collapsedEyebrow,
      collapsedTitle: row.collapsedTitle,
      revealedEyebrow: row.revealedEyebrow,
      revealedTitle: row.revealedTitle,
      defaultNote: row.defaultNote,
    });
    expect(getSurpriseThemeCopy(row.theme)).toBe(SURPRISE_THEME_COPY[row.theme]);
  });

  it("does not use receiver-side logistics or platform wording", () => {
    const forbidden = ["外卖", "订单", "配送", "取件码", "取餐", "美团", "饿了么"];
    for (const copy of Object.values(SURPRISE_THEME_COPY)) {
      for (const word of forbidden) {
        expect(JSON.stringify(copy)).not.toContain(word);
      }
    }
  });
});

describe("buildSurpriseFallbackText", () => {
  it("includes the trimmed secret and note", () => {
    expect(
      buildSurpriseFallbackText({
        kind: "surprise",
        version: 1,
        theme: "apology",
        secret: "  7482  ",
        note: "  是我不好。  ",
      }),
    ).toBe("一份小心意在等你。惊喜暗号：7482。是我不好。");
  });

  it("omits the trailing note when absent or blank", () => {
    expect(
      buildSurpriseFallbackText({
        kind: "surprise",
        version: 1,
        theme: "general",
        secret: "A-1024",
      }),
    ).toBe("一份小心意在等你。惊喜暗号：A-1024。");

    expect(
      buildSurpriseFallbackText({
        kind: "surprise",
        version: 1,
        theme: "general",
        secret: "7482",
        note: "  ",
      }),
    ).toBe("一份小心意在等你。惊喜暗号：7482。");
  });
});

describe("recoverSurpriseContentFromFallbackText", () => {
  it("recovers the deployed Relay fallback payload as a general surprise", () => {
    expect(
      recoverSurpriseContentFromFallbackText(
        "一份小心意在等你。惊喜暗号：A562。没有特别的日子，也可以有一份小惊喜。",
      ),
    ).toEqual({
      kind: "surprise",
      version: 1,
      theme: "general",
      secret: "A562",
      note: "没有特别的日子，也可以有一份小惊喜。",
    });
  });

  it("infers an exact theme default and otherwise falls back to general", () => {
    expect(
      recoverSurpriseContentFromFallbackText(
        "一份小心意在等你。惊喜暗号：7482。是我不好。等你愿意的时候，我想认真听你说。",
      ),
    ).toEqual({
      kind: "surprise",
      version: 1,
      theme: "apology",
      secret: "7482",
      note: "是我不好。等你愿意的时候，我想认真听你说。",
    });

    expect(
      recoverSurpriseContentFromFallbackText(
        "一份小心意在等你。惊喜暗号：A-1024。自己写的一句话。",
      ),
    ).toEqual({
      kind: "surprise",
      version: 1,
      theme: "general",
      secret: "A-1024",
      note: "自己写的一句话。",
    });
  });

  it("omits an empty note", () => {
    expect(
      recoverSurpriseContentFromFallbackText(
        "一份小心意在等你。惊喜暗号：A-1024。",
      ),
    ).toEqual({
      kind: "surprise",
      version: 1,
      theme: "general",
      secret: "A-1024",
    });
  });

  it.each([
    ["ordinary text", "今晚早点休息"],
    [
      "altered prefix",
      "一份礼物在等你。惊喜暗号：7482。没有特别的日子，也可以有一份小惊喜。",
    ],
    ["missing secret", "一份小心意在等你。惊喜暗号：。"],
    ["whitespace secret", "一份小心意在等你。惊喜暗号： 7482 。"],
    ["invalid secret", "一份小心意在等你。惊喜暗号：A_1024。"],
    ["overlong secret", `一份小心意在等你。惊喜暗号：${"A".repeat(25)}。`],
    ["overlong note", `一份小心意在等你。惊喜暗号：7482。${"心".repeat(121)}`],
  ])("rejects %s", (_caseName, text) => {
    expect(recoverSurpriseContentFromFallbackText(text)).toBeNull();
  });
});
