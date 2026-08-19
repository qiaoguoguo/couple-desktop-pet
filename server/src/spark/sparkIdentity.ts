const GRAPHEME_SEGMENTER = new Intl.Segmenter("zh-CN", {
  granularity: "grapheme",
});

export function maskSparkNickname(name: string): string {
  const graphemes = [...GRAPHEME_SEGMENTER.segment(name.trim())].map(
    (segment) => segment.segment,
  );
  return graphemes.length <= 1 ? "*" : `${graphemes[0]}*`;
}
