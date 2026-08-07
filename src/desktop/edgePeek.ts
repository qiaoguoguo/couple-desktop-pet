import edgeLeftUrl from "../assets/pets/q-girl/edge-peek/left.png";
import edgeRightUrl from "../assets/pets/q-girl/edge-peek/right.png";
import edgeTopUrl from "../assets/pets/q-girl/edge-peek/top.png";
import edgeBottomUrl from "../assets/pets/q-girl/edge-peek/bottom.png";
import type { EdgeSide } from "../pet/edgeInteraction";

export type EdgePeekSide = EdgeSide;

export const builtInEdgePeekImages: Record<EdgePeekSide, string> = {
  left: edgeLeftUrl,
  right: edgeRightUrl,
  top: edgeTopUrl,
  bottom: edgeBottomUrl,
};

export function isEdgePeekSide(value: unknown): value is EdgePeekSide {
  return (
    value === "left" ||
    value === "right" ||
    value === "top" ||
    value === "bottom"
  );
}
