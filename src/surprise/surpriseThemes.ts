import {
  validateStructuredMessageContent,
  type SurpriseMessageContent,
  type SurpriseTheme,
} from "../../shared/syncProtocol";

export interface SurpriseThemeCopy {
  label: string;
  collapsedEyebrow: string;
  collapsedTitle: string;
  revealedEyebrow: string;
  revealedTitle: string;
  defaultNote: string;
}

export const SURPRISE_THEME_ORDER = [
  "cheer",
  "apology",
  "birthday",
  "festival",
  "miss",
  "general",
] as const satisfies readonly SurpriseTheme[];

export const SURPRISE_THEME_COPY: Readonly<
  Record<SurpriseTheme, Readonly<SurpriseThemeCopy>>
> = Object.freeze({
  cheer: Object.freeze({
    label: "哄你开心",
    collapsedEyebrow: "想让你开心一点",
    collapsedTitle: "给你藏了一点小甜",
    revealedEyebrow: "不开心先暂停一下",
    revealedTitle: "这份小惊喜负责哄你",
    defaultNote: "别不开心啦，这份小惊喜先替我抱抱你。",
  }),
  apology: Object.freeze({
    label: "想说抱歉",
    collapsedEyebrow: "有句话想认真说",
    collapsedTitle: "先收下这份小心意",
    revealedEyebrow: "我的道歉没有敷衍",
    revealedTitle: "对不起，也想好好哄你",
    defaultNote: "是我不好。等你愿意的时候，我想认真听你说。",
  }),
  birthday: Object.freeze({
    label: "生日惊喜",
    collapsedEyebrow: "今天的主角请注意",
    collapsedTitle: "生日惊喜正在敲门",
    revealedEyebrow: "只属于你的这一天",
    revealedTitle: "愿新一岁被爱意包围",
    defaultNote: "生日快乐。你的每一岁，我都想认真参与。",
  }),
  festival: Object.freeze({
    label: "节日心意",
    collapsedEyebrow: "节日的小心意抵达",
    collapsedTitle: "这一刻想和你一起过",
    revealedEyebrow: "节日快乐",
    revealedTitle: "把今天的仪式感送给你",
    defaultNote: "不管离得多远，节日的心意都不能缺席。",
  }),
  miss: Object.freeze({
    label: "只是想你",
    collapsedEyebrow: "想你的时候做了件小事",
    collapsedTitle: "有份心意正在等你",
    revealedEyebrow: "没有特别的理由",
    revealedTitle: "只是刚好很想你",
    defaultNote: "看到它的时候，就当我偷偷抱了你一下。",
  }),
  general: Object.freeze({
    label: "小小惊喜",
    collapsedEyebrow: "一份心意悄悄抵达",
    collapsedTitle: "有个小惊喜在等你",
    revealedEyebrow: "只为你准备",
    revealedTitle: "请收下这一刻的心意",
    defaultNote: "没有特别的日子，也可以有一份小惊喜。",
  }),
});

export function getSurpriseThemeCopy(theme: SurpriseTheme): SurpriseThemeCopy {
  return SURPRISE_THEME_COPY[theme];
}

export function buildSurpriseFallbackText(
  content: SurpriseMessageContent,
): string {
  const secret = content.secret.trim();
  const note = content.note?.trim();

  return `一份小心意在等你。惊喜暗号：${secret}。${note ? note : ""}`;
}

const surpriseFallbackPrefix = "一份小心意在等你。惊喜暗号：";

export function recoverSurpriseContentFromFallbackText(
  text: string,
): SurpriseMessageContent | null {
  if (!text.startsWith(surpriseFallbackPrefix)) {
    return null;
  }

  const payload = text.slice(surpriseFallbackPrefix.length);
  const secretTerminatorIndex = payload.indexOf("。");
  if (secretTerminatorIndex < 0) {
    return null;
  }

  const secret = payload.slice(0, secretTerminatorIndex);
  const note = payload.slice(secretTerminatorIndex + 1);
  const theme =
    SURPRISE_THEME_ORDER.find(
      (candidate) => SURPRISE_THEME_COPY[candidate].defaultNote === note,
    ) ?? "general";
  const validation = validateStructuredMessageContent({
    kind: "surprise",
    version: 1,
    theme,
    secret,
    ...(note ? { note } : {}),
  });

  if (
    !validation.ok ||
    buildSurpriseFallbackText(validation.content) !== text
  ) {
    return null;
  }

  return validation.content;
}
