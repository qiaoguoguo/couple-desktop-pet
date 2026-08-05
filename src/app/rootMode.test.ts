import { describe, expect, it } from "vitest";
import { shouldRenderMessageComposer } from "./rootMode";

describe("shouldRenderMessageComposer", () => {
  it("uses the dedicated window label as a composer mode signal", () => {
    expect(
      shouldRenderMessageComposer({
        readWindowLabel: () => "message-composer",
        locationHash: "",
      }),
    ).toBe(true);
  });

  it("uses an explicit URL hash before reading the Tauri window label", () => {
    let readCount = 0;

    expect(
      shouldRenderMessageComposer({
        readWindowLabel: () => {
          readCount += 1;
          throw new Error("window metadata unavailable");
        },
        locationHash: "#message-composer",
      }),
    ).toBe(true);
    expect(readCount).toBe(0);
  });

  it("falls back to the main app when reading the window label fails without hash", () => {
    expect(
      shouldRenderMessageComposer({
        readWindowLabel: () => {
          throw new Error("window metadata unavailable");
        },
        locationHash: "",
      }),
    ).toBe(false);
  });

  it("keeps the main pet app for normal windows", () => {
    expect(
      shouldRenderMessageComposer({
        readWindowLabel: () => "main",
        locationHash: "",
      }),
    ).toBe(false);
  });
});
