import type { EdgeSide } from "../pet/edgeInteraction";

export type EdgePeekSide = EdgeSide;

export function isEdgePeekSide(value: unknown): value is EdgePeekSide {
  return (
    value === "left" ||
    value === "right" ||
    value === "top" ||
    value === "bottom"
  );
}
