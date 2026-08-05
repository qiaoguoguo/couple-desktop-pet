import { describe, expect, it } from "vitest";
import { shouldRenderMessageComposer } from "./rootMode";

describe("shouldRenderMessageComposer", () => {
  it("uses the dedicated window label as a composer mode signal", () => {
    expect(
      shouldRenderMessageComposer({
        windowLabel: "message-composer",
        locationSearch: "",
        locationHash: "",
      }),
    ).toBe(true);
  });

  it("uses an explicit URL query as a composer mode signal", () => {
    expect(
      shouldRenderMessageComposer({
        windowLabel: "main",
        locationSearch: "?window=message-composer",
        locationHash: "",
      }),
    ).toBe(true);
  });

  it("uses an explicit URL hash as a composer mode signal", () => {
    expect(
      shouldRenderMessageComposer({
        windowLabel: "main",
        locationSearch: "",
        locationHash: "#message-composer",
      }),
    ).toBe(true);
  });

  it("keeps the main pet app for normal windows", () => {
    expect(
      shouldRenderMessageComposer({
        windowLabel: "main",
        locationSearch: "",
        locationHash: "",
      }),
    ).toBe(false);
  });
});
