import edgeLeftUrl from "../assets/pets/q-girl/edge-peek/left.png";
import edgeRightUrl from "../assets/pets/q-girl/edge-peek/right.png";
import edgeTopUrl from "../assets/pets/q-girl/edge-peek/top.png";

export type EdgePeekSide = "left" | "right" | "top";

export const builtInEdgePeekImages: Record<EdgePeekSide, string> = {
  left: edgeLeftUrl,
  right: edgeRightUrl,
  top: edgeTopUrl,
};

export function isEdgePeekSide(value: unknown): value is EdgePeekSide {
  return value === "left" || value === "right" || value === "top";
}
