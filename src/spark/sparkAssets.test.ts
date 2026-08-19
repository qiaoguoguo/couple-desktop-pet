import { describe, expect, it } from "vitest";
import type { SparkTier } from "../../shared/sparkProtocol";
import { getSparkAsset, getSparkTierLabel } from "./sparkAssets";

const tiers: SparkTier[] = [
  "unlit",
  "glimmer",
  "warm",
  "heartflame",
  "blaze",
  "everbright",
  "stellar",
];

describe("sparkAssets", () => {
  it("maps all seven tiers to distinct bundled PNGs", () => {
    const assets = tiers.map(getSparkAsset);
    expect(new Set(assets)).toHaveProperty("size", 7);
    assets.forEach((asset) => expect(asset).toMatch(/\.png(?:\?|$)/u));
  });

  it("provides stable Chinese labels for every tier", () => {
    expect(tiers.map(getSparkTierLabel)).toEqual([
      "未点亮",
      "微光",
      "暖焰",
      "心焰",
      "炽焰",
      "长明",
      "星火",
    ]);
  });
});
