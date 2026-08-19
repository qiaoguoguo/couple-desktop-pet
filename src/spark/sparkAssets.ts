import type { SparkTier } from "../../shared/sparkProtocol";
import blazeUrl from "../assets/ui/spark/blaze.png";
import everbrightUrl from "../assets/ui/spark/everbright.png";
import glimmerUrl from "../assets/ui/spark/glimmer.png";
import heartflameUrl from "../assets/ui/spark/heartflame.png";
import stellarUrl from "../assets/ui/spark/stellar.png";
import unlitUrl from "../assets/ui/spark/unlit.png";
import warmUrl from "../assets/ui/spark/warm.png";

const sparkAssets: Record<SparkTier, string> = {
  unlit: unlitUrl,
  glimmer: glimmerUrl,
  warm: warmUrl,
  heartflame: heartflameUrl,
  blaze: blazeUrl,
  everbright: everbrightUrl,
  stellar: stellarUrl,
};

const sparkTierLabels: Record<SparkTier, string> = {
  unlit: "未点亮",
  glimmer: "微光",
  warm: "暖焰",
  heartflame: "心焰",
  blaze: "炽焰",
  everbright: "长明",
  stellar: "星火",
};

export function getSparkAsset(tier: SparkTier): string {
  return sparkAssets[tier];
}

export function getSparkTierLabel(tier: SparkTier): string {
  return sparkTierLabels[tier];
}
