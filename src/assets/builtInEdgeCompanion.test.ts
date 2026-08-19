import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { getBuiltInEdgeCompanionVisual } from "./builtInEdgeCompanion";

interface DecodedPng {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  rgba: Uint8Array;
}

interface PixelBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const companionAssets = {
  side: {
    idle: "src/assets/pets/q-girl/edge-companion/side/idle.png",
    blink: "src/assets/pets/q-girl/edge-companion/side/blink.png",
    eyeBounds: [
      { minX: 380, minY: 630, maxX: 640, maxY: 910 },
      { minX: 710, minY: 500, maxX: 990, maxY: 790 },
    ],
  },
  bottom: {
    idle: "src/assets/pets/q-girl/edge-companion/bottom/idle.png",
    blink: "src/assets/pets/q-girl/edge-companion/bottom/blink.png",
    eyeBounds: [
      { minX: 300, minY: 650, maxX: 610, maxY: 930 },
      { minX: 690, minY: 650, maxX: 1000, maxY: 930 },
    ],
  },
} as const;

describe("getBuiltInEdgeCompanionVisual", () => {
  it("registers micro visuals only for built-in left, right, and bottom", () => {
    expect(getBuiltInEdgeCompanionVisual("builtin:q-girl", "left")?.mirrorX).toBe(
      true,
    );
    expect(getBuiltInEdgeCompanionVisual("builtin:q-girl", "right")?.mirrorX).toBe(
      false,
    );
    expect(
      getBuiltInEdgeCompanionVisual("builtin:q-girl", "bottom")?.placement,
    ).toBe("bottom");
    expect(getBuiltInEdgeCompanionVisual("builtin:q-girl", "top")).toBeNull();
    expect(getBuiltInEdgeCompanionVisual("imported:any", "right")).toBeNull();
  });

  it("uses fixed render boxes and frame offsets for stable blink geometry", () => {
    const left = getBuiltInEdgeCompanionVisual("builtin:q-girl", "left");
    const right = getBuiltInEdgeCompanionVisual("builtin:q-girl", "right");
    const bottom = getBuiltInEdgeCompanionVisual("builtin:q-girl", "bottom");

    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    expect(bottom).not.toBeNull();

    if (!left || !right || !bottom) {
      throw new Error("Missing built-in edge companion visuals");
    }

    for (const profile of [left, right, bottom]) {
      expect(profile.baseVisibleHeightPx).toBe(34);
      expect(profile.minVisibleHeightPx).toBe(30);
      expect(profile.maxVisibleHeightPx).toBe(42);
      expect(profile.idleUrl).toContain("/edge-companion/");
      expect(profile.blinkUrl).toContain("/edge-companion/");
    }

    expect(left.fixedBox).toMatchObject({
      widthPx: 1302,
      heightPx: 1268,
      idleFrame: { xPx: 0, yPx: 0, widthPx: 1254, heightPx: 1254 },
      blinkFrame: { xPx: 0, yPx: 0, widthPx: 1254, heightPx: 1254 },
    });
    expect(right.fixedBox).toMatchObject({
      widthPx: left.fixedBox.widthPx,
      heightPx: left.fixedBox.heightPx,
      idleFrame: left.fixedBox.idleFrame,
      blinkFrame: left.fixedBox.blinkFrame,
    });
    expect(left.fixedBox.contactAnchor.x).toBeCloseTo(0.1298, 4);
    expect(right.fixedBox.contactAnchor.x).toBeCloseTo(0.8702, 4);

    expect(bottom.fixedBox).toMatchObject({
      widthPx: 1314,
      heightPx: 1207,
      idleFrame: { xPx: 11, yPx: 0, widthPx: 1303, heightPx: 1207 },
      blinkFrame: { xPx: 11, yPx: 0, widthPx: 1303, heightPx: 1207 },
    });
    expect(bottom.fixedBox.contactAnchor.x).toBeCloseTo(0.5048, 4);
    expect(bottom.fixedBox.contactAnchor.y).toBeCloseTo(0.9147, 4);
  });

  it.each(Object.entries(companionAssets))(
    "keeps %s blink dimensions, alpha mask, and transparent corners identical to idle",
    (_, asset) => {
      const idle = readPng(asset.idle);
      const blink = readPng(asset.blink);

      expect(blink.width).toBe(idle.width);
      expect(blink.height).toBe(idle.height);
      expect(blink.bitDepth).toBe(8);
      expect(blink.colorType).toBe(6);
      expect(cornerAlpha(blink)).toEqual([0, 0, 0, 0]);
      expect(countAlphaMismatches(idle, blink)).toBe(0);
    },
    20_000,
  );

  it.each(Object.entries(companionAssets))(
    "changes only the %s eye regions between idle and blink",
    (_, asset) => {
      const idle = readPng(asset.idle);
      const blink = readPng(asset.blink);
      const diff = comparePixels(idle, blink, asset.eyeBounds);

      expect(diff.changedPixels).toBeGreaterThan(1_000);
      expect(diff.changedOutsideEyeBounds).toBe(0);
    },
  );
});

