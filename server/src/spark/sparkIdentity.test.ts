import { describe, expect, it } from "vitest";
import { maskSparkNickname } from "./sparkIdentity.js";

describe("maskSparkNickname", () => {
  it.each([
    ["雨", "*"],
    ["小雨", "小*"],
    ["Alice", "A*"],
    ["👩‍💻小雨", "👩‍💻*"],
  ])("masks %s by grapheme", (name, masked) => {
    expect(maskSparkNickname(name)).toBe(masked);
  });
});
