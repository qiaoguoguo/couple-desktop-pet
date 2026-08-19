import type {
  EdgeCompanionFixedBox,
  EdgeCompanionVisualProfile,
  EdgeSide,
} from "../pet/edgeInteraction";

const Q_GIRL_PACKAGE_ID = "builtin:q-girl";

const sideIdleUrl = new URL(
  "./pets/q-girl/edge-companion/side/idle.png",
  import.meta.url,
).href;
const sideBlinkUrl = new URL(
  "./pets/q-girl/edge-companion/side/blink.png",
  import.meta.url,
).href;
const bottomIdleUrl = new URL(
  "./pets/q-girl/edge-companion/bottom/idle.png",
  import.meta.url,
).href;
const bottomBlinkUrl = new URL(
  "./pets/q-girl/edge-companion/bottom/blink.png",
  import.meta.url,
).href;

const rightSideContactX = 1133 / 1302;
const bottomContactX = 663.25 / 1314;
const bottomContactY = 1104 / 1207;

const sideFixedBox = {
  widthPx: 1302,
  heightPx: 1268,
  contactAnchor: { x: rightSideContactX, y: 0.5 },
  idleFrame: { xPx: 0, yPx: 0, widthPx: 1254, heightPx: 1254 },
  blinkFrame: { xPx: 0, yPx: 0, widthPx: 1254, heightPx: 1254 },
} as const satisfies EdgeCompanionFixedBox;

const bottomFixedBox = {
  widthPx: 1314,
  heightPx: 1207,
  contactAnchor: { x: bottomContactX, y: bottomContactY },
  idleFrame: { xPx: 11, yPx: 0, widthPx: 1303, heightPx: 1207 },
  blinkFrame: { xPx: 11, yPx: 0, widthPx: 1303, heightPx: 1207 },
} as const satisfies EdgeCompanionFixedBox;

const qGirlCompanionVisuals = {
  left: {
    side: "left",
    placement: "side",
    idleUrl: sideIdleUrl,
    blinkUrl: sideBlinkUrl,
    mirrorX: true,
    baseVisibleHeightPx: 34,
    minVisibleHeightPx: 30,
    maxVisibleHeightPx: 42,
    fixedBox: {
      ...sideFixedBox,
      contactAnchor: { x: 1 - rightSideContactX, y: 0.5 },
    },
  },
  right: {
    side: "right",
    placement: "side",
    idleUrl: sideIdleUrl,
    blinkUrl: sideBlinkUrl,
    mirrorX: false,
    baseVisibleHeightPx: 34,
    minVisibleHeightPx: 30,
    maxVisibleHeightPx: 42,
    fixedBox: sideFixedBox,
  },
  bottom: {
    side: "bottom",
    placement: "bottom",
    idleUrl: bottomIdleUrl,
    blinkUrl: bottomBlinkUrl,
    mirrorX: false,
    baseVisibleHeightPx: 34,
    minVisibleHeightPx: 30,
    maxVisibleHeightPx: 42,
    fixedBox: bottomFixedBox,
  },
} as const satisfies Record<
  EdgeCompanionVisualProfile["side"],
  EdgeCompanionVisualProfile
>;

export function getBuiltInEdgeCompanionVisual(
  packageId: string,
  side: EdgeSide,
): EdgeCompanionVisualProfile | null {
  if (packageId !== Q_GIRL_PACKAGE_ID || side === "top") {
    return null;
  }

  return qGirlCompanionVisuals[side];
}