function readPng(relativePath: string): DecodedPng {
  const bytes = readFileSync(join(process.cwd(), relativePath));
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let offset = 8;
  const idatChunks: Buffer[] = [];

  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const chunkType = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = bytes.subarray(dataStart, dataEnd);

    if (chunkType === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? 0;
    } else if (chunkType === "IDAT") {
      idatChunks.push(Buffer.from(data));
    } else if (chunkType === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  if (bitDepth !== 8 || colorType !== 6) {
    return { width, height, bitDepth, colorType, rgba: new Uint8Array() };
  }

  const compressed = Buffer.concat(idatChunks);
  const inflated = inflateSync(compressed);
  const rowLength = width * 4;
  const rgba = new Uint8Array(rowLength * height);
  let sourceOffset = 0;
  let previousRow = new Uint8Array(rowLength);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset] ?? 0;
    sourceOffset += 1;
    const sourceRow = inflated.subarray(sourceOffset, sourceOffset + rowLength);
    sourceOffset += rowLength;
    const targetRow = rgba.subarray(y * rowLength, (y + 1) * rowLength);

    for (let index = 0; index < rowLength; index += 1) {
      const left = index >= 4 ? targetRow[index - 4] ?? 0 : 0;
      const up = previousRow[index] ?? 0;
      const upperLeft = index >= 4 ? previousRow[index - 4] ?? 0 : 0;
      const value = sourceRow[index] ?? 0;

      if (filter === 0) {
        targetRow[index] = value;
      } else if (filter === 1) {
        targetRow[index] = (value + left) & 0xff;
      } else if (filter === 2) {
        targetRow[index] = (value + up) & 0xff;
      } else if (filter === 3) {
        targetRow[index] = (value + Math.floor((left + up) / 2)) & 0xff;
      } else if (filter === 4) {
        targetRow[index] =
          (value + paethPredictor(left, up, upperLeft)) & 0xff;
      } else {
        throw new Error(`Unsupported PNG filter ${filter}`);
      }
    }

    previousRow = targetRow;
  }

  return { width, height, bitDepth, colorType, rgba };
}

function paethPredictor(left: number, up: number, upperLeft: number) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);

  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) {
    return left;
  }

  return upDistance <= upperLeftDistance ? up : upperLeft;
}

function cornerAlpha(png: DecodedPng) {
  return [
    pixelAlpha(png, 0, 0),
    pixelAlpha(png, png.width - 1, 0),
    pixelAlpha(png, 0, png.height - 1),
    pixelAlpha(png, png.width - 1, png.height - 1),
  ];
}

function countAlphaMismatches(idle: DecodedPng, blink: DecodedPng) {
  if (idle.width !== blink.width || idle.height !== blink.height) {
    return Number.POSITIVE_INFINITY;
  }

  let mismatches = 0;

  for (let pixel = 0; pixel < idle.width * idle.height; pixel += 1) {
    if (idle.rgba[pixel * 4 + 3] !== blink.rgba[pixel * 4 + 3]) {
      mismatches += 1;
    }
  }

  return mismatches;
}

function pixelAlpha(png: DecodedPng, x: number, y: number) {
  return png.rgba[(y * png.width + x) * 4 + 3] ?? 0;
}

function comparePixels(
  idle: DecodedPng,
  blink: DecodedPng,
  eyeBounds: readonly PixelBounds[],
) {
  if (idle.width !== blink.width || idle.height !== blink.height) {
    return { changedPixels: 0, changedOutsideEyeBounds: Number.POSITIVE_INFINITY };
  }

  let changedPixels = 0;
  let changedOutsideEyeBounds = 0;

  for (let y = 0; y < idle.height; y += 1) {
    for (let x = 0; x < idle.width; x += 1) {
      const offset = (y * idle.width + x) * 4;
      const changed = [0, 1, 2, 3].some(
        (channel) => idle.rgba[offset + channel] !== blink.rgba[offset + channel],
      );

      if (!changed) {
        continue;
      }

      changedPixels += 1;
      const insideEyeBounds = eyeBounds.some(
        (bounds) =>
          x >= bounds.minX &&
          x <= bounds.maxX &&
          y >= bounds.minY &&
          y <= bounds.maxY,
      );

      if (!insideEyeBounds) {
        changedOutsideEyeBounds += 1;
      }
    }
  }

  return { changedPixels, changedOutsideEyeBounds };
}
