import { describe, expect, it } from "vitest";
import { getBuiltInEdgeCompanionVisual } from "./builtInEdgeCompanion";

describe("getBuiltInEdgeCompanionVisual", () => {
  it("registers static visuals only for built-in left, right, and bottom", () => {
    const left = getBuiltInEdgeCompanionVisual("builtin:q-girl", "left");
    const right = getBuiltInEdgeCompanionVisual("builtin:q-girl", "right");
    const bottom = getBuiltInEdgeCompanionVisual("builtin:q-girl", "bottom");

    expect(left).toMatchObject({ placement: "side", mirrorX: true });
    expect(right).toMatchObject({ placement: "side", mirrorX: false });
    expect(bottom).toMatchObject({ placement: "bottom", mirrorX: false });
    expect(getBuiltInEdgeCompanionVisual("builtin:q-girl", "top")).toBeNull();
    expect(getBuiltInEdgeCompanionVisual("imported:any", "right")).toBeNull();
  });

  it("keeps only idle resources in the public companion contract", () => {
    for (const side of ["left", "right", "bottom"] as const) {
      const profile = getBuiltInEdgeCompanionVisual("builtin:q-girl", side);

      expect(profile).not.toBeNull();
      expect(profile).not.toHaveProperty("blinkUrl");
      expect(profile?.fixedBox).not.toHaveProperty("blinkFrame");
      expect(profile?.idleUrl).toContain(
        `/q-girl/edge-companion/${side === "bottom" ? "bottom" : "side"}/idle.png`,
      );
    }
  });

  it("preserves the static render boxes, anchors, and visible-height limits", () => {
    const left = getBuiltInEdgeCompanionVisual("builtin:q-girl", "left");
    const right = getBuiltInEdgeCompanionVisual("builtin:q-girl", "right");
    const bottom = getBuiltInEdgeCompanionVisual("builtin:q-girl", "bottom");

    if (!left || !right || !bottom) {
      throw new Error("Missing built-in edge companion visuals");
    }

    for (const profile of [left, right, bottom]) {
      expect(profile).toMatchObject({
        baseVisibleHeightPx: 34,
        minVisibleHeightPx: 30,
        maxVisibleHeightPx: 42,
      });
    }

    expect(left.fixedBox).toMatchObject({
      widthPx: 1302,
      heightPx: 1268,
      idleFrame: { xPx: 0, yPx: 0, widthPx: 1254, heightPx: 1254 },
    });
    expect(right.fixedBox).toMatchObject({
      widthPx: left.fixedBox.widthPx,
      heightPx: left.fixedBox.heightPx,
      idleFrame: left.fixedBox.idleFrame,
    });
    expect(left.fixedBox.contactAnchor.x).toBeCloseTo(0.1298, 4);
    expect(right.fixedBox.contactAnchor.x).toBeCloseTo(0.8702, 4);

    expect(bottom.fixedBox).toMatchObject({
      widthPx: 1314,
      heightPx: 1207,
      idleFrame: { xPx: 11, yPx: 0, widthPx: 1303, heightPx: 1207 },
    });
    expect(bottom.fixedBox.contactAnchor.x).toBeCloseTo(0.5048, 4);
    expect(bottom.fixedBox.contactAnchor.y).toBeCloseTo(0.9147, 4);
  });
});
